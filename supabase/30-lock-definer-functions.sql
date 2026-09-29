-- Migration 30: only signed-in users may call our SECURITY DEFINER functions;
-- trigger-only functions aren't callable through the API at all.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, t.typname as ret
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_type t on t.oid=p.prorettype
    where n.nspname='public' and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    if f.ret = 'trigger' then
      execute format('revoke execute on function %s from authenticated', f.sig);
    else
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;
revoke execute on function public.check_invite(text) from authenticated; -- old invite gate, unused
alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;
