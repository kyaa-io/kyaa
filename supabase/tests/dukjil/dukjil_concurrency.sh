#!/usr/bin/env bash
# N parallel attend_creator calls for one user/creator must create exactly one attendance row.
set -euo pipefail
P="psql -X -q -v ON_ERROR_STOP=1"
$P <<'SQL'
update public.group_wallet_release set enabled=true,write_fenced=false,legacy_writers_verified=true,migration_evidence_sha256=repeat('b',64),rewards_start_on=current_date;
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values('d2200000-0000-4000-8000-000000000001','dukjil-conc','draft','/d.webp',null,'{artist}','idol');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values('d2200000-0000-4000-8000-000000000001','ko','동시','동시','동시'),('d2200000-0000-4000-8000-000000000001','en','Conc','Conc','Conc');
update public.celebrities set status='published' where id='d2200000-0000-4000-8000-000000000001';
insert into public.app_users(id,privy_user_id,verified_email,status) values('d2200000-0000-4000-8000-000000000011','did:privy:dukjil-conc','dukjil-conc@byus.test','active');
insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type) values('d2200000-0000-4000-8000-000000000011',91342,'0xdddddddddddddddddddddddddddddddddddd0099','privy','embedded');
begin; set local session_replication_role = replica;
insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload) values('d2200000-0000-4000-8000-000000000101','passport','d2200000-0000-4000-8000-000000000201','dukjil-conc-1',1,jsonb_build_object('recipient','0xdddddddddddddddddddddddddddddddddddd0099','celebritySlug','dukjil-conc','passportId','0x'||repeat('1',64)));
insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id) values('d2200000-0000-4000-8000-000000000201','d2200000-0000-4000-8000-000000000011','d2200000-0000-4000-8000-000000000001',gen_random_uuid(),'d2200000-0000-4000-8000-000000000101');
commit;
update public.dukjil_policy_versions set status='active',effective_from=now()-interval '1 hour',activated_at=now() where version=1;
SQL
for i in 1 2 3 4 5 6 7 8; do
  $P -c "select public.attend_creator('d2200000-0000-4000-8000-000000000011','d2200000-0000-4000-8000-000000000001',gen_random_uuid())" >/dev/null &
done
wait
rows=$($P -At -c "select count(*) from public.group_creator_attendance where app_user_id='d2200000-0000-4000-8000-000000000011'")
paid=$($P -At -c "select count(*) from public.mobile_fan_economy_ledger where app_user_id='d2200000-0000-4000-8000-000000000011' and source_type='dukjil_action'")
[ "$rows" = "1" ] && [ "$paid" = "1" ] || { echo "concurrency failed rows=$rows paid=$paid"; exit 1; }
# wire: 8 parallel identical share awards (plus a held user lock) pay once and never raise
for i in 1 2 3 4 5 6 7 8; do
  $P -c "select public.dukjil_wire_award('conc','d2200000-0000-4000-8000-000000000011','d2200000-0000-4000-8000-000000000001','share','d2200000-0000-4000-8000-000000000001:wire')" >/dev/null &
done
wait
wpaid=$($P -At -c "select count(*) from public.dukjil_action_log where app_user_id='d2200000-0000-4000-8000-000000000011' and action_key='share'")
wfail=$($P -At -c "select count(*) from public.dukjil_wire_failures where wire='conc' and error_message not like '%DUKJIL_WIRE_LOCK_BUSY%'")
[ "$wpaid" = "1" ] && [ "$wfail" = "0" ] || { echo "wire concurrency failed paid=$wpaid failures=$wfail"; exit 1; }
# busy lock: a held user lock is skipped (logged), the caller returns, nothing is paid
$P -c "begin; select pg_advisory_xact_lock(hashtextextended('fan-web-user:d2200000-0000-4000-8000-000000000011',0)); select pg_sleep(2); commit;" >/dev/null &
sleep 0.5
$P -c "select public.dukjil_wire_award('busy','d2200000-0000-4000-8000-000000000011','d2200000-0000-4000-8000-000000000001','share','d2200000-0000-4000-8000-000000000001:busy')" >/dev/null
wait
busy=$($P -At -c "select count(*) from public.dukjil_wire_failures where wire='busy' and error_message like '%DUKJIL_WIRE_LOCK_BUSY%'")
[ "$busy" = "1" ] || { echo "busy lock not recorded: $busy"; exit 1; }
$P -At -c "select public.retry_dukjil_wire_failures()" >/dev/null
echo "dukjil concurrency ok"
