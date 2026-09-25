-- Migration 21: more ways to repeat a plan item, and choosing the dates.
-- New frequencies: quarterly, semiannual (twice a year), custom (dates you pick).
-- `schedule` holds the chosen days:
--   {"day": 5}                       monthly / quarterly (day of month)
--   {"days": [1, 15]}                twice a month
--   {"dates": ["03-15", "09-30"]}    twice a year / custom (repeat every year)
alter table public.recurring_items
  add column if not exists schedule jsonb;

alter table public.recurring_items
  drop constraint if exists recurring_items_frequency_check;
alter table public.recurring_items
  add constraint recurring_items_frequency_check
  check (frequency in ('once','weekly','biweekly','semimonthly','monthly',
                       'quarterly','semiannual','yearly','custom'));
