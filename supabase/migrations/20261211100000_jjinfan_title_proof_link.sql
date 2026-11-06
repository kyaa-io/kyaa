-- A member whose page 1 was claimed before the first proof approval already holds a jjinfan title without a proof link.
-- review_certification_proof links that title to the approved proof (proof_submission_id null -> value), but the title guard
-- rejected every change of proof_submission_id, so the whole approval rolled back (served as 503 PROOF_ADMIN_UNAVAILABLE).
-- Allow exactly that one link: from null to a value, once. Every other column stays immutable and a set link cannot change.
create or replace function public.guard_jjinfan_title_update() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'PASSPORT_TABLE_IMMUTABLE: jjinfan_titles' using errcode = 'P0001';
  end if;
  if new.app_user_id <> old.app_user_id or new.celebrity_id <> old.celebrity_id or new.achieved_at <> old.achieved_at
     or new.claim_page_no <> old.claim_page_no
     or (old.proof_submission_id is not null and new.proof_submission_id is distinct from old.proof_submission_id)
     or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at) then
    raise exception 'PASSPORT_TABLE_IMMUTABLE: jjinfan_titles only revoked_at may be set once and proof_submission_id linked once' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.guard_jjinfan_title_update() from public, anon, authenticated, service_role;
