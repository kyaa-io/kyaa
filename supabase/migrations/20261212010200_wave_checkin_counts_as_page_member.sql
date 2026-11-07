-- 20261212010000 gives every published creator a page, and a page admits only members to its board. Wave has no join step:
-- check-in is its entrance (group_scope_visible), and check-in writes no membership row. Without this file a checked-in
-- participant is refused FAN_WEB_FORBIDDEN on a program post as soon as the Wave page exists.
-- Only the Wave page changes. No membership row is written, so member counts and every other page stay as they are.
--
-- save_fan_program_post also took the user lock before the page lock while save_fan_post and the comment functions take
-- the page lock first, so one participant's concurrent writes on the Wave page could deadlock. It now takes the page first.
--
-- Revert: supabase/rollback/20261212010200_wave_checkin_counts_as_page_member.sql
begin;
set local lock_timeout = '5s';

do $$
declare program_owner name;
begin
 select pg_get_userbyid(proowner) into program_owner from pg_proc where oid='public.save_fan_program_post(uuid,text,text,text,text,uuid[],uuid)'::regprocedure;
 if not has_function_privilege(program_owner,'public.require_group_content_member(uuid,uuid)','execute') then
  raise exception 'WAVE_PAGE_MEMBER_PRIVILEGE_MISSING';
 end if;
end $$;

create or replace function public.fan_web_is_page_member(p_app_user_id uuid,p_celebrity_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select case when not exists(select 1 from public.group_content_release where singleton and not enabled)
 and exists(select 1 from public.group_pages where celebrity_id=p_celebrity_id)
 then exists(select 1 from public.group_memberships m join public.group_pages g on g.id=m.page_id join public.app_users u on u.id=m.app_user_id and u.status='active'
  where m.app_user_id=p_app_user_id and g.celebrity_id=p_celebrity_id and public.group_scope_visible(p_app_user_id,g.id))
 or exists(select 1 from public.group_pages g join public.celebrities c on c.id=g.celebrity_id and c.slug='kyaa-wave-fanpage'
  where g.celebrity_id=p_celebrity_id and public.group_scope_visible(p_app_user_id,g.id))
 else public.fan_web_is_member(p_app_user_id,p_celebrity_id)end
$$;

create or replace function public.save_fan_program_post(p_app_user_id uuid,p_slug text,p_program text,p_body text,p_visibility text,p_asset_ids uuid[],p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare notice_id uuid; existing public.fan_posts%rowtype; result jsonb; v_post_id uuid;
begin
 perform public.require_group_content_member(p_app_user_id,(select id from public.celebrities where slug=p_slug));
 perform public.fan_web_lock_active_user(p_app_user_id);
 if p_visibility is distinct from 'public' or p_idempotency_key is null then raise exception 'FAN_WEB_INVALID_INPUT'; end if;
 notice_id:=public.fan_program_notice(p_slug,p_program);
 if notice_id is null then raise exception 'FAN_WEB_NOT_FOUND'; end if;
 perform 1 from public.celebrity_notices where id=notice_id for share;
 if public.fan_program_notice(p_slug,p_program) is distinct from notice_id then raise exception 'FAN_WEB_NOT_FOUND'; end if;
 select * into existing from public.fan_posts where app_user_id=p_app_user_id and idempotency_key=p_idempotency_key;
 if found and existing.program_notice_id is distinct from notice_id then raise exception 'FAN_WEB_CONFLICT'; end if;
 result:=public.save_fan_post(p_app_user_id,p_slug,null,p_body,p_visibility,p_asset_ids,null,p_idempotency_key);
 if (result->>'replayed')::boolean then return result; end if;
 v_post_id:=(result->>'id')::uuid;
 update public.fan_posts set program_notice_id=notice_id where id=v_post_id;
 if exists(select 1 from public.content_assets a where a.post_id=v_post_id and a.uploaded_at is not null and a.deleted_at is null and a.cleanup_requested_at is null)
 or exists(select 1 from public.mobile_media_assets a where a.attached_type='fan_post' and a.attached_id=v_post_id and a.kind='image' and a.state='ready' and a.storage_deleted_at is null) then
  insert into public.fan_program_stamps(app_user_id,program_notice_id) values(p_app_user_id,notice_id) on conflict do nothing;
 end if;
 return result;
end $$;

commit;
