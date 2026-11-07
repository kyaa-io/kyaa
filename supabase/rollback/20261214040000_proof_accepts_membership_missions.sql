-- Rollback for 20261214040000_proof_accepts_membership_missions.sql. Roll the web back first or with it.
-- The proof form stops listing and accepting membership missions, review drops the PROOF_ALREADY_APPROVED check, and the two membership
-- payout triggers pay every approved membership row again.
-- Proof rows already made on a membership mission (0 score points) stay as they are: the old reward check comes back NOT VALID, so it
-- binds new rows only. Before rolling back, settle open ones (reject pending proof rows on membership missions): an approval after the
-- rollback would also fire the membership payout triggers.
begin;
set local lock_timeout='5s';
alter table public.certification_submissions drop constraint certification_membership_reward_check;
alter table public.certification_submissions add constraint certification_membership_reward_check
  check (membership_platform is null or (reward_score_points > 0 and reward_ticket_amount = 0)) not valid;

create or replace function public.list_proof_missions(p_user uuid, p_celebrity uuid, p_month_start timestamptz)
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

do $$
declare
  definition text;
  patches constant text[][] := array[
    array['public.submit_certification_proof(uuid,uuid,text,uuid,boolean,boolean,text[],uuid,text,boolean,text)',
          'if mission.membership_platform is not null and exists (select 1 from public.certification_submissions where app_user_id = p_user and celebrity_id = p_celebrity and membership_platform = mission.membership_platform and status = ''approved'') then raise exception ''PROOF_ALREADY_APPROVED'' using errcode = ''P0001''; end if;',
          'if mission.membership_platform is not null then raise exception ''PROOF_MISSION_LEGACY'' using errcode = ''P0001''; end if;'],
    array['public.review_certification_proof(uuid,uuid,bigint,text,text)',
          'if p_decision = ''approved'' and sub.membership_platform is not null and exists (select 1 from public.certification_submissions where app_user_id = sub.app_user_id and celebrity_id = sub.celebrity_id and membership_platform = sub.membership_platform and status = ''approved'' and id <> sub.id) then
    raise exception ''PROOF_ALREADY_APPROVED'' using errcode = ''P0001''; end if;
  ',
          ''],
    array['public.reward_fan_ticket_activity_event()',
          'if new.status<>''approved'' or new.membership_platform is null or new.proof_type is not null then return new; end if;',
          'if new.status<>''approved'' or new.membership_platform is null then return new; end if;'],
    array['public.dukjil_wire_event()',
          'if new.status = ''approved'' and new.membership_platform is not null and new.proof_type is null and (tg_op',
          'if new.status = ''approved'' and new.membership_platform is not null and (tg_op']
  ];
  i integer;
begin
  for i in 1 .. array_length(patches, 1) loop
    select pg_catalog.pg_get_functiondef(patches[i][1]::regprocedure) into definition;
    if position(patches[i][2] in definition) = 0 then raise exception 'PROOF_MEMBERSHIP_ROLLBACK_SHAPE %', patches[i][1]; end if;
    execute replace(definition, patches[i][2], patches[i][3]);
  end loop;
end $$;
notify pgrst, 'reload schema';
commit;
