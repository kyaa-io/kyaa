-- PASSPORT-RENEWAL P3 (2/3): proof submit / resubmit / review RPCs (contract 3.6, 9 P3).
-- Legacy submit_owned_certification, register_owned_certification_upload, review_admin_certification_submission,
-- approve_telegram_certification and get_admin_certification_queue are untouched here (20261210250000 keeps proof rows out of them). These functions only handle rows with proof_type not null.
-- Approval = one transaction: group_wallet_lock -> submission FOR UPDATE -> revision check -> record_dukjil_action('proof')
-- (proof stamp, passport slot 9 through the P2 stamp wrapper, 500P first / 100P repeat, creator-month point cap) -> title -> public post.
-- Any failure in any step rolls back all of them. Errors are P0001 with fixed codes.

create function public.submit_certification_proof(
  p_user uuid, p_celebrity uuid, p_proof_type text, p_upload_id uuid, p_publish_consent boolean, p_amount_visible boolean,
  p_image_phash text[], p_idempotency_key uuid, p_request_hash text, p_pii_detected boolean default false, p_post_body text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_body text := nullif(btrim(coalesce(p_post_body, '')), '');
  up public.certification_uploads%rowtype; mission public.certification_missions%rowtype;
  reward public.certification_reward_revisions%rowtype; existing public.certification_submissions%rowtype;
  new_row public.certification_submissions%rowtype; attempt integer; used integer; month_start timestamptz;
begin
  if p_user is null or p_celebrity is null or p_upload_id is null or p_idempotency_key is null
     or p_proof_type is null or p_proof_type not in ('membership','purchase','receipt','ticket','donation','funding','kyaa_payment')
     or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$'
     or p_image_phash is null or cardinality(p_image_phash) not between 1 and 3 or array_position(p_image_phash, null) is not null then
    raise exception 'PROOF_INVALID' using errcode = 'P0001'; end if;
  if v_body is not null and length(v_body) > 500 then raise exception 'PROOF_INVALID' using errcode = 'P0001'; end if;
  perform public.group_wallet_lock(p_user);
  select * into existing from public.certification_submissions where app_user_id = p_user and idempotency_key = p_idempotency_key;
  if found then
    if existing.request_hash <> p_request_hash or existing.proof_type is distinct from p_proof_type then
      raise exception 'IDEMPOTENCY_MISMATCH' using errcode = 'P0001'; end if;
    return jsonb_build_object('id', existing.id, 'status', existing.status, 'revision', existing.review_revision, 'replayed', true);
  end if;
  -- the server's text-pattern result decides (contract 9): the DB only carries it, nothing is stored for a blocked proof
  if coalesce(p_pii_detected, false) then raise exception 'PROOF_PII_DETECTED' using errcode = 'P0001'; end if;
  select * into up from public.certification_uploads where id = p_upload_id and app_user_id = p_user and celebrity_id = p_celebrity for update;
  if not found or up.consumed_submission_id is not null or up.purged_at is not null then
    raise exception 'UPLOAD_INVALID' using errcode = 'P0001'; end if;
  if up.expires_at <= now() then raise exception 'UPLOAD_EXPIRED' using errcode = 'P0001'; end if;
  select * into mission from public.certification_missions where id = up.mission_id and celebrity_id = p_celebrity
    and status = 'active' and statement_timestamp() >= opens_at and statement_timestamp() < closes_at for share;
  if not found then raise exception 'PROOF_MISSION_UNAVAILABLE' using errcode = 'P0001'; end if;
  if mission.membership_platform is not null then raise exception 'PROOF_MISSION_LEGACY' using errcode = 'P0001'; end if;
  if mission.proof_type is distinct from p_proof_type then raise exception 'PROOF_TYPE_MISMATCH' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.fan_passports where app_user_id = p_user and celebrity_id = p_celebrity and business_status = 'issued') then
    raise exception 'PASSPORT_REQUIRED' using errcode = 'P0001'; end if;
  if exists (select 1 from public.certification_submissions where app_user_id = p_user and mission_id = mission.id
             and proof_type is not null and status in ('pending','in_review','changes_requested')) then
    raise exception 'PROOF_ALREADY_OPEN' using errcode = 'P0001'; end if;
  -- two proofs per creator and KST month (open or approved; rejected ones do not count)
  month_start := (date_trunc('month', public.dukjil_kst_date()::timestamp)) at time zone 'Asia/Seoul';
  select count(*) into used from public.certification_submissions
    where app_user_id = p_user and celebrity_id = p_celebrity and proof_type is not null
      and status in ('pending','in_review','changes_requested','approved') and submitted_at >= month_start;
  if used >= 2 then raise exception 'PROOF_MONTHLY_LIMIT' using errcode = 'P0001'; end if;
  -- consent publishes a post: the server sends the member's one-liner or the language default; the review only reads it back
  if coalesce(p_publish_consent, false) and v_body is null then raise exception 'PROOF_POST_BODY_REQUIRED' using errcode = 'P0001'; end if;
  select * into strict reward from public.certification_reward_revisions where mission_id = mission.id order by revision desc limit 1;
  select coalesce(max(attempt_number), 0) + 1 into attempt from public.certification_submissions where app_user_id = p_user and mission_id = mission.id;
  insert into public.certification_submissions(app_user_id, celebrity_id, mission_id, mission_revision, reward_revision_id, reward_revision,
      reward_policy_version, reward_score_points, reward_ticket_amount, attempt_number, idempotency_key, request_hash,
      proof_type, publish_consent, amount_visible, image_phash, post_body)
    values (p_user, p_celebrity, mission.id, mission.revision, reward.id, reward.revision, reward.policy_version, 0, 0, attempt,
      p_idempotency_key, p_request_hash, p_proof_type, coalesce(p_publish_consent, false), p_amount_visible, p_image_phash,
      case when coalesce(p_publish_consent, false) then v_body end)
    returning * into new_row;
  update public.certification_uploads set consumed_submission_id = new_row.id where id = up.id;
  return jsonb_build_object('id', new_row.id, 'status', new_row.status, 'revision', new_row.review_revision, 'replayed', false);
end $$;

create function public.resubmit_certification_proof(
  p_user uuid, p_submission_id uuid, p_expected_revision bigint, p_upload_id uuid, p_image_phash text[], p_pii_detected boolean default false, p_post_body text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare sub public.certification_submissions%rowtype; up public.certification_uploads%rowtype;
  v_body text := nullif(btrim(coalesce(p_post_body, '')), '');
begin
  if v_body is not null and length(v_body) > 500 then raise exception 'PROOF_INVALID' using errcode = 'P0001'; end if;
  if p_user is null or p_submission_id is null or p_upload_id is null or p_expected_revision is null
     or p_image_phash is null or cardinality(p_image_phash) not between 1 and 3 or array_position(p_image_phash, null) is not null then
    raise exception 'PROOF_INVALID' using errcode = 'P0001'; end if;
  perform public.group_wallet_lock(p_user);
  select * into sub from public.certification_submissions where id = p_submission_id and app_user_id = p_user and proof_type is not null for update;
  if not found then raise exception 'PROOF_NOT_FOUND' using errcode = 'P0001'; end if;
  if sub.status <> 'changes_requested' or sub.review_revision <> p_expected_revision then
    raise exception 'REVISION_CONFLICT' using errcode = 'P0001'; end if;
  if coalesce(p_pii_detected, false) then raise exception 'PROOF_PII_DETECTED' using errcode = 'P0001'; end if;
  select * into up from public.certification_uploads
    where id = p_upload_id and app_user_id = p_user and mission_id = sub.mission_id and celebrity_id = sub.celebrity_id for update;
  if not found or up.consumed_submission_id is not null or up.purged_at is not null then
    raise exception 'UPLOAD_INVALID' using errcode = 'P0001'; end if;
  if up.expires_at <= now() then raise exception 'UPLOAD_EXPIRED' using errcode = 'P0001'; end if;
  update public.certification_submissions set status = 'pending', rejection_reason = null, reviewed_by_app_user_id = null,
      reviewed_by_admin_allowlist_id = null, reviewed_at = null, image_phash = p_image_phash,
      post_body = case when publish_consent then coalesce(v_body, post_body) end,
      review_revision = review_revision + 1, updated_at = now()
    where id = sub.id returning * into sub;
  update public.certification_uploads set consumed_submission_id = sub.id where id = up.id;
  return jsonb_build_object('id', sub.id, 'status', sub.status, 'revision', sub.review_revision, 'replayed', false);
end $$;

create function public.review_certification_proof(
  p_actor uuid, p_submission_id uuid, p_expected_revision bigint, p_decision text, p_reason text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_allow uuid; sub public.certification_submissions%rowtype; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_status public.certification_submission_status; rec jsonb; v_stamp uuid; v_page integer; v_slot smallint; v_post uuid;
  v_title boolean := false; v_first boolean; v_rows integer;
begin
  if p_actor is null or p_submission_id is null or p_expected_revision is null then
    raise exception 'PROOF_INVALID' using errcode = 'P0001'; end if;
  select a.id into v_allow from public.admin_allowlist a
    join public.app_users u on u.id = p_actor and u.status = 'active' and u.verified_email = a.email
    where a.active and a.role <> 'viewer' limit 1;
  if v_allow is null then raise exception 'ADMIN_REQUIRED' using errcode = 'P0001'; end if;
  if p_decision is null or p_decision not in ('in_review','approved','changes_requested','rejected') then
    raise exception 'DECISION_INVALID' using errcode = 'P0001'; end if;
  if p_decision in ('changes_requested','rejected') and (v_reason is null or length(v_reason) not between 3 and 1000) then
    raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
  if p_decision in ('in_review','approved') then v_reason := null; end if;
  select app_user_id into sub.app_user_id from public.certification_submissions where id = p_submission_id and proof_type is not null;
  if sub.app_user_id is null then raise exception 'PROOF_NOT_FOUND' using errcode = 'P0001'; end if;
  -- review 5 (PR-P3-DB-5): rejection and changes-requested must work for a sanctioned or inactive applicant, so every decision takes the
  -- target lock (same lock set and release gate, no active-account check of the applicant). Only approval, which pays out, needs an active account.
  perform public.group_wallet_lock_target(sub.app_user_id);
  select * into strict sub from public.certification_submissions where id = p_submission_id for update;
  -- same decision sent again with the revision it was made from: replay, no second payout
  if sub.status::text = p_decision and sub.review_revision = p_expected_revision + 1 then
    return jsonb_build_object('id', sub.id, 'status', sub.status, 'revision', sub.review_revision, 'replayed', true,
      'postId', sub.public_post_id); end if;
  if sub.review_revision <> p_expected_revision then raise exception 'REVISION_CONFLICT' using errcode = 'P0001'; end if;
  if not ((sub.status = 'pending' and p_decision in ('in_review','approved','changes_requested','rejected'))
       or (sub.status = 'in_review' and p_decision in ('approved','changes_requested','rejected'))) then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001'; end if;
  if p_decision = 'approved' and not exists (select 1 from public.app_users where id = sub.app_user_id and status = 'active') then
    raise exception 'PROOF_STAMP_UNAVAILABLE' using errcode = 'P0001'; end if;
  perform pg_catalog.set_config('byus.proof_review', 'on', true);
  v_status := p_decision::public.certification_submission_status;
  if p_decision = 'in_review' then
    update public.certification_submissions set status = v_status, review_revision = review_revision + 1, updated_at = now()
      where id = sub.id returning * into sub;
  else
    update public.certification_submissions set status = v_status, rejection_reason = v_reason, review_source = 'admin_web',
        reviewed_by_app_user_id = p_actor, reviewed_by_admin_allowlist_id = v_allow, reviewed_at = now(),
        review_revision = review_revision + 1, updated_at = now()
      where id = sub.id returning * into sub;
  end if;
  perform pg_catalog.set_config('byus.proof_review', 'off', true);
  if p_decision = 'approved' then
    -- same test record_dukjil_action uses for firstPoints: no earlier paid proof action for this member and creator
    v_first := not exists (select 1 from public.dukjil_action_log
      where app_user_id = sub.app_user_id and celebrity_id is not distinct from sub.celebrity_id and action_key = 'proof' and points > 0);
    -- stamp + slot 9 + points (500P first approval, 100P repeats, creator-month point cap) in the same transaction
    rec := public.record_dukjil_action(sub.app_user_id, sub.celebrity_id, 'proof', sub.id::text,
      pg_catalog.md5('p3-proof-review:' || sub.id::text)::uuid, '{}'::jsonb);
    v_stamp := nullif(rec ->> 'stampId', '')::uuid;
    -- stamp, slot, points and post succeed together or not at all (contract 9 P3): a stamp cap rolls the whole approval back
    if v_stamp is null then raise exception 'PROOF_STAMP_UNAVAILABLE' using errcode = 'P0001'; end if;
    begin
      select s.page_no, s.slot_no into v_page, v_slot from public.passport_page_slots s
        join public.fan_passports fp on fp.id = s.passport_id and fp.app_user_id = sub.app_user_id and fp.celebrity_id = sub.celebrity_id
        where s.stamp_id = v_stamp limit 1;
    end;
    -- first approval confirms the title (contract 3.6); a revoked title is never re-issued here
    insert into public.jjinfan_titles(app_user_id, celebrity_id, proof_submission_id) values (sub.app_user_id, sub.celebrity_id, sub.id)
      on conflict (app_user_id, celebrity_id) do nothing;
    get diagnostics v_rows = row_count;
    v_title := v_rows > 0;
    update public.jjinfan_titles set proof_submission_id = sub.id
      where app_user_id = sub.app_user_id and celebrity_id = sub.celebrity_id and proof_submission_id is null and revoked_at is null;
    if sub.publish_consent then
      insert into public.fan_posts(celebrity_id, app_user_id, body, visibility, idempotency_key, create_request_hash,
          first_comment_eligible, category, source_type, source_id)
        values (sub.celebrity_id, sub.app_user_id, sub.post_body, 'public', extensions.gen_random_uuid(),
          pg_catalog.md5('p3-proof-post:' || sub.id::text) || pg_catalog.md5('p3-proof-post:' || sub.id::text || ':2'),
          false, 'proof', 'certification_submission', sub.id)
        returning id into v_post;
      update public.certification_submissions set public_post_id = v_post where id = sub.id;
    end if;
  end if;
  insert into public.audit_logs(actor_app_user_id, actor_admin_allowlist_id, action, entity_type, entity_id, before_after_summary)
    values (p_actor, v_allow, 'certification.proof.' || sub.status, 'certification_submission', sub.id::text,
      jsonb_build_object('revision', sub.review_revision, 'reason', v_reason, 'proofType', sub.proof_type, 'postId', v_post,
        'points', rec -> 'points', 'stampId', v_stamp));
  return jsonb_build_object('id', sub.id, 'status', sub.status, 'revision', sub.review_revision, 'replayed', false,
    'points', coalesce((rec ->> 'points')::integer, 0), 'capped', coalesce((rec ->> 'capped')::boolean, false),
    'stampId', v_stamp, 'pageNo', v_page, 'slotNo', v_slot, 'firstApproval', coalesce(v_first and coalesce((rec ->> 'points')::integer, 0) > 0, false), 'titleIssued', v_title, 'postId', v_post);
end $$;

revoke all on function public.submit_certification_proof(uuid, uuid, text, uuid, boolean, boolean, text[], uuid, text, boolean, text),
  public.resubmit_certification_proof(uuid, uuid, bigint, uuid, text[], boolean, text),
  public.review_certification_proof(uuid, uuid, bigint, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_certification_proof(uuid, uuid, text, uuid, boolean, boolean, text[], uuid, text, boolean, text),
  public.resubmit_certification_proof(uuid, uuid, bigint, uuid, text[], boolean, text),
  public.review_certification_proof(uuid, uuid, bigint, text, text)
  to service_role;
