-- Migration 19: debt payoff plan settings (per person).
alter table public.profiles
  add column if not exists debt_extra numeric(12,2) not null default 0,
  add column if not exists debt_strategy text not null default 'avalanche'
    check (debt_strategy in ('avalanche','snowball')),
  add column if not exists debt_free_goal date;
