-- Preserve existing single-photo callers; each multi-photo command is one transaction.
create function public.submit_certification_proof_multi(p_user uuid, p_celebrity uuid, p_proof_type text, p_upload_ids uuid[], p_publish_consent boolean, p_amount_visible boolean, p_image_phash text[], p_idempotency_key uuid, p_request_hash text, p_pii_detected boolean default false, p_post_body text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb; sub public.certification_submissions%rowtype; up public.certification_uploads%rowtype; upload uuid;
begin
  if cardinality(p_upload_ids) not between 1 and 3 or p_upload_ids is null
    or array_position(p_upload_ids,null) is not null
    or cardinality(p_upload_ids) <> cardinality(p_image_phash)
    or (select count(distinct id) from unnest(p_upload_ids) id) <> cardinality(p_upload_ids) then
    raise exception 'PROOF_INVALID';
  end if;
  result := public.submit_certification_proof(p_user,p_celebrity,p_proof_type,p_upload_ids[1],p_publish_consent,p_amount_visible,p_image_phash,p_idempotency_key,p_request_hash,p_pii_detected,p_post_body);
  if coalesce((result->>'replayed')::boolean,false) then return result; end if;
  select * into strict sub from public.certification_submissions where id=(result->>'id')::uuid;
  foreach upload in array p_upload_ids[2:cardinality(p_upload_ids)] loop
    select * into up from public.certification_uploads where id=upload for update;
    if not found or up.app_user_id <> p_user or up.mission_id <> sub.mission_id
      or up.celebrity_id <> sub.celebrity_id or up.consumed_submission_id is not null or up.purged_at is not null then
      raise exception 'UPLOAD_INVALID';
    end if;
    if up.expires_at <= now() then raise exception 'UPLOAD_EXPIRED'; end if;
    update public.certification_uploads set consumed_submission_id=sub.id where id=upload;
  end loop;
  return result;
end $$;
revoke all on function public.submit_certification_proof_multi(uuid,uuid,text,uuid[],boolean,boolean,text[],uuid,text,boolean,text) from public,anon,authenticated;
grant execute on function public.submit_certification_proof_multi(uuid,uuid,text,uuid[],boolean,boolean,text[],uuid,text,boolean,text) to service_role;
create function public.resubmit_certification_proof_multi(p_user uuid, p_submission_id uuid, p_expected_revision bigint, p_upload_ids uuid[], p_image_phash text[], p_pii_detected boolean default false, p_post_body text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb; sub public.certification_submissions%rowtype; up public.certification_uploads%rowtype; upload uuid;
begin
  if cardinality(p_upload_ids) not between 1 and 3 or p_upload_ids is null
    or array_position(p_upload_ids,null) is not null
    or cardinality(p_upload_ids) <> cardinality(p_image_phash)
    or (select count(distinct id) from unnest(p_upload_ids) id) <> cardinality(p_upload_ids) then
    raise exception 'PROOF_INVALID';
  end if;
  result := public.resubmit_certification_proof(p_user,p_submission_id,p_expected_revision,p_upload_ids[1],p_image_phash,p_pii_detected,p_post_body);
  if coalesce((result->>'replayed')::boolean,false) then return result; end if;
  select * into strict sub from public.certification_submissions where id=(result->>'id')::uuid;
  foreach upload in array p_upload_ids[2:cardinality(p_upload_ids)] loop
    select * into up from public.certification_uploads where id=upload for update;
    if not found or up.app_user_id <> p_user or up.mission_id <> sub.mission_id
      or up.celebrity_id <> sub.celebrity_id or up.consumed_submission_id is not null or up.purged_at is not null then
      raise exception 'UPLOAD_INVALID';
    end if;
    if up.expires_at <= now() then raise exception 'UPLOAD_EXPIRED'; end if;
    update public.certification_uploads set consumed_submission_id=sub.id where id=upload;
  end loop;
  return result;
end $$;
revoke all on function public.resubmit_certification_proof_multi(uuid,uuid,bigint,uuid[],text[],boolean,text) from public,anon,authenticated;
grant execute on function public.resubmit_certification_proof_multi(uuid,uuid,bigint,uuid[],text[],boolean,text) to service_role;
