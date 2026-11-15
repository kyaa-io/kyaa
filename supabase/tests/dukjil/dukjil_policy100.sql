-- Disposable clean-chain upgrade test (all fixtures are rolled back or discarded).
-- BYUS_CLEAN_DB_UPGRADE_MIGRATION=20261227180001_proof_uniform_100_policy.sql
-- BYUS_CLEAN_DB_UPGRADE_BEFORE_FILE=$PWD/supabase/tests/dukjil/dukjil_policy100_before.sql
-- BYUS_CLEAN_DB_UPGRADE_AFTER_FILE=$PWD/supabase/tests/dukjil/dukjil_policy100.sql
-- bash scripts/verify-clean-migration-chain.sh
begin;
update public.group_wallet_release set enabled=true, write_fenced=false, legacy_writers_verified=true, migration_evidence_sha256=repeat('b',64), rewards_start_on=current_date;
update public.reward_policy_activation set policy_version=3 where singleton;
create function pg_temp.mkuser(u uuid, n integer) returns void language plpgsql as $$
begin
  insert into public.app_users(id,privy_user_id,verified_email,status) values(u,'did:privy:b3-'||n,'b3-'||n||'@byus.test','active');
  insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)
    values(u,91342,'0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'||lpad(n::text,4,'0'),'privy','embedded');
end $$;
create function pg_temp.mkpass(u uuid, c uuid) returns uuid language plpgsql as $$
declare j uuid := extensions.gen_random_uuid(); p uuid := extensions.gen_random_uuid();
begin
  -- the blockchain job without its triggers; the passport row with them (zzz_fan_tier_start writes the start row)
  set local session_replication_role = replica;
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload)
    values(j,'passport',p,'b3-pass-'||p,1,jsonb_build_object('recipient','0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb0001','celebritySlug','b3','passportId','0x'||repeat('1',64)));
  insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id) values(p,u,c,extensions.gen_random_uuid(),j);
  set local session_replication_role = origin;
  perform public.dukjil_sync_fan_tier(u, c, false);
  return p;
end $$;
create function pg_temp.mkcel(c uuid, slug text) returns void language plpgsql as $$
begin
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values(c,slug,'draft','/d.webp',null,'{artist}','idol');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values(c,'ko',slug,'b3','b3'),(c,'en',slug,'b3','b3');
  update public.celebrities set status='published' where id=c;
end $$;
do $$
declare old public.dukjil_policy_versions; new public.dukjil_policy_versions;
 u uuid := extensions.gen_random_uuid(); c uuid := extensions.gen_random_uuid(); r jsonb;
begin
 select * into old from public.policy100_test_original;
 select * into new from public.dukjil_policy_versions order by version desc limit 1;
 assert new.status='draft';
 assert new.rules = old.rules #- '{actions,proof,firstPoints}';
 assert new.mission_book = old.mission_book;
 assert new.rules #>> '{actions,proof,points}' = '100';
 assert new.rules #>> '{actions,proof,pointCap,max}' = '2';
 assert (select rules=old.rules from public.dukjil_policy_versions where version=old.version);
 perform pg_temp.mkuser(u, 918);
 perform pg_temp.mkcel(c, 'policy100-test');
 perform pg_temp.mkpass(u,c);
 r := public.record_dukjil_action(u,c,'proof','old-proof',extensions.gen_random_uuid());
 assert (r->>'points')::integer=500;
 perform public.replace_dukjil_policy(new.version);
 assert (select version=old.version from public.dukjil_active_policy());
 assert (select version=new.version from public.dukjil_active_policy(((public.dukjil_kst_date()+1)::timestamp at time zone 'Asia/Seoul')));
 -- Advance the policy reader only inside this rolled-back test transaction.
 execute format('create or replace function public.dukjil_active_policy(p_at timestamptz default clock_timestamp()) returns public.dukjil_policy_versions language sql stable as $f$ select * from public.dukjil_policy_versions where version=%s $f$',new.version);
 assert (select points=500 from public.dukjil_action_log where app_user_id=u and source_key='old-proof');
 u := extensions.gen_random_uuid();
 perform pg_temp.mkuser(u,919);
 perform pg_temp.mkpass(u,c);
 r := public.record_dukjil_action(u,c,'proof','first',extensions.gen_random_uuid());
 assert (r->>'points')::integer=100;
 r := public.record_dukjil_action(u,c,'proof','second',extensions.gen_random_uuid());
 assert (r->>'points')::integer=100;
 r := public.record_dukjil_action(u,c,'proof','third',extensions.gen_random_uuid());
 assert (r->>'points')::integer=0 and (r->>'capped')::boolean;
 raise notice 'POLICY100 PASS: first=100 second=100 third=0 capped; historical=500; effective-only copy and KST activation';
end $$;
rollback;
