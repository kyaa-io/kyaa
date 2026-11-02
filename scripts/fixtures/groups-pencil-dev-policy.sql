-- Dev-only recovery of absent migration seed data, with present-time operator provenance.
begin;
set local lock_timeout='5s';
set local statement_timeout='55s';
select pg_advisory_xact_lock(hashtextextended('groups-pencil-dev-v1',0));
lock table public.reward_policy_versions,public.reward_policy_tier_milestones,public.reward_policy_activation,public.reward_policy_activation_audit,public.fan_score_ledger,public.fan_level_events,public.fan_tier_cutover_snapshots,public.fan_ticket_ledger,public.live_surveys,public.live_survey_responses,public.live_survey_reward_setting_bindings,public.live_reward_setting_revisions in share row exclusive mode;
create temp table fixture_expected_policy(like public.reward_policy_versions)on commit drop;
create temp table fixture_expected_tiers(like public.reward_policy_tier_milestones)on commit drop;
insert into fixture_expected_policy values
  (1, 0, 2, 2, 0, 0, 0, 0, 0, 0, '2026-09-02 00:00:00+00'),
  (2, 0, 3, 1, 0, 2, 1, 0, 5, 3, '2026-09-02 00:00:00+00');

insert into fixture_expected_tiers(policy_version,tier_name,minimum_score,tier_rank) values
  (1, 'Bronze', 0, 1), (1, 'Silver', 5, 2), (1, 'Gold', 10, 3),
  (1, 'Platinum', 20, 4), (1, 'Diamond', 35, 5),
  (2, 'Bronze', 0, 1), (2, 'Silver', 15, 2), (2, 'Gold', 50, 3),
  (2, 'Platinum', 120, 4), (2, 'Diamond', 250, 5);

do $$declare operator jsonb:=current_setting('byus.groups_pencil_operator')::jsonb;begin
 if current_setting('byus.groups_pencil_dev',true)is distinct from'SEED_GROUPS_PENCIL_DEV_ONLY'or operator->>'Account'is distinct from'996702758024'or coalesce(operator->>'Arn','')not like'arn:aws:%:996702758024:%'then raise exception 'DEV_FIXTURE_OPERATOR_REQUIRED';end if;
 if exists(select 1 from public.reward_policy_activation)then
  if not exists(select 1 from public.reward_policy_activation where singleton and policy_version=2)or exists((select *from public.reward_policy_versions except select *from fixture_expected_policy)union all(select *from fixture_expected_policy except select *from public.reward_policy_versions))or exists((select *from public.reward_policy_tier_milestones except select *from fixture_expected_tiers)union all(select *from fixture_expected_tiers except select *from public.reward_policy_tier_milestones))then raise exception 'DEV_FIXTURE_POLICY_CONFLICT';end if;
  return;
 end if;
 if exists(select 1 from public.reward_policy_versions)or exists(select 1 from public.reward_policy_tier_milestones)or exists(select 1 from public.reward_policy_activation_audit)or exists(select 1 from public.audit_logs where action='dev.reward_policy.bootstrap_recovered')then raise exception 'DEV_FIXTURE_POLICY_PARTIAL';end if;
 insert into public.reward_policy_versions select *from fixture_expected_policy;
 insert into public.reward_policy_tier_milestones select *from fixture_expected_tiers;
  if exists (
    with expected(tier_name, minimum_score, tier_rank) as (values
      ('Bronze', 0, 1), ('Silver', 15, 2), ('Gold', 50, 3),
      ('Platinum', 120, 4), ('Diamond', 250, 5)
    )
    select 1 from expected
    left join public.reward_policy_tier_milestones milestone
      on milestone.policy_version = 2
     and milestone.tier_name = expected.tier_name
     and milestone.minimum_score = expected.minimum_score
     and milestone.tier_rank = expected.tier_rank
    where milestone.tier_name is null
  ) then
    raise exception 'reward policy v2 Tier milestones are invalid';
  end if;

  if exists (
    with relationships as (
      select app_user_id, celebrity_id from public.fan_score_ledger
      union
      select app_user_id, celebrity_id from public.fan_level_events
    )
    select 1 from relationships relationship
    left join public.fan_tier_cutover_snapshots snapshot
      on snapshot.app_user_id = relationship.app_user_id
     and snapshot.celebrity_id = relationship.celebrity_id
    where snapshot.app_user_id is null
  ) then
    raise exception 'tier cutover snapshot backfill is incomplete';
  end if;

  if exists (
    with scores as (
      select snapshot.app_user_id, snapshot.celebrity_id,
        snapshot.attained_tier_rank,
        coalesce(sum(ledger.points), 0)::integer as current_score
      from public.fan_tier_cutover_snapshots snapshot
      left join public.fan_score_ledger ledger
        on ledger.app_user_id = snapshot.app_user_id
       and ledger.celebrity_id = snapshot.celebrity_id
      group by snapshot.app_user_id, snapshot.celebrity_id, snapshot.attained_tier_rank
    )
    select 1 from scores
    where public.fan_level_rank(public.get_fan_effective_tier_for_score(
      scores.app_user_id, scores.celebrity_id, scores.current_score, 2
    )) < scores.attained_tier_rank
  ) then
    raise exception 'tier downgrade detected';
  end if;

  if exists (
    select 1 from public.fan_ticket_ledger
    group by app_user_id, celebrity_id
    having sum(amount::numeric) < 0
  ) then
    raise exception 'negative Ticket balance detected';
  end if;

  if exists (
    select 1 from public.fan_ticket_ledger
    group by idempotency_key having count(*) > 1
  ) then
    raise exception 'duplicate Ticket idempotency key detected';
  end if;

  if exists (
    select 1 from public.fan_ticket_ledger
    group by app_user_id, celebrity_id, source_type, source_id having count(*) > 1
  ) then
    raise exception 'duplicate Ticket semantic source detected';
  end if;

  if exists (
    select 1 from public.live_surveys s
    where (s.publication_status = 'published' or exists (
      select 1 from public.live_survey_responses response where response.survey_id = s.id
    )) and not exists (
      select 1 from public.live_survey_reward_setting_bindings binding
      where binding.survey_id = s.id
    )
  ) then
    raise exception 'Survey reward binding backfill is incomplete';
  end if;

  if exists (
    select 1
    from public.live_survey_reward_setting_bindings binding
    join public.live_surveys s on s.id = binding.survey_id
    join public.live_reward_setting_revisions r on r.id = binding.reward_setting_revision_id
    where r.lifecycle_status <> 'published' or r.live_event_id <> s.live_event_id
  ) then
    raise exception 'Survey reward binding is invalid';
  end if;


 insert into public.reward_policy_activation(singleton,policy_version,effective_at,activated_at,actor_app_user_id,reason)values(true,2,transaction_timestamp(),transaction_timestamp(),null,'Dev-only recovery of absent migration seed data; current integrity gates checked');
 insert into public.audit_logs(action,entity_type,entity_id,before_after_summary)
 values('dev.reward_policy.bootstrap_recovered','reward_policy_activation','singleton',jsonb_build_object('before',null,'after',jsonb_build_object('policyVersion',2),'operator',operator,'environment','dev','rdsIdentifier','byus-dev-platform-database-zxcddq5gdswr','recoveredAt',transaction_timestamp(),'policySource','supabase/migrations/20260902010000_phase1_reward_policy.sql','policySourceSha256','3b291b7333dd558a20680d47b731569ce297d1a3705bba6ae978d518937a3a0f','gateSource','supabase/migrations/20260902015000_activate_reward_policy_v2.sql','gateSourceSha256','c29bb45fd3b77a8323793d5cb810878d1dcde613763a2d2f0b97469b3ef1d250'));
end $$;
select jsonb_build_object('policyVersion',policy_version,'effectiveAt',effective_at)from public.reward_policy_activation where singleton;
commit;
