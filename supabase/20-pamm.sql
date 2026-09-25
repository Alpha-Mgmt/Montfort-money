-- Migration 20: Cuentas PAMM (owner-only section).
-- One row per client; the whole client record (months, history, projection)
-- lives in `data`. No client-side access at all: RLS on and no policies, so
-- only the server (service role) can read/write, and the API checks that the
-- caller is the owner with two-step verification.
create table if not exists public.pamm_clients (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.pamm_clients enable row level security;
revoke all on public.pamm_clients from anon, authenticated;
