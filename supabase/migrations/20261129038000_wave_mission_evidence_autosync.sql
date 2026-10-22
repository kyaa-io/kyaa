begin;

create or replace function public.evaluate_owned_kyaa_wave_missions(p_app_user_id uuid)
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
   join public.social_dm_conversations d on d.id=m.conversation_id
   join public.social_friendships f on f.user_low_id=d.user_low_id and f.user_high_id=d.user_high_id
    and f.celebrity_id=wave_id and f.status='accepted'
   where m.sender_id=p_app_user_id and p_app_user_id in(d.user_low_id,d.user_high_id)
    and (d.status='accepted' or (d.status in('cancelled','rejected') and m.created_at>=f.accepted_at
     and not public.fan_web_blocked(d.user_low_id,d.user_high_id)))
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
  ) or exists(
   select 1 from public.fan_post_comments c join public.fan_posts p on p.id=c.post_id
   where c.app_user_id=p_app_user_id and c.created_at>=receipt_at
    and c.deleted_at is null and c.hidden_at is null and length(btrim(c.body))>0
    and p.celebrity_id=wave_id and p.program_notice_id=public.fan_program_notice('kyaa-wave-fanpage','live-insight')
    and p.visibility='public' and p.deleted_at is null and p.hidden_at is null
    and public.fan_web_content_visible(p_app_user_id,'fan_post_comment',c.id)
    and (c.parent_id is null or exists(select 1 from public.fan_post_comments parent
     where parent.id=c.parent_id and parent.post_id=c.post_id and parent.deleted_at is null and parent.hidden_at is null
      and public.fan_web_content_visible(p_app_user_id,'fan_post_comment',parent.id)))
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


create function public.reconcile_owned_kyaa_wave_missions(p_app_user_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.app_users where id=p_app_user_id and status='active')
 or exists(select 1 from public.app_user_moderation_restrictions where app_user_id=p_app_user_id and revoked_at is null)
 or not exists(select 1 from public.kyaa_wave_participants where app_user_id=p_app_user_id and event_key='kyaa-wave-2026')
 or not exists(select 1 from public.celebrities where slug='kyaa-wave-fanpage' and status='published' and archived_at is null) then return; end if;
 perform public.fan_web_lock_active_user(p_app_user_id);
 -- Keep publication stable without preventing unrelated actions on a closed fanpage.
 perform 1 from public.celebrities where slug='kyaa-wave-fanpage' and status='published' and archived_at is null for share;
 if found then perform public.read_owned_kyaa_wave_missions(p_app_user_id); end if;
end $$;
revoke all on function public.reconcile_owned_kyaa_wave_missions(uuid) from public,anon,authenticated,service_role;

-- Preserve the account-deletion fence and its current private producer, including native routing gates.
do $$
declare
 signature regprocedure:='public.react_to_creator(uuid,uuid,uuid,uuid,text)'::regprocedure;
 definition text:=pg_catalog.pg_get_functiondef(signature);
 body text; delegate text; expected text; replacement text;
begin
 select prosrc into strict body from pg_catalog.pg_proc where oid=signature;
 delegate:=substring(body from 'public[.]react_to_creator_fw_[0-9a-f]{8}[(]p_app_user_id, p_celebrity_id, p_reaction_id, p_job_id, p_issuance_id[)]');
 expected:='begin if p_app_user_id is not null then perform public.fan_web_lock_active_user(p_app_user_id); end if; return '||delegate||'; end';
 if delegate is null or btrim(regexp_replace(body,'[[:space:]]+',' ','g')) is distinct from expected then
  raise exception 'WAVE_MISSION_REACTION_WRAPPER_SHAPE_CHANGED';
 end if;
 replacement:='declare result jsonb; '||replace(body,'return '||delegate||';','result:='||delegate||';'||$patch$
 if exists(select 1 from public.celebrities where id=p_celebrity_id and slug='kyaa-wave-fanpage') then
  perform public.reconcile_owned_kyaa_wave_missions(p_app_user_id);
 end if;
 return result;
$patch$);
 execute replace(definition,body,replacement);
end $$;

-- Deferred events re-read the final row: program posts and media are attached after insertion.
create function public.reconcile_wave_mission_evidence()
returns trigger language plpgsql security definer set search_path='' as $$
declare owner_id uuid; other_id uuid;
begin
 case tg_table_name
 when 'fan_posts' then
  if tg_op='UPDATE' then
   if not (new.app_user_id is distinct from old.app_user_id or new.celebrity_id is distinct from old.celebrity_id or new.body is distinct from old.body or new.visibility is distinct from old.visibility or new.program_notice_id is distinct from old.program_notice_id or new.deleted_at is distinct from old.deleted_at or new.hidden_at is distinct from old.hidden_at) then return new; end if;
  end if;
  select p.app_user_id into owner_id from public.fan_posts p join public.celebrities w on w.id=p.celebrity_id and w.slug='kyaa-wave-fanpage' join public.kyaa_wave_participants k on k.app_user_id=p.app_user_id and k.event_key='kyaa-wave-2026'
  where p.id=new.id and p.visibility='public' and p.deleted_at is null and p.hidden_at is null and p.created_at>=k.created_at;
 when 'fan_clips' then
  if tg_op='UPDATE' then
   if not (new.app_user_id is distinct from old.app_user_id or new.celebrity_id is distinct from old.celebrity_id or new.visibility is distinct from old.visibility or new.deleted_at is distinct from old.deleted_at or new.hidden_at is distinct from old.hidden_at) then return new; end if;
  end if;
  select p.app_user_id into owner_id from public.fan_clips p join public.celebrities w on w.id=p.celebrity_id and w.slug='kyaa-wave-fanpage' join public.kyaa_wave_participants k on k.app_user_id=p.app_user_id and k.event_key='kyaa-wave-2026'
  where p.id=new.id and p.visibility='public' and p.deleted_at is null and p.hidden_at is null and p.created_at>=k.created_at
   and exists(select 1 from public.mobile_media_assets a where a.attached_type='fan_clip' and a.attached_id=p.id
    and a.kind='image' and a.state='ready' and a.storage_deleted_at is null and a.cleanup_requested_at is null);
 when 'content_assets' then
  if tg_op='UPDATE' then
   if not (new.app_user_id is distinct from old.app_user_id or new.post_id is distinct from old.post_id or new.uploaded_at is distinct from old.uploaded_at or new.deleted_at is distinct from old.deleted_at or new.cleanup_requested_at is distinct from old.cleanup_requested_at or new.storage_deleted_at is distinct from old.storage_deleted_at) then return new; end if;
  end if;
  select p.app_user_id into owner_id from public.content_assets a join public.fan_posts p on p.id=a.post_id join public.celebrities w on w.id=p.celebrity_id and w.slug='kyaa-wave-fanpage' join public.kyaa_wave_participants k on k.app_user_id=p.app_user_id and k.event_key='kyaa-wave-2026'
  where a.id=new.id and a.app_user_id=p.app_user_id and a.uploaded_at is not null
   and a.deleted_at is null and a.cleanup_requested_at is null and a.storage_deleted_at is null and p.visibility='public' and p.deleted_at is null and p.hidden_at is null and p.created_at>=k.created_at;
 when 'mobile_media_assets' then
  if tg_op='UPDATE' then
   if not (new.app_user_id is distinct from old.app_user_id or new.attached_type is distinct from old.attached_type or new.attached_id is distinct from old.attached_id or new.kind is distinct from old.kind or new.state is distinct from old.state or new.storage_deleted_at is distinct from old.storage_deleted_at or new.cleanup_requested_at is distinct from old.cleanup_requested_at) then return new; end if;
  end if;
  select a.app_user_id into owner_id from public.mobile_media_assets a
  join public.kyaa_wave_participants k on k.app_user_id=a.app_user_id and k.event_key='kyaa-wave-2026'
  where a.id=new.id and a.kind='image' and a.state='ready' and a.storage_deleted_at is null and a.cleanup_requested_at is null
   and (exists(select 1 from public.fan_posts p join public.celebrities w on w.id=p.celebrity_id and w.slug='kyaa-wave-fanpage'
    where a.attached_type='fan_post' and a.attached_id=p.id and p.app_user_id=a.app_user_id
     and p.visibility='public' and p.deleted_at is null and p.hidden_at is null and p.created_at>=k.created_at)
   or exists(select 1 from public.fan_clips p join public.celebrities w on w.id=p.celebrity_id and w.slug='kyaa-wave-fanpage'
    where a.attached_type='fan_clip' and a.attached_id=p.id and p.app_user_id=a.app_user_id
     and p.visibility='public' and p.deleted_at is null and p.hidden_at is null and p.created_at>=k.created_at));
 when 'social_friendships' then
  if tg_op='UPDATE' then
   if not (new.status is distinct from old.status or new.accepted_at is distinct from old.accepted_at or new.celebrity_id is distinct from old.celebrity_id or new.requester_id is distinct from old.requester_id or new.addressee_id is distinct from old.addressee_id) then return new; end if;
  end if;
  select f.user_low_id,f.user_high_id into owner_id,other_id from public.social_friendships f
  join public.celebrities w on w.id=f.celebrity_id and w.slug='kyaa-wave-fanpage'
  where f.id=new.id and f.status='accepted' and f.accepted_at is not null
   and not public.fan_web_blocked(f.user_low_id,f.user_high_id);
 when 'social_dm_messages' then
  if tg_op='UPDATE' then
   if not (new.sender_id is distinct from old.sender_id or new.conversation_id is distinct from old.conversation_id or new.hidden_at is distinct from old.hidden_at) then return new; end if;
  end if;
  select m.sender_id into owner_id from public.social_dm_messages m
  join public.social_dm_conversations d on d.id=m.conversation_id
  join public.social_friendships f on f.user_low_id=d.user_low_id and f.user_high_id=d.user_high_id and f.status='accepted'
  join public.celebrities w on w.id=f.celebrity_id and w.slug='kyaa-wave-fanpage'
  join public.kyaa_wave_participants k on k.app_user_id=m.sender_id and k.event_key='kyaa-wave-2026'
  where m.id=new.id and m.sender_id in(d.user_low_id,d.user_high_id) and m.hidden_at is null and m.created_at>=k.created_at
   and (d.status='accepted' or (d.status in('cancelled','rejected') and m.created_at>=f.accepted_at))
   and not public.fan_web_blocked(d.user_low_id,d.user_high_id)
   and not exists(select 1 from public.social_dm_message_deletions x where x.message_id=m.id and x.app_user_id=m.sender_id);
 when 'social_dm_conversations' then
  if tg_op='UPDATE' then
   if not (new.status is distinct from old.status) then return new; end if;
  end if;
  select d.user_low_id,d.user_high_id into owner_id,other_id from public.social_dm_conversations d
  where d.id=new.id and d.status='accepted'
   and exists(select 1 from public.social_friendships f join public.celebrities w on w.id=f.celebrity_id and w.slug='kyaa-wave-fanpage'
    where f.user_low_id=d.user_low_id and f.user_high_id=d.user_high_id and f.status='accepted')
   and not public.fan_web_blocked(d.user_low_id,d.user_high_id);
 when 'fan_lounge_messages' then
  if tg_op='UPDATE' then
   if not (new.app_user_id is distinct from old.app_user_id or new.celebrity_id is distinct from old.celebrity_id or new.body is distinct from old.body or new.removed_at is distinct from old.removed_at) then return new; end if;
  end if;
  select m.app_user_id into owner_id from public.fan_lounge_messages m
  join public.celebrities w on w.id=m.celebrity_id and w.slug='kyaa-wave-fanpage'
  join public.kyaa_wave_participants k on k.app_user_id=m.app_user_id and k.event_key='kyaa-wave-2026'
  where m.id=new.id and m.removed_at is null and length(btrim(m.body))>0 and m.created_at>=k.created_at;
 when 'celebrity_notice_comments' then
  if tg_op='UPDATE' then
   if not (new.app_user_id is distinct from old.app_user_id or new.notice_id is distinct from old.notice_id or new.parent_id is distinct from old.parent_id or new.body is distinct from old.body or new.removed_at is distinct from old.removed_at) then return new; end if;
  end if;
  select c.app_user_id into owner_id from public.celebrity_notice_comments c
  join public.celebrity_notices n on n.id=c.notice_id
  join public.celebrities w on w.id=n.celebrity_id and w.slug='kyaa-wave-fanpage'
  join public.kyaa_wave_participants k on k.app_user_id=c.app_user_id and k.event_key='kyaa-wave-2026'
  where c.id=new.id and n.slug in('live-insight','wave-home-cheer')
   and n.publication_status='published' and n.archived_at is null and n.visibility='public'
   and c.removed_at is null and length(btrim(c.body))>0 and c.created_at>=k.created_at
   and public.fan_web_content_visible(c.app_user_id,'notice_comment',c.id)
   and (c.parent_id is null or exists(select 1 from public.celebrity_notice_comments parent where parent.id=c.parent_id
    and parent.notice_id=c.notice_id and parent.removed_at is null and public.fan_web_content_visible(c.app_user_id,'notice_comment',parent.id)));
 when 'fan_post_comments' then
  if tg_op='UPDATE' then
   if not (new.app_user_id is distinct from old.app_user_id or new.post_id is distinct from old.post_id or new.parent_id is distinct from old.parent_id or new.body is distinct from old.body or new.deleted_at is distinct from old.deleted_at or new.hidden_at is distinct from old.hidden_at) then return new; end if;
  end if;
  select c.app_user_id into owner_id from public.fan_post_comments c join public.fan_posts p on p.id=c.post_id
  join public.celebrities w on w.id=p.celebrity_id and w.slug='kyaa-wave-fanpage'
  join public.kyaa_wave_participants k on k.app_user_id=c.app_user_id and k.event_key='kyaa-wave-2026'
  where c.id=new.id and p.program_notice_id=public.fan_program_notice('kyaa-wave-fanpage','live-insight')
   and p.visibility='public' and p.deleted_at is null and p.hidden_at is null
   and c.deleted_at is null and c.hidden_at is null and length(btrim(c.body))>0 and c.created_at>=k.created_at
   and public.fan_web_content_visible(c.app_user_id,'fan_post_comment',c.id)
   and (c.parent_id is null or exists(select 1 from public.fan_post_comments parent where parent.id=c.parent_id
    and parent.post_id=c.post_id and parent.deleted_at is null and parent.hidden_at is null
    and public.fan_web_content_visible(c.app_user_id,'fan_post_comment',parent.id)));
 else return new;
 end case;
 if owner_id is null then return new; end if;
 -- Account cleanup must not acquire the surviving friend's lock.
 if other_id is not null and (not exists(select 1 from public.app_users where id=owner_id and status='active')
  or not exists(select 1 from public.app_users where id=other_id and status='active')
  or exists(select 1 from public.app_user_moderation_restrictions where app_user_id in(owner_id,other_id) and revoked_at is null)) then return new; end if;
 perform public.reconcile_owned_kyaa_wave_missions(owner_id);
 if other_id is not null then perform public.reconcile_owned_kyaa_wave_missions(other_id); end if;
 return new;
end $$;
revoke all on function public.reconcile_wave_mission_evidence() from public,anon,authenticated,service_role;

create constraint trigger wave_mission_evidence_fan_posts
 after insert or update on public.fan_posts deferrable initially deferred
 for each row execute function public.reconcile_wave_mission_evidence();
create constraint trigger wave_mission_evidence_fan_clips
 after insert or update on public.fan_clips deferrable initially deferred
 for each row execute function public.reconcile_wave_mission_evidence();
create constraint trigger wave_mission_evidence_content_assets
 after insert or update on public.content_assets deferrable initially deferred
 for each row execute function public.reconcile_wave_mission_evidence();
create constraint trigger wave_mission_evidence_mobile_media_assets
 after insert or update on public.mobile_media_assets deferrable initially deferred
 for each row execute function public.reconcile_wave_mission_evidence();
create constraint trigger wave_mission_evidence_social_friendships
 after insert or update on public.social_friendships deferrable initially deferred
 for each row execute function public.reconcile_wave_mission_evidence();
create constraint trigger wave_mission_evidence_social_dm_messages
 after insert or update on public.social_dm_messages deferrable initially deferred
 for each row execute function public.reconcile_wave_mission_evidence();
create constraint trigger wave_mission_evidence_social_dm_conversations
 after insert or update on public.social_dm_conversations deferrable initially deferred
 for each row execute function public.reconcile_wave_mission_evidence();
create constraint trigger wave_mission_evidence_fan_lounge_messages
 after insert or update on public.fan_lounge_messages deferrable initially deferred
 for each row execute function public.reconcile_wave_mission_evidence();
create constraint trigger wave_mission_evidence_celebrity_notice_comments
 after insert or update on public.celebrity_notice_comments deferrable initially deferred
 for each row execute function public.reconcile_wave_mission_evidence();
create constraint trigger wave_mission_evidence_fan_post_comments
 after insert or update on public.fan_post_comments deferrable initially deferred
 for each row execute function public.reconcile_wave_mission_evidence();

commit;
