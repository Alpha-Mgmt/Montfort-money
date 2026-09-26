-- Migration 22: taxes & deductions on income plan items.
-- `amount` stays the take-home (net) so every plan total keeps working;
-- `taxes` keeps the gross and how much goes to each tax, per paycheck:
--   {"gross": 5000, "mode": "simple", "pct": 24}
--   {"gross": 5000, "mode": "detailed", "federal": 600, "state": 125,
--    "social_security": 310, "medicare": 72.5, "other": [{"name": "401k", "amount": 250}]}
alter table public.recurring_items
  add column if not exists taxes jsonb;
