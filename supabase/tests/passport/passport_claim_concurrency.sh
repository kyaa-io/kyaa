#!/usr/bin/env bash
# PASSPORT-RENEWAL contract 9: N parallel Claims of one complete page mint exactly one heart.
# Case A: 8 sessions, 8 different request keys. Case B: 8 sessions, one request key. Disposable byus_clean only.
set -euo pipefail
P="psql -X -q -v ON_ERROR_STOP=1"
[ "$($P -At -c 'select current_database()')" = "byus_clean" ] || { echo "byus_clean required"; exit 1; }
$P <<'SQL'
update public.group_wallet_release set enabled=true,write_fenced=false,legacy_writers_verified=true,migration_evidence_sha256=repeat('b',64),rewards_start_on=current_date;
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values('d3300000-0000-4000-8000-000000000001','claim-conc','draft','/d.webp',null,'{artist}','idol');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values('d3300000-0000-4000-8000-000000000001','ko','동시','동시','동시'),('d3300000-0000-4000-8000-000000000001','en','Conc','Conc','Conc');
update public.celebrities set status='published' where id='d3300000-0000-4000-8000-000000000001';
update public.dukjil_policy_versions set status='active',effective_from=now()-interval '1 hour',activated_at=now() where version=1;
do $fixture$
declare
  c uuid := 'd3300000-0000-4000-8000-000000000001'; u uuid; p uuid; j uuid; s uuid; n integer; k integer;
begin
  for k in 1..2 loop
    u := ('d3300000-0000-4000-8000-00000000001' || k)::uuid;
    insert into public.app_users(id,privy_user_id,verified_email,status) values(u,'did:privy:claim-conc-'||k,'claim-conc-'||k||'@byus.test','active');
    insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type) values(u,91342,'0xddddddddddddddddddddddddddddddddddd'||lpad((90+k)::text,5,'0'),'privy','embedded');
    set local session_replication_role = replica;
    j := extensions.gen_random_uuid(); p := extensions.gen_random_uuid();
    insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload)
      values(j,'passport',p,'claim-conc-pass-'||k,1,jsonb_build_object('recipient','0xddddddddddddddddddddddddddddddddddd'||lpad((90+k)::text,5,'0'),'celebritySlug','claim-conc','passportId','0x'||repeat('1',64)));
    insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id) values(p,u,c,extensions.gen_random_uuid(),j);
    for n in 1..9 loop
      j := extensions.gen_random_uuid(); s := extensions.gen_random_uuid();
      insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload) values(j,'community_stamp',s,'claim-conc-stamp-'||k||'-'||n,1,'{}'::jsonb);
      insert into public.community_stamps(id,app_user_id,celebrity_id,kind,source_key,issued_at,blockchain_job_id)
        values(s,u,c,(case when n = 9 then 'proof' else 'quiz' end)::public.community_stamp_kind,'claim-conc-'||k||'-'||n,now() - interval '3 days',j);
      insert into public.passport_page_slots(passport_id,page_no,slot_no,stamp_id,assigned_at) values(p,1,n,s,now());
    end loop;
    set local session_replication_role = origin;
  end loop;
end $fixture$;
SQL
UA='d3300000-0000-4000-8000-000000000011'
UB='d3300000-0000-4000-8000-000000000012'
C='d3300000-0000-4000-8000-000000000001'
ERR=$(mktemp)
# A: different request keys
for i in 1 2 3 4 5 6 7 8; do
  $P -c "select public.claim_passport_page('$UA','$C',1,'claim-a-$i')" >/dev/null 2>>"$ERR" &
done
wait
# B: the same request key
for i in 1 2 3 4 5 6 7 8; do
  $P -c "select public.claim_passport_page('$UB','$C',1,'claim-b-same')" >/dev/null 2>>"$ERR" &
done
wait
ha=$($P -At -c "select count(*) from public.creator_heart_ledger where app_user_id='$UA' and celebrity_id='$C' and source_type='passport_page_claim'")
hb=$($P -At -c "select count(*) from public.creator_heart_ledger where app_user_id='$UB' and celebrity_id='$C' and source_type='passport_page_claim'")
ca=$($P -At -c "select count(*) from public.passport_page_claims x join public.fan_passports f on f.id=x.passport_id where f.app_user_id='$UA'")
cb=$($P -At -c "select count(*) from public.passport_page_claims x join public.fan_passports f on f.id=x.passport_id where f.app_user_id='$UB'")
[ "$ha" = "1" ] && [ "$hb" = "1" ] && [ "$ca" = "1" ] && [ "$cb" = "1" ] || { head -c 1500 "$ERR" >&2; echo "claim concurrency failed hearts a=$ha b=$hb claims a=$ca b=$cb"; exit 1; }
echo "claim concurrency ok (different keys: 1 heart, same key: 1 heart)"
