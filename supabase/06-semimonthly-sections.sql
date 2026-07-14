-- ============================================================
-- Montfort Money — migration 06 (run once in Supabase SQL editor)
-- 1) 'semimonthly' frequency (paid on the 15th & 30th)
-- 2) Hideable home sections (Debts / Investments)
-- ============================================================

alter table public.recurring_items
  drop constraint if exists recurring_items_frequency_check;
alter table public.recurring_items
  add constraint recurring_items_frequency_check
  check (frequency in ('weekly','biweekly','semimonthly','monthly','yearly'));

alter table public.profiles
  add column if not exists show_debts boolean not null default true,
  add column if not exists show_investments boolean not null default true;
