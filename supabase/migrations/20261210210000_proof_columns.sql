-- PASSPORT-RENEWAL P3 (1/3): proof columns on the existing manual-certification tables (contract 2 P3-1, 3.6).
-- The legacy submit/review RPCs, the pending queue and the Telegram review are NOT changed: legacy rows keep proof_type null,
-- keep the two legacy unique indexes, and keep the three legacy states. Only the new RPCs (next migration) use the new states.

alter table public.certification_missions
  add column proof_type text,
  add column proof_platform text,
  add constraint certification_mission_proof_type check
    (proof_type is null or proof_type in ('membership','purchase','receipt','ticket','donation','funding','kyaa_payment')),
  add constraint certification_mission_proof_platform check
    (proof_platform is null or (proof_platform = btrim(proof_platform) and length(proof_platform) between 1 and 60));

-- existing membership missions (separate statement, contract 2 P3-1)
update public.certification_missions
   set proof_type = 'membership', proof_platform = membership_platform::text
 where membership_platform is not null and proof_type is null;

alter table public.certification_submissions
  add column proof_type text,
  add column publish_consent boolean not null default false,
  add column public_post_id uuid references public.fan_posts(id) on delete set null,
  add column image_phash text[],
  add column amount_visible boolean,
  add column post_body text,
  add constraint certification_submission_proof_type check
    (proof_type is null or proof_type in ('membership','purchase','receipt','ticket','donation','funding','kyaa_payment')),
  add constraint certification_submission_phash_shape check
    (image_phash is null or (cardinality(image_phash) between 1 and 3 and array_position(image_phash, null) is null)),
  -- the public post text is decided at submission (member's one-liner or the language default); consent needs it, legacy rows never carry it
  add constraint certification_submission_post_body_shape check
    (post_body is null or (btrim(post_body) = post_body and length(post_body) between 1 and 500)),
  add constraint certification_submission_consent_body check (publish_consent = false or post_body is not null),
  -- legacy rows can never carry the new fields
  add constraint certification_submission_legacy_shape check
    (proof_type is not null or (publish_consent = false and public_post_id is null and image_phash is null and amount_visible is null and post_body is null));

alter table public.certification_uploads add column purged_at timestamptz;

-- Review states: the shape check keeps the three legacy shapes exactly and adds in_review / changes_requested.
alter table public.certification_submissions
  drop constraint certification_submission_review_shape,
  add constraint certification_submission_review_shape check (
    (status = 'pending' and rejection_reason is null and reviewed_by_app_user_id is null
      and reviewed_by_admin_allowlist_id is null and reviewed_by_telegram_user_id is null
      and reviewed_by_telegram_name is null and reviewed_by_telegram_username is null
      and reviewed_at is null) or
    (status = 'in_review' and proof_type is not null and rejection_reason is null and reviewed_by_app_user_id is null
      and reviewed_by_admin_allowlist_id is null and reviewed_by_telegram_user_id is null
      and reviewed_by_telegram_name is null and reviewed_by_telegram_username is null
      and reviewed_at is null) or
    (status = 'approved' and rejection_reason is null and reviewed_at is not null and (
      (review_source = 'admin_web' and reviewed_by_app_user_id is not null
        and reviewed_by_admin_allowlist_id is not null and reviewed_by_telegram_user_id is null
        and reviewed_by_telegram_name is null and reviewed_by_telegram_username is null) or
      (review_source = 'telegram' and reviewed_by_app_user_id is null
        and reviewed_by_admin_allowlist_id is null and reviewed_by_telegram_user_id is not null
        and reviewed_by_telegram_name is not null)
    )) or
    (status = 'rejected' and rejection_reason is not null and reviewed_at is not null
      and review_source = 'admin_web' and reviewed_by_app_user_id is not null
      and reviewed_by_admin_allowlist_id is not null and reviewed_by_telegram_user_id is null
      and reviewed_by_telegram_name is null and reviewed_by_telegram_username is null) or
    (status = 'changes_requested' and proof_type is not null and rejection_reason is not null and reviewed_at is not null
      and review_source = 'admin_web' and reviewed_by_app_user_id is not null
      and reviewed_by_admin_allowlist_id is not null and reviewed_by_telegram_user_id is null
      and reviewed_by_telegram_name is null and reviewed_by_telegram_username is null)
  );

-- Legacy one-open/one-approved indexes keep their meaning for legacy rows only. A proof mission allows repeat approvals
-- (contract 3.6: first approval 500P, repeats 100P, two per creator and month), but only one open submission at a time.
drop index public.certification_one_open_or_approved_per_owner_mission;
drop index public.certification_one_approved_per_owner_mission;
create unique index certification_one_open_or_approved_per_owner_mission
  on public.certification_submissions(app_user_id, mission_id) where status in ('pending','approved') and proof_type is null;
create unique index certification_one_approved_per_owner_mission
  on public.certification_submissions(app_user_id, mission_id) where status = 'approved' and proof_type is null;
create unique index certification_proof_one_open_per_owner_mission
  on public.certification_submissions(app_user_id, mission_id)
  where proof_type is not null and status in ('pending','in_review','changes_requested');
create index certification_proof_month_idx
  on public.certification_submissions(app_user_id, celebrity_id, submitted_at) where proof_type is not null;
create index certification_proof_queue_idx
  on public.certification_submissions(status, submitted_at, id) where proof_type is not null and status in ('pending','in_review','changes_requested');
create index certification_proof_phash_idx on public.certification_submissions using gin (image_phash) where proof_type is not null;
create index certification_uploads_purge_idx on public.certification_uploads(created_at) where purged_at is null;
