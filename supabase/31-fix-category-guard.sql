-- Migration 31: the category guard (mig 29) read auth.users, which the app role
-- can't see — every category delete from the app failed with
-- "permission denied for table users". Service role / account deletion has no
-- auth.uid(), so that check is enough.
create or replace function public.guard_category_delete()
returns trigger language plpgsql set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then
    return old;
  end if;
  select count(*) into n from recurring_items r
   where r.active and (r.category_id = old.id
      or r.category_id in (select id from categories where parent_id = old.id));
  if n > 0 then
    raise exception 'CATEGORY_IN_USE:%', n using hint = 'Move its plan items to another category first';
  end if;
  return old;
end $$;
