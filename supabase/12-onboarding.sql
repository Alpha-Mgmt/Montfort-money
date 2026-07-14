-- Migration 12: onboarding flag on profiles.
-- New users start with onboarded = false and see the setup wizard once.
alter table public.profiles
  add column if not exists onboarded boolean not null default false;

-- Everyone who already exists has been using the app — skip the wizard for them.
update public.profiles set onboarded = true where onboarded = false;
