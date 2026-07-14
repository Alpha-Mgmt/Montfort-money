-- ============================================================
-- Montfort Money — migration 09 (run once in Supabase SQL editor)
-- Statement close day on debts (credit cards)
-- ============================================================

alter table public.debts
  add column if not exists statement_close_day integer
    check (statement_close_day is null or (statement_close_day between 1 and 31));
