-- PASSPORT-RENEWAL P3 (PR-P3-DB-5): proof isolation. Applies after 240000 (proof_board), which adds fan_posts.category.
-- 1) New proof rows (certification_submissions.proof_type not null) are handled only by review_certification_proof:
--    no Telegram approval card, not in the old queue, and the old review RPCs end with PROOF_USE_PROOF_REVIEW.
--    Legacy rows (proof_type null) behave exactly as before.
-- 2) A proof post (fan_posts.category = 'proof') is invisible to every general read, cannot be edited, and is never an activity reward source.
-- 3) A proof whose stamp was voided disappears from the public proof board and its image path (provisional, reversible: redefine the function without the line).

-- ---- 1. legacy review path guard -------------------------------------------------------------------------------------
-- review_certification_proof sets byus.proof_review = 'on' (transaction local) around its status update; every other status change
-- of a proof row (old review RPC, Telegram approval, direct update) is refused. Resubmit (changes_requested -> pending) is not a review.
create function public.proof_block_legacy_review() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.proof_type is not null and new.status is distinct from old.status
     and new.status::text in ('approved', 'rejected', 'in_review', 'changes_requested')
     and coalesce(pg_catalog.current_setting('byus.proof_review', true), '') <> 'on' then
    raise exception 'PROOF_USE_PROOF_REVIEW' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.proof_block_legacy_review() from public, anon, authenticated, service_role;
create trigger aa_proof_legacy_guard before update on public.certification_submissions
  for each row execute function public.proof_block_legacy_review();

-- Telegram approval card: proof rows never get a delivery. Body otherwise identical to the live definition.
create or replace function public.capture_telegram_certification_submission() returns trigger
language plpgsql security definer set search_path = '' as $$
declare cfg public.telegram_certification_review_settings;
begin
  if new.status <> 'pending' or new.proof_type is not null then return new; end if;
  select * into cfg from public.telegram_certification_review_settings where singleton;
  if not coalesce(cfg.enabled, false) then return new; end if;
  insert into public.telegram_certification_deliveries(submission_id, activation_id, chat_id, expected_review_revision)
    values(new.id, cfg.activation_id, cfg.chat_id, new.review_revision) on conflict(submission_id) do nothing;
  return new;
exception when others then
  raise log 'TELEGRAM_CERTIFICATION_CAPTURE_FAILED sqlstate=%', sqlstate;
  return new;
end $$;

-- Old queue: wrap the live function and drop items whose submission is a proof row (proofs have get_admin_proof_queue).
alter function public.get_admin_certification_queue(uuid, uuid, public.certification_submission_status)
  rename to get_admin_certification_queue_before_proof;
create function public.get_admin_certification_queue(p_actor uuid, p_allowlist uuid,
  p_status public.certification_submission_status default 'pending')
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(pg_catalog.jsonb_agg(r.item order by r.ord), '[]'::jsonb)
    from pg_catalog.jsonb_array_elements(public.get_admin_certification_queue_before_proof(p_actor, p_allowlist, p_status))
         with ordinality r(item, ord)
   where not exists (select 1 from public.certification_submissions s
                      where s.id = (r.item ->> 'id')::uuid and s.proof_type is not null)
$$;
revoke all on function public.get_admin_certification_queue_before_proof(uuid, uuid, public.certification_submission_status),
  public.get_admin_certification_queue(uuid, uuid, public.certification_submission_status) from public, anon, authenticated, service_role;
grant execute on function public.get_admin_certification_queue(uuid, uuid, public.certification_submission_status) to service_role;

-- ---- 2. proof posts out of general reads -----------------------------------------------------------------------------
-- Central choke point: fan_web_content_target feeds read_fan_posts, program posts, period ranking, home feed(s), the unified feeds,
-- favorite album, fan_web_post_json, likes, comments, media authorization and notifications. A proof post is "not found" there.
-- Exception for report / block (PR-P3-DB-6): a proof post that is on the public board must stay reportable and its author blockable.
-- proof_post_on_board mirrors read_proof_board (public, not deleted/hidden, approved + consent, stamp not voided). The gate opens for it only
-- while post_content_report / block_content_author run (transaction-local byus.proof_report, reset right after the call).
create function public.proof_post_on_board(p_post_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.fan_posts p
      join public.certification_submissions s on s.id = p.source_id and p.source_type = 'certification_submission'
     where p.id = p_post_id and p.category = 'proof' and p.visibility = 'public' and p.deleted_at is null and p.hidden_at is null
       and s.status = 'approved' and s.publish_consent = true and s.proof_type is not null
       and not exists (select 1 from public.dukjil_action_log l join public.community_stamps cs on cs.id = l.stamp_id
                        where l.app_user_id = s.app_user_id and l.action_key = 'proof' and l.source_key = s.id::text
                          and cs.revoked_at is not null))
$$;
revoke all on function public.proof_post_on_board(uuid) from public, anon, authenticated, service_role;

alter function public.fan_web_content_target(uuid, text, uuid, public.content_locale) rename to fan_web_content_target_before_proof;
create function public.fan_web_content_target(p_app_user_id uuid, p_target_type text, p_target_id uuid,
  p_locale public.content_locale default 'ko') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_target_type = 'fan_post' and exists (select 1 from public.fan_posts p where p.id = p_target_id and p.category = 'proof')
     and not (coalesce(pg_catalog.current_setting('byus.proof_report', true), '') = 'on' and public.proof_post_on_board(p_target_id)) then
    return null;
  end if;
  return public.fan_web_content_target_before_proof(p_app_user_id, p_target_type, p_target_id, p_locale);
end $$;
revoke all on function public.fan_web_content_target_before_proof(uuid, text, uuid, public.content_locale),
  public.fan_web_content_target(uuid, text, uuid, public.content_locale) from public, anon, authenticated, service_role;
grant execute on function public.fan_web_content_target(uuid, text, uuid, public.content_locale) to service_role;

alter function public.post_content_report(uuid, text, uuid, text, uuid) rename to post_content_report_before_proof;
create function public.post_content_report(p_app_user_id uuid, p_target_type text, p_target_id uuid, p_reason text, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  perform pg_catalog.set_config('byus.proof_report', 'on', true);
  r := public.post_content_report_before_proof(p_app_user_id, p_target_type, p_target_id, p_reason, p_idempotency_key);
  perform pg_catalog.set_config('byus.proof_report', 'off', true);
  return r;
end $$;
alter function public.block_content_author(uuid, text, uuid) rename to block_content_author_before_proof;
create function public.block_content_author(p_app_user_id uuid, p_target_type text, p_target_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  perform pg_catalog.set_config('byus.proof_report', 'on', true);
  r := public.block_content_author_before_proof(p_app_user_id, p_target_type, p_target_id);
  perform pg_catalog.set_config('byus.proof_report', 'off', true);
  return r;
end $$;
revoke all on function public.post_content_report_before_proof(uuid, text, uuid, text, uuid), public.block_content_author_before_proof(uuid, text, uuid),
  public.post_content_report(uuid, text, uuid, text, uuid), public.block_content_author(uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.post_content_report(uuid, text, uuid, text, uuid), public.block_content_author(uuid, text, uuid) to service_role;

-- Readers that do not go through the choke point read public.fan_posts directly. Each gets one extra condition; the replace is
-- asserted so a changed definition fails the migration instead of silently leaving a leak. create or replace keeps the grants.
create function pg_temp.p3_patch(p_sig regprocedure, p_from text, p_to text) returns void
language plpgsql as $$
declare d text; n text;
begin
  d := pg_catalog.pg_get_functiondef(p_sig);
  n := pg_catalog.replace(d, p_from, p_to);
  if n = d then raise exception 'P3_ISOLATION_PATCH_NOT_APPLIED %', p_sig::text; end if;
  execute n;
end $$;

select pg_temp.p3_patch('public.read_public_popular_posts_page(uuid, public.content_locale, integer, boolean)'::regprocedure,
  'where p.visibility=''public'' and p.deleted_at is null and p.hidden_at is null',
  'where p.visibility=''public'' and p.deleted_at is null and p.hidden_at is null and p.category is distinct from ''proof''');
select pg_temp.p3_patch('public.read_public_mobile_profile_activities(uuid, uuid, text, public.content_locale, timestamptz, uuid, text, integer)'::regprocedure,
  'post.visibility=''public''and post.deleted_at is null and post.hidden_at is null',
  'post.visibility=''public''and post.deleted_at is null and post.hidden_at is null and post.category is distinct from ''proof''');
select pg_temp.p3_patch('public.read_social_fan_profile_before_social_states(uuid, uuid, text, public.content_locale, timestamptz, uuid, text, integer)'::regprocedure,
  'post.visibility=''public''and post.deleted_at is null and post.hidden_at is null',
  'post.visibility=''public''and post.deleted_at is null and post.hidden_at is null and post.category is distinct from ''proof''');
select pg_temp.p3_patch('public.read_owned_mobile_profile_activities(uuid, public.content_locale, text, timestamptz, uuid, text, integer)'::regprocedure,
  'post.app_user_id=p_app_user_id and post.deleted_at is null and post.hidden_at is null',
  'post.app_user_id=p_app_user_id and post.deleted_at is null and post.hidden_at is null and post.category is distinct from ''proof''');
select pg_temp.p3_patch('public.community_stamp_invitation_post_preview(uuid)'::regprocedure,
  'post.id=p_post_id and post.visibility=''public''',
  'post.id=p_post_id and post.visibility=''public'' and post.category is distinct from ''proof''');

-- A proof post body is fixed at approval: save_fan_post (and any other update) cannot change its text or visibility.
-- Author deletion (deleted_at) and moderation (hidden_at) are unaffected.
-- The one exception is account deletion: scrub_account_deletion (wrapped below) sets the transaction-local byus.proof_scrub flag and may
-- blank the body (to '') without changing visibility. Every other body / visibility change still raises.
create function public.proof_post_read_only() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.category = 'proof' and (new.body is distinct from old.body or new.visibility is distinct from old.visibility) then
    if coalesce(pg_catalog.current_setting('byus.proof_scrub', true), '') = 'on' and new.body = '' and new.visibility is not distinct from old.visibility then
      return new;
    end if;
    raise exception 'PROOF_POST_READ_ONLY' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.proof_post_read_only() from public, anon, authenticated, service_role;
create trigger aa_proof_post_read_only before update on public.fan_posts
  for each row execute function public.proof_post_read_only();

-- A proof post is never an activity reward source (contract 3.6, review L3). Moved here from 220000 because it reads fan_posts.category,
-- which exists only from 240000 on; created at the end of the chain there is no window where the trigger reads a missing column.
create function public.p3_proof_post_not_rewarded() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.source_type = 'fan_posts' and exists (select 1 from public.fan_posts p where p.id = new.source_id and p.category = 'proof') then
    new.eligible := false;
  end if;
  return new;
end $$;
revoke all on function public.p3_proof_post_not_rewarded() from public, anon, authenticated, service_role;
create trigger p3_proof_post_not_rewarded before insert on public.mobile_fan_activity_sources
  for each row execute function public.p3_proof_post_not_rewarded();

-- ---- 3. voided proof stamp leaves the public board (provisional, reversible) ----------------------------------------------
-- The board query (and so the image path the API signs) skips a submission whose proof stamp is revoked.
-- Reverse: redefine read_proof_board without this condition, or restore the stamp.
select pg_temp.p3_patch('public.read_proof_board(uuid, integer, timestamptz)'::regprocedure,
  's.status = ''approved'' and s.publish_consent = true and s.proof_type is not null',
  's.status = ''approved'' and s.publish_consent = true and s.proof_type is not null
       and not exists (select 1 from public.dukjil_action_log l join public.community_stamps cs on cs.id = l.stamp_id
                        where l.app_user_id = s.app_user_id and l.action_key = ''proof'' and l.source_key = s.id::text
                          and cs.revoked_at is not null)');

-- ---- 4. rejection / changes-requested work for sanctioned or inactive applicants (review L5, proof side) ------------------
-- fan_web_owner_write (guard on certification_submissions) demands an active owner for ANY update of the row, so an admin could not
-- reject or ask for changes on a disabled applicant's proof. review_certification_proof sets byus.proof_review around its status update;
-- the guard now lets exactly that transaction-local, non-approving proof status change through. Approval stays gated (and review_certification_proof
-- ends it with PROOF_STAMP_UNAVAILABLE before any reward); the general wallet-write active check (group_wallet_lock) is untouched.
select pg_temp.p3_patch('public.fan_web_guard_owner_write()'::regprocedure,
  '  if owner_id is null then return new; end if;',
  '  if owner_id is null then return new; end if;
  if tg_table_name = ''certification_submissions'' and tg_op = ''UPDATE'' and (to_jsonb(new)->>''proof_type'') is not null
     and (to_jsonb(new)->>''status'') in (''rejected'', ''changes_requested'', ''in_review'')
     and coalesce(pg_catalog.current_setting(''byus.proof_review'', true), '''') = ''on'' then return new; end if;');

-- ---- 5. account deletion with proof posts (opus finding 2) ----------------------------------------------------------------
-- scrub_account_deletion blanks every fan_posts body, which aa_proof_post_read_only rejects for proof posts, so deleting a member with an
-- approved proof failed. The wrapper opens the transaction-local byus.proof_scrub flag around the existing scrub (only body = '' with
-- unchanged visibility passes) and also clears the certification_submissions copy of the post text: post_body = null together with
-- publish_consent = false satisfies certification_submission_consent_body, so the constraint itself needs no change.
-- Uploaded image objects are registered by begin_owned_account_deletion (account_deletion_objects, bucket certification-proofs) and deleted
-- by the API worker; this migration does not delete storage objects.
alter function public.scrub_account_deletion(uuid) rename to scrub_account_deletion_before_proof;
create function public.scrub_account_deletion(p_app_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.set_config('byus.proof_scrub', 'on', true);
  perform public.scrub_account_deletion_before_proof(p_app_user_id);
  update public.certification_submissions set post_body = null, publish_consent = false
   where app_user_id = p_app_user_id and proof_type is not null and (post_body is not null or publish_consent);
  perform pg_catalog.set_config('byus.proof_scrub', 'off', true);
end $$;
revoke all on function public.scrub_account_deletion_before_proof(uuid), public.scrub_account_deletion(uuid) from public, anon, authenticated, service_role;
grant execute on function public.scrub_account_deletion(uuid) to service_role;

-- ---- 6. wave mission "introduction" does not count proof posts (opus finding 5) -----------------------------------------------
-- evaluate_owned_kyaa_wave_missions (20261129038000) and the admin stage presentation (20261129026000, patched by 20261129039000) share the condition.
select pg_temp.p3_patch('public.evaluate_owned_kyaa_wave_missions(uuid)'::regprocedure,
  'and p.program_notice_id is null and p.visibility=''public'' and length(btrim(p.body))>0',
  'and p.program_notice_id is null and p.visibility=''public'' and length(btrim(p.body))>0 and p.category is distinct from ''proof''');
select pg_temp.p3_patch('public.read_admin_wave_stage_presentation(uuid, uuid, text)'::regprocedure,
  'and p.program_notice_id is null and p.visibility=''public'' and length(btrim(p.body))>0',
  'and p.program_notice_id is null and p.visibility=''public'' and length(btrim(p.body))>0 and p.category is distinct from ''proof''');

-- ---- 7. function owner rights (opus finding 1) ---------------------------------------------------------------------------------
-- A security definer function runs as its owner. The renamed legacy copies (and the legacy callers of fan_web_content_target) can be owned by
-- the imported postgres role while the wrappers above are owned by the migration admin role; the revoke above leaves each copy executable only
-- by its own owner, so a wrapper owned by another role fails with 42501. A clean replay has one owner and cannot show this.
-- Every internal (non API) role that owns a public function gets EXECUTE on the isolation functions; API roles stay revoked.
-- Kept as a function so a test can re-run it after changing an owner.
create function public.p3_grant_isolation_owner_execute() returns void language plpgsql set search_path = '' as $$
declare r record; sig text;
begin
  for r in
    select distinct o.oid as role_oid, o.rolname from pg_catalog.pg_proc p
      join pg_catalog.pg_roles o on o.oid = p.proowner
     where p.pronamespace = 'public'::regnamespace and not o.rolsuper and o.rolname not in ('anon', 'authenticated', 'service_role', 'public')
  loop
    foreach sig in array array[
      'public.fan_web_content_target(uuid,text,uuid,public.content_locale)',
      'public.fan_web_content_target_before_proof(uuid,text,uuid,public.content_locale)',
      'public.get_admin_certification_queue(uuid,uuid,public.certification_submission_status)',
      'public.get_admin_certification_queue_before_proof(uuid,uuid,public.certification_submission_status)',
      'public.post_content_report(uuid,text,uuid,text,uuid)', 'public.post_content_report_before_proof(uuid,text,uuid,text,uuid)',
      'public.block_content_author(uuid,text,uuid)', 'public.block_content_author_before_proof(uuid,text,uuid)',
      'public.scrub_account_deletion(uuid)', 'public.scrub_account_deletion_before_proof(uuid)', 'public.proof_post_on_board(uuid)'] loop
      if not pg_catalog.has_function_privilege(r.role_oid, sig::regprocedure, 'execute') then
        execute pg_catalog.format('grant execute on function %s to %I', sig, r.rolname);
      end if;
    end loop;
  end loop;
end $$;
revoke all on function public.p3_grant_isolation_owner_execute() from public, anon, authenticated, service_role;
select public.p3_grant_isolation_owner_execute();

-- ---- grant check ---------------------------------------------------------------------------------------------------------
do $migration$
declare f text; bad text;
begin
  foreach f in array array['public.get_admin_certification_queue(uuid,uuid,public.certification_submission_status)',
    'public.fan_web_content_target(uuid,text,uuid,public.content_locale)', 'public.read_proof_board(uuid,integer,timestamptz)',
    'public.read_public_popular_posts_page(uuid,public.content_locale,integer,boolean)',
    'public.post_content_report(uuid,text,uuid,text,uuid)', 'public.block_content_author(uuid,text,uuid)', 'public.scrub_account_deletion(uuid)'] loop
    if not pg_catalog.has_function_privilege('service_role', f::regprocedure, 'execute')
       or pg_catalog.has_function_privilege('anon', f::regprocedure, 'execute')
       or pg_catalog.has_function_privilege('authenticated', f::regprocedure, 'execute') then
      raise exception 'P3_ISOLATION_GRANT_MISMATCH %', f;
    end if;
  end loop;
  foreach f in array array['public.proof_block_legacy_review()', 'public.proof_post_read_only()', 'public.p3_proof_post_not_rewarded()',
    'public.get_admin_certification_queue_before_proof(uuid,uuid,public.certification_submission_status)',
    'public.fan_web_content_target_before_proof(uuid,text,uuid,public.content_locale)', 'public.proof_post_on_board(uuid)',
    'public.post_content_report_before_proof(uuid,text,uuid,text,uuid)', 'public.block_content_author_before_proof(uuid,text,uuid)',
    'public.scrub_account_deletion_before_proof(uuid)', 'public.p3_grant_isolation_owner_execute()'] loop
    if pg_catalog.has_function_privilege('service_role', f::regprocedure, 'execute')
       or pg_catalog.has_function_privilege('anon', f::regprocedure, 'execute')
       or pg_catalog.has_function_privilege('authenticated', f::regprocedure, 'execute') then
      raise exception 'P3_ISOLATION_GRANT_EXPOSED %', f;
    end if;
  end loop;
end $migration$;
