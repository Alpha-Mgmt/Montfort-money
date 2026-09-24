-- Migration 14: Personal / Business spaces.
-- Every money row belongs to a space. The user's active space lives in
-- profiles.active_space; RLS only shows rows of the active space, and a
-- trigger stamps new rows with it. Result: the whole app works per space
-- with no per-query changes. Switching = update profiles + reload.

alter table public.profiles
  add column if not exists active_space text not null default 'personal'
    check (active_space in ('personal','business')),
  add column if not exists lang text check (lang in ('en','es')),
  add column if not exists business_name text,
  add column if not exists tax_rate numeric(5,2) not null default 25;

-- the active space of the caller (security definer: no RLS recursion)
create or replace function public.current_space()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select active_space from profiles where id = auth.uid()), 'personal');
$$;
grant execute on function public.current_space() to authenticated;

-- stamp new rows with the owner's active space (unless given explicitly)
create or replace function public.stamp_space()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.space is null then
    new.space := coalesce(
      (select active_space from profiles where id = new.user_id), 'personal');
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts','categories','transactions','budgets','tasks',
    'recurring_items','debts','investments','goals'
  ] loop
    execute format(
      'alter table public.%I add column if not exists space text default ''personal''', t);
    execute format('update public.%I set space = ''personal'' where space is null', t);
    execute format('alter table public.%I alter column space drop default', t);
    execute format('alter table public.%I alter column space set not null', t);
    execute format(
      'alter table public.%I drop constraint if exists %I', t, t || '_space_check');
    execute format(
      'alter table public.%I add constraint %I check (space in (''personal'',''business''))',
      t, t || '_space_check');
    execute format('drop trigger if exists stamp_space on public.%I', t);
    execute format(
      'create trigger stamp_space before insert on public.%I for each row execute function public.stamp_space()', t);
    execute format('create index if not exists %I on public.%I(user_id, space)', t || '_space_idx', t);
  end loop;
end $$;

-- RLS: own rows AND active space
drop policy if exists "own accounts" on public.accounts;
create policy "own accounts" on public.accounts for all
  using (auth.uid() = user_id and space = (select public.current_space()))
  with check (auth.uid() = user_id and space = (select public.current_space()));

drop policy if exists "own categories" on public.categories;
create policy "own categories" on public.categories for all
  using (auth.uid() = user_id and space = (select public.current_space()))
  with check (auth.uid() = user_id and space = (select public.current_space()));

drop policy if exists "own transactions" on public.transactions;
create policy "own transactions" on public.transactions for all
  using (auth.uid() = user_id and space = (select public.current_space()))
  with check (auth.uid() = user_id and space = (select public.current_space()));

drop policy if exists "own budgets" on public.budgets;
create policy "own budgets" on public.budgets for all
  using (auth.uid() = user_id and space = (select public.current_space()))
  with check (auth.uid() = user_id and space = (select public.current_space()));

drop policy if exists "own tasks" on public.tasks;
create policy "own tasks" on public.tasks for all
  using (auth.uid() = user_id and space = (select public.current_space()))
  with check (auth.uid() = user_id and space = (select public.current_space()));

drop policy if exists "own recurring" on public.recurring_items;
create policy "own recurring" on public.recurring_items for all
  using (auth.uid() = user_id and space = (select public.current_space()))
  with check (auth.uid() = user_id and space = (select public.current_space()));

drop policy if exists "own debts" on public.debts;
create policy "own debts" on public.debts for all
  using (auth.uid() = user_id and space = (select public.current_space()))
  with check (auth.uid() = user_id and space = (select public.current_space()));

drop policy if exists "own investments" on public.investments;
create policy "own investments" on public.investments for all
  using (auth.uid() = user_id and space = (select public.current_space()))
  with check (auth.uid() = user_id and space = (select public.current_space()));

drop policy if exists "own goals" on public.goals;
create policy "own goals" on public.goals for all
  using (auth.uid() = user_id and space = (select public.current_space()))
  with check (auth.uid() = user_id and space = (select public.current_space()));

-- category names are unique per space
drop index if exists public.categories_unique_name;
create unique index if not exists categories_unique_name
  on public.categories (user_id, space, kind,
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), name);

-- tasks completed from a space keep their transaction in that space
create or replace function public.stamp_space_from_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.task_id is not null then
    select space into new.space from tasks where id = new.task_id;
  end if;
  return new;
end;
$$;
drop trigger if exists zz_space_from_task on public.transactions;
create trigger zz_space_from_task before insert on public.transactions
  for each row when (new.task_id is not null)
  execute function public.stamp_space_from_task();

-- switch space (validated)
create or replace function public.set_space(p_space text)
returns void
language sql
security definer
set search_path = public
as $$
  update profiles set active_space = p_space
  where id = auth.uid() and p_space in ('personal','business');
$$;
grant execute on function public.set_space(text) to authenticated;

-- "All together": totals per space for one month + balances, across spaces
create or replace function public.space_overview(p_month date)
returns table (
  space text,
  income numeric,
  expense numeric,
  ytd_income numeric,
  ytd_expense numeric,
  investments numeric,
  debts numeric,
  goals_saved numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with s(space) as (values ('personal'), ('business'))
  select
    s.space,
    coalesce((select sum(amount) from transactions t where t.user_id = auth.uid() and t.space = s.space
      and t.kind = 'income' and t.tx_date >= p_month and t.tx_date < p_month + interval '1 month'), 0),
    coalesce((select sum(amount) from transactions t where t.user_id = auth.uid() and t.space = s.space
      and t.kind = 'expense' and t.tx_date >= p_month and t.tx_date < p_month + interval '1 month'), 0),
    coalesce((select sum(amount) from transactions t where t.user_id = auth.uid() and t.space = s.space
      and t.kind = 'income' and t.tx_date >= date_trunc('year', p_month) and t.tx_date < p_month + interval '1 month'), 0),
    coalesce((select sum(amount) from transactions t where t.user_id = auth.uid() and t.space = s.space
      and t.kind = 'expense' and t.tx_date >= date_trunc('year', p_month) and t.tx_date < p_month + interval '1 month'), 0),
    coalesce((select sum(balance) from investments i where i.user_id = auth.uid() and i.space = s.space and not i.archived), 0),
    coalesce((select sum(balance) from debts d where d.user_id = auth.uid() and d.space = s.space and not d.archived), 0),
    coalesce((select sum(saved) from goals g where g.user_id = auth.uid() and g.space = s.space and not g.archived), 0)
  from s;
$$;
grant execute on function public.space_overview(date) to authenticated;

-- "Pay yourself": one atomic move business -> personal
drop function if exists public.pay_owner(numeric, date, text);
create or replace function public.pay_owner(p_amount numeric, p_date date, p_note text, p_lang text default 'en')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_bcat uuid;
  v_pcat uuid;
  v_label text := case when p_lang = 'es' then 'Pago al dueño' else 'Owner pay' end;
begin
  if v_uid is null or p_amount is null or p_amount <= 0 then
    raise exception 'invalid';
  end if;
  select id into v_bcat from categories
    where user_id = v_uid and space = 'business' and kind = 'expense' and name in ('Owner pay','Pago al dueño') limit 1;
  if v_bcat is null then
    insert into categories (user_id, space, name, icon, kind)
    values (v_uid, 'business', v_label, '👤', 'expense') returning id into v_bcat;
  end if;
  select id into v_pcat from categories
    where user_id = v_uid and space = 'personal' and kind = 'income' and name in ('Owner pay','Pago al dueño') limit 1;
  if v_pcat is null then
    insert into categories (user_id, space, name, icon, kind)
    values (v_uid, 'personal', v_label, '💼', 'income') returning id into v_pcat;
  end if;
  insert into transactions (user_id, space, category_id, kind, amount, tx_date, note, source)
  values (v_uid, 'business', v_bcat, 'expense', p_amount, coalesce(p_date, current_date), coalesce(nullif(p_note,''), v_label), 'manual'),
         (v_uid, 'personal', v_pcat, 'income',  p_amount, coalesce(p_date, current_date), coalesce(nullif(p_note,''), v_label), 'manual');
end;
$$;
grant execute on function public.pay_owner(numeric, date, text, text) to authenticated;
