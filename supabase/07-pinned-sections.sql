-- ============================================================
-- Montfort Money — migration 07 (run once in Supabase SQL editor)
-- Pinned category groups: show as their own section on the home page
-- ============================================================

alter table public.categories
  add column if not exists pinned boolean not null default false;
