-- DUKJIL-POLICY ④ (user decision 2026-11-11, reviewer correction): "one post address, one member across all members" holds in both directions.
-- 20261221140000 refused a share proof of a post another member already holds. The Instagram repost (B3) only kept one key per member, so the
-- same post held by member A as a share proof could be sent by member B as a repost. submit_fan_insta_repost now takes the same per-post lock
-- as the share submit and refuses (SHARE_PROOF_URL_REUSED) a post another member holds in any status but 'rejected'; a rejected proof frees
-- the post again. Rows that already exist are not touched, revoked or re-reviewed. Only this function changes (create or replace keeps its owner
-- and ACL); everything else of B3 is as it was.
-- Rollback: supabase/rollback/20261221150000_repost_global_url_reuse.sql
begin;
set local lock_timeout = '5s';

create or replace function public.submit_fan_insta_repost(p_user uuid, p_celebrity uuid, p_post_kind text, p_url text, p_url_key text, p_asset_id uuid, p_own_post boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.fan_share_proofs%rowtype; v_asset public.mobile_media_assets%rowtype; v_key text := nullif(p_url_key, ''); pol public.dukjil_policy_versions;
begin
  if not public.dukjil_b3_payable(p_user) then raise exception 'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED' using errcode = 'P0001'; end if;
  if p_own_post is not true then raise exception 'SHARE_PROOF_OWN_POST_REQUIRED' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.fan_passports p where p.app_user_id = p_user and p.celebrity_id = p_celebrity) then raise exception 'PASSPORT_REQUIRED' using errcode = 'P0001'; end if;
  pol := public.dukjil_active_policy(public.dukjil_now());
  if pol.version is null or pol.rules #> '{actions,insta_repost}' is null then raise exception 'POLICY_INACTIVE' using errcode = 'P0001'; end if;
  if p_post_kind is null or p_post_kind not in ('feed', 'reel', 'story') then raise exception 'INSTA_REPOST_INVALID' using errcode = 'P0001'; end if;
  if p_post_kind in ('feed', 'reel') and (p_url is null or v_key is null or v_key !~ '^instagram:' or p_asset_id is not null) then
    raise exception 'INSTA_REPOST_INVALID' using errcode = 'P0001'; end if;
  if p_post_kind = 'story' then
    if p_asset_id is null then raise exception 'INSTA_REPOST_CAPTURE_REQUIRED' using errcode = 'P0001'; end if;
    if (v_key is null) <> (p_url is null) or (v_key is not null and v_key !~ '^instagram-story:') then raise exception 'INSTA_REPOST_INVALID' using errcode = 'P0001'; end if;
    select * into v_asset from public.mobile_media_assets a where a.id = p_asset_id for update;
    if not found or v_asset.app_user_id <> p_user or v_asset.kind <> 'image' or v_asset.purpose <> 'share_proof' or v_asset.state <> 'ready'
       or v_asset.storage_deleted_at is not null or v_asset.cleanup_requested_at is not null then
      raise exception 'INSTA_REPOST_CAPTURE_INVALID' using errcode = 'P0001'; end if;
    v_key := coalesce(v_key, 'image:' || left(v_asset.source_sha256, 40));
  end if;
  -- the lock is per post, not per member: a share proof and a repost of one post, or two members, meet here (same lock name as submit_fan_share_proof)
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-share-proof:' || v_key, 0));
  -- the same capture under a story address already submitted
  if p_asset_id is not null and v_asset.attached_id is not null then
    select * into v_row from public.fan_share_proofs where asset_id = p_asset_id;
    if v_row.id is null or v_row.url_key <> v_key then raise exception 'INSTA_REPOST_CAPTURE_INVALID' using errcode = 'P0001'; end if;
  end if;
  select * into v_row from public.fan_share_proofs where app_user_id = p_user and url_key = v_key for update;
  if found then
    if v_row.kind <> 'insta_repost' or v_row.status in ('pending', 'accepted', 'revoked') or v_row.reject_code = 'duplicate' then
      return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'replayed', true, 'duplicate', true);
    end if;
  end if;
  -- one post, one member (DUKJIL-POLICY 4): another member's proof of it, share or repost, in any status but rejected, refuses this one
  if exists (select 1 from public.fan_share_proofs o where o.url_key = v_key and o.app_user_id <> p_user and o.status <> 'rejected') then
    raise exception 'SHARE_PROOF_URL_REUSED' using errcode = 'P0001';
  end if;
  if v_row.id is not null then
    -- rejected for a reason the member can fix: back to pending, next revision
    if p_asset_id is not null and v_row.asset_id is distinct from p_asset_id then
      update public.mobile_media_assets set state = 'cancelled', asset_version = asset_version + 1, cleanup_requested_at = clock_timestamp(),
        cleanup_retry_at = clock_timestamp(), updated_at = clock_timestamp() where id = v_row.asset_id;
      update public.fan_share_proofs set asset_id = null where id = v_row.id;
    end if;
    update public.fan_share_proofs set status = 'pending', post_kind = p_post_kind, url = coalesce(p_url, url), asset_id = coalesce(p_asset_id, asset_id),
      celebrity_id = p_celebrity, submitted_at = clock_timestamp(), review_revision = review_revision + 1, reject_code = null,
      reviewed_at = null, reviewed_by = null, reviewer_role = null where id = v_row.id returning * into v_row;
  else
    insert into public.fan_share_proofs (app_user_id, celebrity_id, platform, url, url_key, own_post_confirmed, kind, post_kind, asset_id, status, submitted_at)
    values (p_user, p_celebrity, 'instagram', p_url, v_key, true, 'insta_repost', p_post_kind, p_asset_id, 'pending', clock_timestamp())
    returning * into v_row;
  end if;
  if p_asset_id is not null then
    update public.mobile_media_assets set attached_type = 'share_proof', attached_id = v_row.id, attached_version = v_row.review_revision + 1,
      access_scope = 'share_proof', position = 0, updated_at = clock_timestamp() where id = p_asset_id;
  end if;
  return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'replayed', false, 'duplicate', false);
end $$;

do $$ begin
  perform public.b3_owner_execute('public.submit_fan_insta_repost(uuid,uuid,text,text,text,uuid,boolean)', array['public.dukjil_now()', 'public.dukjil_b3_payable(uuid)', 'public.dukjil_active_policy(timestamp with time zone)']);
  perform public.b3_owner_access('public.submit_fan_insta_repost(uuid,uuid,text,text,text,uuid,boolean)', array['fan_passports:select', 'fan_share_proofs:select,insert,update', 'mobile_media_assets:select,update']);
end $$;

notify pgrst, 'reload schema';
commit;
