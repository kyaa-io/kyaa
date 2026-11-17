-- A resubmit that was stored but whose answer was lost: the same member, request key and body get the first result back.
-- The record keeps only the key, the body hash, the submission id and the revision the resubmit produced. No photo, upload path or token.
create table public.certification_proof_resubmit_requests (
  app_user_id uuid not null references public.app_users(id) on delete restrict,
  request_key uuid not null,
  submission_id uuid not null references public.certification_submissions(id) on delete cascade,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  result_revision bigint not null check (result_revision > 0),
  created_at timestamptz not null default now(),
  primary key (app_user_id, request_key)
);
alter table public.certification_proof_resubmit_requests enable row level security;
alter table public.certification_proof_resubmit_requests force row level security;
revoke all on table public.certification_proof_resubmit_requests from public, anon, authenticated, service_role;

-- Wraps resubmit_certification_proof_multi, which keeps the optimistic revision check, ownership, the personal-data flag and the
-- single consumption of every upload. A replay is answered before any of those checks, because the first call already changed them.
create function public.resubmit_certification_proof_keyed(
  p_user uuid, p_submission_id uuid, p_request_key uuid, p_expected_revision bigint, p_upload_ids uuid[], p_image_phash text[],
  p_request_hash text, p_pii_detected boolean default false, p_post_body text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare existing public.certification_proof_resubmit_requests%rowtype; result jsonb;
begin
  if p_user is null or p_submission_id is null or p_request_key is null or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'PROOF_INVALID' using errcode = 'P0001'; end if;
  perform public.group_wallet_lock(p_user);
  select * into existing from public.certification_proof_resubmit_requests where app_user_id = p_user and request_key = p_request_key;
  if found then
    if existing.request_hash <> p_request_hash or existing.submission_id <> p_submission_id then
      raise exception 'IDEMPOTENCY_MISMATCH' using errcode = 'P0001'; end if;
    return jsonb_build_object('id', existing.submission_id, 'status', 'pending', 'revision', existing.result_revision, 'replayed', true);
  end if;
  result := public.resubmit_certification_proof_multi(p_user, p_submission_id, p_expected_revision, p_upload_ids, p_image_phash, p_pii_detected, p_post_body);
  insert into public.certification_proof_resubmit_requests(app_user_id, request_key, submission_id, request_hash, result_revision)
    values (p_user, p_request_key, p_submission_id, p_request_hash, (result ->> 'revision')::bigint);
  return result;
end $$;
revoke all on function public.resubmit_certification_proof_keyed(uuid, uuid, uuid, bigint, uuid[], text[], text, boolean, text) from public, anon, authenticated;
grant execute on function public.resubmit_certification_proof_keyed(uuid, uuid, uuid, bigint, uuid[], text[], text, boolean, text) to service_role;
notify pgrst, 'reload schema';
