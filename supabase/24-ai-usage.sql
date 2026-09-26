-- Migration 24: Montfort AI usage (for the owner dashboard).
-- One row per AI call. Users can't read it; the owner panel reads it with
-- the server key.
create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  kind text not null,            -- 'ask' | 'insights'
  model text,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(10,5) not null default 0
);
alter table public.ai_usage enable row level security;
drop policy if exists "insert own ai usage" on public.ai_usage;
create policy "insert own ai usage" on public.ai_usage
  for insert with check (auth.uid() = user_id);
create index if not exists ai_usage_created_idx on public.ai_usage(created_at desc);
