\set ON_ERROR_STOP on
begin;
do $$ begin
  if has_table_privilege('anon','public.search_indexnow_state','SELECT')
    or has_table_privilege('authenticated','public.search_indexnow_state','UPDATE')
    or has_function_privilege('anon','public.claim_search_indexnow(uuid)','EXECUTE')
    or has_function_privilege('authenticated','public.acknowledge_search_indexnow(uuid,jsonb)','EXECUTE') then
    raise exception 'Search snapshot exposed';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.search_indexnow_state'::regclass) then raise exception 'RLS missing'; end if;
end $$;
set local role anon;
do $$ begin
  begin perform public.claim_search_indexnow('01000000-0000-4000-8000-000000000001'); raise exception 'anon unexpectedly claimed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.search_indexnow_state set snapshot='{}',lease_token=null,lease_until=null;
set local role service_role;
do $$
declare a uuid:='01000000-0000-4000-8000-000000000001'; b uuid:='01000000-0000-4000-8000-000000000002'; r jsonb;
begin
  r:=public.claim_search_indexnow(a);
  if r<>'{"acquired":true,"snapshot":{}}'::jsonb then raise exception 'Initial claim failed'; end if;
  if public.claim_search_indexnow(b)<>'{"acquired":false}'::jsonb then raise exception 'Concurrent lease acquired'; end if;
  if public.acknowledge_search_indexnow(b,'{"safe":"hash"}') then raise exception 'Other token acknowledged'; end if;
  perform public.release_search_indexnow(b);
  if (select lease_token from public.search_indexnow_state)<>a then raise exception 'Other token released lease'; end if;
  update public.search_indexnow_state set lease_until=statement_timestamp()-interval '1 second';
  if public.acknowledge_search_indexnow(a,'{"old":"hash"}') then raise exception 'Expired lease acknowledged'; end if;
  r:=public.claim_search_indexnow(b);
  if r->>'acquired'<>'true' then raise exception 'Expired lease not reclaimed'; end if;
  if public.acknowledge_search_indexnow(a,'{"old":"hash"}') then raise exception 'Stale token acknowledged'; end if;
  perform public.release_search_indexnow(a);
  if not public.acknowledge_search_indexnow(b,'{"new":"hash"}') then raise exception 'Active lease not acknowledged'; end if;
  perform public.release_search_indexnow(b);
  r:=public.claim_search_indexnow(a);
  if r->'snapshot'<>'{"new":"hash"}'::jsonb then raise exception 'Acknowledged state not durable'; end if;
  perform public.release_search_indexnow(a);
  if (select snapshot from public.search_indexnow_state)<>'{"new":"hash"}'::jsonb then raise exception 'Release lost retry state'; end if;
end $$;
rollback;
