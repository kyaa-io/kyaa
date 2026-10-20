begin;

-- Read activity evidence only; this function never issues stamps, points or draw entries.
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
  jsonb_build_object('key','live-cheer','status','unverified'),
  jsonb_build_object('key','insight-review','status',case when exists(
   select 1 from public.celebrity_notice_comments c where c.app_user_id=p_app_user_id
    and c.notice_id=public.fan_program_notice('kyaa-wave-fanpage','live-insight')
    and c.removed_at is null and length(btrim(c.body))>0 and c.created_at>=receipt_at
  ) then 'completed' else 'pending' end),
  jsonb_build_object('key','quiz-correct','status','unverified'),
  jsonb_build_object('key','website-cheer','status','unverified')
 ));
end $$;

revoke all on function public.read_owned_kyaa_wave_missions(uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_owned_kyaa_wave_missions(uuid) to service_role;

commit;
