-- T2 ONLY: operator must pin this file, the installed issue definition, finalized Hub init4 and worker readiness.
-- Must run as DB owner; no production mutation occurs during prepare migration.
begin;
-- Cached old function calls may complete after commit; the post-T2 drain must include all pre-cutover transactions, including idle-in-transaction sessions.
lock table public.community_stamps in access exclusive mode;
lock table public.fan_action_producer_routes in share row exclusive mode;
do $$
begin
  -- Exact production issuer fingerprint from the read-only 2026-10-29 RDS readback.
  if encode(extensions.digest(pg_get_functiondef('public.issue_community_stamp(uuid,uuid,public.community_stamp_kind,text)'::regprocedure),'sha256'),'hex')<>'49f786bb5d845f4d3476e3fa61851c6b6a09fedecdf356d9de137df33c9b1ea4' then
    raise exception 'COMMUNITY_NATIVE_ISSUER_DEFINITION_CHANGED';
  end if;
  if (select count(*) from public.fan_action_producer_routes route
      join public.fan_action_bindings binding on binding.id=route.binding_id
      where route.action_code in (7,8,9,10,12) and binding.binding_version=2)<>5
    or (select count(distinct binding_id) from public.fan_action_producer_routes where action_code in (7,8,9,10,12))<>1
    or exists(select 1 from public.fan_action_canary_scope where action_code in (7,8,9,10,12)) then
    raise exception 'COMMUNITY_NATIVE_ROUTES_NOT_READY';
  end if;
  if not exists(select 1 from pg_enum where enumtypid='public.community_stamp_kind'::regtype and enumlabel='first_clip')
    or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='fan_clips' and column_name='first_stamp_eligible')
    or position('first_stamp_eligible' in pg_get_functiondef('public.assert_community_stamp_source(uuid,uuid,public.community_stamp_kind,text)'::regprocedure))=0 then
    raise exception 'COMMUNITY_NATIVE_FIRST_CLIP_PROOF_REQUIRED';
  end if;
end $$;
CREATE OR REPLACE FUNCTION public.issue_community_stamp(p_app_user_id uuid, p_celebrity_id uuid, p_kind community_stamp_kind, p_source_key text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_recipient text;v_celebrity_slug text;v_stamp_id uuid:=extensions.gen_random_uuid();
  v_job_id uuid:=extensions.gen_random_uuid();v_operation_key text;v_payload jsonb;v_outbox_id uuid;
  v_action_code integer;v_campaign_id uuid;v_occurred_at timestamptz:=pg_catalog.statement_timestamp();v_source_id uuid;
begin
  if p_app_user_id is null or p_kind is null or p_source_key is null then
    raise exception 'COMMUNITY_STAMP_INVALID_REQUEST' using errcode='22023'; end if;
  if p_kind in ('subscription','support') then
    raise exception 'COMMUNITY_STAMP_UNAVAILABLE' using errcode='P0001'; end if;
  perform 1 from public.app_users app_user where app_user.id=p_app_user_id and app_user.status='active' for key share;
  if not found then raise exception 'COMMUNITY_STAMP_NOT_FOUND' using errcode='P0002'; end if;
  select wallet.address into v_recipient from public.user_wallets wallet where wallet.app_user_id=p_app_user_id
    and wallet.chain_id=91342 and wallet.provider='privy' and wallet.wallet_type='embedded' for key share;
  if v_recipient is null then raise exception 'COMMUNITY_STAMP_WALLET_NOT_READY' using errcode='P0001'; end if;
  if p_celebrity_id is not null then
    select celebrity.slug into v_celebrity_slug from public.celebrities celebrity where celebrity.id=p_celebrity_id
      and celebrity.status='published' and celebrity.archived_at is null for key share;
    if v_celebrity_slug is null then raise exception 'COMMUNITY_STAMP_NOT_FOUND' using errcode='P0002'; end if;
  end if;
  perform public.assert_community_stamp_source(p_app_user_id,p_celebrity_id,p_kind,p_source_key);
  if p_kind='wave_mission' then
    select config.campaign_id,completion.completed_at into strict v_campaign_id,v_occurred_at
    from public.kyaa_wave_mission_completions completion join public.kyaa_wave_participation_config config on config.event_key=completion.event_key and config.creator_id=completion.celebrity_id
    where completion.app_user_id=p_app_user_id and completion.celebrity_id=p_celebrity_id and p_source_key='wave-mission:'||completion.id::text;
  end if;
  if p_kind='wave_mission' and (not (select enabled from public.kyaa_wave_stamp_activation where singleton) or not public.fan_action_native_enabled(4,p_app_user_id,p_celebrity_id,v_campaign_id)) then
    raise exception 'COMMUNITY_STAMP_UNAVAILABLE';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('community-stamp:'||p_app_user_id::text||':'||p_kind::text||':'||coalesce(p_celebrity_id::text,'global')||':'||p_source_key,0));
  if exists(select 1 from public.community_stamps stamp where stamp.app_user_id=p_app_user_id and stamp.kind=p_kind and
      (stamp.source_key=p_source_key or (p_kind='welcome' and stamp.celebrity_id is null)
        or (p_kind in ('first_comment','subscription','support','share') and stamp.celebrity_id=p_celebrity_id))) then return false; end if;
  v_action_code:=case p_kind when 'wave_mission' then 4 when 'welcome' then 7 when 'first_comment' then 8 when 'invite' then 9 when 'daily_checkin' then 10 when 'share' then 12 when 'first_clip' then 12 end;
  if v_action_code is null then raise exception 'COMMUNITY_STAMP_UNAVAILABLE'; end if;
  if p_kind='first_comment' then
    v_source_id:=pg_catalog.split_part(p_source_key,':',3)::uuid;
    case pg_catalog.split_part(p_source_key,':',2)
    when 'lounge' then select created_at into strict v_occurred_at from public.fan_lounge_messages where id=v_source_id;
    when 'notice' then select created_at into strict v_occurred_at from public.celebrity_notice_comments where id=v_source_id;
    when 'post' then select created_at into strict v_occurred_at from public.fan_posts where id=v_source_id and first_comment_eligible;
    else raise exception 'COMMUNITY_STAMP_INVALID_REQUEST' using errcode='22023';
    end case;
  elsif p_kind='invite' then
    v_source_id:=pg_catalog.split_part(p_source_key,':',2)::uuid;
    select redeemed_at into strict v_occurred_at from public.community_stamp_invite_redemptions where id=v_source_id;
  end if;
  v_operation_key:='byus:community-stamp:v1:'||v_stamp_id::text;
  v_payload:=jsonb_build_object('recipient',v_recipient,'issuanceId','0x'||encode(extensions.digest(v_operation_key,'sha256'),'hex'),
    'stampKind',p_kind::text,'celebritySlug',v_celebrity_slug);
  if p_kind='wave_mission' then
    v_payload:=v_payload||jsonb_build_object('missionKey',(select mission_key from public.kyaa_wave_mission_completions where p_source_key='wave-mission:'||id::text));
  end if;
  perform 1 from public.fan_action_producer_routes route
    join public.fan_action_bindings binding on binding.id=route.binding_id
    where route.action_code=v_action_code and route.enabled and binding.binding_version=2 for update of route;
  if not found then raise exception 'FAN_ACTION_ROUTE_REQUIRED'; end if;
  if v_action_code is not null and (case when p_kind='wave_mission' then public.fan_action_native_enabled(v_action_code,p_app_user_id,p_celebrity_id,v_campaign_id) else public.fan_action_native_enabled(v_action_code,p_app_user_id,p_celebrity_id) end) then
    v_outbox_id:=public.enqueue_fan_action_source('community_stamps',p_source_key||':'||p_app_user_id::text,
      p_app_user_id,p_celebrity_id,v_campaign_id,v_occurred_at,v_action_code,jsonb_build_array(jsonb_build_object(
        'entityType','community_stamp','entityId',v_stamp_id,'kind',1,
        'issuanceKey','0x'||encode(extensions.digest(v_operation_key,'sha256'),'hex'),
        'operationKey',v_operation_key,'legacyPayload',v_payload)));
    insert into public.community_stamps(id,app_user_id,celebrity_id,kind,source_key,issued_at,blockchain_job_id,fan_action_outbox_id)
      values(v_stamp_id,p_app_user_id,p_celebrity_id,p_kind,p_source_key,v_occurred_at,null,v_outbox_id);
  else
    raise exception 'FAN_ACTION_ROUTE_REQUIRED';
  end if;
  return true;
exception when unique_violation then return false;
end $function$;

update public.fan_action_producer_routes set enabled=true,enabled_at=clock_timestamp()
where action_code in (7,8,9,10,12);
commit;
-- Only after this commit: drain every legacy pending/processing/retrying/failed job,
-- binding1 MINT outbox, signed transaction, writer lease and pre-cutover transaction to zero before oldPassport and oldStamp pause/revoke.
