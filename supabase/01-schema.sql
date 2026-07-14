-- ============================================================
-- Montfort Money — schema v1 (run once in Supabase SQL editor)
-- Plaid-ready shape: accounts/transactions carry source + external_id
-- ============================================================

-- ---------- invite codes (private beta) ----------
create table if not exists public.invite_codes (
  code text primary key,
  note text,
  max_uses integer not null default 10,
  uses integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.invite_codes enable row level security;
-- no public policies: validated only through the check_invite() function

create or replace function public.check_invite(p_code text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from invite_codes
    where code = lower(trim(p_code)) and active and uses < max_uses
  );
$$;

grant execute on function public.check_invite(text) to anon, authenticated;

-- ---------- profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  invite_code_used text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "own profile read" on public.profiles
  for select using (auth.uid() = id);
create policy "own profile update" on public.profiles
  for update using (auth.uid() = id);

-- ---------- accounts (manual today, Plaid tomorrow) ----------
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null default 'checking'
    check (type in ('cash','checking','savings','credit','other')),
  source text not null default 'manual' check (source in ('manual','plaid')),
  external_id text,
  currency text not null default 'USD',
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.accounts enable row level security;
create policy "own accounts" on public.accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists accounts_user_idx on public.accounts(user_id);

-- ---------- categories ----------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  icon text not null default '💸',
  kind text not null default 'expense' check (kind in ('expense','income')),
  created_at timestamptz not null default now(),
  unique (user_id, name, kind)
);

alter table public.categories enable row level security;
create policy "own categories" on public.categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists categories_user_idx on public.categories(user_id);

-- ---------- transactions ----------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  kind text not null default 'expense' check (kind in ('expense','income')),
  amount numeric(12,2) not null check (amount > 0),
  tx_date date not null default current_date,
  note text,
  source text not null default 'manual' check (source in ('manual','task','plaid')),
  external_id text,
  task_id uuid,
  created_at timestamptz not null default now()
);

alter table public.transactions enable row level security;
create policy "own transactions" on public.transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists tx_user_date_idx on public.transactions(user_id, tx_date desc);
create index if not exists tx_user_cat_idx on public.transactions(user_id, category_id);

-- ---------- budgets (monthly, per category) ----------
create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  month date not null, -- always the 1st of the month
  limit_amount numeric(12,2) not null check (limit_amount > 0),
  created_at timestamptz not null default now(),
  unique (user_id, category_id, month)
);

alter table public.budgets enable row level security;
create policy "own budgets" on public.budgets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists budgets_user_month_idx on public.budgets(user_id, month);

-- ---------- tasks (the differentiator: tasks wired to the budget) ----------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  category_id uuid references public.categories(id) on delete set null,
  account_id uuid references public.accounts(id) on delete set null,
  kind text not null default 'expense' check (kind in ('expense','income')),
  amount numeric(12,2) check (amount is null or amount > 0),
  due_date date,
  recurrence text not null default 'none'
    check (recurrence in ('none','weekly','biweekly','monthly','yearly')),
  status text not null default 'pending' check (status in ('pending','completed')),
  completed_at timestamptz,
  transaction_id uuid references public.transactions(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.tasks enable row level security;
create policy "own tasks" on public.tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists tasks_user_status_idx on public.tasks(user_id, status, due_date);

-- link transactions back to tasks (added after tasks exists)
alter table public.transactions
  drop constraint if exists transactions_task_fk;
alter table public.transactions
  add constraint transactions_task_fk
  foreign key (task_id) references public.tasks(id) on delete set null;

-- ---------- complete_task: one atomic call from the app ----------
-- Marks a task completed. If it has an amount, records the linked
-- transaction (source='task') so the budget updates automatically.
-- If it recurs, creates the next occurrence.
create or replace function public.complete_task(p_task_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task tasks%rowtype;
  v_tx_id uuid;
  v_next date;
begin
  select * into v_task from tasks
  where id = p_task_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'task not found';
  end if;
  if v_task.status = 'completed' then
    return v_task.transaction_id;
  end if;

  if v_task.amount is not null then
    insert into transactions
      (user_id, account_id, category_id, kind, amount, tx_date, note, source, task_id)
    values
      (v_task.user_id, v_task.account_id, v_task.category_id, v_task.kind,
       v_task.amount, current_date, v_task.title, 'task', v_task.id)
    returning id into v_tx_id;
  end if;

  update tasks
  set status = 'completed', completed_at = now(), transaction_id = v_tx_id
  where id = v_task.id;

  if v_task.recurrence <> 'none' then
    v_next := case v_task.recurrence
      when 'weekly' then coalesce(v_task.due_date, current_date) + interval '7 days'
      when 'biweekly' then coalesce(v_task.due_date, current_date) + interval '14 days'
      when 'monthly' then coalesce(v_task.due_date, current_date) + interval '1 month'
      when 'yearly' then coalesce(v_task.due_date, current_date) + interval '1 year'
    end;
    insert into tasks
      (user_id, title, category_id, account_id, kind, amount, due_date, recurrence)
    values
      (v_task.user_id, v_task.title, v_task.category_id, v_task.account_id,
       v_task.kind, v_task.amount, v_next, v_task.recurrence);
  end if;

  return v_tx_id;
end;
$$;

grant execute on function public.complete_task(uuid) to authenticated;

-- ---------- uncomplete_task: undo (also removes the auto transaction) ----------
create or replace function public.uncomplete_task(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task tasks%rowtype;
begin
  select * into v_task from tasks
  where id = p_task_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'task not found';
  end if;

  if v_task.transaction_id is not null then
    delete from transactions where id = v_task.transaction_id and user_id = auth.uid();
  end if;

  update tasks
  set status = 'pending', completed_at = null, transaction_id = null
  where id = v_task.id;
end;
$$;

grant execute on function public.uncomplete_task(uuid) to authenticated;

-- ---------- new user bootstrap: profile + invite redemption + default categories ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := lower(trim(coalesce(new.raw_user_meta_data->>'invite_code', '')));
  v_name text := coalesce(new.raw_user_meta_data->>'full_name', '');
begin
  insert into profiles (id, full_name, invite_code_used)
  values (new.id, nullif(v_name, ''), nullif(v_code, ''));

  if v_code <> '' then
    update invite_codes set uses = uses + 1
    where code = v_code and active and uses < max_uses;
  end if;

  insert into categories (user_id, name, icon, kind) values
    (new.id, 'Housing', '🏠', 'expense'),
    (new.id, 'Groceries', '🛒', 'expense'),
    (new.id, 'Dining out', '🍽️', 'expense'),
    (new.id, 'Transport', '🚗', 'expense'),
    (new.id, 'Utilities', '💡', 'expense'),
    (new.id, 'Subscriptions', '📺', 'expense'),
    (new.id, 'Health', '🩺', 'expense'),
    (new.id, 'Shopping', '🛍️', 'expense'),
    (new.id, 'Entertainment', '🎟️', 'expense'),
    (new.id, 'Other', '💸', 'expense'),
    (new.id, 'Salary', '💼', 'income'),
    (new.id, 'Other income', '📈', 'income');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
