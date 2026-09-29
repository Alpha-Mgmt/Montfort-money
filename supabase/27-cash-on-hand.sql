-- Montfort Money — migration 27: cash in hand per month (not income; it balances the month)
-- cash_on_hand = { "2026-09": 350, ... }
alter table public.profiles add column if not exists cash_on_hand jsonb;
