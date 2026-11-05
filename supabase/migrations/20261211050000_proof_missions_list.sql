-- Proof mission list for the member screen. The certification tables are closed to service_role (20260908030000 revokes all),
-- so the API reads them only through a definer function, like the other proof reads in 20261210240000.
-- Same filters the API used to apply directly: active, inside the window, proof_type set, not a legacy membership mission.
create function public.list_proof_missions(p_user uuid, p_celebrity uuid, p_month_start timestamptz)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'missions', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'proofType', m.proof_type, 'platform', m.proof_platform, 'closesAt', m.closes_at)
        order by m.closes_at, m.id)
      from (select * from public.certification_missions
             where celebrity_id = p_celebrity and status = 'active' and proof_type is not null and membership_platform is null
               and opens_at <= pg_catalog.now() and closes_at > pg_catalog.now()
             order by closes_at, id limit 50) m), '[]'::jsonb),
    'openMissionIds', coalesce((select jsonb_agg(s.mission_id order by s.mission_id)
      from public.certification_submissions s
     where s.app_user_id = p_user and s.celebrity_id = p_celebrity and s.proof_type is not null
       and s.status::text in ('pending', 'in_review', 'changes_requested')), '[]'::jsonb),
    'monthCount', (select count(*) from public.certification_submissions s
     where s.app_user_id = p_user and s.celebrity_id = p_celebrity and s.proof_type is not null
       and s.status::text in ('pending', 'in_review', 'changes_requested', 'approved') and s.submitted_at >= p_month_start))
$$;

revoke all on function public.list_proof_missions(uuid, uuid, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.list_proof_missions(uuid, uuid, timestamptz) to service_role;

notify pgrst, 'reload schema';
