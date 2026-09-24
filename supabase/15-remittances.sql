-- Migration 15: remittances (envíos de dinero).
-- Each transfer is logged here AND booked as a personal expense so the
-- budget stays true. Remittances always belong to the personal space.

create table if not exists public.remittances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sent_on date not null default current_date,
  amount numeric(12,2) not null check (amount > 0),   -- USD sent
  fee numeric(12,2) not null default 0 check (fee >= 0),
  currency text not null default 'MXN',               -- what they receive
  fx_rate numeric(14,6),
  received_amount numeric(14,2),
  provider text,
  recipient text,
  country text,
  note text,
  transaction_id uuid references public.transactions(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.remittances enable row level security;
drop policy if exists "own remittances" on public.remittances;
create policy "own remittances" on public.remittances for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists remittances_user_date_idx
  on public.remittances(user_id, sent_on desc);

-- monthly sending goal
alter table public.profiles
  add column if not exists remit_goal numeric(12,2);

-- log a transfer + its expense in one step
create or replace function public.record_remittance(
  p_sent_on date,
  p_amount numeric,
  p_fee numeric,
  p_currency text,
  p_fx_rate numeric,
  p_received numeric,
  p_provider text,
  p_recipient text,
  p_country text,
  p_lang text default 'en'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cat uuid;
  v_tx uuid;
  v_id uuid;
  v_label text := case when p_lang = 'es' then 'Remesas' else 'Remittances' end;
begin
  if v_uid is null or p_amount is null or p_amount <= 0 then
    raise exception 'invalid';
  end if;
  select id into v_cat from categories
    where user_id = v_uid and space = 'personal' and kind = 'expense'
      and name in ('Remittances','Remesas') limit 1;
  if v_cat is null then
    insert into categories (user_id, space, name, icon, kind)
    values (v_uid, 'personal', v_label, '✈️', 'expense') returning id into v_cat;
  end if;

  insert into transactions (user_id, space, category_id, kind, amount, tx_date, note, source)
  values (v_uid, 'personal', v_cat, 'expense', p_amount + coalesce(p_fee, 0),
          coalesce(p_sent_on, current_date),
          trim(both ' ' from concat_ws(' · ', v_label, nullif(p_recipient, ''), nullif(p_provider, ''))),
          'manual')
  returning id into v_tx;

  insert into remittances (user_id, sent_on, amount, fee, currency, fx_rate,
    received_amount, provider, recipient, country, transaction_id)
  values (v_uid, coalesce(p_sent_on, current_date), p_amount, coalesce(p_fee, 0),
    upper(coalesce(nullif(p_currency, ''), 'MXN')), p_fx_rate,
    coalesce(p_received, case when p_fx_rate is not null then round(p_amount * p_fx_rate, 2) end),
    nullif(p_provider, ''), nullif(p_recipient, ''), nullif(p_country, ''), v_tx)
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.record_remittance(date, numeric, numeric, text, numeric, numeric, text, text, text, text) to authenticated;

-- delete a transfer and its expense
create or replace function public.delete_remittance(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx uuid;
begin
  select transaction_id into v_tx from remittances where id = p_id and user_id = auth.uid();
  if not found then raise exception 'not found'; end if;
  delete from remittances where id = p_id and user_id = auth.uid();
  if v_tx is not null then
    delete from transactions where id = v_tx and user_id = auth.uid();
  end if;
end;
$$;
grant execute on function public.delete_remittance(uuid) to authenticated;
