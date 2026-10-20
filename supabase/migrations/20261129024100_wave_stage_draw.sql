create table public.wave_stage_draws(
 event_key text primary key check(event_key='kyaa-wave-20261022'),
 idempotency_key uuid not null unique,
 changha_draw_id uuid not null unique references public.benefit_draws(id),
 wena_draw_id uuid not null unique references public.benefit_draws(id),
 executed_at timestamptz not null, published_at timestamptz not null
);
alter table public.wave_stage_draws enable row level security;
revoke all on public.wave_stage_draws from public,anon,authenticated,service_role;
create function public.read_admin_wave_stage(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; pair public.wave_stage_draws%rowtype; conflict boolean;
begin
 perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,false);
 select * into pair from public.wave_stage_draws where event_key='kyaa-wave-20261022';
 conflict:=(exists(select 1 from public.benefit_draws where campaign_id in ('aedf77a4-52e9-4acd-aa7a-79ceee5ca8eb','c3930f7f-bd2b-4e58-8cec-b3c61f8463fe')) and pair.event_key is null)
 or (pair.event_key is not null and (select count(*) from public.benefit_draw_publications where draw_id in(pair.changha_draw_id,pair.wena_draw_id))<>2);
 with campaigns as (
 select campaign.*,creator.slug,coalesce(localized.name,creator.slug) creator_name from public.live_benefit_campaigns campaign
 join public.live_events live on live.id=campaign.live_event_id join public.celebrities creator on creator.id=live.celebrity_id
 left join public.celebrity_localizations localized on localized.celebrity_id=creator.id and localized.locale='ko'
 where (campaign.id='aedf77a4-52e9-4acd-aa7a-79ceee5ca8eb' and live.id='fde5ff1b-ac41-4c20-902b-034cba972023' and creator.slug='changha')
 or (campaign.id='c3930f7f-bd2b-4e58-8cec-b3c61f8463fe' and live.id='45fcead7-24f3-46aa-98ce-84dfe8c8e75b' and creator.slug='wena')
 ) select jsonb_build_object('stage',jsonb_build_object(
 'eventKey','kyaa-wave-20261022','asOf',statement_timestamp(),'liveSlug','changha-kyaa-wave-20261022',
 'creators',coalesce((select jsonb_agg(jsonb_build_object('slug',c.slug,'name',c.creator_name,'campaignId',c.id,'revision',c.revision,'entryClosesAt',c.entry_closes_at,
 'participantCount',stats.participants,'reservationCount',stats.reservations,'weightedEntryCount',stats.participants+stats.reservations,
 'photocardEligibleCount',(select count(*) from public.cheer_photocard_entitlements e join public.app_users u on u.id=e.app_user_id and u.status='active' where e.campaign_id=c.id)) order by c.slug)
 from campaigns c cross join lateral(select count(*) participants,count(*) filter(where exists(select 1 from public.live_reservations r where r.live_event_id=c.live_event_id and r.app_user_id=e.app_user_id and r.reserved_at<c.entry_closes_at)) reservations from public.benefit_cheer_entries e join public.app_users u on u.id=e.app_user_id and u.status='active' where e.campaign_id=c.id) stats),'[]'::jsonb),
 'prizes',coalesce((select jsonb_agg(jsonb_build_object('benefitId',i.benefit_id,'creatorSlug',c.slug,'kind',i.stage_prize_kind,'title',coalesce(l.title,b.slug),'winnerQuantity',i.winner_quantity) order by c.slug,i.priority) from campaigns c join public.live_benefit_campaign_items i on i.campaign_id=c.id join public.benefits b on b.id=i.benefit_id left join public.benefit_localizations l on l.benefit_id=b.id and l.locale='ko' where i.draw_enabled and i.stage_prize_kind is not null),'[]'::jsonb),
 'drawConflict',conflict,'draw',case when pair.event_key is null or conflict then null else jsonb_build_object('executedAt',pair.executed_at,'publishedAt',pair.published_at,
 'winners',coalesce((select jsonb_agg(jsonb_build_object('benefitId',w.benefit_id,'creatorSlug',c.slug,
 'displayName',coalesce(nullif(btrim(profile.nickname),''),'참여자'),'displayCode',upper(substr(encode(extensions.digest(w.app_user_id::text||':kyaa-wave-20261022','sha256'),'hex'),1,8))) order by c.slug,i.priority,w.id)
 from public.benefit_draw_winners w join campaigns c on c.id=w.campaign_id join public.live_benefit_campaign_items i on i.campaign_id=c.id and i.benefit_id=w.benefit_id
 left join public.user_profiles profile on profile.app_user_id=w.app_user_id where w.draw_id in(pair.changha_draw_id,pair.wena_draw_id)),'[]'::jsonb)) end)) into result;
 return result;
end $$;

create function public.execute_admin_wave_stage_draw(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_correlation_id uuid,p_idempotency_key uuid,p_changha_revision integer,p_wena_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare pair public.wave_stage_draws%rowtype; v_campaign record; at_time timestamptz; draw_result jsonb; changha_draw uuid; wena_draw uuid; derived_key uuid;
begin
 perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,true);
 if p_idempotency_key is null or p_changha_revision is null or p_wena_revision is null then raise exception 'FAN_WEB_INVALID_INPUT'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('wave-stage:kyaa-wave-20261022',0));
 -- Lock both campaigns before either LIVE, in the same order as the shared draw.
 perform 1 from public.live_benefit_campaigns where id in('aedf77a4-52e9-4acd-aa7a-79ceee5ca8eb','c3930f7f-bd2b-4e58-8cec-b3c61f8463fe') order by id for update;
 perform 1 from public.live_events where id in('fde5ff1b-ac41-4c20-902b-034cba972023','45fcead7-24f3-46aa-98ce-84dfe8c8e75b') order by id for update;
 at_time:=clock_timestamp();
 select * into pair from public.wave_stage_draws where event_key='kyaa-wave-20261022';
 if found then
  if pair.idempotency_key<>p_idempotency_key or (public.read_admin_wave_stage(p_actor_app_user_id,p_actor_admin_allowlist_id)->'stage'->>'drawConflict')::boolean then raise exception 'FAN_WEB_CONFLICT'; end if;
  return public.read_admin_wave_stage(p_actor_app_user_id,p_actor_admin_allowlist_id);
 end if;
 if exists(select 1 from public.benefit_draws where campaign_id in('aedf77a4-52e9-4acd-aa7a-79ceee5ca8eb','c3930f7f-bd2b-4e58-8cec-b3c61f8463fe') or idempotency_key=p_idempotency_key) then raise exception 'FAN_WEB_CONFLICT'; end if;
 if (select count(*) from public.live_benefit_campaigns c join public.live_events l on l.id=c.live_event_id join public.celebrities creator on creator.id=l.celebrity_id
 where c.status='published' and c.entry_source='cheer' and c.cancelled_at is null and l.publication_status='published' and l.archived_at is null and c.entry_opens_at<at_time and
 ((c.id='aedf77a4-52e9-4acd-aa7a-79ceee5ca8eb' and l.id='fde5ff1b-ac41-4c20-902b-034cba972023' and creator.slug='changha' and c.revision=p_changha_revision)
 or(c.id='c3930f7f-bd2b-4e58-8cec-b3c61f8463fe' and l.id='45fcead7-24f3-46aa-98ce-84dfe8c8e75b' and creator.slug='wena' and c.revision=p_wena_revision)))<>2 then raise exception 'FAN_WEB_CONFLICT'; end if;
 for v_campaign in select * from public.live_benefit_campaigns where id in('aedf77a4-52e9-4acd-aa7a-79ceee5ca8eb','c3930f7f-bd2b-4e58-8cec-b3c61f8463fe') order by id loop
  if not exists(select 1 from public.benefit_cheer_entries e join public.app_users u on u.id=e.app_user_id and u.status='active' where e.campaign_id=v_campaign.id)
   then raise exception 'WAVE_STAGE_EMPTY_CAMPAIGN'; end if;
  derived_key:=md5('wave-stage:'||p_idempotency_key::text||':'||v_campaign.id::text)::uuid;
  if exists(select 1 from public.benefit_draws where idempotency_key=derived_key) then raise exception 'FAN_WEB_CONFLICT'; end if;
  update public.live_benefit_campaigns set entry_closes_at=least(entry_closes_at,at_time),revision=revision+1,updated_at=at_time where id=v_campaign.id;
  draw_result:=public.execute_admin_benefit_draw(p_actor_app_user_id,p_actor_admin_allowlist_id,p_correlation_id,v_campaign.id,derived_key,at_time);
  perform public.publish_admin_benefit_draw(p_actor_app_user_id,p_actor_admin_allowlist_id,p_correlation_id,v_campaign.id,(draw_result->>'drawId')::uuid,at_time);
  if v_campaign.id='aedf77a4-52e9-4acd-aa7a-79ceee5ca8eb' then changha_draw:=(draw_result->>'drawId')::uuid; else wena_draw:=(draw_result->>'drawId')::uuid; end if;
 end loop;
 insert into public.wave_stage_draws values('kyaa-wave-20261022',p_idempotency_key,changha_draw,wena_draw,at_time,at_time);
 return public.read_admin_wave_stage(p_actor_app_user_id,p_actor_admin_allowlist_id);
end $$;
revoke all on function public.read_admin_wave_stage(uuid,uuid),public.execute_admin_wave_stage_draw(uuid,uuid,uuid,uuid,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.read_admin_wave_stage(uuid,uuid),public.execute_admin_wave_stage_draw(uuid,uuid,uuid,uuid,integer,integer) to service_role;
