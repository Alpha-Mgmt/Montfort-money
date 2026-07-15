-- Migration 13: user feedback / suggestions.
-- Users can send suggestions; you read them all from the Supabase dashboard
-- (Table editor / SQL editor use the service role and bypass RLS).
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message text not null,
  page text,
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

create policy "insert own feedback" on public.feedback
  for insert with check (auth.uid() = user_id);
create policy "read own feedback" on public.feedback
  for select using (auth.uid() = user_id);

create index if not exists feedback_created_idx on public.feedback(created_at desc);
