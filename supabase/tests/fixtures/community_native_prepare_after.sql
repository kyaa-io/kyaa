do $$
begin
  if not exists(select 1 from public.fan_action_producer_routes where action_code=12 and not enabled and binding_id='fa160000-0000-4000-8000-000000000001' and policy_version=1)
    or (select count(*) from public.fan_action_producer_routes where action_code in (7,8,9,10) and not enabled)<>4
    or (select definition from public.community_native_prepare_definition) is distinct from pg_get_functiondef('public.issue_community_stamp(uuid,uuid,public.community_stamp_kind,text)'::regprocedure) then
    raise exception 'COMMUNITY_NATIVE_PREPARE_CHANGED_ISSUANCE';
  end if;
end $$;
delete from public.fan_action_producer_routes where action_code in (7,8,9,10,12);
drop table public.community_native_prepare_definition;
select 'COMMUNITY_NATIVE_PREPARE_PASS' result;
