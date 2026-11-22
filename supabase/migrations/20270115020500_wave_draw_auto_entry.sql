CREATE OR REPLACE FUNCTION public.execute_admin_kyaa_wave_draw(p_actor_app_user_id uuid, p_actor_admin_allowlist_id uuid, p_correlation_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare state public.kyaa_wave_draw_state%rowtype; saved public.kyaa_wave_draw_requests%rowtype;
 entry record; candidate record; tickets integer; chosen text; n integer:=0; result jsonb;
begin
 begin perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,true);
 exception when others then raise exception 'FAN_WEB_FORBIDDEN'; end;
 if p_request_id is null or p_correlation_id is null then raise exception 'FAN_WEB_INVALID_INPUT'; end if;
 select * into state from public.kyaa_wave_draw_state where singleton for update;
 select * into saved from public.kyaa_wave_draw_requests where actor_id=p_actor_app_user_id and request_id=p_request_id;
 if found then
  if saved.operation<>'execute' then raise exception 'FAN_WEB_CONFLICT'; end if;
  return saved.response;
 end if;
 if state.id is not null then raise exception 'FAN_WEB_CONFLICT'; end if;
 update public.kyaa_wave_draw_state set id=extensions.gen_random_uuid(),seed=extensions.gen_random_bytes(32),executed_at=clock_timestamp() where singleton returning * into state;
 for entry in select p.app_user_id, coalesce(e.preferences,(select array_agg(prize_key order by extensions.digest(state.seed||pg_catalog.uuid_send(p.app_user_id)||convert_to(prize_key,'UTF8'),'sha256')) from public.kyaa_wave_draw_prizes)) as preferences
 from public.kyaa_wave_participants p join public.app_users u on u.id=p.app_user_id and u.status='active'
 left join public.kyaa_wave_draw_preferences e on e.app_user_id=p.app_user_id
 where p.event_key='kyaa-wave-2026' and not exists(select 1 from public.app_user_moderation_restrictions restriction where restriction.app_user_id=p.app_user_id and restriction.revoked_at is null)
 order by p.app_user_id loop
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('fan-web-user:'||entry.app_user_id::text,0)) then raise exception 'FAN_WEB_ACCOUNT_BUSY' using errcode='55P03'; end if;
  select count(*) into tickets from jsonb_array_elements(public.read_owned_kyaa_wave_missions(entry.app_user_id)->'progress') mission where mission->>'status'='completed';
  if tickets>0 then
   insert into public.kyaa_wave_draw_candidates(draw_id,app_user_id,preferences,tickets,priority)
   values(state.id,entry.app_user_id,entry.preferences,tickets,
   -ln((public.benefit_digest_uint256(extensions.digest(state.seed||pg_catalog.uuid_send(state.id)||pg_catalog.uuid_send(entry.app_user_id),'sha256'))+1)/(power(2::numeric,256)+1))/tickets);
  end if;
 end loop;
 for candidate in select * from public.kyaa_wave_draw_candidates where draw_id=state.id order by priority,app_user_id loop
  n:=n+1;
  select preference.key into chosen from unnest(candidate.preferences) with ordinality preference(key,rank)
  join public.kyaa_wave_draw_prizes p on p.prize_key=preference.key
  where (select count(*) from public.kyaa_wave_draw_candidates c where c.draw_id=state.id and c.prize_key=p.prize_key)<p.quantity
  order by preference.rank limit 1;
  update public.kyaa_wave_draw_candidates set ordinal=n,prize_key=chosen where draw_id=state.id and app_user_id=candidate.app_user_id;
 end loop;
 result:=public.read_admin_kyaa_wave_draw(p_actor_app_user_id,p_actor_admin_allowlist_id);
 insert into public.kyaa_wave_draw_requests values(p_actor_app_user_id,p_request_id,'execute','',result);
 insert into public.audit_logs(actor_app_user_id,actor_admin_allowlist_id,action,entity_type,entity_id,correlation_id,before_after_summary)
 values(p_actor_app_user_id,p_actor_admin_allowlist_id,'kyaa_wave.draw_executed','kyaa_wave_draw',state.id::text,p_correlation_id,jsonb_build_object('drawId',state.id));
 return result;
end $function$;

CREATE OR REPLACE FUNCTION public.read_admin_kyaa_wave_draw(p_actor_app_user_id uuid, p_actor_admin_allowlist_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare state public.kyaa_wave_draw_state%rowtype;
begin
 begin perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,false);
 exception when others then raise exception 'FAN_WEB_FORBIDDEN'; end;
 select * into state from public.kyaa_wave_draw_state where singleton;
 return jsonb_build_object('draw',case when state.id is null then null else jsonb_build_object('id',state.id,'executedAt',state.executed_at,'revealedThrough',state.revealed_through) end,
 'entryCount',case when state.id is null then (select count(*) from public.kyaa_wave_participants p join public.app_users u on u.id=p.app_user_id and u.status='active' where p.event_key='kyaa-wave-2026' and not exists(select 1 from public.app_user_moderation_restrictions r where r.app_user_id=p.app_user_id and r.revoked_at is null)) else (select count(*) from public.kyaa_wave_draw_candidates where draw_id=state.id) end,
 'results',case when state.id is null then '[]'::jsonb else public.kyaa_wave_draw_winners(null,10) end);
end $function$;

CREATE OR REPLACE FUNCTION public.read_owned_kyaa_wave_draw(p_app_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare state public.kyaa_wave_draw_state%rowtype; entry public.kyaa_wave_draw_preferences%rowtype;
 candidate public.kyaa_wave_draw_candidates%rowtype; tickets integer; prize_ordinal integer; result jsonb;
begin
 perform public.fan_web_lock_active_user(p_app_user_id);
 if not exists(select 1 from public.kyaa_wave_participants where event_key='kyaa-wave-2026' and app_user_id=p_app_user_id) then raise exception 'FAN_WEB_FORBIDDEN'; end if;
 select * into state from public.kyaa_wave_draw_state where singleton;
 select * into entry from public.kyaa_wave_draw_preferences where app_user_id=p_app_user_id;
 select count(*) into tickets from jsonb_array_elements(public.read_owned_kyaa_wave_missions(p_app_user_id)->'progress') mission where mission->>'status'='completed';
 if state.id is not null then
  select * into candidate from public.kyaa_wave_draw_candidates where draw_id=state.id and app_user_id=p_app_user_id;
  if candidate.app_user_id is not null then tickets:=candidate.tickets; end if;
  select ordinal into prize_ordinal from public.kyaa_wave_draw_prizes where prize_key=candidate.prize_key;
 end if;
 result:=case when state.id is not null and candidate.app_user_id is null then jsonb_build_object('status','not_entered')
 when state.id is null then jsonb_build_object('status','pending')
 when prize_ordinal<=state.revealed_through then jsonb_build_object('status','won','prizeKey',candidate.prize_key)
 when state.revealed_through=10 then jsonb_build_object('status','not_won') else jsonb_build_object('status','pending') end;
 return jsonb_build_object('entry',case when entry.app_user_id is null then null else jsonb_build_object('preferences',entry.preferences,'updatedAt',entry.updated_at) end,
 'tickets',tickets,'draw',case when state.id is null then null else jsonb_build_object('id',state.id,'executedAt',state.executed_at,'revealedThrough',state.revealed_through) end,
 'result',result,'published',public.kyaa_wave_draw_winners(p_app_user_id,state.revealed_through));
end $function$;

