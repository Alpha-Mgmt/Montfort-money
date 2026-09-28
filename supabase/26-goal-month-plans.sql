-- Montfort Money — migration 26: editable goal plans
-- monthly_plan: fixed amount per month (null = calculated from target & date)
-- month_plans:  { "2026-10": 150, ... } for one-month changes
alter table public.goals add column if not exists monthly_plan numeric(12,2);
alter table public.goals add column if not exists month_plans jsonb;
