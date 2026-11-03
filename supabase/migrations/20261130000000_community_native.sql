begin;
-- Prepare only. T2 activation is a separate owner-only transaction after Hub/worker readiness.
alter table public.fan_action_producer_routes drop constraint fan_action_producer_routes_action_code_check;
alter table public.fan_action_producer_routes add constraint fan_action_producer_routes_action_code_check check(action_code between 1 and 12);

-- Patch only installed action helpers; leave the production first_clip source verifier untouched.
do $$
declare signature regprocedure; definition text;
begin
  foreach signature in array array[
    'public.enqueue_fan_action_source(text,text,uuid,uuid,uuid,timestamptz,integer,jsonb)'::regprocedure,
    'public.fan_action_native_enabled(integer)'::regprocedure,
    'public.fan_action_native_enabled(integer,uuid)'::regprocedure,
    'public.configure_fan_action_canary_scope(integer,uuid[])'::regprocedure
  ] loop
    definition:=pg_get_functiondef(signature);
    if length(definition)-length(replace(definition,'p_action_code not between 1 and 11',''))<>length('p_action_code not between 1 and 11') then
      raise exception 'COMMUNITY_NATIVE_CODE_PATCH_DRIFT: %',signature;
    end if;
    execute replace(definition,'p_action_code not between 1 and 11','p_action_code not between 1 and 12');
  end loop;
end $$;

-- Extend the shared trust boundary, not only the producer's metadata.
do $$
declare signature regprocedure:='public.enqueue_fan_action_source(text,text,uuid,uuid,uuid,timestamptz,integer,jsonb)'::regprocedure;
  definition text; anchor text:=$anchor$  if p_creator_id is not null and not exists($anchor$;
  replacement text:=$patch$  if p_action_code=12 then
    if p_namespace is distinct from 'community_stamps' or p_campaign_id is not null
      or jsonb_array_length(p_credentials)<>1
      or p_credentials->0->>'entityType' is distinct from 'community_stamp'
      or p_credentials->0->>'kind' is distinct from '1'
      or not coalesce(p_credentials->0->'legacyPayload'->>'stampKind' in ('share','first_clip'),false)
      or p_creator_id is null then
      raise exception 'FAN_ACTION_INVALID_COMMUNITY_CREDENTIAL';
    end if;
    if p_credentials->0->>'operationKey' is distinct from 'byus:community-stamp:v1:'||(p_credentials->0->>'entityId')
      or p_credentials->0->>'issuanceKey' is distinct from '0x'||encode(extensions.digest(p_credentials->0->>'operationKey','sha256'),'hex')
      or p_credentials->0->'legacyPayload'->>'issuanceId' is distinct from p_credentials->0->>'issuanceKey'
      or right(p_source_key,37) is distinct from ':'||p_app_user_id::text then
      raise exception 'FAN_ACTION_INVALID_COMMUNITY_CREDENTIAL';
    end if;
    perform public.assert_community_stamp_source(p_app_user_id,p_creator_id,
      (p_credentials->0->'legacyPayload'->>'stampKind')::public.community_stamp_kind,
      left(p_source_key,length(p_source_key)-37));
    perform 1 from public.fan_action_producer_routes route
      join public.fan_action_bindings binding on binding.id=route.binding_id
      where route.action_code=12 and route.enabled and binding.binding_version=2 for update of route;
    if not found then raise exception 'FAN_ACTION_ROUTE_REQUIRED'; end if;
    if not public.fan_action_native_enabled(12,p_app_user_id,p_creator_id) then
      raise exception 'FAN_ACTION_ROUTE_REQUIRED';
    end if;
  end if;

  if p_creator_id is not null and not exists($patch$;
begin
  definition:=pg_get_functiondef(signature);
  if length(definition)-length(replace(definition,anchor,''))<>length(anchor) then raise exception 'COMMUNITY_NATIVE_ENQUEUE_PATCH_DRIFT'; end if;
  execute replace(definition,anchor,replacement);
end $$;

do $$
declare signature regprocedure:='public.fan_action_native_enabled(integer,uuid,uuid)'::regprocedure; definition text;
begin
  definition:=pg_get_functiondef(signature);
  if position('p_action_code not in (1, 6, 8, 10)' in definition)=0 then raise exception 'COMMUNITY_NATIVE_CREATOR_PATCH_DRIFT'; end if;
  execute replace(definition,'p_action_code not in (1, 6, 8, 10)','p_action_code not in (1, 6, 8, 10, 12)');
end $$;

-- A prepared route does not stop existing share issuance before T2.
insert into public.fan_action_producer_routes(action_code,binding_id,enabled,policy_version)
select 12,min(route.binding_id::text)::uuid,false,min(route.policy_version)
from public.fan_action_producer_routes route join public.fan_action_bindings binding on binding.id=route.binding_id
where route.action_code in (7,8,9,10) and binding.binding_version=2
having count(*)=4 and count(distinct route.binding_id)=1 and count(distinct route.policy_version)=1
on conflict(action_code) do nothing;

commit;
