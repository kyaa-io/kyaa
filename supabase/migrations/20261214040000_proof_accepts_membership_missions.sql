-- 261107-2: the certification list shows a creator's Instagram·TikTok·YouTube membership missions, but the proof form left them out
-- (list_proof_missions filtered membership_platform is null) and submit refused them (PROOF_MISSION_LEGACY). The proof form now lists
-- every active proof mission the certification list shows, and submit accepts them.
-- A proof row on a membership mission carries membership_platform (snapshot trigger), so the membership payout triggers would pay it a
-- second time on approval, beside review_certification_proof's own payout. Both triggers now skip proof rows (proof_type is not null);
-- rows from the legacy membership flow (proof_type null) are paid exactly as before.
-- A proof row stores 0 score points (its payout is the dukjil proof action), so the membership reward check applies to legacy rows only.

alter table public.certification_submissions drop constraint certification_membership_reward_check;
alter table public.certification_submissions add constraint certification_membership_reward_check
  check (membership_platform is null or proof_type is not null or (reward_score_points > 0 and reward_ticket_amount = 0));

create or replace function public.list_proof_missions(p_user uuid, p_celebrity uuid, p_month_start timestamptz)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'missions', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'proofType', m.proof_type, 'platform', m.proof_platform, 'closesAt', m.closes_at)
        order by m.closes_at, m.id)
      from (select * from public.certification_missions
             where celebrity_id = p_celebrity and status = 'active' and proof_type is not null
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

-- Patch the live definitions (same method as 20261129003000): each needle must be found exactly once or the migration stops.
do $$
declare
  definition text;
  patches constant text[][] := array[
    array['public.submit_certification_proof(uuid,uuid,text,uuid,boolean,boolean,text[],uuid,text,boolean,text)',
          'if mission.membership_platform is not null then raise exception ''PROOF_MISSION_LEGACY'' using errcode = ''P0001''; end if;',
          ''],
    array['public.reward_fan_ticket_activity_event()',
          'if new.status<>''approved'' or new.membership_platform is null then return new; end if;',
          'if new.status<>''approved'' or new.membership_platform is null or new.proof_type is not null then return new; end if;'],
    array['public.dukjil_wire_event()',
          'if new.status = ''approved'' and new.membership_platform is not null and (tg_op',
          'if new.status = ''approved'' and new.membership_platform is not null and new.proof_type is null and (tg_op']
  ];
  i integer;
begin
  for i in 1 .. array_length(patches, 1) loop
    select pg_catalog.pg_get_functiondef(patches[i][1]::regprocedure) into definition;
    if (length(definition) - length(replace(definition, patches[i][2], ''))) / length(patches[i][2]) <> 1 then
      raise exception 'PROOF_MEMBERSHIP_PATCH_CONTRACT_CHANGED %', patches[i][1];
    end if;
    execute replace(definition, patches[i][2], patches[i][3]);
  end loop;
end $$;

notify pgrst, 'reload schema';
