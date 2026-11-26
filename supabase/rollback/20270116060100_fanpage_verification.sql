-- Rollback of 20270116060100_fanpage_verification.sql. Roll the web back first (it sends p_verification and reads
-- list_unverified_creators). Pages switched to Unverified become ordinary (official) pages again when the column goes.
begin;
set local lock_timeout = '5s';

do $$
declare v_fn constant text := 'public.record_dukjil_action(uuid,uuid,text,text,uuid,jsonb)';
begin
  if not exists (select 1 from public.b3_function_patches p where p.fn = v_fn and p.pair_no = 12) then return; end if;
  perform public.b3_patch_function(v_fn, true);
  delete from public.b3_function_patches p where p.fn = v_fn and p.pair_no = 12;
  if public.b3_patch_function(v_fn, false) <> 'applied' then raise exception 'VERIFIED_PAGE_PAIR_ROLLBACK_FAILED'; end if;
end $$;

do $$
declare
  f record;
  guard constant text := E'  if exists (select 1 from public.celebrities where id = p_celebrity and verification = ''unverified'') then /* verified-page */\n    raise exception ''COMMUNITY_STAMP_NOT_FOUND'' using errcode = ''P0001''; end if;\n';
begin
  select oid, prosrc into strict f from pg_catalog.pg_proc where oid = 'public.attend_creator(uuid,uuid,uuid)'::regprocedure;
  if position(guard in f.prosrc) = 0 then return; end if;
  execute replace(pg_catalog.pg_get_functiondef(f.oid), f.prosrc, replace(f.prosrc, guard, ''));
end $$;

drop function if exists public.list_unverified_creators();
drop function if exists public.fan_web_admin_set_page_verification(uuid,uuid,uuid,uuid,text,text,public.content_locale);
drop function if exists public.fan_web_admin_review_fanpage_request(uuid,uuid,uuid,uuid,integer,text,text,uuid,public.content_locale,text,text);
drop function if exists public.fan_web_apply_page_verification(uuid,uuid,uuid,uuid,text,text);
create function public.fan_web_admin_review_fanpage_request(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_correlation_id uuid,p_request_id uuid,p_expected_revision integer,p_decision text,p_reason text,p_celebrity_id uuid,p_locale public.content_locale)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.fanpage_requests%rowtype; v_status text;
begin
  perform public.fan_web_lock_active_user(p_actor_app_user_id);
  perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,true);
  v_status:=case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' end;
  if v_status is null or p_correlation_id is null then raise exception 'FAN_WEB_INVALID_REQUEST'; end if;
  select * into r from public.fanpage_requests where id=p_request_id for update;
  if not found then raise exception 'FAN_WEB_NOT_FOUND'; end if;
  if r.status=v_status then return jsonb_build_object('item',public.fan_web_request_json(r.id,p_locale),'replayed',true); end if;
  if r.status<>'pending' or r.revision<>p_expected_revision then raise exception 'FAN_WEB_REVISION_CONFLICT'; end if;
  if v_status='approved' then
    if not exists(select 1 from public.celebrities where id=p_celebrity_id and archived_at is null) then raise exception 'FAN_WEB_NOT_FOUND'; end if;
  elsif nullif(btrim(p_reason),'') is null or p_celebrity_id is not null then raise exception 'FAN_WEB_INVALID_REQUEST'; end if;
  update public.fanpage_requests set status=v_status,celebrity_id=p_celebrity_id,review_reason=nullif(btrim(p_reason),''),reviewed_at=clock_timestamp(),reviewed_by_admin_allowlist_id=p_actor_admin_allowlist_id,revision=revision+1,updated_at=clock_timestamp() where id=r.id;
  perform public.fan_web_participation_audit(p_actor_app_user_id,p_actor_admin_allowlist_id,p_correlation_id,'fanpage_request.reviewed','fanpage_request',r.id,jsonb_build_object('status',r.status),jsonb_build_object('status',v_status));
  return jsonb_build_object('item',public.fan_web_request_json(r.id,p_locale),'replayed',false);
end $$;
revoke all on function public.fan_web_admin_review_fanpage_request(uuid,uuid,uuid,uuid,integer,text,text,uuid,public.content_locale) from public,anon,authenticated,service_role;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.fan_web_admin_review_fanpage_request(uuid,uuid,uuid,uuid,integer,text,text,uuid,public.content_locale) to service_role;
  end if;
end $$;
create or replace function public.fan_web_request_json(p_id uuid,p_locale public.content_locale) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',r.id,'name',r.name,'subjectType',r.subject_type,'officialSocialUrl',r.official_social_url,'note',r.note,'locale',r.locale,
  'status',r.status,'revision',r.revision,'reviewReason',r.review_reason,'reviewedAt',r.reviewed_at,'createdAt',r.created_at,
  'artist',(select jsonb_build_object('slug',c.slug,'name',l.name,'imageUrl',c.image_url,'href','/'||c.slug)
    from public.celebrities c join public.celebrity_localizations l on l.celebrity_id=c.id and l.locale=p_locale
    where c.id=r.celebrity_id and c.status='published' and c.archived_at is null))
 from public.fanpage_requests r where r.id=p_id
$$;

alter table public.celebrities
  drop column verification_changed_by, drop column verification_changed_at, drop column verification_reason, drop column verification;
commit;
