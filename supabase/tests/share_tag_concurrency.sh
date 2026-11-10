#!/usr/bin/env bash
# DUKJIL-POLICY ④ concurrency (20261221140000). Disposable clean-chain database only (fixtures are committed). Uses the caller's PG* environment.
#  1. two members send the same post at once (each twice): one live proof, the others answer SHARE_PROOF_URL_REUSED or a replay
#  2. an accepted proof is paid six times at once with one request key: one grant, one ledger row
#  3. the same with a different request key per call (the web's key is fixed, the retry job's differs): still one grant
#  4. two accepts of one pending proof at once, each followed by the payout like the server: one grant
#  5. an accept and a reject of one pending proof at once: one decision wins, a rejected proof is never paid
#  6. a payout whose request failed (accepted, points null) paid by the five-minute retry and the web's retry at once: one grant
set -euo pipefail
P="psql -X -q -v ON_ERROR_STOP=1"
DB=$($P -At -c "select current_database()")
case "$DB" in byus_clean|b3*) ;; *) echo "disposable clean-chain database required (got $DB)"; exit 1;; esac
C=b3e00000-0000-4000-8000-000000000001
ADM=b3e00000-0000-4000-8000-000000000010
AL=b3e00000-0000-4000-8000-000000000020
U() { echo "b3e00000-0000-4000-8000-0000000001$1"; }
$P <<SQL
update public.group_wallet_release set enabled=true,write_fenced=false,legacy_writers_verified=true,migration_evidence_sha256=repeat('b',64),rewards_start_on=current_date;
update public.reward_policy_activation set policy_version = 3 where singleton;
update public.dukjil_policy_versions set status='active',effective_from=now()-interval '2 hours',activated_at=now() where version=1 and status='draft';
update public.dukjil_policy_versions set status='active',effective_from=now()-interval '1 hour',activated_at=now() where version=2 and status='draft';
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values('$C','b3-share-conc','draft','/d.webp',null,'{artist}','idol');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values('$C','ko','b3','b3','b3'),('$C','en','b3','b3','b3');
update public.celebrities set status='published' where id='$C';
insert into public.app_users(id,privy_user_id,verified_email,status) values('$ADM','did:privy:b3e-adm','b3e-adm@byus.test','active');
insert into public.admin_allowlist(id,email,role,active) values('$AL','b3e-adm@byus.test','admin',true);
do \$\$
declare i integer; u uuid; j uuid; p uuid;
begin
  for i in 10..25 loop
    u := ('b3e00000-0000-4000-8000-0000000001' || i)::uuid;
    insert into public.app_users(id,privy_user_id,verified_email,status) values(u,'did:privy:b3e-'||i,'b3e-'||i||'@byus.test','active');
    insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type) values(u,91342,'0xbebebebebebebebebebebebebebebebebebe00'||i,'privy','embedded');
    insert into public.fan_profile_public_fields(app_user_id, favorite_celebrity_id, sns_links) values (u, '$C', '{}');
    j := gen_random_uuid(); p := gen_random_uuid();
    set local session_replication_role = replica;
    insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload) values(j,'passport',p,'b3e-pass-'||p,1,jsonb_build_object('recipient','0xbebebebebebebebebebebebebebebebebebe0010','celebritySlug','b3-share-conc','passportId','0x'||repeat('1',64)));
    insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id) values(p,u,'$C',gen_random_uuid(),j);
    set local session_replication_role = origin;
  end loop;
end \$\$;
SQL
fail() { echo "share tag concurrency failed: $*"; exit 1; }
SUB() { echo "select public.submit_fan_share_proof('$1','$C','x','https://x.com/f/status/$2','x:$2',true)"; }
logs() { $P -At -c "select count(*) from public.dukjil_action_log where action_key='share' and source_key='share-proof:$1'"; }
ledger() { $P -At -c "select count(*) from public.mobile_fan_economy_ledger e join public.dukjil_action_log l on l.ledger_id=e.id where l.action_key='share' and l.source_key='share-proof:$1'"; }
pending() { # member post -> proof id (submit, leave pending)
  $P -At -c "$(SUB "$1" "$2")" | python3 -c "import json,sys; print(json.loads(sys.stdin.read())['id'])"; }
accept() { $P -At -c "select public.review_fan_share_proof('$ADM','$AL','$1',0,'accept',null,array['x'])" >/dev/null; }

# 1. one post, two members, four concurrent submissions
A=$(U 10); B=$(U 11); K=1860000000000000001
OUT=$(mktemp -d)
for m in "$A" "$B" "$A" "$B"; do ($P -At -c "$(SUB "$m" $K)" >"$OUT/ok.$RANDOM" 2>"$OUT/err.$RANDOM" || true) & done
wait
rows=$($P -At -c "select count(*) from public.fan_share_proofs where url_key='x:$K' and status<>'rejected'")
owners=$($P -At -c "select count(distinct app_user_id) from public.fan_share_proofs where url_key='x:$K'")
[ "$rows" = "1" ] && [ "$owners" = "1" ] || fail "1 live rows $rows owners $owners"
reused=$(cat "$OUT"/err.* | grep -c SHARE_PROOF_URL_REUSED || true)
[ "$reused" -ge 1 ] || fail "1 no refusal for the second member"
rm -rf "$OUT"

# 2. one accepted proof, six payouts with one request key
U2=$(U 12); P2=$(pending "$U2" 1860000000000000002); accept "$P2"
RK=$(python3 -c "import uuid;print(uuid.uuid4())")
for i in 1 2 3 4 5 6; do $P -c "select public.pay_fan_share_proof('$U2','$P2','$RK','{\"platform\":\"x\"}')" >/dev/null 2>&1 & done
wait
[ "$(logs "$P2")" = "1" ] && [ "$(ledger "$P2")" = "1" ] || fail "2 grants $(logs "$P2") ledger $(ledger "$P2")"
pts=$($P -At -c "select points from public.fan_share_proofs where id='$P2'")
[ -n "$pts" ] && [ "$pts" -gt 0 ] || fail "2 proof points not kept: '$pts'"

# 3. six payouts with six request keys
U3=$(U 13); P3=$(pending "$U3" 1860000000000000003); accept "$P3"
for i in 1 2 3 4 5 6; do $P -c "select public.pay_fan_share_proof('$U3','$P3',gen_random_uuid(),'{\"platform\":\"x\"}')" >/dev/null 2>&1 & done
wait
[ "$(logs "$P3")" = "1" ] && [ "$(ledger "$P3")" = "1" ] || fail "3 grants $(logs "$P3") ledger $(ledger "$P3")"

RK=$(python3 -c "import uuid;print(uuid.uuid4())")
# 4. two accepts at once, each followed by the payout
U4=$(U 14); P4=$(pending "$U4" 1860000000000000004)
for i in 1 2; do $P -c "select public.review_fan_share_proof('$ADM','$AL','$P4',0,'accept',null,array['x']); select public.pay_fan_share_proof('$U4','$P4','$RK','{\"platform\":\"x\"}')" >/dev/null 2>&1 & done
wait
[ "$($P -At -c "select status from public.fan_share_proofs where id='$P4'")" = "accepted" ] || fail "4 not accepted"
[ "$(logs "$P4")" = "1" ] && [ "$(ledger "$P4")" = "1" ] || fail "4 grants $(logs "$P4") ledger $(ledger "$P4")"

RK=$(python3 -c "import uuid;print(uuid.uuid4())")
# 5. accept and reject at once
U5=$(U 15); P5=$(pending "$U5" 1860000000000000005)
$P -c "select public.review_fan_share_proof('$ADM','$AL','$P5',0,'accept',null,array['x']); select public.pay_fan_share_proof('$U5','$P5','$RK','{\"platform\":\"x\"}')" >/dev/null 2>&1 &
$P -c "select public.review_fan_share_proof('$ADM','$AL','$P5',0,'reject','no_hashtag',array['x'])" >/dev/null 2>&1 &
wait
st=$($P -At -c "select status from public.fan_share_proofs where id='$P5'")
case "$st/$(logs "$P5")" in accepted/1|accepted/0|rejected/0) ;; *) fail "5 ended $st with $(logs "$P5") grants";; esac
if [ "$st" = "accepted" ]; then
  # the reject lost: the proof can still be paid once, never twice
  $P -c "select public.pay_fan_share_proof('$U5','$P5','$RK','{\"platform\":\"x\"}')" >/dev/null 2>&1 || true
  [ "$(logs "$P5")" = "1" ] || fail "5 accepted proof grants $(logs "$P5")"
fi

RK=$(python3 -c "import uuid;print(uuid.uuid4())")
# 6. a failed request (accepted, never paid), the web's retry and the five-minute job at once
U6=$(U 16); P6=$(pending "$U6" 1860000000000000006); accept "$P6"
$P -c "insert into public.dukjil_wire_failures (wire, app_user_id, celebrity_id, action_key, source_key, error_message) values ('server','$U6','$C','share','share-proof:$P6','request died after the accept')" >/dev/null
$P -c "select public.retry_dukjil_wire_failures(500)" >/dev/null 2>&1 &
$P -c "select public.pay_fan_share_proof('$U6','$P6','$RK','{\"platform\":\"x\"}')" >/dev/null 2>&1 &
$P -c "select public.pay_fan_share_proof('$U6','$P6',gen_random_uuid(),'{\"platform\":\"x\"}')" >/dev/null 2>&1 &
wait
[ "$(logs "$P6")" = "1" ] && [ "$(ledger "$P6")" = "1" ] || fail "6 grants $(logs "$P6") ledger $(ledger "$P6")"

$P -c "update public.reward_policy_activation set policy_version = 2 where singleton" >/dev/null
echo "share tag concurrency ok"
