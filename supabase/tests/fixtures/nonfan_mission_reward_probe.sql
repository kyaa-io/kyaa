-- Shared probe for NONFAN-MISSION-REWARD. Run with psql -v expect=fail|ok. Everything rolls back.
-- ok = after 20261211060000: a mission approval on a page without a creator pays the shown reward (response = submission = ledger).
-- fail = before it: such a row stays at the shown value with no ledger link. Creator pages behave the same in both modes.
begin;
select set_config('dukjil.expect', :'expect', false);
update public.group_wallet_release set enabled = true, write_fenced = false, legacy_writers_verified = true,
  migration_evidence_sha256 = repeat('b',64), rewards_start_on = current_date;

do $$
declare
  ex text := current_setting('dukjil.expect');
  c1 uuid := 'd1400000-0000-4000-8000-000000000001'; pg uuid := 'd1400000-0000-4000-8000-000000000002';
  adm uuid := 'd1400000-0000-4000-8000-000000000003'; ph uuid := 'd1400000-0000-4000-8000-000000000004';
  m_cr uuid := 'd1400000-0000-4000-8000-000000000011'; m_nf uuid := 'd1400000-0000-4000-8000-000000000012';
  m_zero uuid := 'd1400000-0000-4000-8000-000000000013'; m_pre uuid := 'd1400000-0000-4000-8000-000000000014';
  uo uuid := 'd1400000-0000-4000-8000-0000000000a0'; u_pre uuid := 'd1400000-0000-4000-8000-0000000000a1';
  u_nf uuid := 'd1400000-0000-4000-8000-0000000000a2'; u_zero uuid := 'd1400000-0000-4000-8000-0000000000a3';
  u_cr uuid := 'd1400000-0000-4000-8000-0000000000a4'; u_np uuid := 'd1400000-0000-4000-8000-0000000000a5';
  u_tr uuid := 'd1400000-0000-4000-8000-0000000000a6';
  s_pre uuid := 'd1400000-0000-4000-8000-0000000000b1'; s_nf uuid := 'd1400000-0000-4000-8000-0000000000b2';
  s_zero uuid := 'd1400000-0000-4000-8000-0000000000b3'; s_cr uuid := 'd1400000-0000-4000-8000-0000000000b4';
  s_np uuid := 'd1400000-0000-4000-8000-0000000000b5'; s_tr uuid := 'd1400000-0000-4000-8000-0000000000b6';
  s_set uuid := 'd1400000-0000-4000-8000-0000000000b7';
  st text; amt numeric; n integer; k integer; i integer := 0; u uuid; r jsonb; sub public.group_mission_submissions%rowtype;
  led record; bal_before bigint; failed boolean;
begin
  insert into public.celebrities(id,slug,status,image_url,roles,primary_role) values(c1,'nonfan-reward-1','draft','/d.webp','{artist}','idol');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)
    values(c1,'ko','덕질','덕질','덕질'),(c1,'en','Dukjil','Dukjil','Dukjil');
  update public.celebrities set status='published', published_at=coalesce(published_at,clock_timestamp()) where id=c1;
  foreach u in array array[uo,u_pre,u_nf,u_zero,u_cr,u_np,u_tr] loop
    i := i + 1;
    insert into public.app_users(id,privy_user_id,verified_email,status) values(u,'did:privy:nmr-'||i,'nmr-'||i||'@byus.test','active');
  end loop;
  set local session_replication_role = replica;
  insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)
    values(u_cr,91342,'0xdddddddddddddddddddddddddddddddddddd0001','privy','embedded');
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload) values
    ('d1400000-0000-4000-8000-000000000101','passport','d1400000-0000-4000-8000-000000000201','nmr-fixture-1',1,
     jsonb_build_object('recipient','0xdddddddddddddddddddddddddddddddddddd0001','celebritySlug','nonfan-reward-1','passportId','0x'||repeat('1',64)));
  insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id)
    values('d1400000-0000-4000-8000-000000000201',u_cr,c1,extensions.gen_random_uuid(),'d1400000-0000-4000-8000-000000000101');
  set local session_replication_role = origin;
  insert into public.admin_allowlist(id,email,role) values(adm,'nmr-admin@byus.test','admin');
  insert into public.group_pages(id,kind,celebrity_id,name,status) values(pg,'fan',c1,'크리에이터 페이지','published'),(ph,'hobby',null,'취미 페이지','published');
  insert into public.group_memberships(page_id,app_user_id,role) values(pg,uo,'owner'),(pg,u_cr,'member'),(pg,u_np,'member'),
    (ph,uo,'owner'),(ph,u_pre,'member'),(ph,u_nf,'member'),(ph,u_zero,'member'),(ph,u_tr,'member');
  insert into public.group_missions(id,page_id,title,instructions,state,reward_points,reward_budget,reward_approved_by) values
    (m_cr,pg,'크리에이터 미션','안내','published',100,1000,adm), (m_nf,ph,'비팬 미션','안내','published',100,1000,adm),
    (m_zero,ph,'보상 없는 미션','안내','published',0,0,null), (m_pre,ph,'활성 전 미션','안내','published',100,1000,adm);
  insert into public.group_mission_submissions(id,mission_id,app_user_id,body,status) values
    (s_pre,m_pre,u_pre,'내용','pending'),(s_nf,m_nf,u_nf,'내용','pending'),(s_zero,m_zero,u_zero,'내용','pending'),
    (s_cr,m_cr,u_cr,'내용','pending'),(s_np,m_cr,u_np,'내용','pending');
  insert into public.group_mission_submission_revisions(submission_id,revision,body,original_attested) values
    (s_pre,1,'내용',true),(s_nf,1,'내용',true),(s_zero,1,'내용',true),(s_cr,1,'내용',true),(s_np,1,'내용',true);

  -- D: policy not active -> the legacy approval pays the non-fan page itself (once), unchanged
  set local role service_role;
  r := public.group_activities_dispatch('mission-review', uo, ph, m_pre, s_pre, jsonb_build_object('action','approve','expectedSubmissionRevision',1,'requestId',md5('s_pre')::uuid));
  reset role;
  select * into sub from public.group_mission_submissions where id = s_pre;
  if (r->>'rewardPoints')::int <> 100 or sub.reward_points <> 100 or sub.reward_ledger_id is null then
    raise exception 'D: policy-inactive approval must keep the legacy payout: % / % / %', r, sub.reward_points, sub.reward_ledger_id; end if;

  update public.dukjil_policy_versions set status='active', effective_from=now()-interval '1 hour', activated_at=now() where version=1;

  -- A: non-fan page, policy active: paid. response = submission = ledger = wallet row
  set local role service_role;
  r := public.group_activities_dispatch('mission-review', uo, ph, m_nf, s_nf, jsonb_build_object('action','approve','expectedSubmissionRevision',1,'requestId',md5('s_nf')::uuid));
  reset role;
  select * into sub from public.group_mission_submissions where id = s_nf;
  select count(*) into n from public.dukjil_wire_failures where app_user_id = u_nf;
  if sub.status <> 'completed' or n <> 0 then raise exception 'A: status %, failures %', sub.status, n; end if;
  if ex = 'ok' then
    if (r->>'rewardPoints')::int <> 100 or sub.reward_points <> 100 or sub.reward_ledger_id is null then
      raise exception 'A: non-fan mission must pay 100 and link the ledger: % / % / %', r, sub.reward_points, sub.reward_ledger_id; end if;
    select * into led from public.mobile_fan_economy_ledger where id = sub.reward_ledger_id;
    if led.app_user_id <> u_nf or led.amount <> 100 or led.asset <> 'fan_point' or led.source_type <> 'group_mission'
       or led.source_id <> s_nf or led.celebrity_id is not null then
      raise exception 'A: ledger row does not match: %', row_to_json(led); end if;
    select count(*), coalesce(sum(points),0) into n, k from public.dukjil_action_log where app_user_id = u_nf and action_key = 'mission' and source_key = s_nf::text and celebrity_id is null and stamp_id is null;
    if n <> 1 or k <> 100 then raise exception 'A: one action row of 100 without creator or stamp expected, got % / %', n, k; end if;
    select count(*) into n from public.community_stamps where app_user_id = u_nf;
    if n <> 0 then raise exception 'A: a non-fan mission must not issue a stamp'; end if;
    -- earnings read of that page: credited 100, valid
    select min(data->>'status'), sum((data->>'netAmount')::numeric) into st, amt from public.group_earning_rows(u_nf, ph);
    if st is distinct from 'credited' or amt is distinct from 100 then raise exception 'A: earnings read % / %', st, amt; end if;
  else
    if sub.reward_points <> 100 or sub.reward_ledger_id is not null then
      raise exception 'A (before): the old behaviour leaves 100 without a ledger, got % / %', sub.reward_points, sub.reward_ledger_id; end if;
  end if;

  -- B: no double payout. Re-running the hook, the retry job, the settle helper and a second approval change nothing
  perform public.dukjil_wire_award('group_mission', u_nf, null, 'mission', s_nf::text, jsonb_build_object('points', 100));
  perform public.retry_dukjil_wire_failures(10);
  perform public.dukjil_mission_settle_refused(s_nf::text);
  begin
    set local role service_role;
    perform public.group_activities_dispatch('mission-review', uo, ph, m_nf, s_nf, jsonb_build_object('action','approve','expectedSubmissionRevision',1,'requestId',md5('s_nf2')::uuid));
    failed := false;
  exception when others then failed := true;
  end;
  reset role;
  if not failed then raise exception 'B: a second approval of a completed submission must be refused'; end if;
  select count(*) into n from public.mobile_fan_economy_ledger where source_type = 'group_mission' and source_id = s_nf;
  select reward_points into k from public.group_mission_submissions where id = s_nf;
  if n <> (case when ex = 'ok' then 1 else 0 end) or k <> 100 then raise exception 'B: ledger rows %, stored %', n, k; end if;

  -- C: reward 0 mission: no payout, no ledger, no failure, read shows no_reward
  set local role service_role;
  r := public.group_activities_dispatch('mission-review', uo, ph, m_zero, s_zero, jsonb_build_object('action','approve','expectedSubmissionRevision',1,'requestId',md5('s_zero')::uuid));
  reset role;
  select * into sub from public.group_mission_submissions where id = s_zero;
  select count(*) into n from public.dukjil_wire_failures where app_user_id = u_zero;
  select count(*) into k from public.dukjil_action_log where app_user_id = u_zero;
  if (r->>'rewardPoints')::int <> 0 or sub.reward_points <> 0 or sub.reward_ledger_id is not null or n <> 0 or k <> 0 then
    raise exception 'C: zero reward mission % / % / % / % / %', r, sub.reward_points, sub.reward_ledger_id, n, k; end if;
  select min(data->>'status') into st from public.group_earning_rows(u_zero, ph);
  if st is distinct from 'no_reward' then raise exception 'C: zero reward must read no_reward, got %', st; end if;
  -- a missing submission / bad source never pays or fails
  perform public.dukjil_mission_settle_refused('d1400000-0000-4000-8000-0000000000ff');
  perform public.dukjil_mission_settle_refused('not-a-uuid');
  perform public.dukjil_mission_settle_refused(null);

  -- E: creator page regression (both modes): passport holder paid 100 and linked; member without a passport refused -> 0, no rows
  set local role service_role;
  r := public.group_activities_dispatch('mission-review', uo, pg, m_cr, s_cr, jsonb_build_object('action','approve','expectedSubmissionRevision',1,'requestId',md5('s_cr')::uuid));
  reset role;
  select * into sub from public.group_mission_submissions where id = s_cr;
  select count(*) into n from public.dukjil_action_log where app_user_id = u_cr and action_key = 'mission' and celebrity_id = c1 and stamp_id is not null;
  if (r->>'rewardPoints')::int <> 100 or sub.reward_points <> 100 or sub.reward_ledger_id is null or n <> 1 then
    raise exception 'E: passport holder % / % / % / %', r, sub.reward_points, sub.reward_ledger_id, n; end if;
  set local role service_role;
  r := public.group_activities_dispatch('mission-review', uo, pg, m_cr, s_np, jsonb_build_object('action','approve','expectedSubmissionRevision',1,'requestId',md5('s_np')::uuid));
  reset role;
  select * into sub from public.group_mission_submissions where id = s_np;
  select count(*) into n from public.dukjil_wire_failures where app_user_id = u_np;
  select count(*) into k from public.dukjil_action_log where app_user_id = u_np;
  if (r->>'rewardPoints')::int <> 0 or sub.reward_points <> 0 or sub.reward_ledger_id is not null or n <> 0 or k <> 0 then
    raise exception 'E: no-passport member must stay refused at 0: % / % / % / % / %', r, sub.reward_points, sub.reward_ledger_id, n, k; end if;
  select min(data->>'status') into st from public.group_earning_rows(u_np, pg);
  if st is distinct from 'no_reward' then raise exception 'E: refused creator row must read no_reward, got %', st; end if;

  -- F: transient failure on a non-fan page: open failure row keeps the shown value, the retry pays once
  insert into public.group_mission_submissions(id,mission_id,app_user_id,body,status,reviewed_by,reviewed_at,reward_points)
    values(s_tr,m_nf,u_tr,'내용','completed',uo,clock_timestamp(),100);
  insert into public.dukjil_wire_failures(wire,app_user_id,celebrity_id,action_key,source_key,params,error_message)
    values('app',u_tr,null,'mission',s_tr::text,'{"points":100}'::jsonb,'transient');
  perform public.retry_dukjil_wire_failures(10);
  perform public.retry_dukjil_wire_failures(10);
  select * into sub from public.group_mission_submissions where id = s_tr;
  select count(*) into n from public.mobile_fan_economy_ledger where source_type = 'group_mission' and source_id = s_tr;
  if ex = 'ok' and (sub.reward_points <> 100 or sub.reward_ledger_id is null or n <> 1) then
    raise exception 'F: retry must pay once: % / % / %', sub.reward_points, sub.reward_ledger_id, n; end if;
  if ex = 'fail' and (sub.reward_ledger_id is not null or n <> 0) then raise exception 'F (before): unexpected payout'; end if;

  -- G: settle scope in ok mode: a completed non-fan row with no record and no failure settles to 0 (normal refusal), a paid one is untouched
  insert into public.group_mission_submissions(id,mission_id,app_user_id,body,status,reviewed_by,reviewed_at,reward_points)
    values(s_set,m_nf,u_zero,'내용','completed',uo,clock_timestamp(),100);
  if ex = 'ok' then
    perform public.dukjil_mission_settle_refused(s_set::text);
    if (select reward_points from public.group_mission_submissions where id = s_set) <> 0 then raise exception 'G: refused non-fan row must settle to 0'; end if;
    select min(data->>'status') into st from public.group_earning_rows(u_zero, ph);
    if st is null then raise exception 'G: earnings read must still work'; end if;
  end if;
end $$;

-- H/I: budget and legacy out-of-range value on a page without a creator (same page and owner as above)
do $$
declare
  ex text := current_setting('dukjil.expect');
  ph uuid := 'd1400000-0000-4000-8000-000000000002'; pg2 uuid := 'd1400000-0000-4000-8000-000000000402';
  uo uuid := 'd1400000-0000-4000-8000-0000000000a0'; adm uuid := 'd1400000-0000-4000-8000-000000000003';
  m_bud uuid := 'd1400000-0000-4000-8000-000000000421'; m_old uuid := 'd1400000-0000-4000-8000-000000000422';
  ua uuid := 'd1400000-0000-4000-8000-0000000004a1'; ub uuid := 'd1400000-0000-4000-8000-0000000004a2'; uc uuid := 'd1400000-0000-4000-8000-0000000004a3';
  sa uuid := 'd1400000-0000-4000-8000-0000000004b1'; sb uuid := 'd1400000-0000-4000-8000-0000000004b2'; sc uuid := 'd1400000-0000-4000-8000-0000000004b3';
  sub public.group_mission_submissions%rowtype; r jsonb; n integer; failed text; u uuid; i integer := 100;
begin
  foreach u in array array[ua,ub,uc] loop
    i := i + 1;
    insert into public.app_users(id,privy_user_id,verified_email,status) values(u,'did:privy:nmr-b'||i,'nmr-b'||i||'@byus.test','active');
  end loop;
  insert into public.group_pages(id,kind,celebrity_id,name,status) values(pg2,'hobby',null,'취미 페이지 2','published');
  insert into public.group_memberships(page_id,app_user_id,role) values(pg2,uo,'owner'),(pg2,ua,'member'),(pg2,ub,'member'),(pg2,uc,'member');
  insert into public.group_missions(id,page_id,title,instructions,state,reward_points,reward_budget,reward_approved_by)
    values(m_bud,pg2,'예산 미션','안내','published',100,150,adm);
  -- created before activation in real data: the range guard is not applied, so skip triggers for this insert only
  set local session_replication_role = replica;
  insert into public.group_missions(id,page_id,title,instructions,state,reward_points,reward_budget,reward_approved_by)
    values(m_old,pg2,'범위 밖 기존 미션','안내','published',500,1000,adm);
  set local session_replication_role = origin;
  insert into public.group_mission_submissions(id,mission_id,app_user_id,body,status) values(sa,m_bud,ua,'내용','pending'),(sb,m_bud,ub,'내용','pending'),(sc,m_old,uc,'내용','pending');
  insert into public.group_mission_submission_revisions(submission_id,revision,body,original_attested) values(sa,1,'내용',true),(sb,1,'내용',true),(sc,1,'내용',true);

  -- H: first approval fits the budget (100 of 150) and pays; the second would exceed it: refused before any payout
  set local role service_role;
  perform public.group_activities_dispatch('mission-review', uo, pg2, m_bud, sa, jsonb_build_object('action','approve','expectedSubmissionRevision',1,'requestId',md5('sa')::uuid));
  reset role;
  begin
    set local role service_role;
    perform public.group_activities_dispatch('mission-review', uo, pg2, m_bud, sb, jsonb_build_object('action','approve','expectedSubmissionRevision',1,'requestId',md5('sb')::uuid));
    failed := null;
  exception when others then failed := sqlerrm;
  end;
  reset role;
  if failed is distinct from 'GROUP_ACTIVITY_CAPACITY' then raise exception 'H: over-budget approval must raise GROUP_ACTIVITY_CAPACITY, got %', failed; end if;
  select * into sub from public.group_mission_submissions where id = sb;
  select count(*) into n from public.mobile_fan_economy_ledger where source_type = 'group_mission' and source_id = sb;
  if sub.status <> 'pending' or sub.reward_ledger_id is not null or n <> 0 then raise exception 'H: refused submission must stay pending without payout'; end if;
  select count(*) into n from public.mobile_fan_economy_ledger where source_type = 'group_mission' and source_id = sa and amount = 100;
  if n <> (case when ex = 'ok' then 1 else 0 end) then raise exception 'H: first approval ledger rows %', n; end if;

  -- I: legacy mission outside the 50-300 range (500): pays exactly the displayed value, once, like the creator-page path
  set local role service_role;
  r := public.group_activities_dispatch('mission-review', uo, pg2, m_old, sc, jsonb_build_object('action','approve','expectedSubmissionRevision',1,'requestId',md5('sc')::uuid));
  reset role;
  select * into sub from public.group_mission_submissions where id = sc;
  select count(*) into n from public.mobile_fan_economy_ledger where source_type = 'group_mission' and source_id = sc and amount = 500;
  if (r->>'rewardPoints')::int <> 500 or sub.reward_points <> 500 then raise exception 'I: displayed value must stay 500: % / %', r, sub.reward_points; end if;
  if ex = 'ok' and (sub.reward_ledger_id is null or n <> 1) then raise exception 'I: legacy out-of-range mission must pay the displayed 500 once: % / %', sub.reward_ledger_id, n; end if;
  if ex = 'fail' and (sub.reward_ledger_id is not null or n <> 0) then raise exception 'I (before): unexpected payout'; end if;
end $$;
rollback;
