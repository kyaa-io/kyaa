-- FB-N21-PROOF-TAB: counts for the fan page proof tab. No member id, name, image or text leaves this function.
-- approvedCount counts every approved certification of the page, including the legacy flow (proof_type null), which never
-- asked for publish consent and so can never appear on the photo board (read_proof_board needs publish_consent = true).
-- An SNS post (slot 07) is not a proof of purchase or membership and is left out of both counts.
-- proofTypes lists the proof kinds a member can submit right now (same window test as list_proof_missions).
create function public.read_proof_summary(p_celebrity uuid, p_month_start timestamptz)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'approvedCount', (select count(*) from public.certification_submissions s
       where s.celebrity_id = p_celebrity and s.status = 'approved' and s.proof_type is distinct from 'sns_post'),
    'monthFanCount', (select count(distinct s.app_user_id) from public.certification_submissions s
       where s.celebrity_id = p_celebrity and s.status = 'approved' and s.proof_type is distinct from 'sns_post'
         and s.reviewed_at >= p_month_start),
    'proofTypes', coalesce((select jsonb_agg(t.proof_type order by t.proof_type)
       from (select distinct m.proof_type from public.certification_missions m
              where m.celebrity_id = p_celebrity and m.status = 'active' and m.proof_type is not null
                and m.opens_at <= pg_catalog.now() and m.closes_at > pg_catalog.now()) t), '[]'::jsonb))
$$;

revoke all on function public.read_proof_summary(uuid, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.read_proof_summary(uuid, timestamptz) to service_role;
