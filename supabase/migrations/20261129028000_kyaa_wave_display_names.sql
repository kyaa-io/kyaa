-- Stable internal references are stripped by the server before public response validation.
create or replace function public.kyaa_wave_draw_winners(p_viewer uuid,p_revealed integer)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('prizeKey',p.prize_key,'winners',(
 select coalesce(jsonb_agg(jsonb_build_object(
 '__waveNameReference',candidate.draw_id::text||':'||candidate.app_user_id::text,
 'nickname',case when u.status='active' then coalesce(nullif(btrim(profile.nickname),''),'팬') else '팬' end,
 'avatarUrl',case when u.status='active' then public.public_fan_avatar_url(u.id) else '/images/avatars/star-cream.webp' end
 ) order by candidate.ordinal),'[]'::jsonb)
 from public.kyaa_wave_draw_candidates candidate join public.app_users u on u.id=candidate.app_user_id
 left join public.user_profiles profile on profile.app_user_id=u.id
 where candidate.prize_key=p.prize_key and (p_viewer is null or not public.fan_web_blocked(p_viewer,u.id))
 )) order by p.ordinal),'[]'::jsonb) from public.kyaa_wave_draw_prizes p where p.ordinal<=p_revealed;
$$;

create or replace function public.read_admin_wave_stage(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid) returns jsonb
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
 '__waveNameReference',w.id,
 'displayName',coalesce(nullif(btrim(profile.nickname),''),'참여자'),'displayCode',upper(substr(encode(extensions.digest(w.app_user_id::text||':kyaa-wave-20261022','sha256'),'hex'),1,8))) order by c.slug,i.priority,w.id)
 from public.benefit_draw_winners w join campaigns c on c.id=w.campaign_id join public.live_benefit_campaign_items i on i.campaign_id=c.id and i.benefit_id=w.benefit_id
 left join public.user_profiles profile on profile.app_user_id=w.app_user_id where w.draw_id in(pair.changha_draw_id,pair.wena_draw_id)),'[]'::jsonb)) end)) into result;
 return result;
end $$;

-- Only the trusted server can resolve identities already present in an authorized Wave read.
create function public.read_kyaa_wave_display_names(p_app_user_id uuid,p_references jsonb,p_admin_allowlist_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; is_admin boolean:=false;
begin
 if p_references is null or jsonb_typeof(p_references)<>'array' then raise exception 'FAN_WEB_INVALID_INPUT'; end if;
 if jsonb_array_length(p_references)>500 then raise exception 'FAN_WEB_INVALID_INPUT'; end if;
 if p_admin_allowlist_id is not null then
  perform public.assert_active_admin(p_app_user_id,p_admin_allowlist_id,false);
  is_admin:=true;
 elsif not public.kyaa_wave_checked_in(p_app_user_id) then return '[]'::jsonb;
 end if;
 with refs as materialized (
  select distinct x.kind,x.id,case when x.id ~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$' then x.id::uuid end resource_id from jsonb_to_recordset(p_references) x(kind text,id text)
  where length(x.id)<=100 and x.kind in('self','profile','fan_post','fan_post_comment','notice_comment','cheer','fan_clip','fan_clip_comment','draw','stage')
 ), owners as (
  select r.*,p.app_user_id from refs r join public.kyaa_wave_participants p on p.app_user_id=r.resource_id and p.event_key='kyaa-wave-2026'
  where not is_admin and (r.kind='profile' or (r.kind='self' and p.app_user_id=p_app_user_id))
  union all
  select r.*,p.app_user_id from refs r join public.fan_posts p on p.id=r.resource_id where not is_admin and r.kind='fan_post'
   and public.is_kyaa_wave_resource(r.kind,r.id) and public.fan_web_content_visible(p_app_user_id,r.kind,p.id)
  union all
  select r.*,p.app_user_id from refs r join public.fan_post_comments p on p.id=r.resource_id where not is_admin and r.kind='fan_post_comment'
   and public.is_kyaa_wave_resource(r.kind,r.id) and public.fan_web_content_visible(p_app_user_id,r.kind,p.id)
  union all
  select r.*,p.app_user_id from refs r join public.celebrity_notice_comments p on p.id=r.resource_id where not is_admin and r.kind='notice_comment' and not p.is_official
   and public.is_kyaa_wave_resource(r.kind,r.id) and public.fan_web_content_visible(p_app_user_id,r.kind,p.id)
  union all
  select r.*,p.app_user_id from refs r join public.fan_lounge_messages p on p.id=r.resource_id where not is_admin and r.kind='cheer'
   and public.is_kyaa_wave_resource(r.kind,r.id) and p.removed_at is null
   and (public.fan_web_content_visible(p_app_user_id,r.kind,p.id) or (p.reply_to_id is not null and exists(
    select 1 from public.fan_lounge_messages parent join public.app_users author on author.id=parent.app_user_id and author.status='active'
    where parent.id=p.reply_to_id and parent.reply_to_id is null and parent.removed_at is null
     and parent.celebrity_id=p.celebrity_id and public.fan_web_content_visible(p_app_user_id,'cheer',parent.id)
   )))
  union all
  select r.*,p.app_user_id from refs r join public.fan_clips p on p.id=r.resource_id where not is_admin and r.kind='fan_clip'
   and public.is_kyaa_wave_resource(r.kind,r.id) and public.fan_web_content_visible(p_app_user_id,r.kind,p.id)
  union all
  select r.*,p.app_user_id from refs r join public.fan_clip_comments p on p.id=r.resource_id where not is_admin and r.kind='fan_clip_comment'
   and public.is_kyaa_wave_resource(r.kind,r.id) and public.fan_web_content_visible(p_app_user_id,r.kind,p.id)
  union all
  select r.*,candidate.app_user_id from refs r join public.kyaa_wave_draw_candidates candidate on r.id=candidate.draw_id::text||':'||candidate.app_user_id::text
   join public.kyaa_wave_draw_prizes prize on prize.prize_key=candidate.prize_key
   join public.kyaa_wave_draw_state state on state.id=candidate.draw_id
   where r.kind='draw' and (is_admin or prize.ordinal<=state.revealed_through)
  union all
  select r.*,w.app_user_id from refs r join public.benefit_draw_winners w on w.id=r.resource_id
   join public.wave_stage_draws pair on w.draw_id in(pair.changha_draw_id,pair.wena_draw_id)
   where is_admin and r.kind='stage' and pair.event_key='kyaa-wave-20261022'
 )
 select coalesce(jsonb_agg(jsonb_build_object('kind',o.kind,'id',o.id,'appUserId',p.app_user_id,'nameEncrypted',p.name_encrypted)),'[]'::jsonb) into result
 from owners o join public.kyaa_wave_participants p on p.app_user_id=o.app_user_id and p.event_key='kyaa-wave-2026'
 join public.app_users u on u.id=p.app_user_id and u.status='active'
 where o.kind='self' or is_admin or not public.fan_web_blocked(p_app_user_id,p.app_user_id);
 return result;
end $$;
revoke all on function public.read_kyaa_wave_display_names(uuid,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_kyaa_wave_display_names(uuid,jsonb,uuid) to service_role;
