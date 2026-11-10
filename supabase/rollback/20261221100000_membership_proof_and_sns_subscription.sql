-- Rollback for 20261221100000_membership_proof_and_sns_subscription.sql. Roll the web back with it.
-- Stops if any sns_post mission or submission exists: approved SNS posts already paid the subscription action and filled slot 07, and
-- the old constraints cannot hold those rows. Close or remove them (and settle their grants) first.
-- Legacy membership approvals go back to the 'subscription' action (slot 07); 'proof' rows written by the patched trigger stay.
begin;
set local lock_timeout = '5s';
do $$ begin
  if exists (select 1 from public.certification_missions where proof_type = 'sns_post')
     or exists (select 1 from public.certification_submissions where proof_type = 'sns_post') then
    raise exception 'SNS_POST_ROWS_EXIST'; end if;
end $$;

alter table public.certification_missions drop constraint certification_mission_sns_platform;
alter table public.certification_missions drop constraint certification_mission_proof_type;
alter table public.certification_missions add constraint certification_mission_proof_type
  check (proof_type is null or proof_type in ('membership','purchase','receipt','ticket','donation','funding','kyaa_payment'));
alter table public.certification_submissions drop constraint certification_submission_proof_type;
alter table public.certification_submissions add constraint certification_submission_proof_type
  check (proof_type is null or proof_type in ('membership','purchase','receipt','ticket','donation','funding','kyaa_payment'));

create or replace function public.list_proof_missions(p_user uuid, p_celebrity uuid, p_month_start timestamptz)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'missions', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'proofType', m.proof_type, 'platform', m.proof_platform, 'closesAt', m.closes_at)
        order by m.closes_at, m.id)
      from (select * from public.certification_missions
             where celebrity_id = p_celebrity and status = 'active' and proof_type is not null
               and opens_at <= pg_catalog.now() and closes_at > pg_catalog.now()
             order by closes_at, id limit 50) m), '[]'::jsonb),
    -- A membership already approved for this member and platform (legacy flow or proof) is done: the unique index
    -- certification_membership_approved_once would refuse a second approval.
    'approvedMissionIds', coalesce((select jsonb_agg(m.id order by m.id)
      from public.certification_missions m
     where m.celebrity_id = p_celebrity and m.membership_platform is not null
       and exists (select 1 from public.certification_submissions s where s.app_user_id = p_user and s.celebrity_id = p_celebrity
                     and s.membership_platform = m.membership_platform and s.status = 'approved')), '[]'::jsonb),
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

do $migration$
declare
  definition text;
  patches constant text[][] := array[
    -- submit: accept sns_post
    array['public.submit_certification_proof(uuid,uuid,text,uuid,boolean,boolean,text[],uuid,text,boolean,text)',
          $n$('membership','purchase','receipt','ticket','donation','funding','kyaa_payment')$n$,
          $r$('membership','purchase','receipt','ticket','donation','funding','kyaa_payment','sns_post')$r$],
    -- submit: an SNS post screenshot is never published on the proof board
    array['public.submit_certification_proof(uuid,uuid,text,uuid,boolean,boolean,text[],uuid,text,boolean,text)',
          $n$if v_body is not null and length(v_body) > 500 then raise exception 'PROOF_INVALID' using errcode = 'P0001'; end if;$n$,
          $r$if v_body is not null and length(v_body) > 500 then raise exception 'PROOF_INVALID' using errcode = 'P0001'; end if;
  if p_proof_type = 'sns_post' and coalesce(p_publish_consent, false) then raise exception 'PROOF_INVALID' using errcode = 'P0001'; end if;$r$],
    -- submit: one approved SNS post per creator and network
    array['public.submit_certification_proof(uuid,uuid,text,uuid,boolean,boolean,text[],uuid,text,boolean,text)',
          $n$if mission.proof_type is distinct from p_proof_type then raise exception 'PROOF_TYPE_MISMATCH' using errcode = 'P0001'; end if;$n$,
          $r$if mission.proof_type is distinct from p_proof_type then raise exception 'PROOF_TYPE_MISMATCH' using errcode = 'P0001'; end if;
  if p_proof_type = 'sns_post' and exists (select 1 from public.certification_submissions s join public.certification_missions sm on sm.id = s.mission_id
       where s.app_user_id = p_user and s.celebrity_id = p_celebrity and s.proof_type = 'sns_post' and s.status = 'approved'
         and sm.proof_platform = mission.proof_platform) then
    raise exception 'PROOF_ALREADY_APPROVED' using errcode = 'P0001'; end if;$r$],
    -- submit: the monthly limit is the slot 09 proofs' own; SNS posts neither count nor wait for it
    array['public.submit_certification_proof(uuid,uuid,text,uuid,boolean,boolean,text[],uuid,text,boolean,text)',
          $n$and status in ('pending','in_review','changes_requested','approved') and submitted_at >= month_start;$n$,
          $r$and status in ('pending','in_review','changes_requested','approved') and submitted_at >= month_start and proof_type <> 'sns_post';$r$],
    array['public.submit_certification_proof(uuid,uuid,text,uuid,boolean,boolean,text[],uuid,text,boolean,text)',
          $n$if used >= 2 then$n$,
          $r$if used >= 2 and p_proof_type <> 'sns_post' then$r$],
    -- review: declare the network
    array['public.review_certification_proof(uuid,uuid,bigint,text,text)',
          $n$v_title boolean := false; v_first boolean; v_rows integer;$n$,
          $r$v_title boolean := false; v_first boolean; v_rows integer; v_sns text;$r$],
    -- review: a second approved SNS post for the same creator and network is refused before anything is written
    array['public.review_certification_proof(uuid,uuid,bigint,text,text)',
          $n$  if p_decision = 'approved' and not exists (select 1 from public.app_users where id = sub.app_user_id and status = 'active') then$n$,
          $r$  if p_decision = 'approved' and sub.proof_type = 'sns_post' then
    select m.proof_platform into v_sns from public.certification_missions m where m.id = sub.mission_id;
    if v_sns is null or v_sns not in ('instagram','tiktok','x','threads','youtube') then raise exception 'PROOF_INVALID' using errcode = 'P0001'; end if;
    if exists (select 1 from public.certification_submissions s join public.certification_missions sm on sm.id = s.mission_id
        where s.app_user_id = sub.app_user_id and s.celebrity_id = sub.celebrity_id and s.proof_type = 'sns_post' and s.status = 'approved'
          and s.id <> sub.id and sm.proof_platform = v_sns) then
      raise exception 'PROOF_ALREADY_APPROVED' using errcode = 'P0001'; end if;
  end if;
  if p_decision = 'approved' and not exists (select 1 from public.app_users where id = sub.app_user_id and status = 'active') then$r$],
    -- review: an SNS post pays the existing subscription action (slot 07) and nothing else
    array['public.review_certification_proof(uuid,uuid,bigint,text,text)',
          $n$  if p_decision = 'approved' then$n$,
          $r$  if p_decision = 'approved' and sub.proof_type = 'sns_post' then
    rec := public.record_dukjil_action(sub.app_user_id, sub.celebrity_id, 'subscription', 'sns:' || sub.celebrity_id::text || ':' || v_sns,
      pg_catalog.md5('p3-sns-review:' || sub.id::text)::uuid, jsonb_build_object('platform', 'sns:' || v_sns));
    v_stamp := nullif(rec ->> 'stampId', '')::uuid;
    if v_stamp is null then raise exception 'PROOF_STAMP_UNAVAILABLE' using errcode = 'P0001'; end if;
    select s.page_no, s.slot_no into v_page, v_slot from public.passport_page_slots s
      join public.fan_passports fp on fp.id = s.passport_id and fp.app_user_id = sub.app_user_id and fp.celebrity_id = sub.celebrity_id
      where s.stamp_id = v_stamp limit 1;
  elsif p_decision = 'approved' then$r$],
    -- B1 A: an approved legacy membership certification fills slot 09 like a proof approval
    array['public.dukjil_wire_event()',
          $n$      perform public.dukjil_wire_award('subscription', new.app_user_id, new.celebrity_id, 'subscription',
        new.celebrity_id::text || ':' || new.membership_platform::text, jsonb_build_object('platform', new.membership_platform::text));$n$,
          $r$      perform public.dukjil_wire_award('proof', new.app_user_id, new.celebrity_id, 'proof', new.id::text);$r$],
    -- admin missions: sns_post with one of the five networks
    array['public.save_admin_certification_mission_v3(uuid,uuid,uuid,uuid,uuid,text,bigint,text,text,text,text,text,text,text,timestamptz,timestamptz,smallint,bigint,public.social_platform,text,text)',
          $n$('membership','purchase','receipt','ticket','donation','funding','kyaa_payment') then$n$,
          $r$('membership','purchase','receipt','ticket','donation','funding','kyaa_payment','sns_post') then
    raise exception 'PROOF_INVALID' using errcode = 'P0001'; end if;
  if p_proof_type = 'sns_post' and (v_platform is null or v_platform not in ('instagram','tiktok','x','threads','youtube')) then$r$]
  ];
  i integer;
begin
  for i in reverse array_length(patches, 1) .. 1 loop
    select pg_catalog.pg_get_functiondef(patches[i][1]::regprocedure) into definition;
    if (length(definition) - length(replace(definition, patches[i][3], ''))) / length(patches[i][3]) <> 1 then
      raise exception 'SNS_SUBSCRIPTION_ROLLBACK_CONTRACT_CHANGED % (%)', patches[i][1], i;
    end if;
    execute replace(definition, patches[i][3], patches[i][2]);
  end loop;
end $migration$;

notify pgrst, 'reload schema';
commit;
