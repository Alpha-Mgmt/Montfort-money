-- ============================================================
-- Montfort Money — migration 04 (run once in Supabase SQL editor)
-- Cards & debts: payment due day + statement close day, 'loan' type
-- ============================================================

alter table public.accounts
  add column if not exists payment_due_day integer
    check (payment_due_day is null or (payment_due_day between 1 and 31)),
  add column if not exists statement_close_day integer
    check (statement_close_day is null or (statement_close_day between 1 and 31));

alter table public.accounts drop constraint if exists accounts_type_check;
alter table public.accounts add constraint accounts_type_check
  check (type in ('cash','checking','savings','credit','loan','other'));
