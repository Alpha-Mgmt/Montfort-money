-- Migration 18: business tools — clients & vendors, invoices, receipts,
-- tax-deductible flag, cash position for the cash-flow forecast.

-- ---------- clients & vendors ----------
create table if not exists public.counterparties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'client' check (kind in ('client','vendor')),
  name text not null,
  email text,
  phone text,
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.counterparties enable row level security;
drop policy if exists "own counterparties" on public.counterparties;
create policy "own counterparties" on public.counterparties for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create index if not exists counterparties_user_idx on public.counterparties(user_id, kind);

-- ---------- invoices ----------
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  number text not null,
  client_id uuid references public.counterparties(id) on delete set null,
  issue_date date not null default current_date,
  due_date date,
  items jsonb not null default '[]'::jsonb,   -- [{description, qty, price}]
  amount numeric(12,2) not null check (amount >= 0),
  status text not null default 'sent' check (status in ('draft','sent','paid','void')),
  paid_on date,
  transaction_id uuid references public.transactions(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);
alter table public.invoices enable row level security;
drop policy if exists "own invoices" on public.invoices;
create policy "own invoices" on public.invoices for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create index if not exists invoices_user_idx on public.invoices(user_id, status, due_date);

-- next invoice number: INV-0001, INV-0002…
create or replace function public.next_invoice_number()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select 'INV-' || lpad((coalesce(max(nullif(regexp_replace(number, '\D', '', 'g'), '')::int), 0) + 1)::text, 4, '0')
  from invoices where user_id = auth.uid();
$$;
grant execute on function public.next_invoice_number() to authenticated;

-- mark paid → books the income in the business space (and links it)
create or replace function public.mark_invoice_paid(p_id uuid, p_date date default null, p_lang text default 'en')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv invoices%rowtype;
  v_cat uuid;
  v_tx uuid;
  v_client text;
  v_label text := case when p_lang = 'es' then 'Ventas' else 'Sales' end;
begin
  select * into v_inv from invoices where id = p_id and user_id = auth.uid() for update;
  if not found then raise exception 'not found'; end if;
  if v_inv.status = 'paid' then return v_inv.transaction_id; end if;
  select id into v_cat from categories
    where user_id = auth.uid() and space = 'business' and kind = 'income'
      and name in ('Sales','Ventas') limit 1;
  if v_cat is null then
    insert into categories (user_id, space, name, icon, kind)
    values (auth.uid(), 'business', v_label, '🧾', 'income') returning id into v_cat;
  end if;
  select name into v_client from counterparties where id = v_inv.client_id;
  insert into transactions (user_id, space, category_id, kind, amount, tx_date, note, source, counterparty_id)
  values (auth.uid(), 'business', v_cat, 'income', v_inv.amount, coalesce(p_date, current_date),
          concat_ws(' · ', v_inv.number, v_client), 'manual', v_inv.client_id)
  returning id into v_tx;
  update invoices set status = 'paid', paid_on = coalesce(p_date, current_date), transaction_id = v_tx
  where id = p_id;
  return v_tx;
end;
$$;
grant execute on function public.mark_invoice_paid(uuid, date, text) to authenticated;

create or replace function public.mark_invoice_unpaid(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx uuid;
begin
  select transaction_id into v_tx from invoices where id = p_id and user_id = auth.uid();
  if not found then raise exception 'not found'; end if;
  update invoices set status = 'sent', paid_on = null, transaction_id = null where id = p_id;
  if v_tx is not null then delete from transactions where id = v_tx and user_id = auth.uid(); end if;
end;
$$;
grant execute on function public.mark_invoice_unpaid(uuid) to authenticated;

-- ---------- transactions: who, deductible, receipt ----------
alter table public.transactions
  add column if not exists counterparty_id uuid references public.counterparties(id) on delete set null,
  add column if not exists deductible boolean not null default false,
  add column if not exists receipt_path text;

-- ---------- cash on hand (starting point of the cash-flow forecast) ----------
alter table public.profiles
  add column if not exists business_cash numeric(14,2),
  add column if not exists business_cash_date date;

-- ---------- receipt photos (Supabase Storage, private) ----------
-- files live at receipts/<user id>/<file>; only the owner can read/write them
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

drop policy if exists "receipts read own" on storage.objects;
create policy "receipts read own" on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "receipts write own" on storage.objects;
create policy "receipts write own" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "receipts delete own" on storage.objects;
create policy "receipts delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
