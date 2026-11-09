-- B3 §5.2: the Instagram repost mission (30P once a KST day and 20 times a month, counted by approvals, taken back within 7 days).
--
-- Rows live in fan_share_proofs next to the app's share proofs, told apart by kind ('share' | 'insta_repost'). A repost is born
-- 'pending' and a reviewer decides it: 'accepted' pays record_dukjil_action('insta_repost', 'insta-repost:<id>') once, 'rejected'
-- carries one of four reasons and can be submitted again (except 'duplicate'), an accepted repost can be revoked by an operator
-- within the paying policy's clawbackDays. Feed and reels are proven by their address (instagram:<code>, the same key the share
-- proof uses), stories by a capture (mobile_media_assets, purpose 'share_proof') with an optional address (instagram-story:<id>);
-- without one the key is image:<first 40 hex of the capture's sha256>. One member, one key, whatever the kind: a post sent as a share
-- proof cannot pay again as a repost and the other way round.
--
-- Reviewers: an active non-viewer admin, or an owner/manager of a published fan page of the repost's creator (can_review_insta_repost).
-- Nobody reviews their own repost (SELF_REVIEW_FORBIDDEN, checked on the locked row). Every decision writes audit_logs.
-- The share API keeps to kind 'share': its submit answers a repost key as a replay with duplicate:true and pays nothing, its payout
-- refuses a repost, its lists leave reposts out.
-- The capture is only readable by its owner and the reviewers (authorize_share_proof_image_read); the answer carries the storage path
-- for the server to stream, never to the browser. 90 days after the decision (policy proofRetentionDays) the capture is queued for
-- deletion (request_share_proof_capture_cleanup, daily cron); account deletion queues it at once.
--
-- Rollback: supabase/rollback/20261220033000_b3_insta_repost.sql (refuses while a repost row exists).
begin;
set local lock_timeout = '5s';

-- uploads: a new purpose / scope / attachment type, appended to whatever the current checks allow
do $$
declare c record; def text;
begin
  for c in select * from (values ('mobile_media_assets_purpose_check', 'purpose'), ('mobile_media_assets_access_scope_check', 'access_scope'),
      ('mobile_media_assets_attached_type_check', 'attached_type')) v(conname, col) loop
    select pg_get_constraintdef(oid) into def from pg_constraint where conrelid = 'public.mobile_media_assets'::regclass and conname = c.conname;
    if def is null then raise exception 'mobile_media_assets constraint % missing', c.conname; end if;
    if position('share_proof' in def) > 0 then continue; end if;
    def := regexp_replace(def, '^CHECK \((.*)\)$', '\1');
    execute format('alter table public.mobile_media_assets drop constraint %I', c.conname);
    execute format('alter table public.mobile_media_assets add constraint %I check ((%s) or (%I = %L))', c.conname, def, c.col, 'share_proof');
  end loop;
end $$;

alter table public.fan_share_proofs
  add column kind text not null default 'share' check (kind in ('share', 'insta_repost')),
  add column post_kind text check (post_kind in ('feed', 'reel', 'story')),
  add column asset_id uuid unique references public.mobile_media_assets(id) on delete restrict,
  add column submitted_at timestamptz,
  add column review_revision integer not null default 0 check (review_revision >= 0),
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references public.app_users(id),
  add column reviewer_role text check (reviewer_role in ('admin', 'page')),
  add column reject_code text check (reject_code in ('no_hashtag', 'private_account', 'duplicate', 'unrelated')),
  add column approved_at timestamptz,
  add column pay_result text check (pay_result in ('paid', 'point_cap', 'month_cap', 'account_inactive')),
  add column action_log_id uuid references public.dukjil_action_log(id);
alter table public.fan_share_proofs drop constraint fan_share_proofs_status_check;
alter table public.fan_share_proofs add constraint fan_share_proofs_status_check check (status in ('pending', 'accepted', 'rejected', 'revoked'));
alter table public.fan_share_proofs drop constraint fan_share_proofs_url_key_check;
alter table public.fan_share_proofs add constraint fan_share_proofs_url_key_check check (
  url_key ~ '^(instagram|tiktok|x|threads|youtube):[A-Za-z0-9_-]{6,40}$' or url_key ~ '^instagram-story:[0-9]{6,30}$' or url_key ~ '^image:[0-9a-f]{40}$');
alter table public.fan_share_proofs add constraint fan_share_proofs_kind_shape check (
  (kind = 'share' and post_kind is null and asset_id is null and status in ('accepted', 'revoked') and url_key !~ '^(instagram-story|image):')
  or (kind = 'insta_repost' and platform = 'instagram' and post_kind is not null and submitted_at is not null
      and (post_kind = 'story' or asset_id is null) and (url_key !~ '^image:' or post_kind = 'story')));
alter table public.fan_share_proofs add constraint fan_share_proofs_story_capture check (kind <> 'insta_repost' or post_kind <> 'story' or asset_id is not null or scrubbed_at is not null);
alter table public.fan_share_proofs add constraint fan_share_proofs_rejected_code check ((status = 'rejected') = (reject_code is not null));
create index fan_share_proofs_repost_queue on public.fan_share_proofs (status, submitted_at, id) where kind = 'insta_repost';

-- Who may review reposts of this creator: 'admin', 'page' or null.
create function public.can_review_insta_repost(p_actor uuid, p_allowlist uuid, p_celebrity uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_actor is null then return null; end if;
  if p_allowlist is not null then
    begin perform public.assert_active_admin(p_actor, p_allowlist, true); return 'admin';
    exception when others then null; end;
  end if;
  if p_celebrity is not null and public.dukjil_b3_payable(p_actor) and exists (select 1 from public.group_pages gp
      join public.group_memberships m on m.page_id = gp.id and m.app_user_id = p_actor and m.role in ('owner', 'manager')
      where gp.celebrity_id = p_celebrity and gp.kind = 'fan' and gp.status = 'published') then
    return 'page';
  end if;
  return null;
end $$;

-- A member submits a repost. Answers { id, status, replayed, duplicate }.
create function public.submit_fan_insta_repost(p_user uuid, p_celebrity uuid, p_post_kind text, p_url text, p_url_key text, p_asset_id uuid, p_own_post boolean)
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
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-share-proof:' || p_user::text || ':' || v_key, 0));
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

-- A reviewer decides one pending repost. p_decision 'accept' | 'reject'. Answers { id, status, points, payResult, revision }.
create function public.review_fan_insta_repost(p_actor uuid, p_allowlist uuid, p_id uuid, p_expected_revision integer, p_decision text, p_reject_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.fan_share_proofs%rowtype; v_role text; r jsonb; v_points integer := 0; v_pay text; v_at timestamptz; v_log uuid;
begin
  if p_decision is null or p_decision not in ('accept', 'reject') then raise exception 'REVIEW_INVALID' using errcode = 'P0001'; end if;
  select * into v_row from public.fan_share_proofs where id = p_id and kind = 'insta_repost' for update;
  if not found then raise exception 'SHARE_PROOF_NOT_FOUND' using errcode = 'P0001'; end if;
  if p_actor = v_row.app_user_id then raise exception 'SELF_REVIEW_FORBIDDEN' using errcode = 'P0001'; end if;
  v_role := public.can_review_insta_repost(p_actor, p_allowlist, v_row.celebrity_id);
  if v_role is null then raise exception 'REVIEW_FORBIDDEN' using errcode = 'P0001'; end if;
  if v_row.status <> 'pending' or p_expected_revision is distinct from v_row.review_revision then raise exception 'REVIEW_STALE' using errcode = 'P0001'; end if;
  if p_decision = 'reject' then
    if p_reject_code is null or p_reject_code not in ('no_hashtag', 'private_account', 'duplicate', 'unrelated') then raise exception 'REVIEW_INVALID' using errcode = 'P0001'; end if;
    update public.fan_share_proofs set status = 'rejected', reject_code = p_reject_code, reviewed_at = clock_timestamp(), reviewed_by = p_actor, reviewer_role = v_role
      where id = v_row.id returning * into v_row;
  else
    if p_reject_code is not null then raise exception 'REVIEW_INVALID' using errcode = 'P0001'; end if;
    if not public.dukjil_b3_payable(v_row.app_user_id) then
      v_pay := 'account_inactive'; v_at := public.dukjil_now();
    else
      -- an error here fails the approval as a whole: the repost stays pending
      r := public.record_dukjil_action(v_row.app_user_id, v_row.celebrity_id, 'insta_repost', 'insta-repost:' || v_row.id::text,
        pg_catalog.md5('insta-repost:' || v_row.id::text)::uuid, jsonb_build_object('targetKey', v_row.url_key));
      if r ->> 'reason' = 'ACCOUNT_INACTIVE' then v_pay := 'account_inactive';
      else
        v_points := coalesce((r ->> 'points')::integer, 0);
        v_pay := case when v_points > 0 then 'paid' when r ->> 'reason' like 'MONTH_CAP%' then 'month_cap' else 'point_cap' end;
        v_log := (r ->> 'logId')::uuid;
      end if;
      v_at := (r ->> 'at')::timestamptz;
    end if;
    update public.fan_share_proofs set status = 'accepted', points = v_points, pay_result = v_pay, approved_at = v_at, action_log_id = v_log,
      reviewed_at = clock_timestamp(), reviewed_by = p_actor, reviewer_role = v_role where id = v_row.id returning * into v_row;
  end if;
  insert into public.audit_logs (actor_app_user_id, actor_admin_allowlist_id, action, entity_type, entity_id, correlation_id, before_after_summary)
  values (p_actor, case when v_role = 'admin' then p_allowlist end, 'insta_repost.' || p_decision, 'fan_share_proof', v_row.id::text, extensions.gen_random_uuid(),
    jsonb_build_object('reviewerRole', v_role, 'rejectCode', v_row.reject_code, 'payResult', v_row.pay_result, 'points', v_row.points, 'revision', v_row.review_revision));
  return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'points', coalesce(v_row.points, 0), 'payResult', v_row.pay_result, 'revision', v_row.review_revision);
end $$;

-- The review list: pending first by submission time (or the given status), for one creator or (admins) all.
create function public.read_insta_repost_review_queue(p_actor uuid, p_allowlist uuid, p_celebrity uuid, p_status text, p_before timestamptz, p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_role text; v_admin boolean := false;
begin
  if p_allowlist is not null then
    begin perform public.assert_active_admin(p_actor, p_allowlist, true); v_admin := true; exception when others then v_admin := false; end;
  end if;
  if not v_admin then
    v_role := public.can_review_insta_repost(p_actor, null, p_celebrity);
    if v_role is null then raise exception 'REVIEW_FORBIDDEN' using errcode = 'P0001'; end if;
  end if;
  if p_status is not null and p_status not in ('pending', 'accepted', 'rejected', 'revoked', 'all') then raise exception 'REVIEW_INVALID' using errcode = 'P0001'; end if;
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object('id', s.id, 'submittedAt', s.submitted_at, 'status', s.status, 'postKind', s.post_kind, 'url', s.url,
      'hasCapture', s.asset_id is not null, 'revision', s.review_revision,
      'creator', jsonb_build_object('slug', c.slug, 'name', coalesce(l.name, c.slug)),
      'member', jsonb_build_object('id', s.app_user_id, 'nickname', p.nickname),
      'duplicateCount', (select count(*) from public.fan_share_proofs o where o.url_key = s.url_key and o.app_user_id <> s.app_user_id),
      'rejectCode', s.reject_code, 'reviewedAt', s.reviewed_at, 'reviewerRole', s.reviewer_role, 'payResult', s.pay_result,
      'points', s.points, 'approvedAt', s.approved_at,
      'clawedBack', s.action_log_id is not null and exists (select 1 from public.dukjil_point_corrections k where k.action_log_id = s.action_log_id),
      'revokedAt', s.revoked_at, 'revokeResult', s.revoke_result) order by s.submitted_at, s.id)
    from (select * from public.fan_share_proofs f
          where f.kind = 'insta_repost' and (p_celebrity is null or f.celebrity_id = p_celebrity)
            and (coalesce(p_status, 'pending') = 'all' or f.status = coalesce(p_status, 'pending'))
            and (p_before is null or f.submitted_at > p_before)
          order by f.submitted_at, f.id limit least(greatest(coalesce(p_limit, 50), 1), 100)) s
    join public.celebrities c on c.id = s.celebrity_id
    left join public.celebrity_localizations l on l.celebrity_id = c.id and l.locale = 'ko'
    left join public.user_profiles p on p.app_user_id = s.app_user_id), '[]'::jsonb));
end $$;

-- The review list of one fan page, for an owner or manager of that page (the page's creator decides which reposts).
create function public.read_page_insta_repost_queue(p_actor uuid, p_page uuid, p_status text, p_before timestamptz, p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_celebrity uuid;
begin
  select gp.celebrity_id into v_celebrity from public.group_pages gp
    join public.group_memberships m on m.page_id = gp.id and m.app_user_id = p_actor and m.role in ('owner', 'manager')
   where gp.id = p_page and gp.kind = 'fan' and gp.status = 'published';
  if v_celebrity is null then raise exception 'REVIEW_FORBIDDEN' using errcode = 'P0001'; end if;
  return public.read_insta_repost_review_queue(p_actor, null, v_celebrity, p_status, p_before, p_limit);
end $$;

-- The member's own reposts for one creator, newest first.
create function public.list_fan_insta_reposts(p_user uuid, p_celebrity uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object('id', s.id, 'status', s.status, 'postKind', s.post_kind, 'url', s.url, 'hasCapture', s.asset_id is not null,
      'rejectCode', s.reject_code, 'payResult', s.pay_result, 'points', s.points, 'submittedAt', s.submitted_at, 'reviewedAt', s.reviewed_at,
      'revokedAt', s.revoked_at) order by s.submitted_at desc, s.id desc)
    from (select * from public.fan_share_proofs where app_user_id = p_user and celebrity_id = p_celebrity and kind = 'insta_repost'
          order by submitted_at desc, id desc limit 50) s), '[]'::jsonb))
$$;

-- The capture of a repost for its owner or a reviewer: { storagePath, contentType } for the server to stream, else null.
create function public.authorize_share_proof_image_read(p_actor uuid, p_allowlist uuid, p_proof_id uuid, p_variant text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_row public.fan_share_proofs%rowtype; a public.mobile_media_assets%rowtype; v_role text;
begin
  if p_variant not in ('original', 'thumbnail') then raise exception 'MEDIA_INVALID_INPUT' using errcode = 'P0001'; end if;
  select * into v_row from public.fan_share_proofs where id = p_proof_id and kind = 'insta_repost';
  if not found or v_row.asset_id is null or p_actor is null then return null; end if;
  if p_actor <> v_row.app_user_id then
    v_role := public.can_review_insta_repost(p_actor, p_allowlist, v_row.celebrity_id);
    if v_role is null then return null; end if;
  end if;
  select * into a from public.mobile_media_assets where id = v_row.asset_id and purpose = 'share_proof' and kind = 'image' and state = 'ready'
    and storage_deleted_at is null and cleanup_requested_at is null;
  if not found then return null; end if;
  if v_role is not null then
    insert into public.audit_logs (actor_app_user_id, actor_admin_allowlist_id, action, entity_type, entity_id, correlation_id, before_after_summary)
    values (p_actor, case when v_role = 'admin' then p_allowlist end, 'insta_repost.capture.read', 'fan_share_proof', v_row.id::text, extensions.gen_random_uuid(),
      jsonb_build_object('assetId', a.id, 'reviewerRole', v_role));
  end if;
  return jsonb_build_object('storagePath', case when p_variant = 'thumbnail' then a.thumbnail_path else a.storage_path end,
    'contentType', case when p_variant = 'thumbnail' then 'image/webp' else a.content_type end);
end $$;

-- Daily: captures of reposts decided more than proofRetentionDays ago are queued for deletion.
create function public.request_share_proof_capture_cleanup() returns integer
language plpgsql security definer set search_path = '' as $$
declare days integer; n integer;
begin
  days := coalesce((select (p.rules ->> 'proofRetentionDays')::integer from public.dukjil_active_policy(clock_timestamp()) p), 90);
  update public.mobile_media_assets a set cleanup_requested_at = clock_timestamp(), cleanup_retry_at = clock_timestamp(), updated_at = clock_timestamp()
    from public.fan_share_proofs s
   where s.asset_id = a.id and s.kind = 'insta_repost' and s.status in ('accepted', 'rejected', 'revoked')
     and coalesce(s.revoked_at, s.reviewed_at) < clock_timestamp() - make_interval(days => days)
     and a.cleanup_requested_at is null and a.storage_deleted_at is null;
  get diagnostics n = row_count;
  return n;
end $$;
select cron.schedule('share-proof-capture-cleanup', '17 4 * * *', $c$select public.request_share_proof_capture_cleanup()$c$);

-- B3 §5.2 회수: the share-grant correction with the action key as a parameter. The old function passes 'share'.
create function public.dukjil_correct_proof_grant(p_actor uuid, p_owner uuid, p_action_key text, p_source_key text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  l public.dukjil_action_log; st public.community_stamps; cid uuid; entry uuid; gseq bigint; spent boolean; correction text; review text;
  v_reason text := case when p_action_key = 'share' then 'share_proof_revoked' else 'insta_repost_revoked' end;
begin
  select * into l from public.dukjil_action_log
   where app_user_id = p_owner and action_key = p_action_key and source_key = p_source_key
     and ((points > 0 and ledger_id is not null) or (points = 0 and ledger_id is null and stamp_id is not null))
   order by created_at limit 1;
  if l.id is null then return 'none'; end if;
  if exists (select 1 from public.dukjil_point_corrections c where c.action_log_id = l.id) then return 'replayed'; end if;
  if l.stamp_id is not null then
    select * into st from public.community_stamps where id = l.stamp_id;
    if st.id is null then raise exception 'SHARE_GRANT_UNREADABLE: stamp %', l.stamp_id using errcode = 'P0001'; end if;
    if st.revoked_at is null then
      perform public.void_passport_stamp(p_actor, st.id, v_reason, false, 'share-proof:' || l.id::text);
      if not exists (select 1 from public.community_stamps s where s.id = st.id and s.revoked_at is not null) then
        raise exception 'SHARE_GRANT_NOT_REVERTED: stamp %', st.id using errcode = 'P0001';
      end if;
    end if;
    if l.points = 0 then return 'stamp_voided'; end if;
    if exists (select 1 from public.dukjil_point_corrections c where c.action_log_id = l.id) then
      return (select status from public.dukjil_point_corrections c where c.action_log_id = l.id limit 1);
    end if;
  end if;
  cid := extensions.gen_random_uuid();
  select e.owner_sequence into gseq from public.mobile_fan_economy_ledger e where e.id = l.ledger_id;
  if gseq is null then raise exception 'SHARE_GRANT_UNREADABLE: ledger %', l.ledger_id using errcode = 'P0001'; end if;
  select exists (select 1 from public.mobile_fan_economy_ledger e
                 where e.app_user_id = p_owner and e.celebrity_id is null and e.asset = 'fan_point' and e.amount < 0
                   and e.source_type <> 'dukjil_correction' and e.owner_sequence > gseq) into spent;
  if not spent and public.group_wallet_balance(p_owner, 'fan_point') >= l.points then
    entry := public.group_wallet_post_correction(p_owner, 'fan_point', -l.points::bigint, 'dukjil_correction', cid);
    if entry is null then raise exception 'SHARE_GRANT_NOT_REVERTED: points' using errcode = 'P0001'; end if;
    correction := 'corrected';
  else
    correction := 'review'; review := 'rights_spent';
  end if;
  insert into public.dukjil_point_corrections (id, action_log_id, stamp_id, app_user_id, amount, reason, ledger_id, status, void_reason)
    values (cid, l.id, null, p_owner, l.points, coalesce(review, v_reason), entry, correction, v_reason);
  return correction;
end $$;

create or replace function public.dukjil_correct_share_grant(p_actor uuid, p_owner uuid, p_source_key text)
returns text language sql security definer set search_path = '' as $$
  select public.dukjil_correct_proof_grant(p_actor, p_owner, 'share', p_source_key)
$$;

-- Patches of the share functions (pairs, §4.1)
insert into public.b3_function_patch_bases (fn, base_md5) values
  ('public.submit_fan_share_proof(uuid,uuid,text,text,text,boolean)', 'f8abc10b99234985275a0e126468b770'),
  ('public.pay_fan_share_proof(uuid,uuid,uuid,jsonb)', '8ec4f06b6b4932ebead7c347521476d3'),
  ('public.list_fan_share_proofs(uuid,uuid)', 'be0fcb725f9850b788589363aa104859'),
  ('public.read_admin_share_proofs(uuid,uuid,text,timestamp with time zone,integer)', 'cdf016d2f868b6d5963d82bd7c121689'),
  ('public.revoke_fan_share_proof(uuid,uuid,uuid,text)', '416f52136bda4aa58089fea16bc8ea13'),
  ('public.scrub_fan_share_proofs_on_deletion()', '77ac3a1b4721e29363628ff8328fbf63');
insert into public.b3_function_patches (fn, pair_no, original, patched) values
('public.submit_fan_share_proof(uuid,uuid,text,text,text,boolean)', 1,
$o$  if found then
    return jsonb_build_object('id', v_row.id, 'replayed', true, 'points', v_row.points, 'status', v_row.status);
$o$,
$p$  if found and v_row.kind <> 'share' then /* b3-share-cross */
    -- a repost of the same post: answered as a closed replay (the deployed web pays nothing for it), marked duplicate
    return jsonb_build_object('id', v_row.id, 'replayed', true, 'points', 0, 'status', 'accepted', 'duplicate', true);
  elsif found then
    return jsonb_build_object('id', v_row.id, 'replayed', true, 'points', v_row.points, 'status', v_row.status);
$p$),
('public.pay_fan_share_proof(uuid,uuid,uuid,jsonb)', 1,
$o$  select * into v_row from public.fan_share_proofs where id = p_proof_id and app_user_id = p_app_user_id for update;
$o$,
$p$  select * into v_row from public.fan_share_proofs where id = p_proof_id and app_user_id = p_app_user_id and kind = 'share' /* b3-share-cross */ for update;
$p$),
('public.list_fan_share_proofs(uuid,uuid)', 1,
$o$where app_user_id = p_app_user_id and celebrity_id = p_celebrity_id and url is not null order by$o$,
$p$where app_user_id = p_app_user_id and celebrity_id = p_celebrity_id and url is not null and kind = 'share' /* b3-share-cross */ order by$p$),
('public.read_admin_share_proofs(uuid,uuid,text,timestamp with time zone,integer)', 1,
$o$          where (p_status is null or p_status = 'all' or f.status = p_status) and$o$,
$p$          where f.kind = 'share' /* b3-share-cross */ and (p_status is null or p_status = 'all' or f.status = p_status) and$p$),
('public.revoke_fan_share_proof(uuid,uuid,uuid,text)', 1,
$o$  v_result := public.dukjil_correct_share_grant(p_actor, v_row.app_user_id, 'share-proof:' || v_row.id::text);
$o$,
$p$  if v_row.kind = 'insta_repost' then /* b3-repost-revoke */
    if p_actor = v_row.app_user_id then raise exception 'SELF_REVIEW_FORBIDDEN' using errcode = 'P0001'; end if;
    if v_row.status <> 'accepted' then raise exception 'SHARE_PROOF_NOT_ACCEPTED' using errcode = 'P0001'; end if;
    if v_row.action_log_id is not null and public.dukjil_now() > v_row.approved_at + make_interval(days => coalesce((select (pv.rules #>> '{actions,insta_repost,clawbackDays}')::integer
         from public.dukjil_action_log l join public.dukjil_policy_versions pv on pv.version = l.policy_version where l.id = v_row.action_log_id), 7)) then
      raise exception 'CLAWBACK_WINDOW_CLOSED' using errcode = 'P0001'; end if;
    v_result := public.dukjil_correct_proof_grant(p_actor, v_row.app_user_id, 'insta_repost', 'insta-repost:' || v_row.id::text);
  else
    v_result := public.dukjil_correct_share_grant(p_actor, v_row.app_user_id, 'share-proof:' || v_row.id::text); /* b3-share */
  end if;
$p$),
('public.scrub_fan_share_proofs_on_deletion()', 1,
$o$    update public.fan_share_proofs set url = null, scrubbed_at = clock_timestamp() where app_user_id = new.id and scrubbed_at is null;
$o$,
$p$    update public.fan_share_proofs set url = null, scrubbed_at = clock_timestamp() where app_user_id = new.id and scrubbed_at is null; /* b3-capture */
    update public.mobile_media_assets set cleanup_requested_at = clock_timestamp(), cleanup_retry_at = clock_timestamp(), updated_at = clock_timestamp()
     where app_user_id = new.id and purpose = 'share_proof' and cleanup_requested_at is null and storage_deleted_at is null;
$p$);
-- uploads: the reservation accepts the story capture purpose (images only)
insert into public.b3_function_patch_bases (fn, base_md5) values ('public.reserve_owned_mobile_media(uuid,text,text,text,integer,uuid)', '7eb68e9349894d457a6335f8f8351bee');
insert into public.b3_function_patches (fn, pair_no, original, patched) values
('public.reserve_owned_mobile_media(uuid,text,text,text,integer,uuid)', 1,
$o$'wave_album','wave_post','group_post','group_image')
$o$,
$p$'wave_album','wave_post','group_post','group_image','share_proof' /* b3-capture */)
$p$),
('public.reserve_owned_mobile_media(uuid,text,text,text,integer,uuid)', 2,
$o$(p_purpose in('certification','support','group_image')and p_kind<>'image')$o$,
$p$(p_purpose in('certification','support','group_image','share_proof' /* b3-capture */)and p_kind<>'image')$p$);
do $$ declare f text; begin
  foreach f in array array['public.submit_fan_share_proof(uuid,uuid,text,text,text,boolean)', 'public.pay_fan_share_proof(uuid,uuid,uuid,jsonb)',
    'public.list_fan_share_proofs(uuid,uuid)', 'public.read_admin_share_proofs(uuid,uuid,text,timestamp with time zone,integer)',
    'public.revoke_fan_share_proof(uuid,uuid,uuid,text)', 'public.scrub_fan_share_proofs_on_deletion()',
    'public.reserve_owned_mobile_media(uuid,text,text,text,integer,uuid)'] loop
    perform public.b3_patch_function(f, false);
  end loop;
end $$;

revoke all on function public.can_review_insta_repost(uuid, uuid, uuid), public.submit_fan_insta_repost(uuid, uuid, text, text, text, uuid, boolean),
  public.review_fan_insta_repost(uuid, uuid, uuid, integer, text, text), public.read_insta_repost_review_queue(uuid, uuid, uuid, text, timestamptz, integer),
  public.list_fan_insta_reposts(uuid, uuid), public.authorize_share_proof_image_read(uuid, uuid, uuid, text),
  public.request_share_proof_capture_cleanup(), public.dukjil_correct_proof_grant(uuid, uuid, text, text),
  public.read_page_insta_repost_queue(uuid, uuid, text, timestamptz, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_fan_insta_repost(uuid, uuid, text, text, text, uuid, boolean),
  public.review_fan_insta_repost(uuid, uuid, uuid, integer, text, text), public.read_insta_repost_review_queue(uuid, uuid, uuid, text, timestamptz, integer),
  public.list_fan_insta_reposts(uuid, uuid), public.authorize_share_proof_image_read(uuid, uuid, uuid, text),
  public.read_page_insta_repost_queue(uuid, uuid, text, timestamptz, integer) to service_role;

-- owner-policy-begin (same remedy as 20261215070000)
do $$
declare me record; t record;
begin
  select oid, rolname, rolsuper, rolbypassrls into me from pg_roles where rolname = current_user;
  if me.rolsuper or me.rolbypassrls then return; end if;
  for t in select * from (values ('group_pages','select'),('group_memberships','select'),('mobile_media_assets','select, update'),('audit_logs','insert'),
      ('admin_allowlist','select'),('user_profiles','select'),('dukjil_point_corrections','select, insert'),('dukjil_action_log','select'),('dukjil_policy_versions','select')) v(tname, privs) loop
    execute format('grant %s on table public.%I to %I', t.privs, t.tname, me.rolname);
    if exists (select 1 from pg_class c where c.oid = ('public.' || t.tname)::regclass and c.relrowsecurity
        and (c.relforcerowsecurity or not pg_has_role(me.oid, c.relowner, 'USAGE')))
      and not exists (select 1 from pg_policy pol where pol.polrelid = ('public.' || t.tname)::regclass and me.oid = any(pol.polroles)) then
      execute format('create policy %I on public.%I for all to %I using (true) with check (true)', 'p3_fn_owner_' || me.rolname, t.tname, me.rolname);
    end if;
  end loop;
end $$;
-- owner-policy-end

-- Access of the functions this file adds or patches, for the role that owns each (B3 review F3).
do $$ begin
  perform public.b3_owner_execute('public.can_review_insta_repost(uuid,uuid,uuid)', array['public.assert_active_admin(uuid,uuid,boolean)', 'public.dukjil_b3_payable(uuid)']);
  perform public.b3_owner_execute('public.read_insta_repost_review_queue(uuid,uuid,uuid,text,timestamp with time zone,integer)', array['public.assert_active_admin(uuid,uuid,boolean)', 'public.can_review_insta_repost(uuid,uuid,uuid)']);
  perform public.b3_owner_execute('public.read_page_insta_repost_queue(uuid,uuid,text,timestamp with time zone,integer)', array['public.read_insta_repost_review_queue(uuid,uuid,uuid,text,timestamp with time zone,integer)']);
  perform public.b3_owner_execute('public.submit_fan_insta_repost(uuid,uuid,text,text,text,uuid,boolean)', array['public.dukjil_now()', 'public.dukjil_b3_payable(uuid)', 'public.dukjil_active_policy(timestamp with time zone)']);
  perform public.b3_owner_execute('public.review_fan_insta_repost(uuid,uuid,uuid,integer,text,text)', array['public.record_dukjil_action(uuid,uuid,text,text,uuid,jsonb)', 'public.can_review_insta_repost(uuid,uuid,uuid)', 'public.dukjil_b3_payable(uuid)', 'public.dukjil_now()']);
  perform public.b3_owner_execute('public.authorize_share_proof_image_read(uuid,uuid,uuid,text)', array['public.can_review_insta_repost(uuid,uuid,uuid)']);
  perform public.b3_owner_execute('public.dukjil_correct_proof_grant(uuid,uuid,text,text)', array['public.void_passport_stamp(uuid,uuid,text,boolean,text)', 'public.group_wallet_post_correction(uuid,text,bigint,text,uuid)', 'public.group_wallet_balance(uuid,text)']);
  perform public.b3_owner_execute('public.dukjil_correct_share_grant(uuid,uuid,text)', array['public.dukjil_correct_proof_grant(uuid,uuid,text,text)']);
  perform public.b3_owner_execute('public.revoke_fan_share_proof(uuid,uuid,uuid,text)', array['public.dukjil_correct_proof_grant(uuid,uuid,text,text)', 'public.dukjil_now()']);
  perform public.b3_owner_execute('public.request_share_proof_capture_cleanup()', array['public.dukjil_active_policy(timestamp with time zone)']);
  perform public.b3_owner_access('public.can_review_insta_repost(uuid,uuid,uuid)', array['group_pages:select', 'group_memberships:select']);
  perform public.b3_owner_access('public.read_page_insta_repost_queue(uuid,uuid,text,timestamp with time zone,integer)', array['group_pages:select', 'group_memberships:select']);
  perform public.b3_owner_access('public.submit_fan_insta_repost(uuid,uuid,text,text,text,uuid,boolean)', array['fan_passports:select', 'fan_share_proofs:select,insert,update', 'mobile_media_assets:select,update']);
  perform public.b3_owner_access('public.review_fan_insta_repost(uuid,uuid,uuid,integer,text,text)', array['fan_share_proofs:select,update', 'audit_logs:insert']);
  perform public.b3_owner_access('public.read_insta_repost_review_queue(uuid,uuid,uuid,text,timestamp with time zone,integer)', array['fan_share_proofs:select', 'celebrities:select', 'celebrity_localizations:select', 'user_profiles:select', 'dukjil_point_corrections:select']);
  perform public.b3_owner_access('public.list_fan_insta_reposts(uuid,uuid)', array['fan_share_proofs:select']);
  perform public.b3_owner_access('public.authorize_share_proof_image_read(uuid,uuid,uuid,text)', array['fan_share_proofs:select', 'mobile_media_assets:select', 'audit_logs:insert']);
  perform public.b3_owner_access('public.request_share_proof_capture_cleanup()', array['fan_share_proofs:select', 'mobile_media_assets:select,update']);
  perform public.b3_owner_access('public.dukjil_correct_proof_grant(uuid,uuid,text,text)', array['dukjil_action_log:select', 'dukjil_point_corrections:select,insert', 'community_stamps:select', 'mobile_fan_economy_ledger:select']);
  perform public.b3_owner_access('public.revoke_fan_share_proof(uuid,uuid,uuid,text)', array['fan_share_proofs:select,update', 'dukjil_action_log:select', 'dukjil_policy_versions:select']);
  perform public.b3_owner_access('public.submit_fan_share_proof(uuid,uuid,text,text,text,boolean)', array['fan_share_proofs:select,insert']);
  perform public.b3_owner_access('public.pay_fan_share_proof(uuid,uuid,uuid,jsonb)', array['fan_share_proofs:select,update']);
  perform public.b3_owner_access('public.scrub_fan_share_proofs_on_deletion()', array['fan_share_proofs:select,update', 'mobile_media_assets:select,update']);
end $$;

do $$ declare pair record; caller_owner name; target_owner name; begin
  for pair in select * from (values
    ('public.can_review_insta_repost(uuid,uuid,uuid)', 'public.assert_active_admin(uuid,uuid,boolean)'),
    ('public.can_review_insta_repost(uuid,uuid,uuid)', 'public.dukjil_b3_payable(uuid)'),
    ('public.read_insta_repost_review_queue(uuid,uuid,uuid,text,timestamp with time zone,integer)', 'public.assert_active_admin(uuid,uuid,boolean)'),
    ('public.read_page_insta_repost_queue(uuid,uuid,text,timestamp with time zone,integer)', 'public.read_insta_repost_review_queue(uuid,uuid,uuid,text,timestamp with time zone,integer)'),
    ('public.review_fan_insta_repost(uuid,uuid,uuid,integer,text,text)', 'public.record_dukjil_action(uuid,uuid,text,text,uuid,jsonb)'),
    ('public.revoke_fan_share_proof(uuid,uuid,uuid,text)', 'public.dukjil_correct_proof_grant(uuid,uuid,text,text)'),
    ('public.dukjil_correct_proof_grant(uuid,uuid,text,text)', 'public.void_passport_stamp(uuid,uuid,text,boolean,text)'),
    ('public.dukjil_correct_proof_grant(uuid,uuid,text,text)', 'public.group_wallet_post_correction(uuid,text,bigint,text,uuid)'),
    ('public.dukjil_correct_proof_grant(uuid,uuid,text,text)', 'public.group_wallet_balance(uuid,text)'),
    ('public.submit_fan_insta_repost(uuid,uuid,text,text,text,uuid,boolean)', 'public.dukjil_now()'),
    ('public.revoke_fan_share_proof(uuid,uuid,uuid,text)', 'public.dukjil_now()')) v(caller, target) loop
    select pg_get_userbyid(proowner) into caller_owner from pg_proc where oid = pair.caller::regprocedure;
    select pg_get_userbyid(proowner) into target_owner from pg_proc where oid = pair.target::regprocedure;
    if caller_owner in ('anon', 'authenticated', 'service_role') then raise exception 'Unexpected definer owner % for %', caller_owner, pair.caller; end if;
    if caller_owner <> target_owner then execute format('grant execute on function %s to %I', pair.target, caller_owner); end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;
