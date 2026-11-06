#!/usr/bin/env bash
# A content correction (wallet lock, then stamp row) racing an admin void of the same stamp must not deadlock. One void row either way. Disposable byus_clean only.
set -uo pipefail
P="psql -X -q -v ON_ERROR_STOP=1"
[ "$($P -At -c 'select current_database()')" = "byus_clean" ] || { echo "byus_clean required"; exit 1; }
$P <<'SQL' || exit 1
update public.group_wallet_release set enabled=true,write_fenced=false,legacy_writers_verified=true,migration_evidence_sha256=repeat('b',64),rewards_start_on=current_date;
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values('d3500000-0000-4000-8000-000000000001','void-order','draft','/d.webp',null,'{artist}','idol');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values('d3500000-0000-4000-8000-000000000001','ko','순서','순서','순서'),('d3500000-0000-4000-8000-000000000001','en','Order','Order','Order');
update public.celebrities set status='published' where id='d3500000-0000-4000-8000-000000000001';
update public.dukjil_policy_versions set status='active',effective_from=now()-interval '1 hour',activated_at=now() where version=1 and status<>'active';
insert into public.app_users(id,privy_user_id,verified_email,status) values
  ('d3500000-0000-4000-8000-000000000010','did:privy:void-order-adm','void-order-adm@byus.test','active'),
  ('d3500000-0000-4000-8000-000000000011','did:privy:void-order-u','void-order-u@byus.test','active');
insert into public.admin_allowlist(email,role,active) values('void-order-adm@byus.test','admin',true);
insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type) values('d3500000-0000-4000-8000-000000000011',91342,'0xddddddddddddddddddddddddddddddddddd00071','privy','embedded');
do $fixture$
declare j uuid := extensions.gen_random_uuid(); p uuid := extensions.gen_random_uuid();
begin
  set local session_replication_role = replica;
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload)
    values(j,'passport',p,'void-order-pass',1,jsonb_build_object('recipient','0xddddddddddddddddddddddddddddddddddd00071','celebritySlug','void-order','passportId','0x'||repeat('1',64)));
  insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id) values(p,'d3500000-0000-4000-8000-000000000011','d3500000-0000-4000-8000-000000000001',extensions.gen_random_uuid(),j);
  set local session_replication_role = origin;
end $fixture$;
SQL
ADM='d3500000-0000-4000-8000-000000000010'; U='d3500000-0000-4000-8000-000000000011'; C='d3500000-0000-4000-8000-000000000001'
fail=0
for n in 1 2 3; do
  ERR=$(mktemp)
  S=$($P -At -c "select public.record_dukjil_action('$U','$C','survey','race-$n',md5('race-$n')::uuid,'{}')->>'stampId'")
  ( $P -c "begin; select public.group_wallet_lock('$U'); select pg_sleep(0.6); select public.void_passport_stamp('$U','$S','content_deleted',false,'content:$n'); commit;" >/dev/null 2>>"$ERR" ) &
  sleep 0.2
  OUT=$(mktemp)
  ( $P -At -c "select public.void_passport_stamp('$ADM','$S','admin',false,'admin-$n')" >"$OUT" 2>>"$ERR" ) &
  wait
  # the admin void waited and lost the race: it reports what the winner stored
  saved=$($P -At -c "select point_correction from public.passport_stamp_voids where stamp_id='$S'")
  answered=$($P -At -c "select ('$(cat "$OUT")'::jsonb)->>'pointCorrection'")
  [ "$saved" = "corrected" ] && [ "$answered" = "$saved" ] || { echo "round $n: saved $saved, answered $answered"; fail=1; }
  voids=$($P -At -c "select count(*) from public.passport_stamp_voids where stamp_id='$S'")
  corrections=$($P -At -c "select count(*) from public.dukjil_point_corrections where stamp_id='$S'")
  if grep -q 'deadlock detected' "$ERR" || grep -q ERROR "$ERR" || [ "$voids" != "1" ] || [ "$corrections" != "1" ]; then
    echo "round $n failed: voids=$voids corrections=$corrections $(grep -m1 ERROR "$ERR" | cut -c1-140)"; fail=1
  fi
done
balance=$($P -At -c "select public.group_wallet_balance('$U','fan_point')")
[ "$balance" = "0" ] || { echo "balance $balance, wanted 0"; fail=1; }
[ "$fail" = "0" ] || { echo "void lock order failed"; exit 1; }
echo "void lock order ok (3 rounds: no deadlock, one void and one correction each)"
