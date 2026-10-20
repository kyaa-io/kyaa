begin;

alter table public.kyaa_wave_participants add column quiz_correct_at timestamptz;

create function public.grant_admin_kyaa_wave_quiz_stamp(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_participant_id uuid,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare participant public.kyaa_wave_participants%rowtype; draw_id uuid;
begin
 begin perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,true);
 exception when others then raise exception 'FAN_WEB_FORBIDDEN'; end;
 if p_participant_id is null or p_correlation_id is null then raise exception 'FAN_WEB_INVALID_INPUT'; end if;
 select * into participant from public.kyaa_wave_participants where id=p_participant_id and event_key='kyaa-wave-2026';
 if not found then raise exception 'FAN_WEB_NOT_FOUND'; end if;
 perform public.fan_web_lock_active_user(participant.app_user_id);
 select * into participant from public.kyaa_wave_participants where id=p_participant_id and event_key='kyaa-wave-2026' for update;
 if not found then raise exception 'FAN_WEB_NOT_FOUND'; end if;
 if participant.quiz_correct_at is null then
  -- Serialize new stamps with the draw's ticket snapshot.
  select id into draw_id from public.kyaa_wave_draw_state where singleton for update;
  if draw_id is not null then raise exception 'FAN_WEB_CONFLICT'; end if;
  update public.kyaa_wave_participants set quiz_correct_at=clock_timestamp() where id=p_participant_id returning * into participant;
  insert into public.audit_logs(actor_app_user_id,actor_admin_allowlist_id,action,entity_type,entity_id,correlation_id,before_after_summary)
  values(p_actor_app_user_id,p_actor_admin_allowlist_id,'kyaa_wave.quiz_stamp_granted','kyaa_wave_participant',p_participant_id::text,p_correlation_id,jsonb_build_object('quizCorrectAt',participant.quiz_correct_at));
 end if;
 return jsonb_build_object('id',participant.id,'quizCorrectAt',participant.quiz_correct_at);
end $$;
revoke all on function public.grant_admin_kyaa_wave_quiz_stamp(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.grant_admin_kyaa_wave_quiz_stamp(uuid,uuid,uuid,uuid) to service_role;

-- A separate notice thread keeps home cheers distinct from LIVE cheers.
insert into public.celebrity_notices(celebrity_id,slug,publication_status,published_at,ever_published_at)
select id,'wave-home-cheer','published',clock_timestamp(),clock_timestamp() from public.celebrities
where slug='kyaa-wave-fanpage' and status='published' and archived_at is null
on conflict(celebrity_id,slug) do nothing;
insert into public.celebrity_notice_localizations(notice_id,locale,title,body_json)
select n.id,locale,case when locale='ko' then 'WAVE 홈 응원' else 'Cheer for WAVE' end,
 jsonb_build_object('type','doc','content',jsonb_build_array(jsonb_build_object('type','paragraph','content',jsonb_build_array(jsonb_build_object('type','text','text',case when locale='ko' then 'WAVE에 응원 댓글을 남겨 주세요.' else 'Leave a cheer for WAVE.' end)))))
from public.celebrity_notices n join public.celebrities c on c.id=n.celebrity_id
cross join unnest(enum_range(null::public.content_locale)) locale
where c.slug='kyaa-wave-fanpage' and n.slug='wave-home-cheer'
on conflict(notice_id,locale) do nothing;

create or replace function public.list_admin_kyaa_wave_participants(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_before_at timestamptz default null,p_before_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 begin perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,false);
 exception when others then raise exception 'PARTICIPATION_ADMIN_FORBIDDEN' using errcode='42501'; end;
 if (p_before_at is null)<>(p_before_id is null) then raise exception 'PARTICIPATION_INVALID'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'appUserId',p.app_user_id,'nameEncrypted',p.name_encrypted,'createdAt',p.created_at,'quizCorrectAt',p.quiz_correct_at) order by p.created_at desc,p.id desc)
 from (select * from public.kyaa_wave_participants where event_key='kyaa-wave-2026' and (p_before_at is null or (created_at,id)<(p_before_at,p_before_id)) order by created_at desc,id desc limit 51) p),'[]'::jsonb);
end $$;

create or replace function public.read_owned_kyaa_wave_missions(p_app_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare receipt_at timestamptz; wave_id uuid;
begin
 perform public.fan_web_lock_active_user(p_app_user_id);
 select p.created_at into receipt_at from public.kyaa_wave_participants p
 where p.app_user_id=p_app_user_id and p.event_key='kyaa-wave-2026';
 if receipt_at is null then raise exception 'FAN_WEB_FORBIDDEN'; end if;
 select c.id into wave_id from public.celebrities c
 where c.slug='kyaa-wave-fanpage' and c.status='published' and c.archived_at is null;
 if wave_id is null then raise exception 'FAN_WEB_NOT_FOUND'; end if;

 return jsonb_build_object('progress',jsonb_build_array(
  jsonb_build_object('key','checkin','status','completed'),
  jsonb_build_object('key','event-photo','status',case when exists(
   select 1 from public.fan_posts p where p.app_user_id=p_app_user_id and p.celebrity_id=wave_id
    and p.visibility='public' and p.deleted_at is null and p.hidden_at is null and p.created_at>=receipt_at
    and (exists(select 1 from public.content_assets a where a.post_id=p.id and a.app_user_id=p_app_user_id
      and a.uploaded_at is not null and a.deleted_at is null and a.cleanup_requested_at is null and a.storage_deleted_at is null)
     or exists(select 1 from public.mobile_media_assets a where a.attached_type='fan_post' and a.attached_id=p.id
      and a.app_user_id=p_app_user_id and a.kind='image' and a.state='ready' and a.storage_deleted_at is null))
  ) or exists(select 1 from public.fan_clips p join public.mobile_media_assets a on a.attached_type='fan_clip' and a.attached_id=p.id
   where p.app_user_id=p_app_user_id and p.celebrity_id=wave_id and p.visibility='public'
   and p.deleted_at is null and p.hidden_at is null and p.created_at>=receipt_at
   and a.kind='image' and a.state='ready' and a.storage_deleted_at is null
  ) then 'completed' else 'pending' end),
  jsonb_build_object('key','fanpage-like','status',case when exists(
   select 1 from public.fan_reactions r where r.app_user_id=p_app_user_id and r.celebrity_id=wave_id and r.business_status='completed'
  ) then 'completed' else 'pending' end),
  jsonb_build_object('key','introduction','status',case when exists(
   select 1 from public.fan_posts p where p.app_user_id=p_app_user_id and p.celebrity_id=wave_id
   and p.program_notice_id is null and p.visibility='public' and length(btrim(p.body))>0
   and p.deleted_at is null and p.hidden_at is null and p.created_at>=receipt_at
  ) then 'completed' else 'pending' end),
  jsonb_build_object('key','friendship','status',case when exists(
   select 1 from public.social_friendships f where p_app_user_id in(f.requester_id,f.addressee_id)
   and f.celebrity_id=wave_id and f.status='accepted' and f.accepted_at>=receipt_at
  ) then 'completed' else 'pending' end),
  jsonb_build_object('key','dm-greeting','status',case when exists(
   select 1 from public.social_dm_messages m
   join public.social_dm_conversations d on d.id=m.conversation_id and d.status='accepted'
   join public.social_friendships f on f.user_low_id=d.user_low_id and f.user_high_id=d.user_high_id
    and f.celebrity_id=wave_id and f.status='accepted'
   where m.sender_id=p_app_user_id and p_app_user_id in(d.user_low_id,d.user_high_id)
    and m.created_at>=receipt_at and m.hidden_at is null
    and not exists(select 1 from public.social_dm_message_deletions x where x.message_id=m.id and x.app_user_id=p_app_user_id)
  ) then 'completed' else 'pending' end),
  jsonb_build_object('key','live-cheer','status',case when exists(
   select 1 from public.fan_lounge_messages m where m.app_user_id=p_app_user_id and m.celebrity_id=wave_id
    and m.removed_at is null and length(btrim(m.body))>0 and m.created_at>=receipt_at
  ) then 'completed' else 'pending' end),
  jsonb_build_object('key','insight-review','status',case when exists(
   select 1 from public.celebrity_notice_comments c where c.app_user_id=p_app_user_id
    and c.notice_id=public.fan_program_notice('kyaa-wave-fanpage','live-insight')
    and c.removed_at is null and length(btrim(c.body))>0 and c.created_at>=receipt_at
  ) or exists(
   select 1 from public.fan_posts p where p.app_user_id=p_app_user_id and p.celebrity_id=wave_id
    and p.program_notice_id=public.fan_program_notice('kyaa-wave-fanpage','live-insight')
    and p.visibility='public' and p.deleted_at is null and p.hidden_at is null
    and length(btrim(p.body))>0 and p.created_at>=receipt_at
  ) then 'completed' else 'pending' end),
  jsonb_build_object('key','quiz-correct','status',case when exists(select 1 from public.kyaa_wave_participants p where p.app_user_id=p_app_user_id and p.event_key='kyaa-wave-2026' and p.quiz_correct_at is not null) then 'completed' else 'pending' end),
  jsonb_build_object('key','website-cheer','status',case when exists(
   select 1 from public.celebrity_notice_comments c join public.celebrity_notices n on n.id=c.notice_id
   where c.app_user_id=p_app_user_id and n.celebrity_id=wave_id and n.slug='wave-home-cheer'
    and n.publication_status='published' and n.archived_at is null and n.visibility='public'
    and c.removed_at is null and length(btrim(c.body))>0 and c.created_at>=receipt_at
    and public.fan_web_content_visible(p_app_user_id,'notice_comment',c.id)
    and (c.parent_id is null or exists(select 1 from public.celebrity_notice_comments parent where parent.id=c.parent_id and parent.notice_id=c.notice_id and parent.removed_at is null and public.fan_web_content_visible(p_app_user_id,'notice_comment',parent.id)))
  ) then 'completed' else 'pending' end)
 ));
end $$;

commit;
