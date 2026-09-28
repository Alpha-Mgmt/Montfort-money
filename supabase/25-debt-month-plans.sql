-- Montfort Money — migration 25: a debt's planned payment can be changed for ONE month
-- month_plans = { "2026-10": 80, ... }  (months not listed use planned_payment)
alter table public.debts add column if not exists month_plans jsonb;
