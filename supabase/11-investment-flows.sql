-- Migration 11: investment monthly flows (deposit/withdraw) +
-- safe transaction delete that reverses debt/investment/goal balances.

-- ---------- investments: planned monthly movement ----------
alter table public.investments
  add column if not exists monthly_amount numeric(12,2) not null default 0,
  add column if not exists monthly_kind text not null default 'deposit'
    check (monthly_kind in ('deposit','withdraw'));

-- ---------- record_withdrawal: take money out of an investment ----------
-- Logs it as INCOME (money coming back to you) and moves the balance down.
create or replace function public.record_withdrawal(
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
    (v_inv.user_id, p_account_id, p_category_id, 'income', p_amount,
     current_date, v_inv.name || ' withdrawal', 'manual', v_inv.id);

  update investments
  set balance = greatest(balance - p_amount, 0)
  where id = v_inv.id;

  return (select balance from investments where id = v_inv.id);
end;
$$;

grant execute on function public.record_withdrawal(uuid, numeric, uuid, uuid) to authenticated;

-- ---------- delete_transaction: delete + undo side effects ----------
-- Deleting a debt payment puts the amount back on the debt.
-- Deleting an investment contribution/withdrawal restores the balance.
-- Deleting a goal contribution lowers the goal's saved amount.
create or replace function public.delete_transaction(p_tx_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx transactions%rowtype;
begin
  select * into v_tx from transactions
  where id = p_tx_id and user_id = auth.uid()
  for update;
  if not found then
    raise exception 'transaction not found';
  end if;

  if v_tx.debt_id is not null then
    -- inverse of record_debt_payment: it did  new = B - (amount - B*r)
    -- so the balance before was  B = (new + amount) / (1 + r)
    update debts
    set balance = round((balance + v_tx.amount) / (1 + apr / 100.0 / 12.0), 2)
    where id = v_tx.debt_id and user_id = auth.uid();
  end if;

  if v_tx.investment_id is not null then
    if v_tx.kind = 'expense' then
      -- was a contribution
      update investments
      set balance = greatest(balance - v_tx.amount, 0),
          contributed_total = greatest(contributed_total - v_tx.amount, 0)
      where id = v_tx.investment_id and user_id = auth.uid();
    else
      -- was a withdrawal
      update investments set balance = balance + v_tx.amount
      where id = v_tx.investment_id and user_id = auth.uid();
    end if;
  end if;

  if v_tx.goal_id is not null then
    update goals set saved = greatest(saved - v_tx.amount, 0)
    where id = v_tx.goal_id and user_id = auth.uid();
  end if;

  delete from transactions where id = v_tx.id;
end;
$$;

grant execute on function public.delete_transaction(uuid) to authenticated;
