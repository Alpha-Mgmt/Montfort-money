-- Migration 16: Plaid bank connections.
-- Access tokens are secrets: this table has NO client policies, so only the
-- server (service-role key) can read it. The app lists connections through
-- /api/plaid/items, which never returns the token.

create table if not exists public.plaid_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  space text not null default 'personal' check (space in ('personal','business')),
  item_id text not null unique,
  access_token text not null,
  institution_name text,
  cursor text,
  last_synced_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);
alter table public.plaid_items enable row level security;
-- (intentionally no policies)

-- accounts: allow the Plaid types we map to, and dedupe by external id
alter table public.accounts drop constraint if exists accounts_type_check;
alter table public.accounts add constraint accounts_type_check
  check (type in ('cash','checking','savings','credit','loan','investment','other'));
alter table public.accounts add column if not exists plaid_item_id uuid
  references public.plaid_items(id) on delete set null;
alter table public.accounts add column if not exists mask text;
alter table public.accounts add column if not exists current_balance numeric(14,2);
create unique index if not exists accounts_external_uq
  on public.accounts(user_id, external_id) where external_id is not null;

-- transactions: one row per Plaid transaction id
create unique index if not exists transactions_external_uq
  on public.transactions(user_id, external_id) where external_id is not null;
alter table public.transactions add column if not exists pending boolean not null default false;
