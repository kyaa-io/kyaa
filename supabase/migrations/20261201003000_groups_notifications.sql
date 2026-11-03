begin;
-- Reuse the existing intent pipeline so a page preference also controls legacy
-- fan-board replies, official notices and queued schedule reminders.
create or replace function public.fan_web_emit_notification(p_owner uuid,p_kind text,p_target_type text,p_target_id uuid,p_revision integer,p_at timestamptz)
returns void language plpgsql security definer set search_path=''as $$
begin
 if exists(select 1 from public.group_notification_settings where page_id=public.group_notification_page(p_target_type,p_target_id)and app_user_id=p_owner and not enabled)then return;end if;
 insert into public.fan_web_notification_intents(recipient_app_user_id,kind,target_type,target_id,revision,scheduled_for)values(p_owner,p_kind,p_target_type,p_target_id,p_revision,p_at)on conflict(recipient_app_user_id,kind,target_id,revision)do nothing;
end $$;

alter table public.group_applications add column review_revision integer not null default 0;
create function public.group_application_review_revision() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status in ('approved','rejected','changes_requested') and (new.status is distinct from old.status or new.reason is distinct from old.reason or new.reviewed_at is distinct from old.reviewed_at)then new.review_revision:=old.review_revision+1;else new.review_revision:=old.review_revision;end if;
 return new;
end $$;
create trigger group_application_review_revision before update on public.group_applications for each row execute function public.group_application_review_revision();
create function public.group_emit_notification() returns trigger language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
 if tg_table_name='group_applications' then
  if new.review_revision<>old.review_revision and exists(select 1 from public.app_users where id=new.applicant_id and status='active')then
   perform public.fan_web_emit_notification(new.applicant_id,'fanpage_request_reviewed','group_application',new.id,new.review_revision,clock_timestamp());
  end if;
 elsif tg_table_name='group_comments' then
  select coalesce((select author_id from public.group_comments where id=new.parent_id),author_id)into recipient from public.group_posts where id=new.post_id;
  if recipient<>new.author_id and not public.fan_web_blocked(recipient,new.author_id) and exists(select 1 from public.app_users where id=recipient and status='active') and public.group_post_visible(recipient,new.post_id)and coalesce((select enabled from public.group_notification_settings where page_id=(select page_id from public.group_posts where id=new.post_id)and app_user_id=recipient),true)then
   perform public.fan_web_emit_notification(recipient,'content_reply','group_comment',new.id,1,clock_timestamp());
  end if;
 end if;
 return new;
end $$;
create trigger group_application_result_notification after update on public.group_applications for each row execute function public.group_emit_notification();
create trigger group_comment_notification after insert on public.group_comments for each row execute function public.group_emit_notification();
alter function public.fan_web_notification_path(uuid,uuid) rename to fan_web_notification_path_before_groups;
create function public.fan_web_notification_path(p_owner uuid,p_notification uuid) returns text language plpgsql stable security definer set search_path='' as $$
declare n public.fan_notifications; target uuid; path text;
begin
 select * into n from public.fan_notifications where id=p_notification and app_user_id=p_owner and scheduled_for<=now() and superseded_at is null;
 if not found or not exists(select 1 from public.app_users where id=p_owner and status='active')then return null;end if;
 if n.payload->>'targetType' not in('group_application','group_comment')then return public.fan_web_notification_path_before_groups(p_owner,p_notification);end if;
 if n.payload->>'targetId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null;end if;target:=(n.payload->>'targetId')::uuid;
 if n.payload->>'targetType'='group_application' and n.kind::text='fanpage_request_reviewed' then
  select '/pages/groups/apply?applicationId='||a.id::text into path from public.group_applications a where a.id=target and a.applicant_id=p_owner;
 elsif n.payload->>'targetType'='group_comment' and n.kind::text='content_reply' then
  select '/pages/groups/'||p.page_id::text||'?tab=board&postId='||p.id::text into path from public.group_comments c join public.group_posts p on p.id=c.post_id
   where c.id=target and c.removed_at is null and not public.fan_web_blocked(p_owner,c.author_id) and public.group_post_visible(p_owner,p.id);
 end if;
 return path;
end $$;
revoke all on function public.group_application_review_revision(),public.group_emit_notification(),public.fan_web_notification_path_before_groups(uuid,uuid),public.fan_web_notification_path(uuid,uuid)from public,anon,authenticated,service_role;
grant execute on function public.fan_web_notification_path(uuid,uuid)to service_role;
commit;
