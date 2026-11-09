#!/usr/bin/env bash
# B3 concurrency (plan §10). Disposable clean-chain database only (fixtures are committed). Uses the caller's PG* environment.
#  1. a Claim-shaped heart write (wallet lock held) and a heart conversion of the same member at once: no deadlock, one grant per tier
#  2. eight cheers of one member at once: one 3P
#  3. two approvals of one member on the same KST day at once (different reposts): one 30P
#  4. an approval and a revoke of one repost at once: they run one after the other, the wallet ends consistent
#  5. a heart write and observe_fan_tiers of one member at once: no deadlock, one grant
#  6. an approval and a resubmission of one repost at once: one after the other, one row
set -euo pipefail
P="psql -X -q -v ON_ERROR_STOP=1"
DB=$($P -At -c "select current_database()")
case "$DB" in byus_clean|b3*) ;; *) echo "disposable clean-chain database required (got $DB)"; exit 1;; esac
C=b3c00000-0000-4000-8000-000000000001
ADM=b3c00000-0000-4000-8000-000000000010
AL=b3c00000-0000-4000-8000-000000000020
U() { echo "b3c00000-0000-4000-8000-0000000001$1"; }
$P <<SQL
update public.group_wallet_release set enabled=true,write_fenced=false,legacy_writers_verified=true,migration_evidence_sha256=repeat('b',64),rewards_start_on=current_date;
update public.reward_policy_activation set policy_version = 3 where singleton;
update public.dukjil_policy_versions set status='active',effective_from=now()-interval '2 hours',activated_at=now() where version=1 and status='draft';
update public.dukjil_policy_versions set status='active',effective_from=now()-interval '1 hour',activated_at=now() where version=2 and status='draft';
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values('$C','b3-conc','draft','/d.webp',null,'{artist}','idol');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values('$C','ko','b3','b3','b3'),('$C','en','b3','b3','b3');
update public.celebrities set status='published' where id='$C';
insert into public.app_users(id,privy_user_id,verified_email,status) values('$ADM','did:privy:b3c-adm','b3c-adm@byus.test','active');
insert into public.admin_allowlist(id,email,role,active) values('$AL','b3c-adm@byus.test','admin',true);
do \$\$
declare i integer; u uuid; j uuid; p uuid;
begin
  for i in 10..19 loop
    u := ('b3c00000-0000-4000-8000-0000000001' || i)::uuid;
    insert into public.app_users(id,privy_user_id,verified_email,status) values(u,'did:privy:b3c-'||i,'b3c-'||i||'@byus.test','active');
    insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type) values(u,91342,'0xbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbc00'||i,'privy','embedded');
    insert into public.fan_profile_public_fields(app_user_id, favorite_celebrity_id, sns_links) values (u, '$C', '{}');
    j := gen_random_uuid(); p := gen_random_uuid();
    set local session_replication_role = replica;
    insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload) values(j,'passport',p,'b3c-pass-'||p,1,jsonb_build_object('recipient','0xbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbc0010','celebritySlug','b3-conc','passportId','0x'||repeat('1',64)));
    insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id) values(p,u,'$C',gen_random_uuid(),j);
    set local session_replication_role = origin;
    perform public.dukjil_sync_fan_tier(u, '$C', false);
  end loop;
end \$\$;
SQL
fail() { echo "b3 concurrency failed: $*"; exit 1; }

# 1. Claim-shaped heart write and a conversion
U1=$(U 10)
$P -c "begin; select public.group_wallet_lock('$U1', true); insert into public.creator_heart_ledger(celebrity_id,app_user_id,amount,source_type,source_id) values('$C','$U1',1,'passport_page_claim',gen_random_uuid()); select pg_sleep(1); commit;" >/dev/null &
sleep 0.3
$P -c "insert into public.fan_heart_conversions(app_user_id,celebrity_id,stamps_counted,hearts,remainder,cutoff_at) values('$U1','$C',140,14,0,now())" >/dev/null &
wait
g=$($P -At -c "select string_agg(tier||'/'||status, ',' order by public.fan_tier_rank(tier)) from public.fan_tier_bonus_grants where app_user_id='$U1'")
[ "$g" = "Silver/paid,Gold/paid,Platinum/paid" ] || fail "1 grants $g"

# 2. eight cheers
U2=$(U 11)
for i in 1 2 3 4 5 6 7 8; do $P -c "select public.cheer_dukjil_favorite('$U2')" >/dev/null & done
wait
n=$($P -At -c "select count(*) from public.dukjil_action_log where app_user_id='$U2' and action_key='cheer' and points=3")
l=$($P -At -c "select count(*) from public.mobile_fan_economy_ledger where app_user_id='$U2' and source_type='dukjil_action'")
[ "$n" = "1" ] && [ "$l" = "1" ] || fail "2 cheers paid $n ledger $l"

# 3. two approvals on the same day
U3=$(U 12)
P1=$($P -At -c "select public.submit_fan_insta_repost('$U3','$C','feed','https://www.instagram.com/p/B3concA001/','instagram:B3concA001',null,true)->>'id'")
P2=$($P -At -c "select public.submit_fan_insta_repost('$U3','$C','feed','https://www.instagram.com/p/B3concA002/','instagram:B3concA002',null,true)->>'id'")
$P -c "select public.review_fan_insta_repost('$ADM','$AL','$P1',0,'accept',null)" >/dev/null &
$P -c "select public.review_fan_insta_repost('$ADM','$AL','$P2',0,'accept',null)" >/dev/null &
wait
s=$($P -At -c "select coalesce(sum(points),0)||'/'||count(*) from public.dukjil_action_log where app_user_id='$U3' and action_key='insta_repost'")
[ "$s" = "30/2" ] || fail "3 same-day approvals $s"

# 4. approval and revoke of one repost
U4=$(U 13)
P3=$($P -At -c "select public.submit_fan_insta_repost('$U4','$C','feed','https://www.instagram.com/p/B3concB001/','instagram:B3concB001',null,true)->>'id'")
$P -c "select public.review_fan_insta_repost('$ADM','$AL','$P3',0,'accept',null)" >/dev/null &
$P -c "select public.revoke_fan_share_proof('$ADM','$AL','$P3','b3 concurrency')" >/dev/null 2>&1 &
wait
st=$($P -At -c "select status from public.fan_share_proofs where id='$P3'")
bal=$($P -At -c "select public.group_wallet_balance('$U4','fan_point')")
case "$st/$bal" in accepted/30|revoked/0) ;; *) fail "4 approval/revoke ended $st with $bal";; esac

# 5. heart write and observe
U5=$(U 14)
$P -c "begin; insert into public.creator_heart_ledger(celebrity_id,app_user_id,amount,source_type,source_id) values('$C','$U5',1,'passport_page_claim',gen_random_uuid()); select pg_sleep(1); commit;" >/dev/null &
sleep 0.3
$P -c "select public.observe_fan_tiers('$U5')" >/dev/null &
wait
g=$($P -At -c "select count(*) from public.fan_tier_bonus_grants where app_user_id='$U5' and status='paid'")
h=$($P -At -c "select count(*) from public.fan_tier_history where app_user_id='$U5' and kind='up'")
[ "$g" = "2" ] && [ "$h" = "1" ] || fail "5 grants $g up rows $h"

# 6. approval and resubmission of one repost
U6=$(U 15)
P4=$($P -At -c "select public.submit_fan_insta_repost('$U6','$C','feed','https://www.instagram.com/p/B3concC001/','instagram:B3concC001',null,true)->>'id'")
$P -c "select public.review_fan_insta_repost('$ADM','$AL','$P4',0,'accept',null)" >/dev/null &
$P -c "select public.submit_fan_insta_repost('$U6','$C','feed','https://www.instagram.com/p/B3concC001/','instagram:B3concC001',null,true)" >/dev/null &
wait
r=$($P -At -c "select count(*)||'/'||max(status)||'/'||max(review_revision) from public.fan_share_proofs where app_user_id='$U6'")
[ "$r" = "1/accepted/0" ] || fail "6 approval/resubmit $r"

# the clean-chain script checks the replay's reward policy afterwards
$P -c "update public.reward_policy_activation set policy_version = 2 where singleton" >/dev/null
echo "dukjil b3 concurrency ok"
