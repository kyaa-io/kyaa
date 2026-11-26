-- Official (Verified) and fan-made (Unverified) creator pages (revamp plan F, 11/26 fan page request decision).
-- Every page that exists today stays Verified. A page linked from an approved fan page request opens Unverified unless the
-- admin switches it to Verified with a reason; an admin can switch a page either way later, again with a reason.
-- Unverified pages keep their fan page and their place in the groups directory, but carry no kyaa official mark,
-- stay off the home, gallery and shorts lists, and pay no 덕질 points. The app reads list_unverified_creators() for the lists;
-- record_dukjil_action (B3 pair 12) and attend_creator refuse an Unverified page in the database.
-- Rollback: supabase/rollback/20270116060100_fanpage_verification.sql.
begin;
set local lock_timeout = '5s';

alter table public.celebrities
  add column verification text not null default 'verified' check (verification in ('verified','unverified')),
  add column verification_reason text check (verification_reason is null or length(btrim(verification_reason)) between 1 and 1000),
  add column verification_changed_at timestamptz,
  add column verification_changed_by uuid references public.admin_allowlist(id) on delete set null;

-- The page state shown next to each request in the admin review list (the requester's own list shows it too; the admin's reason stays internal).
create or replace function public.fan_web_request_json(p_id uuid,p_locale public.content_locale) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',r.id,'name',r.name,'subjectType',r.subject_type,'officialSocialUrl',r.official_social_url,'note',r.note,'locale',r.locale,
  'status',r.status,'revision',r.revision,'reviewReason',r.review_reason,'reviewedAt',r.reviewed_at,'createdAt',r.created_at,
  'artist',(select jsonb_build_object('slug',c.slug,'name',l.name,'imageUrl',c.image_url,'href','/'||c.slug)
    from public.celebrities c join public.celebrity_localizations l on l.celebrity_id=c.id and l.locale=p_locale
    where c.id=r.celebrity_id and c.status='published' and c.archived_at is null),
  'pageVerification',(select c.verification from public.celebrities c where c.id=r.celebrity_id))
 from public.fanpage_requests r where r.id=p_id
$$;

-- One rule for the approval and the later switch: Verified always needs a reason, and so does taking the mark off a page
-- that is already public and Verified (linking an existing official page must not demote it by default).
create function public.fan_web_apply_page_verification(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_correlation_id uuid,p_celebrity_id uuid,p_verification text,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare c public.celebrities%rowtype; v_reason text:=nullif(btrim(p_reason),'');
begin
  if p_verification not in ('verified','unverified') then raise exception 'FAN_WEB_INVALID_REQUEST'; end if;
  select * into c from public.celebrities where id=p_celebrity_id and archived_at is null for update;
  if not found then raise exception 'FAN_WEB_NOT_FOUND'; end if;
  if c.verification=p_verification then return; end if;
  if v_reason is null and (p_verification='verified' or c.status='published') then raise exception 'FAN_WEB_INVALID_VERIFICATION_REASON'; end if;
  update public.celebrities set verification=p_verification,verification_reason=v_reason,verification_changed_at=clock_timestamp(),
    verification_changed_by=p_actor_admin_allowlist_id where id=c.id;
  perform public.fan_web_participation_audit(p_actor_app_user_id,p_actor_admin_allowlist_id,p_correlation_id,'celebrity.verification_changed','celebrity',c.id,
    jsonb_build_object('verification',c.verification),jsonb_build_object('verification',p_verification,'reason',v_reason));
end $$;

drop function public.fan_web_admin_review_fanpage_request(uuid,uuid,uuid,uuid,integer,text,text,uuid,public.content_locale);
create function public.fan_web_admin_review_fanpage_request(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_correlation_id uuid,p_request_id uuid,p_expected_revision integer,p_decision text,p_reason text,p_celebrity_id uuid,p_locale public.content_locale,p_verification text default 'unverified',p_verification_reason text default null)
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
    perform public.fan_web_apply_page_verification(p_actor_app_user_id,p_actor_admin_allowlist_id,p_correlation_id,p_celebrity_id,p_verification,p_verification_reason);
  elsif nullif(btrim(p_reason),'') is null or p_celebrity_id is not null then raise exception 'FAN_WEB_INVALID_REQUEST'; end if;
  update public.fanpage_requests set status=v_status,celebrity_id=p_celebrity_id,review_reason=nullif(btrim(p_reason),''),reviewed_at=clock_timestamp(),reviewed_by_admin_allowlist_id=p_actor_admin_allowlist_id,revision=revision+1,updated_at=clock_timestamp() where id=r.id;
  perform public.fan_web_participation_audit(p_actor_app_user_id,p_actor_admin_allowlist_id,p_correlation_id,'fanpage_request.reviewed','fanpage_request',r.id,jsonb_build_object('status',r.status),jsonb_build_object('status',v_status));
  return jsonb_build_object('item',public.fan_web_request_json(r.id,p_locale),'replayed',false);
end $$;

-- The switch on an approved request: change the linked page's state and answer with the request as the list shows it.
create function public.fan_web_admin_set_page_verification(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_correlation_id uuid,p_request_id uuid,p_verification text,p_reason text,p_locale public.content_locale)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.fanpage_requests%rowtype;
begin
  perform public.fan_web_lock_active_user(p_actor_app_user_id);
  perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,true);
  if p_correlation_id is null then raise exception 'FAN_WEB_INVALID_REQUEST'; end if;
  select * into r from public.fanpage_requests where id=p_request_id;
  if not found or r.status<>'approved' or r.celebrity_id is null then raise exception 'FAN_WEB_NOT_FOUND'; end if;
  perform public.fan_web_apply_page_verification(p_actor_app_user_id,p_actor_admin_allowlist_id,p_correlation_id,r.celebrity_id,p_verification,p_reason);
  return jsonb_build_object('item',public.fan_web_request_json(r.id,p_locale),'replayed',false);
end $$;

-- 덕질 points: an Unverified page pays nothing. record_dukjil_action already refuses an unpublished or archived creator with
-- COMMUNITY_STAMP_NOT_FOUND, which the app treats as "nothing to pay"; pair 12 adds the Verified condition to that check through the
-- B3 bookkeeping (b3_patch_function reverts pairs 1 to 11, checks the base md5, records pair 12 and applies 1 to 12), so the B3
-- rollback still finds its base.
do $$
declare
  v_fn constant text := 'public.record_dukjil_action(uuid,uuid,text,text,uuid,jsonb)';
  original constant text := $o$    perform 1 from public.celebrities where id = p_celebrity and status = 'published' and archived_at is null;$o$;
  patched constant text := $p$    perform 1 from public.celebrities where id = p_celebrity and status = 'published' and archived_at is null and verification = 'verified' /* b3-verified-page */;$p$;
begin
  if exists (select 1 from public.b3_function_patches p where p.fn = v_fn and p.pair_no = 12) then
    if public.b3_patch_function(v_fn, false) <> 'unchanged' then raise exception 'VERIFIED_PAGE_PAIR_NOT_APPLIED'; end if;
    return;
  end if;
  perform public.b3_patch_function(v_fn, true);
  if public.b3_patch_count((select prosrc from pg_catalog.pg_proc where oid = v_fn::regprocedure), original) <> 1 then raise exception 'VERIFIED_PAGE_GUARD_CHANGED'; end if;
  insert into public.b3_function_patches (fn, pair_no, original, patched) values (v_fn, 12, original, patched);
  if public.b3_patch_function(v_fn, false) <> 'applied' then raise exception 'VERIFIED_PAGE_PAIR_NOT_APPLIED'; end if;
end $$;

-- Creator attendance pays points too: refuse an Unverified page the same way (COMMUNITY_STAMP_NOT_FOUND, 404 in the app).
do $$
declare
  f record;
  needle constant text := E'  perform 1 from public.fan_passports where app_user_id = p_user and celebrity_id = p_celebrity;\n  if not found then raise exception ''PASSPORT_REQUIRED'' using errcode = ''P0001''; end if;';
  guard constant text := E'  if exists (select 1 from public.celebrities where id = p_celebrity and verification = ''unverified'') then /* verified-page */\n    raise exception ''COMMUNITY_STAMP_NOT_FOUND'' using errcode = ''P0001''; end if;\n';
begin
  select oid, prosrc into strict f from pg_catalog.pg_proc where oid = 'public.attend_creator(uuid,uuid,uuid)'::regprocedure;
  if position('/* verified-page */' in f.prosrc) > 0 then return; end if;
  if (length(f.prosrc) - length(replace(f.prosrc, needle, ''))) / length(needle) <> 1 then raise exception 'ATTEND_VERIFIED_SHAPE'; end if;
  execute replace(pg_catalog.pg_get_functiondef(f.oid), f.prosrc, replace(f.prosrc, needle, guard || needle));
end $$;

-- Public creator pages without the kyaa official mark. The server leaves them out of home, gallery, shorts and 덕질 points.
create function public.list_unverified_creators() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'slug',c.slug) order by c.slug),'[]'::jsonb)
    from public.celebrities c where c.verification='unverified' and c.status='published' and c.archived_at is null
$$;

revoke all on function public.fan_web_apply_page_verification(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.fan_web_admin_review_fanpage_request(uuid,uuid,uuid,uuid,integer,text,text,uuid,public.content_locale,text,text) from public,anon,authenticated,service_role;
revoke all on function public.fan_web_admin_set_page_verification(uuid,uuid,uuid,uuid,text,text,public.content_locale) from public,anon,authenticated,service_role;
revoke all on function public.list_unverified_creators() from public,anon,authenticated,service_role;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.fan_web_admin_review_fanpage_request(uuid,uuid,uuid,uuid,integer,text,text,uuid,public.content_locale,text,text) to service_role;
    grant execute on function public.fan_web_admin_set_page_verification(uuid,uuid,uuid,uuid,text,text,public.content_locale) to service_role;
    grant execute on function public.list_unverified_creators() to service_role;
  end if;
end $$;

commit;
