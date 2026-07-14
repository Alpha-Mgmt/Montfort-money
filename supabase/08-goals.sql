-- ============================================================
-- Montfort Money — migration 08 (run once in Supabase SQL editor)
-- Goals: save toward a house, car, watch, vacation…
-- ============================================================

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_amount numeric(14,2) not null check (target_amount > 0),
  target_date date,
  saved numeric(14,2) not null default 0 check (saved >= 0),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.goals enable row level security;
create policy "own goals" on public.goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists goals_user_idx on public.goals(user_id, archived);

alter table public.transactions
  add column if not exists goal_id uuid references public.goals(id) on delete set null;

create or replace function public.record_goal_contribution(
  p_goal_id uuid,
  p_amount numeric,
  p_account_id uuid default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_goal goals%rowtype;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  select * into v_goal from goals
  where id = p_goal_id and user_id = auth.uid()
  for update;
  if not found then
    raise exception 'goal not found';
  end if;

  insert into transactions
    (user_id, account_id, kind, amount, tx_date, note, source, goal_id)
  values
    (v_goal.user_id, p_account_id, 'expense', p_amount,
     current_date, v_goal.name || ' — set aside', 'manual', v_goal.id);

  update goals set saved = saved + p_amount where id = v_goal.id;
  return (select saved from goals where id = v_goal.id);
end;
$$;

grant execute on function public.record_goal_contribution(uuid, numeric, uuid) to authenticated;
