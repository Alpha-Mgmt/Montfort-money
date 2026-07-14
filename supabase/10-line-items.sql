-- ============================================================
-- Montfort Money — migration 10 (run once in Supabase SQL editor)
-- Trackable line items: plans you fill up ("Stipends $200/$900")
-- 1) 'once' frequency = planned for a single month
-- 2) contributions (transactions) link to their line item
-- ============================================================

alter table public.recurring_items
  drop constraint if exists recurring_items_frequency_check;
alter table public.recurring_items
  add constraint recurring_items_frequency_check
  check (frequency in ('once','weekly','biweekly','semimonthly','monthly','yearly'));

alter table public.transactions
  add column if not exists recurring_item_id uuid
    references public.recurring_items(id) on delete set null;

create index if not exists tx_recurring_item_idx
  on public.transactions(recurring_item_id);
