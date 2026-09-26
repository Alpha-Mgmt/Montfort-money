-- Migration 23: recent sign-ins (Settings → Security).
create table if not exists public.login_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  device text,
  place text,
  ip text,
  is_new boolean not null default false
);
alter table public.login_events enable row level security;
drop policy if exists "own login events read" on public.login_events;
create policy "own login events read" on public.login_events
  for select using (auth.uid() = user_id);
drop policy if exists "own login events insert" on public.login_events;
create policy "own login events insert" on public.login_events
  for insert with check (auth.uid() = user_id);
create index if not exists login_events_user_idx on public.login_events(user_id, created_at desc);
