-- Migration 28: Trips — plan a trip with friends or your partner.
-- A trip has members (invite by link), an itinerary (flights, stays, activities
-- with confirmation numbers), shared expenses (who paid, split between who)
-- and a trip fund everyone chips into. Everything is visible to every member.

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  destination text,
  start_date date,
  end_date date,
  cover_path text,              -- trip-covers/<trip id>/<file>
  budget numeric(14,2),
  fund_goal numeric(14,2),
  currency text not null default 'USD',
  notes text,
  invite_code text not null unique default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.trip_members (
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null default 'Viajero',
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create table if not exists public.trip_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  kind text not null default 'activity' check (kind in ('flight','stay','transport','activity','food','note')),
  title text not null,
  item_date date,
  item_time text,               -- "14:30"
  end_date date,
  location text,
  reference text,               -- flight number, train, etc.
  confirmation text,            -- booking / confirmation code
  url text,
  details text,
  cost numeric(14,2),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists trip_items_trip on public.trip_items(trip_id, item_date);

create table if not exists public.trip_expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  title text not null,
  amount numeric(14,2) not null check (amount > 0),
  paid_by uuid not null references auth.users(id) on delete cascade,
  split_among uuid[],           -- null = everyone on the trip
  spent_on date not null default current_date,
  category text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists trip_expenses_trip on public.trip_expenses(trip_id);

create table if not exists public.trip_contributions (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  amount numeric(14,2) not null check (amount > 0),
  given_on date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

-- membership check (security definer: no RLS recursion)
create or replace function public.is_trip_member(p_trip uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from trip_members where trip_id = p_trip and user_id = auth.uid());
$$;
grant execute on function public.is_trip_member(uuid) to authenticated;

-- the creator becomes the first member
create or replace function public.trip_add_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into trip_members(trip_id, user_id, display_name, role)
  values (new.id, new.owner_id,
          coalesce(nullif((select full_name from profiles where id = new.owner_id), ''),
                   split_part((select email from auth.users where id = new.owner_id), '@', 1), 'Yo'),
          'owner')
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists trip_add_owner on public.trips;
create trigger trip_add_owner after insert on public.trips for each row execute function public.trip_add_owner();

-- invite link: look up a trip by its code (no membership needed)
create or replace function public.trip_invite_info(p_code text)
returns table(trip_id uuid, name text, destination text, start_date date, owner_name text, already boolean)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, t.destination, t.start_date,
         (select display_name from trip_members m where m.trip_id = t.id and m.role = 'owner' limit 1),
         exists (select 1 from trip_members m where m.trip_id = t.id and m.user_id = auth.uid())
  from trips t where t.invite_code = upper(p_code) and not t.archived;
$$;
grant execute on function public.trip_invite_info(text) to authenticated;

create or replace function public.join_trip(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  select id into t from trips where invite_code = upper(p_code) and not archived;
  if t is null then raise exception 'Invite not valid'; end if;
  insert into trip_members(trip_id, user_id, display_name)
  values (t, auth.uid(),
          coalesce(nullif((select full_name from profiles where id = auth.uid()), ''),
                   split_part((select email from auth.users where id = auth.uid()), '@', 1), 'Viajero'))
  on conflict do nothing;
  return t;
end $$;
grant execute on function public.join_trip(text) to authenticated;

-- ---------- RLS ----------
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.trip_items enable row level security;
alter table public.trip_expenses enable row level security;
alter table public.trip_contributions enable row level security;

drop policy if exists "trips read" on public.trips;
create policy "trips read" on public.trips for select to authenticated using (owner_id = auth.uid() or public.is_trip_member(id));
drop policy if exists "trips create" on public.trips;
create policy "trips create" on public.trips for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists "trips edit" on public.trips;
create policy "trips edit" on public.trips for update to authenticated using (public.is_trip_member(id));
drop policy if exists "trips delete" on public.trips;
create policy "trips delete" on public.trips for delete to authenticated using (owner_id = auth.uid());

drop policy if exists "trip members read" on public.trip_members;
create policy "trip members read" on public.trip_members for select to authenticated using (public.is_trip_member(trip_id));
drop policy if exists "trip members rename self" on public.trip_members;
create policy "trip members rename self" on public.trip_members for update to authenticated using (user_id = auth.uid());
drop policy if exists "trip members leave" on public.trip_members;
create policy "trip members leave" on public.trip_members for delete to authenticated
  using (user_id = auth.uid() or exists (select 1 from trips t where t.id = trip_id and t.owner_id = auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['trip_items','trip_expenses','trip_contributions'] loop
    execute format('drop policy if exists "%s members" on public.%I', t, t);
    execute format('create policy "%s members" on public.%I for all to authenticated using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id))', t, t);
  end loop;
end $$;

-- ---------- cover photos (public read; only members upload into their trip's folder) ----------
insert into storage.buckets (id, name, public)
values ('trip-covers', 'trip-covers', true)
on conflict (id) do nothing;

drop policy if exists "trip covers write" on storage.objects;
create policy "trip covers write" on storage.objects for insert to authenticated
  with check (bucket_id = 'trip-covers' and public.is_trip_member(((storage.foldername(name))[1])::uuid));
drop policy if exists "trip covers delete" on storage.objects;
create policy "trip covers delete" on storage.objects for delete to authenticated
  using (bucket_id = 'trip-covers' and public.is_trip_member(((storage.foldername(name))[1])::uuid));

-- only signed-in users call the trip functions; the trigger isn't an API
revoke execute on function public.is_trip_member(uuid) from anon, public;
revoke execute on function public.join_trip(text) from anon, public;
revoke execute on function public.trip_invite_info(text) from anon, public;
revoke execute on function public.trip_add_owner() from anon, public, authenticated;
grant execute on function public.is_trip_member(uuid) to authenticated;
grant execute on function public.join_trip(text) to authenticated;
grant execute on function public.trip_invite_info(text) to authenticated;
