-- Shared probe for the Dukjil legacy-owner fix. Run with psql -v expect=fail|ok. Everything rolls back.
-- Calls the payout RPCs as service_role (the role the app's API uses) after the policy is active, while the legacy
-- stamp / score / award functions belong to a role that has no execute right on the policy helper (the AWS layout).
begin;
select set_config('dukjil.expect', :'expect', false);
update public.group_wallet_release set enabled = true, write_fenced = false, legacy_writers_verified = true,
  migration_evidence_sha256 = repeat('b',64), rewards_start_on = current_date;

do $$
declare
  c1 uuid := 'd1200000-0000-4000-8000-000000000001'; u1 uuid := 'd1200000-0000-4000-8000-000000000011';
  expect_mode text := current_setting('dukjil.expect');
  r jsonb; msg text; state text; seen_attend boolean := false; seen_award boolean := false; seen_post boolean := false; rk uuid; rk2 uuid;
begin
  insert into public.celebrities(id,slug,status,image_url,roles,primary_role) values(c1,'dukjil-owner-1','draft','/d.webp','{artist}','idol');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)
    values(c1,'ko','덕질','덕질','덕질'),(c1,'en','Dukjil','Dukjil','Dukjil');
  update public.celebrities set status='published', published_at=coalesce(published_at,clock_timestamp()) where id=c1;
  insert into public.app_users(id,privy_user_id,verified_email,status) values(u1,'did:privy:dukjil-owner','dukjil-owner@byus.test','active');
  -- the welcome-stamp trigger on a new wallet runs the same legacy chain; it is skipped here so the setup is the same in both modes
  set local session_replication_role = replica;
  insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)
    values(u1,91342,'0xdddddddddddddddddddddddddddddddddddd0099','privy','embedded');
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload) values
    ('d1200000-0000-4000-8000-000000000101','passport','d1200000-0000-4000-8000-000000000201','dukjil-owner-fixture',1,
     jsonb_build_object('recipient','0xdddddddddddddddddddddddddddddddddddd0099','celebritySlug','dukjil-owner-1','passportId','0x'||repeat('1',64)));
  insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id) values
    ('d1200000-0000-4000-8000-000000000201',u1,c1,extensions.gen_random_uuid(),'d1200000-0000-4000-8000-000000000101');
  set local session_replication_role = origin;
  update public.dukjil_policy_versions set status='active', effective_from=now()-interval '1 hour', activated_at=now() where version=1;

  rk := extensions.gen_random_uuid(); rk2 := extensions.gen_random_uuid();
  set local role service_role;
  begin
    r := public.attend_creator(u1, c1, rk);
    seen_attend := true;
    if (r->>'points')::int <> 2 then raise exception 'attend result %', r; end if;
  exception when others then
    get stacked diagnostics state = returned_sqlstate;
    msg := sqlerrm;
    if expect_mode = 'ok' or state <> '42501' or msg not like '%dukjil_policy_replaces_earning%' then
      reset role; raise exception 'attend_creator as service_role: % %', state, msg; end if;
  end;
  begin
    r := public.record_dukjil_action(u1, c1, 'post', 'd1200000-0000-4000-8000-000000000301', rk2,
      jsonb_build_object('chars', 40, 'bodyHash', repeat('a',64)));
    seen_post := true;
    if (r->>'points')::int <> 20 or r->>'stampId' is null then raise exception 'post result %', r; end if;
  exception when others then
    get stacked diagnostics state = returned_sqlstate;
    msg := sqlerrm;
    if expect_mode = 'ok' or state <> '42501' or msg not like '%dukjil_policy_replaces_earning%' then
      reset role; raise exception 'record_dukjil_action(post) as service_role: % %', state, msg; end if;
  end;
  reset role;
  begin
    r := public.award_mobile_fan_activity(u1, c1, 'comment', 'x');
    seen_award := true;
    if r->>'status' <> 'not_eligible' then raise exception 'legacy award not frozen: %', r; end if;
  exception when others then
    get stacked diagnostics state = returned_sqlstate;
    msg := sqlerrm;
    if expect_mode = 'ok' or state <> '42501' or msg not like '%dukjil_policy_replaces_earning%' then
      raise exception 'award_mobile_fan_activity (internal definer, owner distinct): % %', state, msg; end if;
  end;
  reset role;
  if (expect_mode = 'ok') <> (seen_attend and seen_award and seen_post) then raise exception 'probe outcome does not match expectation %', expect_mode; end if;
end $$;

-- Failure record under the real owner layout: the table owner (wire functions) is neither superuser nor BYPASSRLS, and the
-- table is FORCE ROW LEVEL SECURITY. UNKNOWN_ACTION is not a normal rejection, so dukjil_wire_award must record it.
do $$
declare
  c1 uuid := 'd1200000-0000-4000-8000-000000000001'; u1 uuid := 'd1200000-0000-4000-8000-000000000011';
  expect_mode text := current_setting('dukjil.expect'); state text; msg text; n integer; a integer;
begin
  begin
    perform public.dukjil_wire_award('probe', u1, c1, 'zzz_unknown', 'wire-src-1', '{}'::jsonb);
    if expect_mode = 'fail' then raise exception 'dukjil_wire_award should be blocked by row level security before the fix'; end if;
  exception when others then
    get stacked diagnostics state = returned_sqlstate;
    msg := sqlerrm;
    if expect_mode = 'ok' or state <> '42501' then raise exception 'dukjil_wire_award failure record: % %', state, msg; end if;
  end;
  if expect_mode = 'ok' then
    select count(*) into n from public.dukjil_wire_failures where app_user_id = u1 and source_key = 'wire-src-1' and resolved_at is null;
    if n <> 1 then raise exception 'dukjil_wire_award did not record the failure (rows %)', n; end if;
  end if;
  -- an open row that the retry cannot see is never retried: attempts must grow only when the owner can read and update it
  insert into public.dukjil_wire_failures(wire, app_user_id, celebrity_id, action_key, source_key, error_message)
    values ('probe', u1, c1, 'zzz_unknown', 'wire-src-2', 'seed');
  perform public.retry_dukjil_wire_failures(10);
  select attempts into a from public.dukjil_wire_failures where source_key = 'wire-src-2';
  if (expect_mode = 'ok') <> (a = 1) then raise exception 'retry_dukjil_wire_failures attempts % in mode %', a, expect_mode; end if;
end $$;
rollback;
