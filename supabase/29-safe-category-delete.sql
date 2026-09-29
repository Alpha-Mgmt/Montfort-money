-- Migration 29: a category that still has plan items (in ANY month) can't be deleted.
-- Before this, deleting a category left its plan items without a category and
-- they disappeared from the month view. Move the items first, then delete.
create or replace function public.guard_category_delete()
returns trigger language plpgsql set search_path = public as $$
declare n int;
begin
  -- only guard deletes a signed-in user makes from the app; account deletion
  -- (service role / cascade from auth.users) must always go through
  if auth.uid() is null or not exists (select 1 from auth.users where id = old.user_id) then
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
drop trigger if exists guard_category_delete on public.categories;
create trigger guard_category_delete before delete on public.categories
  for each row execute function public.guard_category_delete();
