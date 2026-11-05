-- PASSPORT-RENEWAL P1-7: freeze fan_score_ledger writes once the dukjil policy is in force.
-- Never raise and never skip: 26 activity RPCs write the score in the same transaction and several of them
-- (for example the reservation result builder) read the score row back, so a skipped row would fail the user's
-- activity with an integrity error. Activity rows are written with zero points instead; manual and adjustment rows
-- (no activity row to read back) are still skipped. The pre-conversion sum stays intact either way.
create function public.dukjil_freeze_fan_score() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.dukjil_policy_replaces_earning() then
    if new.activity_id is null then return null; end if;
    new.points := 0;
  end if;
  return new;
end $$;
revoke all on function public.dukjil_freeze_fan_score() from public, anon, authenticated, service_role;
create trigger aa_dukjil_freeze before insert on public.fan_score_ledger
  for each row execute function public.dukjil_freeze_fan_score();

create or replace function public.validate_fan_score_weight() returns trigger
language plpgsql set search_path='' as $$
declare source_activity_type public.fan_activity_type; expected_points smallint;
  adjustment_record public.fan_score_adjustments%rowtype; manual_record public.certification_submissions%rowtype;
  current_score bigint; next_score bigint;
begin
  if num_nonnulls(new.activity_id,new.adjustment_id,new.manual_submission_id)<>1 then raise exception 'fan score entry requires exactly one source'; end if;
  -- PASSPORT-RENEWAL P1-FIX2: while the dukjil policy is in force the freeze trigger writes a zero-point row, so
  -- the activity RPCs that read the score row back keep working and the sum stays unchanged.
  if new.points=0 and new.activity_id is not null and public.dukjil_policy_replaces_earning() then return new; end if;
  if new.activity_id is not null then
    select activity_type into strict source_activity_type from public.fan_activities
      where id=new.activity_id and app_user_id=new.app_user_id and celebrity_id=new.celebrity_id;
    if source_activity_type='membership' then raise exception 'membership score requires manual submission source'; end if;
    if source_activity_type='survey' then
      -- Each published mission freezes its own reward revision. Legacy surveys
      -- are already bound to their original +2 revision by the v1 backfill.
      select revision.mission_score into strict expected_points
      from public.fan_activities activity
      join public.live_survey_responses response
        on response.id=activity.source_id
       and response.app_user_id=activity.app_user_id
       and response.celebrity_id=activity.celebrity_id
       and response.status='submitted'
      join public.live_survey_reward_setting_bindings binding
        on binding.survey_id=response.survey_id
      join public.live_reward_setting_revisions revision
        on revision.id=binding.reward_setting_revision_id
       and revision.live_event_id=response.live_event_id
       and revision.lifecycle_status='published'
      where activity.id=new.activity_id
        and activity.app_user_id=new.app_user_id
        and activity.celebrity_id=new.celebrity_id
        and activity.source_type='live_survey_response';
      if expected_points<=0 then raise exception 'zero-point mission cannot create a score row'; end if;
    else
      expected_points:=case source_activity_type when 'knowledge' then 1 when 'reservation' then 1 when 'attendance' then 3 end;
    end if;
  elsif new.adjustment_id is not null then
    select * into strict adjustment_record from public.fan_score_adjustments
      where id=new.adjustment_id and app_user_id=new.app_user_id and celebrity_id=new.celebrity_id;
    expected_points:=adjustment_record.points;
  else
    select * into strict manual_record from public.certification_submissions
      where id=new.manual_submission_id and app_user_id=new.app_user_id and celebrity_id=new.celebrity_id and status='approved';
    expected_points:=manual_record.reward_score_points;
    if expected_points<=0 then raise exception 'zero-point certification cannot create a score row'; end if;
  end if;
  if expected_points is null or new.points<>expected_points then raise exception 'fan score points do not match source'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('g5:fan-score:'||new.app_user_id::text||':'||new.celebrity_id::text,0));
  select coalesce(sum(points::bigint),0) into current_score from public.fan_score_ledger where app_user_id=new.app_user_id and celebrity_id=new.celebrity_id;
  next_score:=current_score+new.points::bigint;
  if next_score<0 or next_score>1000000 then raise exception 'fan score total must remain between 0 and 1000000'; end if;
  return new;
end $$;

-- PASSPORT-RENEWAL FIX3 item 8: the quiz submit RPC and its result builder read the knowledge score row back and demand
-- points = 1. After activation that row is written with 0 points (above), so entry screening itself failed with
-- G2_ISSUANCE_CONFLICT. Accept 0 as well; before activation the row is still 1 and nothing else changes.
do $migration$
declare fn regprocedure; def text; hits integer;
begin
  for fn in select p.oid::regprocedure from pg_proc p
    where p.pronamespace = 'public'::regnamespace and (p.proname like 'submit\_owned\_quiz\_attempt%' or p.proname like 'build\_owned\_quiz\_submit\_result%')
  loop
    def := pg_get_functiondef(fn);
    hits := (select count(*) from regexp_matches(def, 'score\.points\s*=\s*1\M', 'g'));
    if hits = 0 then continue; end if;
    if hits <> 1 then raise exception 'DUKJIL_SCORE_READBACK_CONTRACT_CHANGED % %', fn, hits; end if;
    execute regexp_replace(def, 'score\.points\s*=\s*1\M', 'score.points in (0, 1)');
  end loop;
end $migration$;
