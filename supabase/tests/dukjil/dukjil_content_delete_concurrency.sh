#!/usr/bin/env bash
# N parallel remove_fan_post calls for one post with a paid grant must correct exactly once.
# Disposable byus_clean DB only. NOT RUN by the author.
set -euo pipefail
P="psql -X -q -v ON_ERROR_STOP=1"
C=d9200000-0000-4000-8000-000000000001
U=d9200000-0000-4000-8000-000000000011
POST=d9200000-0000-4000-8000-0000000000a1
$P <<SQL
update public.group_wallet_release set enabled=true,write_fenced=false,legacy_writers_verified=true,migration_evidence_sha256=repeat('b',64),rewards_start_on=current_date;
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values('$C','cdel-conc','draft','/d.webp',null,'{artist}','idol');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values('$C','ko','동시','동시','동시'),('$C','en','Conc','Conc','Conc');
update public.celebrities set status='published' where id='$C';
insert into public.app_users(id,privy_user_id,verified_email,status) values('$U','did:privy:cdel-conc','cdel-conc@byus.test','active');
insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type) values('$U',91342,'0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee0099','privy','embedded');
insert into public.fan_posts(id,celebrity_id,app_user_id,body,idempotency_key,create_request_hash) values('$POST','$C','$U','cdel conc body',gen_random_uuid(),'h');
insert into public.dukjil_action_log(app_user_id,celebrity_id,action_key,source_key,request_key,points,ledger_id,capped,reason,policy_version,kst_date)
  select '$U','$C','post','$POST',gen_random_uuid(),20,public.group_wallet_post('$U','fan_point',20::bigint,'dukjil_action',gen_random_uuid()),true,'STAMP_CAP',1,public.dukjil_kst_date();
SQL
for i in 1 2 3 4 5 6 7 8; do
  $P -c "select public.remove_fan_post('$U','$POST')" >/dev/null &
done
wait
rows=$($P -At -c "select count(*) from public.dukjil_point_corrections c join public.dukjil_action_log l on l.id=c.action_log_id where l.source_key='$POST'")
neg=$($P -At -c "select count(*) from public.mobile_fan_economy_ledger where app_user_id='$U' and source_type='dukjil_correction'")
bal=$($P -At -c "select public.group_wallet_balance('$U','fan_point')")
[ "$rows" = "1" ] && [ "$neg" = "1" ] && [ "$bal" = "0" ] || { echo "content delete concurrency failed rows=$rows neg=$neg balance=$bal"; exit 1; }
echo "ok"
