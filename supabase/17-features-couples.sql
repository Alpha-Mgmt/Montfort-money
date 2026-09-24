-- Migration 17: feature switches + couples ("Pareja" shared space).
--
-- Features: Business and Remittances are opt-in per user (Settings).
-- Couples: a household of 2+ people shares a third space, 'shared'. Rows in
-- it carry household_id and every member can see and edit them. Personal and
-- Business stay private. Existing functions keep working: their owner checks
-- are rewritten below to "can this user see the row".

-- ---------- feature switches ----------
alter table public.profiles
  add column if not exists feature_business boolean not null default false,
  add column if not exists feature_remit boolean not null default false;

-- keep features on for people already using them
update public.profiles p set feature_business = true
  where exists (select 1 from public.categories c where c.user_id = p.id and c.space = 'business');
update public.profiles p set feature_remit = true
  where exists (select 1 from public.remittances r where r.user_id = p.id);

-- ---------- households ----------
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Home',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id),
  unique (user_id) -- one household per person
);

create table if not exists public.household_invites (
  code text primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '14 days',
  used_by uuid references auth.users(id) on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;
-- reads go through the RPCs below (security definer); no direct policies needed

-- my household (null if none)
create or replace function public.my_household()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id from household_members where user_id = auth.uid();
$$;
grant execute on function public.my_household() to authenticated;

-- ---------- 'shared' becomes a valid space ----------
alter table public.profiles drop constraint if exists profiles_active_space_check;
alter table public.profiles add constraint profiles_active_space_check
  check (active_space in ('personal','business','shared'));

do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts','categories','transactions','budgets','tasks',
    'recurring_items','debts','investments','goals'
  ] loop
    execute format('alter table public.%I add column if not exists household_id uuid references public.households(id) on delete cascade', t);
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_space_check');
    execute format(
      'alter table public.%I add constraint %I check (space in (''personal'',''business'',''shared'') and (space <> ''shared'' or household_id is not null))',
      t, t || '_space_check');
    execute format('create index if not exists %I on public.%I(household_id) where household_id is not null', t || '_household_idx', t);

    -- RLS: private spaces by owner, shared space by household
    execute format('drop policy if exists %I on public.%I', 'space access', t);
    execute format($p$
      create policy "space access" on public.%I for all
      using (
        space = (select public.current_space()) and (
          (space <> 'shared' and user_id = (select auth.uid()))
          or (space = 'shared' and household_id = (select public.my_household()))
        )
      )
      with check (
        space = (select public.current_space()) and (
          (space <> 'shared' and user_id = (select auth.uid()))
          or (space = 'shared' and household_id = (select public.my_household()))
        )
      )$p$, t);
  end loop;
end $$;

-- drop the per-table policies from migration 14 (replaced by "space access")
drop policy if exists "own accounts" on public.accounts;
drop policy if exists "own categories" on public.categories;
drop policy if exists "own transactions" on public.transactions;
drop policy if exists "own budgets" on public.budgets;
drop policy if exists "own tasks" on public.tasks;
drop policy if exists "own recurring" on public.recurring_items;
drop policy if exists "own debts" on public.debts;
drop policy if exists "own investments" on public.investments;
drop policy if exists "own goals" on public.goals;

-- new rows: stamp with the ACTING user's space (+ household when shared)
create or replace function public.stamp_space()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.space is null then
    new.space := coalesce(
      (select active_space from profiles where id = coalesce(auth.uid(), new.user_id)),
      'personal');
  end if;
  if new.space = 'shared' and new.household_id is null then
    new.household_id := (select household_id from household_members
                         where user_id = coalesce(auth.uid(), new.user_id));
  end if;
  if new.space = 'shared' and new.household_id is null then
    new.space := 'personal'; -- left the household meanwhile: keep it private
  end if;
  return new;
end;
$$;

create or replace function public.stamp_space_from_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.task_id is not null then
    select space, household_id into new.space, new.household_id
      from tasks where id = new.task_id;
  end if;
  return new;
end;
$$;

-- can the caller act on this row? (used inside security-definer functions)
create or replace function public.row_visible(p_user uuid, p_space text, p_household uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_space = 'shared' then p_household is not null and p_household = public.my_household()
    else p_user = auth.uid()
  end;
$$;
grant execute on function public.row_visible(uuid, text, uuid) to authenticated;

-- rewrite owner checks in existing money functions so partners can use them
do $$
declare
  r record;
  def text;
begin
  for r in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'complete_task','uncomplete_task','record_debt_payment','record_contribution',
      'record_goal_contribution','record_withdrawal','delete_transaction')
  loop
    def := pg_get_functiondef(r.oid);
    def := replace(def, 'and user_id = auth.uid()', 'and public.row_visible(user_id, space, household_id)');
    -- a task completed by a partner is booked to whoever completed it
    def := replace(def, '(v_task.user_id, v_task.account_id, v_task.category_id, v_task.kind,', '(auth.uid(), v_task.account_id, v_task.category_id, v_task.kind,');
    execute def;
  end loop;
end $$;

-- switch space (shared only if you're in a household; business only if enabled)
create or replace function public.set_space(p_space text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_space = 'shared' and public.my_household() is null then
    raise exception 'no household';
  end if;
  update profiles set active_space = p_space
  where id = auth.uid() and p_space in ('personal','business','shared');
end;
$$;

-- ---------- couple RPCs ----------
create or replace function public.create_household(p_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := public.my_household();
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if v_id is not null then return v_id; end if;
  insert into households (name, created_by)
  values (coalesce(nullif(trim(p_name), ''), 'Home'), auth.uid())
  returning id into v_id;
  insert into household_members (household_id, user_id, role) values (v_id, auth.uid(), 'owner');
  return v_id;
end;
$$;
grant execute on function public.create_household(text) to authenticated;

create or replace function public.create_household_invite()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_h uuid := public.my_household();
  v_code text;
begin
  if v_h is null then v_h := public.create_household(null); end if;
  -- reuse a live code if there is one
  select code into v_code from household_invites
    where household_id = v_h and used_by is null and expires_at > now()
    order by created_at desc limit 1;
  if v_code is not null then return v_code; end if;
  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into household_invites (code, household_id, created_by) values (v_code, v_h, auth.uid());
  return v_code;
end;
$$;
grant execute on function public.create_household_invite() to authenticated;

-- peek at an invite before accepting (who invited you)
create or replace function public.household_invite_info(p_code text)
returns table (household_name text, inviter_name text, valid boolean)
language sql
stable
security definer
set search_path = public
as $$
  select h.name, coalesce(p.full_name, 'Someone'),
         (i.used_by is null and i.expires_at > now())
  from household_invites i
  join households h on h.id = i.household_id
  left join profiles p on p.id = i.created_by
  where i.code = upper(trim(p_code));
$$;
grant execute on function public.household_invite_info(text) to authenticated;

create or replace function public.join_household(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv household_invites%rowtype;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if public.my_household() is not null then raise exception 'already in a household'; end if;
  select * into v_inv from household_invites
    where code = upper(trim(p_code)) and used_by is null and expires_at > now()
    for update;
  if not found then raise exception 'invalid or expired code'; end if;
  insert into household_members (household_id, user_id, role) values (v_inv.household_id, auth.uid(), 'member');
  update household_invites set used_by = auth.uid(), used_at = now() where code = v_inv.code;
  return v_inv.household_id;
end;
$$;
grant execute on function public.join_household(text) to authenticated;

-- leave: your shared rows stay with the household; your space falls back to personal
create or replace function public.leave_household()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_h uuid := public.my_household();
begin
  if v_h is null then return; end if;
  delete from household_members where household_id = v_h and user_id = auth.uid();
  update profiles set active_space = 'personal' where id = auth.uid() and active_space = 'shared';
  -- last one out closes the household (and its shared data)
  if not exists (select 1 from household_members where household_id = v_h) then
    delete from households where id = v_h;
  end if;
end;
$$;
grant execute on function public.leave_household() to authenticated;

create or replace function public.rename_household(p_name text)
returns void
language sql
security definer
set search_path = public
as $$
  update households set name = coalesce(nullif(trim(p_name), ''), name)
  where id = public.my_household();
$$;
grant execute on function public.rename_household(text) to authenticated;

-- household + members (names only)
create or replace function public.my_household_info()
returns table (household_id uuid, household_name text, user_id uuid, full_name text, role text, is_me boolean)
language sql
stable
security definer
set search_path = public
as $$
  select h.id, h.name, m.user_id, coalesce(p.full_name, 'Partner'), m.role, m.user_id = auth.uid()
  from households h
  join household_members m on m.household_id = h.id
  left join profiles p on p.id = m.user_id
  where h.id = public.my_household()
  order by m.joined_at;
$$;
grant execute on function public.my_household_info() to authenticated;

-- who put in / spent what in the shared space this month
create or replace function public.household_month(p_month date)
returns table (user_id uuid, full_name text, income numeric, expense numeric)
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id, coalesce(p.full_name, 'Partner'),
    coalesce(sum(t.amount) filter (where t.kind = 'income'), 0),
    coalesce(sum(t.amount) filter (where t.kind = 'expense'), 0)
  from household_members m
  left join profiles p on p.id = m.user_id
  left join transactions t on t.user_id = m.user_id and t.space = 'shared'
    and t.household_id = m.household_id
    and t.tx_date >= p_month and t.tx_date < p_month + interval '1 month'
  where m.household_id = public.my_household()
  group by m.user_id, p.full_name, m.joined_at
  order by m.joined_at;
$$;
grant execute on function public.household_month(date) to authenticated;

-- move money from your personal space into the shared pot, in one step
create or replace function public.contribute_shared(p_amount numeric, p_date date, p_lang text default 'en')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_h uuid := public.my_household();
  v_scat uuid;
  v_pcat uuid;
  v_in text := case when p_lang = 'es' then 'Aportaciones' else 'Contributions' end;
  v_out text := case when p_lang = 'es' then 'Hogar compartido' else 'Shared household' end;
begin
  if v_uid is null or v_h is null or p_amount is null or p_amount <= 0 then
    raise exception 'invalid';
  end if;
  select id into v_scat from categories
    where household_id = v_h and space = 'shared' and kind = 'income'
      and name in ('Contributions','Aportaciones') limit 1;
  if v_scat is null then
    insert into categories (user_id, space, household_id, name, icon, kind)
    values (v_uid, 'shared', v_h, v_in, '🤝', 'income') returning id into v_scat;
  end if;
  select id into v_pcat from categories
    where user_id = v_uid and space = 'personal' and kind = 'expense'
      and name in ('Shared household','Hogar compartido') limit 1;
  if v_pcat is null then
    insert into categories (user_id, space, name, icon, kind)
    values (v_uid, 'personal', v_out, '🏡', 'expense') returning id into v_pcat;
  end if;
  insert into transactions (user_id, space, household_id, category_id, kind, amount, tx_date, note, source)
  values (v_uid, 'shared', v_h, v_scat, 'income', p_amount, coalesce(p_date, current_date), v_in, 'manual');
  insert into transactions (user_id, space, category_id, kind, amount, tx_date, note, source)
  values (v_uid, 'personal', v_pcat, 'expense', p_amount, coalesce(p_date, current_date), v_out, 'manual');
end;
$$;
grant execute on function public.contribute_shared(numeric, date, text) to authenticated;

-- "All together" now includes the shared space (if any)
drop function if exists public.space_overview(date);
create or replace function public.space_overview(p_month date)
returns table (
  space text, income numeric, expense numeric, ytd_income numeric, ytd_expense numeric,
  investments numeric, debts numeric, goals_saved numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with s(space) as (
    select 'personal' union all select 'business'
    union all select 'shared' where public.my_household() is not null
  ),
  mine as (
    select * from transactions t
    where (t.space <> 'shared' and t.user_id = auth.uid())
       or (t.space = 'shared' and t.household_id = public.my_household())
  )
  select
    s.space,
    coalesce((select sum(amount) from mine t where t.space = s.space and t.kind = 'income'
      and t.tx_date >= p_month and t.tx_date < p_month + interval '1 month'), 0),
    coalesce((select sum(amount) from mine t where t.space = s.space and t.kind = 'expense'
      and t.tx_date >= p_month and t.tx_date < p_month + interval '1 month'), 0),
    coalesce((select sum(amount) from mine t where t.space = s.space and t.kind = 'income'
      and t.tx_date >= date_trunc('year', p_month) and t.tx_date < p_month + interval '1 month'), 0),
    coalesce((select sum(amount) from mine t where t.space = s.space and t.kind = 'expense'
      and t.tx_date >= date_trunc('year', p_month) and t.tx_date < p_month + interval '1 month'), 0),
    coalesce((select sum(balance) from investments i where i.space = s.space and not i.archived
      and ((i.space <> 'shared' and i.user_id = auth.uid()) or (i.space = 'shared' and i.household_id = public.my_household()))), 0),
    coalesce((select sum(balance) from debts d where d.space = s.space and not d.archived
      and ((d.space <> 'shared' and d.user_id = auth.uid()) or (d.space = 'shared' and d.household_id = public.my_household()))), 0),
    coalesce((select sum(saved) from goals g where g.space = s.space and not g.archived
      and ((g.space <> 'shared' and g.user_id = auth.uid()) or (g.space = 'shared' and g.household_id = public.my_household()))), 0)
  from s;
$$;
grant execute on function public.space_overview(date) to authenticated;
