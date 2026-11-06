#!/usr/bin/env bash
# Stacking pages under parallel earning. Case A: 8 sessions, one source: one stamp, one slot, one payout. Case B: 12 sessions, 12 sources: 12 slots with no gap
# and no duplicate, running from page 2 into page 3. Disposable byus_clean only.
set -euo pipefail
P="psql -X -q -v ON_ERROR_STOP=1"
[ "$($P -At -c 'select current_database()')" = "byus_clean" ] || { echo "byus_clean required"; exit 1; }
$P <<'SQL'
update public.group_wallet_release set enabled=true,write_fenced=false,legacy_writers_verified=true,migration_evidence_sha256=repeat('b',64),rewards_start_on=current_date;
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values('d3400000-0000-4000-8000-000000000001','stack-conc','draft','/d.webp',null,'{artist}','idol');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values('d3400000-0000-4000-8000-000000000001','ko','동시','동시','동시'),('d3400000-0000-4000-8000-000000000001','en','Conc','Conc','Conc');
update public.celebrities set status='published' where id='d3400000-0000-4000-8000-000000000001';
update public.dukjil_policy_versions set status='active',effective_from=now()-interval '1 hour',activated_at=now() where version=1 and status<>'active';
do $fixture$
declare
  c uuid := 'd3400000-0000-4000-8000-000000000001'; u uuid; p uuid; j uuid; k integer;
begin
  for k in 1..2 loop
    u := ('d3400000-0000-4000-8000-00000000001' || k)::uuid;
    insert into public.app_users(id,privy_user_id,verified_email,status) values(u,'did:privy:stack-conc-'||k,'stack-conc-'||k||'@byus.test','active');
    insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type) values(u,91342,'0xddddddddddddddddddddddddddddddddddd'||lpad((80+k)::text,5,'0'),'privy','embedded');
    set local session_replication_role = replica;
    j := extensions.gen_random_uuid(); p := extensions.gen_random_uuid();
    insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload)
      values(j,'passport',p,'stack-conc-pass-'||k,1,jsonb_build_object('recipient','0xddddddddddddddddddddddddddddddddddd'||lpad((80+k)::text,5,'0'),'celebritySlug','stack-conc','passportId','0x'||repeat('1',64)));
    insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id) values(p,u,c,extensions.gen_random_uuid(),j);
    set local session_replication_role = origin;
  end loop;
end $fixture$;
SQL
UA='d3400000-0000-4000-8000-000000000011'
UB='d3400000-0000-4000-8000-000000000012'
C='d3400000-0000-4000-8000-000000000001'
ERR=$(mktemp)
for i in 1 2 3 4 5 6 7 8; do
  $P -c "select public.record_dukjil_action('$UA','$C','survey','same-source',md5('same-source')::uuid,'{}')" >/dev/null 2>>"$ERR" &
done
wait
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  $P -c "select public.record_dukjil_action('$UB','$C','survey','source-$i',md5('source-$i')::uuid,'{}')" >/dev/null 2>>"$ERR" &
done
wait
slots() { $P -At -c "select count(*) from public.passport_page_slots s join public.fan_passports f on f.id=s.passport_id where f.app_user_id='$1' and s.stamp_id is not null"; }
sa=$(slots "$UA"); sb=$(slots "$UB")
stampa=$($P -At -c "select count(*) from public.community_stamps where app_user_id='$UA' and kind='survey'")
paid_a=$($P -At -c "select public.group_wallet_balance('$UA','fan_point')")
paid_b=$($P -At -c "select public.group_wallet_balance('$UB','fan_point')")
layout=$($P -At -c "select string_agg(page_no||'/'||slot_no, ',' order by page_no, slot_no) from public.passport_page_slots s join public.fan_passports f on f.id=s.passport_id where f.app_user_id='$UB' and s.stamp_id is not null")
want='2/1,2/2,2/3,2/4,2/5,2/6,2/7,2/8,2/9,3/1,3/2,3/3'
[ "$sa" = "1" ] && [ "$stampa" = "1" ] && [ "$paid_a" = "10" ] && [ "$sb" = "12" ] && [ "$paid_b" = "120" ] && [ "$layout" = "$want" ] || { head -c 1500 "$ERR" >&2; echo "stacking concurrency failed: a slots=$sa stamps=$stampa points=$paid_a; b slots=$sb points=$paid_b layout=$layout"; exit 1; }
echo "stacking concurrency ok (one source: 1 slot, 10P; 12 sources: 12 slots in order, 120P)"
