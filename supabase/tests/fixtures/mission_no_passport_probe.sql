-- Shared probe for P1-MISSION-NO-PASSPORT. Run with psql -v expect=fail|ok. Everything rolls back.
-- A group mission approval that the Dukjil policy refuses on purpose (no passport for the page's creator) must report and
-- store payout 0 (ok) instead of the displayed reward with an empty ledger link (fail = the behaviour before the migration).
begin;
select set_config('dukjil.expect', :'expect', false);
update public.group_wallet_release set enabled = true, write_fenced = false, legacy_writers_verified = true,
  migration_evidence_sha256 = repeat('b',64), rewards_start_on = current_date;

do $$
declare
  ex text := current_setting('dukjil.expect');
  c1 uuid := 'd1300000-0000-4000-8000-000000000001'; pg uuid := 'd1300000-0000-4000-8000-000000000002';
  adm uuid := 'd1300000-0000-4000-8000-000000000003'; ms uuid := 'd1300000-0000-4000-8000-000000000004';
  uo uuid := 'd1300000-0000-4000-8000-0000000000a0';
  u_leg uuid := 'd1300000-0000-4000-8000-0000000000a1'; u_np uuid := 'd1300000-0000-4000-8000-0000000000a2';
  u_pp uuid := 'd1300000-0000-4000-8000-0000000000a3'; u_tr uuid := 'd1300000-0000-4000-8000-0000000000a4';
  u_nf uuid := 'd1300000-0000-4000-8000-0000000000a5';
  s_leg uuid := 'd1300000-0000-4000-8000-0000000000b1'; s_np uuid := 'd1300000-0000-4000-8000-0000000000b2';
  s_pp uuid := 'd1300000-0000-4000-8000-0000000000b3'; s_tr uuid := 'd1300000-0000-4000-8000-0000000000b4';
  s_nf uuid := 'd1300000-0000-4000-8000-0000000000b5';
  ms2 uuid := 'd1300000-0000-4000-8000-000000000014';
  ph uuid := 'd1300000-0000-4000-8000-000000000022'; ms3 uuid := 'd1300000-0000-4000-8000-000000000024';
  b_np uuid := 'd1300000-0000-4000-8000-0000000000c1'; b_pre uuid := 'd1300000-0000-4000-8000-0000000000c2';
  b_pp uuid := 'd1300000-0000-4000-8000-0000000000c3'; b_h uuid := 'd1300000-0000-4000-8000-0000000000c4';
  st text; amt numeric; failed boolean;
  u uuid; i integer := 0; r jsonb; sub public.group_mission_submissions%rowtype; n integer; k integer; msg text;
begin
  insert into public.celebrities(id,slug,status,image_url,roles,primary_role) values(c1,'mission-nopass-1','draft','/d.webp','{artist}','idol');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)
    values(c1,'ko','덕질','덕질','덕질'),(c1,'en','Dukjil','Dukjil','Dukjil');
  update public.celebrities set status='published', published_at=coalesce(published_at,clock_timestamp()) where id=c1;
  foreach u in array array[uo,u_leg,u_np,u_pp,u_tr,u_nf] loop
    i := i + 1;
    insert into public.app_users(id,privy_user_id,verified_email,status) values(u,'did:privy:mnp-'||i,'mnp-'||i||'@byus.test','active');
  end loop;
  set local session_replication_role = replica;
  i := 0;
  foreach u in array array[u_leg,u_pp,u_tr] loop
    i := i + 1;
    insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)
      values(u,91342,'0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee00'||lpad(i::text,2,'0'),'privy','embedded');
    insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload) values
      (('d1300000-0000-4000-8000-00000000010'||i)::uuid,'passport',('d1300000-0000-4000-8000-00000000020'||i)::uuid,'mnp-fixture-'||i,1,
       jsonb_build_object('recipient','0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee00'||lpad(i::text,2,'0'),'celebritySlug','mission-nopass-1','passportId','0x'||repeat(i::text,64)));
    insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id) values
      (('d1300000-0000-4000-8000-00000000020'||i)::uuid,u,c1,extensions.gen_random_uuid(),('d1300000-0000-4000-8000-00000000010'||i)::uuid);
  end loop;
  -- u_leg is only used before activation (legacy path); the passport is irrelevant there
  set local session_replication_role = origin;
  insert into public.admin_allowlist(id,email,role) values(adm,'mnp-admin@byus.test','admin');
  insert into public.group_pages(id,kind,celebrity_id,name,status) values(pg,'fan',c1,'미션 시험','published');
  insert into public.group_memberships(page_id,app_user_id,role) values(pg,uo,'owner'),(pg,u_leg,'member'),(pg,u_np,'member'),(pg,u_pp,'member'),(pg,u_tr,'member'),(pg,u_nf,'member');
  insert into public.group_missions(id,page_id,title,instructions,state,reward_points,reward_budget,reward_approved_by)
    values(ms,pg,'시험 미션','시험 안내','published',100,1000,adm);
  insert into public.group_mission_submissions(id,mission_id,app_user_id,body,status) values
    (s_leg,ms,u_leg,'내용','pending'),(s_np,ms,u_np,'내용','pending'),(s_pp,ms,u_pp,'내용','pending');
  insert into public.group_mission_submission_revisions(submission_id,revision,body,original_attested) values
    (s_leg,1,'내용',true),(s_np,1,'내용',true),(s_pp,1,'내용',true);

  -- D: policy not active -> legacy payout, unchanged
  set local role service_role;
  r := public.group_activities_dispatch('mission-review', uo, pg, ms, s_leg, jsonb_build_object('action','approve','expectedSubmissionRevision',1,'requestId',md5('s_leg')::uuid));
  reset role;
  select * into sub from public.group_mission_submissions where id = s_leg;
  if (r->>'rewardPoints')::int <> 100 or sub.reward_points <> 100 or sub.reward_ledger_id is null then
    raise exception 'policy-inactive approval must keep the legacy payout: % / % / %', r, sub.reward_points, sub.reward_ledger_id; end if;

  update public.dukjil_policy_versions set status='active', effective_from=now()-interval '1 hour', activated_at=now() where version=1;

  -- A: no passport for the creator -> refused on purpose -> payout 0 everywhere
  set local role service_role;
  r := public.group_activities_dispatch('mission-review', uo, pg, ms, s_np, jsonb_build_object('action','approve','expectedSubmissionRevision',1,'requestId',md5('s_np')::uuid));
  reset role;
  select * into sub from public.group_mission_submissions where id = s_np;
  select count(*) into n from public.dukjil_wire_failures where app_user_id = u_np;
  select count(*) into k from public.dukjil_action_log where app_user_id = u_np;
  if sub.status <> 'completed' or sub.reward_ledger_id is not null or n <> 0 or k <> 0 then
    raise exception 'A: status %, ledger %, failures %, actions %', sub.status, sub.reward_ledger_id, n, k; end if;
  if ex = 'ok' and ((r->>'rewardPoints')::int <> 0 or sub.reward_points <> 0) then
    raise exception 'A: refused payout must report 0, got response % stored %', r, sub.reward_points; end if;
  if ex = 'fail' and ((r->>'rewardPoints')::int <> 100 or sub.reward_points <> 100) then
    raise exception 'A (before): expected the old 100, got response % stored %', r, sub.reward_points; end if;
  if (select reward_points from public.group_missions where id = ms) <> 100 then raise exception 'mission definition must keep 100'; end if;
  -- earnings read: after the migration the row is a valid no_reward row with amount 0; before it, the read is not valid
  failed := false; st := null; amt := null;
  begin
    select min(data->>'status'), sum((data->>'netAmount')::numeric) into st, amt from public.group_earning_rows(u_np, pg);
  exception when others then failed := true; msg := sqlerrm;
  end;
  if ex = 'ok' and (failed or st is distinct from 'no_reward' or amt is distinct from 0) then
    raise exception 'A: earnings read after the migration must show no_reward / 0, got failed=% status=% amount=% %', failed, st, amt, msg; end if;
  if ex = 'fail' and not failed and st = 'no_reward' then raise exception 'A (before): earnings read must not show no_reward yet'; end if;

  -- B: member with the passport is paid 100, linked to the ledger
  set local role service_role;
  r := public.group_activities_dispatch('mission-review', uo, pg, ms, s_pp, jsonb_build_object('action','approve','expectedSubmissionRevision',1,'requestId',md5('s_pp')::uuid));
  reset role;
  select * into sub from public.group_mission_submissions where id = s_pp;
  select count(*) into n from public.dukjil_action_log where app_user_id = u_pp and action_key = 'mission';
  if (r->>'rewardPoints')::int <> 100 or sub.reward_points <> 100 or sub.reward_ledger_id is null or n <> 1 then
    raise exception 'B: paid member % / % / % / %', r, sub.reward_points, sub.reward_ledger_id, n; end if;

  -- C: transient failure (open failure row, passport exists): stays 100 and the retry still pays
  insert into public.group_mission_submissions(id,mission_id,app_user_id,body,status,reviewed_by,reviewed_at,reward_points)
    values(s_tr,ms,u_tr,'내용','completed',uo,clock_timestamp(),100);
  insert into public.dukjil_wire_failures(wire,app_user_id,celebrity_id,action_key,source_key,params,error_message)
    values('app',u_tr,c1,'mission',s_tr::text,'{"points":100}'::jsonb,'transient');
  perform public.retry_dukjil_wire_failures(10);
  select * into sub from public.group_mission_submissions where id = s_tr;
  if sub.reward_points <> 100 or sub.reward_ledger_id is null then
    raise exception 'C: retry should still pay: % / %', sub.reward_points, sub.reward_ledger_id; end if;

  -- E: waiting for a retry keeps 100 (pending); the retry ends in the normal refusal -> settled to 0 (ok) / stays 100 (fail)
  insert into public.group_mission_submissions(id,mission_id,app_user_id,body,status,reviewed_by,reviewed_at,reward_points)
    values(s_nf,ms,u_nf,'내용','completed',uo,clock_timestamp(),100);
  insert into public.dukjil_wire_failures(wire,app_user_id,celebrity_id,action_key,source_key,params,error_message)
    values('app',u_nf,c1,'mission',s_nf::text,'{"points":100}'::jsonb,'transient');
  if ex = 'ok' then perform public.dukjil_mission_settle_refused(s_nf::text); end if;
  if (select reward_points from public.group_mission_submissions where id = s_nf) <> 100 then
    raise exception 'E: an open failure row must keep the pending value'; end if;
  perform public.retry_dukjil_wire_failures(10);
  select * into sub from public.group_mission_submissions where id = s_nf;
  select count(*) into n from public.dukjil_wire_failures where app_user_id = u_nf and resolved_at is null;
  if n <> 0 or sub.reward_ledger_id is not null then raise exception 'E: refused retry must close the row without a payout (open %, ledger %)', n, sub.reward_ledger_id; end if;
  if (ex = 'ok') <> (sub.reward_points = 0) then raise exception 'E: stored % in mode %', sub.reward_points, ex; end if;

  -- F: scope. Rows that must NOT be settled, then the backfill (ok mode only) settles exactly the refused one.
  insert into public.group_pages(id,kind,celebrity_id,name,status) values(ph,'hobby',null,'취미 시험','published');
  insert into public.group_memberships(page_id,app_user_id,role) values(ph,uo,'owner'),(ph,u_leg,'member');
  insert into public.group_missions(id,page_id,title,instructions,state,reward_points,reward_budget,reward_approved_by) values
    (ms2,pg,'시험 미션 2','안내','published',100,1000,adm),(ms3,ph,'취미 미션','안내','published',100,1000,adm);
  -- b_np: refused (policy effective, creator page, no passport) ; b_pre: approved before the policy ; b_pp: passport but no payout record ;
  -- b_h: page without a creator
  insert into public.group_mission_submissions(id,mission_id,app_user_id,body,status,reviewed_by,reviewed_at,reward_points) values
    (b_np,ms2,u_np,'내용','completed',uo,clock_timestamp(),100),
    (b_pre,ms2,u_nf,'내용','completed',uo,now()-interval '2 hours',100),
    (b_pp,ms2,u_pp,'내용','completed',uo,clock_timestamp(),100),
    (b_h,ms3,u_leg,'내용','completed',uo,clock_timestamp(),100);
  if ex = 'ok' then
    -- the per-row helper refuses all rows that are out of scope
    perform public.dukjil_mission_settle_refused(b_pre::text);
    perform public.dukjil_mission_settle_refused(b_h::text);
    k := public.dukjil_mission_settle_backfill();
  end if;
  select count(*) into n from public.group_mission_submissions where id in (b_pre,b_pp,b_h) and reward_points = 100;
  if n <> 3 then raise exception 'F: pre-policy, passport-without-record and no-creator rows must stay 100, %', n; end if;
  if (select reward_points from public.group_mission_submissions where id = b_np) <> (case when ex = 'ok' then 0 else 100 end) then
    raise exception 'F: refused row must be % in mode %', case when ex = 'ok' then 0 else 100 end, ex; end if;
  -- earnings read of the page without a creator must not show no_reward
  failed := false; st := null;
  begin
    select min(data->>'status') into st from public.group_earning_rows(u_leg, ph);
  exception when others then failed := true;
  end;
  if st = 'no_reward' then raise exception 'F: a page without a creator must not show no_reward'; end if;
end $$;
rollback;
