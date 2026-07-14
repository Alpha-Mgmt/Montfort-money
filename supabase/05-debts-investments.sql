-- ============================================================
-- Montfort Money — migration 05 (run once in Supabase SQL editor)
-- Debts (with payoff math inputs) + Investments, linked payments
-- ============================================================

-- ---------- debts ----------
create table if not exists public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  debt_type text not null default 'credit_card'
    check (debt_type in ('credit_card','car_loan','mortgage','personal_loan','student_loan','other')),
  original_amount numeric(12,2) check (original_amount is null or original_amount > 0),
  balance numeric(12,2) not null check (balance >= 0),
  apr numeric(6,3) not null default 0 check (apr >= 0 and apr <= 100),
  planned_payment numeric(12,2) not null check (planned_payment > 0),
  payment_due_day integer check (payment_due_day is null or (payment_due_day between 1 and 31)),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.debts enable row level security;
create policy "own debts" on public.debts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists debts_user_idx on public.debts(user_id, archived);

-- ---------- investments ----------
create table if not exists public.investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  inv_type text not null default 'brokerage'
    check (inv_type in ('brokerage','retirement','crypto','real_estate','savings','other')),
  balance numeric(14,2) not null default 0 check (balance >= 0),
  expected_apr numeric(6,3) not null default 7 check (expected_apr >= 0 and expected_apr <= 100),
  contributed_total numeric(14,2) not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.investments enable row level security;
create policy "own investments" on public.investments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists investments_user_idx on public.investments(user_id, archived);

-- ---------- link transactions to debts / investments ----------
alter table public.transactions
  add column if not exists debt_id uuid references public.debts(id) on delete set null,
  add column if not exists investment_id uuid references public.investments(id) on delete set null;

-- ---------- record_debt_payment: one atomic call ----------
-- Logs the payment as an expense transaction and moves the balance down by
-- (payment - this month's estimated interest). Returns the new balance.
create or replace function public.record_debt_payment(
  p_debt_id uuid,
  p_amount numeric,
  p_account_id uuid default null,
  p_category_id uuid default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_debt debts%rowtype;
  v_interest numeric;
  v_principal numeric;
  v_new numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  select * into v_debt from debts
  where id = p_debt_id and user_id = auth.uid()
  for update;
  if not found then
    raise exception 'debt not found';
  end if;

  v_interest := round(v_debt.balance * (v_debt.apr / 100.0 / 12.0), 2);
  v_principal := greatest(p_amount - v_interest, 0);
  v_new := greatest(v_debt.balance - v_principal, 0);

  insert into transactions
    (user_id, account_id, category_id, kind, amount, tx_date, note, source, debt_id)
  values
    (v_debt.user_id, p_account_id, p_category_id, 'expense', p_amount,
     current_date, v_debt.name || ' payment', 'manual', v_debt.id);

  update debts set balance = v_new where id = v_debt.id;
  return v_new;
end;
$$;

grant execute on function public.record_debt_payment(uuid, numeric, uuid, uuid) to authenticated;

-- ---------- record_contribution: investment deposit ----------
create or replace function public.record_contribution(
  p_investment_id uuid,
  p_amount numeric,
  p_account_id uuid default null,
  p_category_id uuid default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv investments%rowtype;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  select * into v_inv from investments
  where id = p_investment_id and user_id = auth.uid()
  for update;
  if not found then
    raise exception 'investment not found';
  end if;

  insert into transactions
    (user_id, account_id, category_id, kind, amount, tx_date, note, source, investment_id)
  values
    (v_inv.user_id, p_account_id, p_category_id, 'expense', p_amount,
     current_date, v_inv.name || ' contribution', 'manual', v_inv.id);

  update investments
  set balance = balance + p_amount,
      contributed_total = contributed_total + p_amount
  where id = v_inv.id;

  return (select balance from investments where id = v_inv.id);
end;
$$;

grant execute on function public.record_contribution(uuid, numeric, uuid, uuid) to authenticated;
