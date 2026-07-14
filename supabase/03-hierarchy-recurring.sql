-- ============================================================
-- Montfort Money — migration 03 (run once in Supabase SQL editor)
-- 1) Hierarchical categories: groups -> subcategories (parent_id)
-- 2) Recurring items (planned income/expenses) for the 12-month forecast
-- ============================================================

-- ---------- categories: self-referential parent ----------
alter table public.categories
  add column if not exists parent_id uuid references public.categories(id) on delete cascade;

create index if not exists categories_parent_idx on public.categories(parent_id);

-- allow same name under different parents (replace the old unique)
alter table public.categories drop constraint if exists categories_user_id_name_kind_key;
create unique index if not exists categories_unique_name
  on public.categories (user_id, kind, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), name);

-- ---------- recurring items (the plan, not the actuals) ----------
create table if not exists public.recurring_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  kind text not null default 'expense' check (kind in ('expense','income')),
  amount numeric(12,2) not null check (amount > 0),
  category_id uuid references public.categories(id) on delete set null,
  account_id uuid references public.accounts(id) on delete set null,
  frequency text not null default 'monthly'
    check (frequency in ('weekly','biweekly','monthly','yearly')),
  start_date date not null default current_date,
  end_date date, -- null = indefinitely
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.recurring_items enable row level security;
create policy "own recurring" on public.recurring_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists recurring_user_idx on public.recurring_items(user_id, active);
