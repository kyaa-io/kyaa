-- DUKJIL-POLICY ④ (user decision 2026-11-11): the share mission pays only for a post that tags the official kyaa account, and a post
-- address is used once across all members.
--
-- 1. A share proof is born 'pending' and pays nothing. An operator opens the post, checks the official tag and decides with
--    review_fan_share_proof: 'accept' makes it 'accepted' (the web then runs the unchanged payout pay_fan_share_proof, which only pays an
--    accepted proof), 'reject' keeps one of the existing reject codes. A rejected proof can be sent again (back to pending, next
--    revision) unless it was rejected as a duplicate. Nothing outside the proof's own review pays it: an outside check that fails or
--    cannot run leaves the proof pending.
-- 2. One post, one member: submit_fan_share_proof (a B3 text-pair patch, see below) refuses a post address another member already holds (any kind, any status except
--    rejected) with SHARE_PROOF_URL_REUSED. Rows written before this migration are left as they are (accepted rows keep their grant);
--    the admin list still marks old duplicates. Nobody else's row is touched.
-- 3. The admin list also answers the review revision and the reject code.
--
-- Rollback: supabase/rollback/20261221140000_share_tag_review.sql (roll the web back first; it refuses while pending or rejected
-- share proofs exist).
begin;
set local lock_timeout = '5s';

alter table public.fan_share_proofs drop constraint fan_share_proofs_kind_shape;
alter table public.fan_share_proofs add constraint fan_share_proofs_kind_shape check (
  (kind = 'share' and post_kind is null and asset_id is null and status in ('pending', 'accepted', 'rejected', 'revoked') and url_key !~ '^(instagram-story|image):')
  or (kind = 'insta_repost' and platform = 'instagram' and post_kind is not null and submitted_at is not null
      and (post_kind = 'story' or asset_id is null) and (url_key !~ '^image:' or post_kind = 'story')));

-- submit_fan_share_proof and read_admin_share_proofs carry the B3 text pairs (20261220033000 b3_function_patches, md5-checked,
-- reverted by its rollback and checked by dukjil_b3.sql S19). Replacing them whole would break that bookkeeping, so the same mechanism
-- is used: revert to the base text, add pairs 2 and 3 for the submit and pair 2 for the list, apply all pairs again. The pairs keep
-- pair 1's text untouched.
do $$ declare f text; begin
  foreach f in array array['public.submit_fan_share_proof(uuid,uuid,text,text,text,boolean)', 'public.read_admin_share_proofs(uuid,uuid,text,timestamp with time zone,integer)'] loop
    perform public.b3_patch_function(f, true);
  end loop;
end $$;
insert into public.b3_function_patches (fn, pair_no, original, patched) values
('public.submit_fan_share_proof(uuid,uuid,text,text,text,boolean)', 2,
$o$  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-share-proof:' || p_app_user_id::text || ':' || p_url_key, 0));
  select * into v_row from public.fan_share_proofs where app_user_id = p_app_user_id and url_key = p_url_key;
$o$,
$p$  -- the lock is per post, not per member: two members sending one post at once meet here /* b3-share-tag-lock */
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-share-proof:' || p_url_key, 0));
  -- a share proof rejected for a fixable reason (not 'duplicate') is not a replay: it is reopened below
  select * into v_row from public.fan_share_proofs where app_user_id = p_app_user_id and url_key = p_url_key
     and not (kind = 'share' and status = 'rejected' and reject_code <> 'duplicate') for update;
$p$),
('public.submit_fan_share_proof(uuid,uuid,text,text,text,boolean)', 3,
$o$  end if;
  insert into public.fan_share_proofs (app_user_id, celebrity_id, platform, url, url_key, own_post_confirmed)
  values (p_app_user_id, p_celebrity_id, p_platform, p_url, p_url_key, true) returning * into v_row;
$o$,
$p$  end if;
  /* b3-share-tag-reuse */
  -- one post, one member: another member's proof of it (any kind, any status but rejected) refuses this one
  if exists (select 1 from public.fan_share_proofs o where o.url_key = p_url_key and o.app_user_id <> p_app_user_id and o.status <> 'rejected') then
    raise exception 'SHARE_PROOF_URL_REUSED';
  end if;
  select * into v_row from public.fan_share_proofs where app_user_id = p_app_user_id and url_key = p_url_key and kind = 'share' and status = 'rejected' and reject_code <> 'duplicate' for update;
  if v_row.id is not null then
    -- rejected for a reason the member can fix (the tag): back to pending, next revision
    update public.fan_share_proofs set status = 'pending', url = coalesce(p_url, url), celebrity_id = p_celebrity_id, review_revision = review_revision + 1,
      reject_code = null, reviewed_at = null, reviewed_by = null, reviewer_role = null where id = v_row.id returning * into v_row;
  else
    insert into public.fan_share_proofs (app_user_id, celebrity_id, platform, url, url_key, own_post_confirmed, status)
    values (p_app_user_id, p_celebrity_id, p_platform, p_url, p_url_key, true, 'pending') returning * into v_row;
  end if;
$p$),
('public.read_admin_share_proofs(uuid,uuid,text,timestamp with time zone,integer)', 2,
$o$      'revokedAt', s.revoked_at, 'revokeResult', s.revoke_result) order by s.created_at desc, s.id desc)$o$,
$p$      'revokedAt', s.revoked_at, 'revokeResult', s.revoke_result, 'revision', s.review_revision, 'rejectCode', s.reject_code /* b3-share-tag-list */) order by s.created_at desc, s.id desc)$p$);
do $$ declare f text; begin
  foreach f in array array['public.submit_fan_share_proof(uuid,uuid,text,text,text,boolean)', 'public.read_admin_share_proofs(uuid,uuid,text,timestamp with time zone,integer)'] loop
    perform public.b3_patch_function(f, false);
  end loop;
end $$;

-- An operator decides one pending share proof. p_decision 'accept' | 'reject'. Answers what the server needs to pay an accepted proof.
-- An accepted proof whose payout never ran (points still null) answers 'accept' again as a replay, so the server can finish the payout.
create function public.review_fan_share_proof(p_actor uuid, p_allowlist uuid, p_id uuid, p_expected_revision integer, p_decision text, p_reject_code text, p_tag_platforms text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.fan_share_proofs%rowtype; v_slug text; v_replayed boolean := false;
begin
  begin perform public.assert_active_admin(p_actor, p_allowlist, true);
  exception when others then raise exception 'ADMIN_REQUIRED' using errcode = 'P0001'; end;
  if p_decision is null or p_decision not in ('accept', 'reject') then raise exception 'REVIEW_INVALID' using errcode = 'P0001'; end if;
  select * into v_row from public.fan_share_proofs where id = p_id and kind = 'share' for update;
  if not found then raise exception 'SHARE_PROOF_NOT_FOUND' using errcode = 'P0001'; end if;
  if p_actor = v_row.app_user_id then raise exception 'SELF_REVIEW_FORBIDDEN' using errcode = 'P0001'; end if;
  if p_decision = 'accept' and v_row.status = 'accepted' and v_row.points is null and p_reject_code is null then
    v_replayed := true;
  else
    if v_row.status <> 'pending' or p_expected_revision is distinct from v_row.review_revision then raise exception 'REVIEW_STALE' using errcode = 'P0001'; end if;
    if p_decision = 'reject' then
      if p_reject_code is null or p_reject_code not in ('no_hashtag', 'private_account', 'duplicate', 'unrelated') then raise exception 'REVIEW_INVALID' using errcode = 'P0001'; end if;
      update public.fan_share_proofs set status = 'rejected', reject_code = p_reject_code, reviewed_at = clock_timestamp(), reviewed_by = p_actor, reviewer_role = 'admin'
       where id = v_row.id returning * into v_row;
    else
      if p_reject_code is not null then raise exception 'REVIEW_INVALID' using errcode = 'P0001'; end if;
      -- p_tag_platforms: the networks whose official account is known; a post on another one cannot be checked, so it stays pending
      if v_row.platform <> all (coalesce(p_tag_platforms, '{}'::text[])) then raise exception 'SHARE_TAG_HANDLE_UNCONFIRMED' using errcode = 'P0001'; end if;
      update public.fan_share_proofs set status = 'accepted', approved_at = clock_timestamp(), reviewed_at = clock_timestamp(), reviewed_by = p_actor, reviewer_role = 'admin'
       where id = v_row.id returning * into v_row;
    end if;
    insert into public.audit_logs (actor_app_user_id, actor_admin_allowlist_id, action, entity_type, entity_id, correlation_id, before_after_summary)
    values (p_actor, p_allowlist, 'share_proof.' || p_decision, 'fan_share_proof', v_row.id::text, extensions.gen_random_uuid(),
      jsonb_build_object('rejectCode', v_row.reject_code, 'platform', v_row.platform, 'revision', v_row.review_revision));
  end if;
  select c.slug into v_slug from public.celebrities c where c.id = v_row.celebrity_id;
  return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'replayed', v_replayed, 'revision', v_row.review_revision,
    'appUserId', v_row.app_user_id, 'platform', v_row.platform, 'creatorId', v_row.celebrity_id, 'creatorSlug', v_slug);
end $$;

revoke all on function public.review_fan_share_proof(uuid, uuid, uuid, integer, text, text, text[]) from public, anon, authenticated, service_role;
grant execute on function public.review_fan_share_proof(uuid, uuid, uuid, integer, text, text, text[]) to service_role;

-- The applying role may differ from the owner of what it reads (same remedy as 20261220033000).
do $$ begin
  perform public.b3_owner_execute('public.review_fan_share_proof(uuid,uuid,uuid,integer,text,text,text[])', array['public.assert_active_admin(uuid,uuid,boolean)']);
  perform public.b3_owner_access('public.review_fan_share_proof(uuid,uuid,uuid,integer,text,text,text[])', array['fan_share_proofs:select,update', 'celebrities:select', 'audit_logs:insert']);
  perform public.b3_owner_access('public.submit_fan_share_proof(uuid,uuid,text,text,text,boolean)', array['fan_share_proofs:select,insert,update']);
  perform public.b3_owner_access('public.read_admin_share_proofs(uuid,uuid,text,timestamp with time zone,integer)', array['fan_share_proofs:select', 'celebrities:select', 'celebrity_localizations:select', 'user_profiles:select']);
end $$;

notify pgrst, 'reload schema';
commit;
