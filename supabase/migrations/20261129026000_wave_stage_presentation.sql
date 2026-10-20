begin;

-- Presentation aggregates are independent from draw eligibility and on-chain issuance.
create function public.read_admin_wave_stage_presentation(
 p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_scope text default 'all'
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare as_of timestamptz:=statement_timestamp(); from_at timestamptz; to_at timestamptz; wave_id uuid; targets jsonb; result jsonb;
begin
 begin perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,false);
 exception when others then raise exception 'FAN_WEB_FORBIDDEN'; end;
 if p_scope is null or p_scope not in('all','event-day') then raise exception 'FAN_WEB_INVALID_INPUT'; end if;
 from_at:=case when p_scope='event-day' then '2026-10-21T15:00:00Z'::timestamptz else null end;
 to_at:=case when p_scope='event-day' then least(as_of,'2026-10-22T15:00:00Z'::timestamptz) else as_of end;
 select jsonb_agg(jsonb_build_object('id',c.id,'live',l.id,'slug',c.slug,'name',coalesce(nullif(btrim(loc.name),''),c.slug)) order by c.slug) into targets
 from (values
  ('aedf77a4-52e9-4acd-aa7a-79ceee5ca8eb'::uuid,'fde5ff1b-ac41-4c20-902b-034cba972023'::uuid,'changha'),
  ('c3930f7f-bd2b-4e58-8cec-b3c61f8463fe'::uuid,'45fcead7-24f3-46aa-98ce-84dfe8c8e75b'::uuid,'wena')
 ) pinned(campaign,live,slug)
 join public.live_benefit_campaigns campaign on campaign.id=pinned.campaign and campaign.live_event_id=pinned.live
 join public.live_events l on l.id=pinned.live
 join public.celebrities c on c.id=l.celebrity_id and c.slug=pinned.slug
 left join public.celebrity_localizations loc on loc.celebrity_id=c.id and loc.locale='ko';
 select c.id into wave_id from public.celebrities c where c.slug='kyaa-wave-fanpage' and c.status='published' and c.archived_at is null;
 if coalesce(jsonb_array_length(targets),0)<>2 or wave_id is null then raise exception 'FAN_WEB_UNAVAILABLE'; end if;

 with creators as (
  select * from jsonb_to_recordset(targets) as t(id uuid,live uuid,slug text,name text)
 ), activity as (
  select c.id creator_id,r.app_user_id,'reservations' kind from creators c
  join public.live_reservations r on r.live_event_id=c.live
  where (from_at is null or r.reserved_at>=from_at) and r.reserved_at<to_at
  union all
  select c.id,p.app_user_id,'passports' from creators c join public.fan_passports p on p.celebrity_id=c.id
  where p.business_status='issued' and (from_at is null or p.issued_at>=from_at) and p.issued_at<to_at
  union all
  select c.id,r.app_user_id,'likes' from creators c join public.fan_reactions r on r.celebrity_id=c.id
  where r.business_status='completed' and (from_at is null or r.completed_at>=from_at) and r.completed_at<to_at
  union all
  select c.id,m.app_user_id,'comments' from creators c join public.fan_lounge_messages m on m.celebrity_id=c.id
  where m.removed_at is null and length(btrim(m.body))>0 and (from_at is null or m.created_at>=from_at) and m.created_at<to_at
 ), active_activity as (
  select a.* from activity a join public.app_users u on u.id=a.app_user_id and u.status='active'
 ), cohort as (
  select p.* from public.kyaa_wave_participants p join public.app_users u on u.id=p.app_user_id and u.status='active'
  where p.event_key='kyaa-wave-2026' and (from_at is null or p.created_at>=from_at) and p.created_at<to_at
 ), mission_progress as (
  -- Match read_owned_kyaa_wave_missions without its per-user locks or moderation guard.
  select
jsonb_build_array(
  jsonb_build_object('key','checkin','status','completed'),
  jsonb_build_object('key','event-photo','status',case when exists(
   select 1 from public.fan_posts p where p.app_user_id=cohort.app_user_id and p.celebrity_id=wave_id
    and p.visibility='public' and p.deleted_at is null and p.hidden_at is null and p.created_at>=cohort.created_at
    and (exists(select 1 from public.content_assets a where a.post_id=p.id and a.app_user_id=cohort.app_user_id
      and a.uploaded_at is not null and a.deleted_at is null and a.cleanup_requested_at is null and a.storage_deleted_at is null)
     or exists(select 1 from public.mobile_media_assets a where a.attached_type='fan_post' and a.attached_id=p.id
      and a.app_user_id=cohort.app_user_id and a.kind='image' and a.state='ready' and a.storage_deleted_at is null))
  ) or exists(select 1 from public.fan_clips p join public.mobile_media_assets a on a.attached_type='fan_clip' and a.attached_id=p.id
   where p.app_user_id=cohort.app_user_id and p.celebrity_id=wave_id and p.visibility='public'
   and p.deleted_at is null and p.hidden_at is null and p.created_at>=cohort.created_at
   and a.kind='image' and a.state='ready' and a.storage_deleted_at is null
  ) then 'completed' else 'pending' end),
  jsonb_build_object('key','fanpage-like','status',case when exists(
   select 1 from public.fan_reactions r where r.app_user_id=cohort.app_user_id and r.celebrity_id=wave_id and r.business_status='completed'
  ) then 'completed' else 'pending' end),
  jsonb_build_object('key','introduction','status',case when exists(
   select 1 from public.fan_posts p where p.app_user_id=cohort.app_user_id and p.celebrity_id=wave_id
   and p.program_notice_id is null and p.visibility='public' and length(btrim(p.body))>0
   and p.deleted_at is null and p.hidden_at is null and p.created_at>=cohort.created_at
  ) then 'completed' else 'pending' end),
  jsonb_build_object('key','friendship','status',case when exists(
   select 1 from public.social_friendships f where cohort.app_user_id in(f.requester_id,f.addressee_id)
   and f.celebrity_id=wave_id and f.status='accepted' and f.accepted_at>=cohort.created_at
  ) then 'completed' else 'pending' end),
  jsonb_build_object('key','dm-greeting','status',case when exists(
   select 1 from public.social_dm_messages m
   join public.social_dm_conversations d on d.id=m.conversation_id and d.status='accepted'
   join public.social_friendships f on f.user_low_id=d.user_low_id and f.user_high_id=d.user_high_id
    and f.celebrity_id=wave_id and f.status='accepted'
   where m.sender_id=cohort.app_user_id and cohort.app_user_id in(d.user_low_id,d.user_high_id)
    and m.created_at>=cohort.created_at and m.hidden_at is null
    and not exists(select 1 from public.social_dm_message_deletions x where x.message_id=m.id and x.app_user_id=cohort.app_user_id)
  ) then 'completed' else 'pending' end),
  jsonb_build_object('key','live-cheer','status',case when exists(
   select 1 from public.fan_lounge_messages m where m.app_user_id=cohort.app_user_id and m.celebrity_id=wave_id
    and m.removed_at is null and length(btrim(m.body))>0 and m.created_at>=cohort.created_at
  ) then 'completed' else 'pending' end),
  jsonb_build_object('key','insight-review','status',case when exists(
   select 1 from public.celebrity_notice_comments c where c.app_user_id=cohort.app_user_id
    and c.notice_id=public.fan_program_notice('kyaa-wave-fanpage','live-insight')
    and c.removed_at is null and length(btrim(c.body))>0 and c.created_at>=cohort.created_at
  ) or exists(
   select 1 from public.fan_posts p where p.app_user_id=cohort.app_user_id and p.celebrity_id=wave_id
    and p.program_notice_id=public.fan_program_notice('kyaa-wave-fanpage','live-insight')
    and p.visibility='public' and p.deleted_at is null and p.hidden_at is null
    and length(btrim(p.body))>0 and p.created_at>=cohort.created_at
  ) then 'completed' else 'pending' end),
  jsonb_build_object('key','quiz-correct','status',case when exists(select 1 from public.kyaa_wave_participants p where p.app_user_id=cohort.app_user_id and p.event_key='kyaa-wave-2026' and p.quiz_correct_at is not null) then 'completed' else 'pending' end),
  jsonb_build_object('key','website-cheer','status',case when exists(
   select 1 from public.celebrity_notice_comments c join public.celebrity_notices n on n.id=c.notice_id
   where c.app_user_id=cohort.app_user_id and n.celebrity_id=wave_id and n.slug='wave-home-cheer'
    and n.publication_status='published' and n.archived_at is null and n.visibility='public'
    and c.removed_at is null and length(btrim(c.body))>0 and c.created_at>=cohort.created_at
    and public.fan_web_content_visible(cohort.app_user_id,'notice_comment',c.id)
    and (c.parent_id is null or exists(select 1 from public.celebrity_notice_comments parent where parent.id=c.parent_id and parent.notice_id=c.notice_id and parent.removed_at is null and public.fan_web_content_visible(cohort.app_user_id,'notice_comment',parent.id)))
  ) then 'completed' else 'pending' end)
 ) progress from cohort
 ), mission_keys as (
  select key,ordinal from unnest(array['checkin','event-photo','fanpage-like','introduction','friendship','dm-greeting','live-cheer','insight-review','quiz-correct','website-cheer']) with ordinality k(key,ordinal)
 ), mission_counts as (
  select item->>'key' key,count(*) filter(where item->>'status'='completed') completed
  from mission_progress cross join lateral jsonb_array_elements(progress) item group by item->>'key'
 ) select jsonb_build_object(
 'asOf',as_of,'scope',p_scope,'from',from_at,'to',to_at,'eventDate','2026-10-22',
 'creators',(select jsonb_agg(jsonb_build_object('slug',c.slug,'name',c.name,
  'reservations',(select count(*) from active_activity a where a.creator_id=c.id and a.kind='reservations'),
  'passports',(select count(*) from active_activity a where a.creator_id=c.id and a.kind='passports'),
  'likes',(select count(*) from active_activity a where a.creator_id=c.id and a.kind='likes'),
  'comments',(select count(*) from active_activity a where a.creator_id=c.id and a.kind='comments'),
  'engagedFans',(select count(distinct app_user_id) from active_activity a where a.creator_id=c.id)
 ) order by c.slug) from creators c),
 'missions',jsonb_build_object('participants',(select count(*) from cohort),
 'items',(select jsonb_agg(jsonb_build_object('key',k.key,'completed',coalesce(m.completed,0)) order by k.ordinal) from mission_keys k left join mission_counts m on m.key=k.key))
 ) into result;
 return result;
end $$;
revoke all on function public.read_admin_wave_stage_presentation(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.read_admin_wave_stage_presentation(uuid,uuid,text) to service_role;

commit;
