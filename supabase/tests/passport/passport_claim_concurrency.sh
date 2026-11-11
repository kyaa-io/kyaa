#!/usr/bin/env bash
# PASSPORT-RENEWAL contract 9: N parallel Claims of one complete page mint exactly one heart.
# Case A: 8 sessions, 8 different request keys. Case B: 8 sessions, one request key. Disposable byus_clean only.
# Every child's exit status is collected; any child that exits non-zero fails the script even when the ledger count is 1.
# The only expected non-first outcome is the idempotent replay ("replayed": true, exit 0), counted separately from real errors.
# CLAIM_CONCURRENCY_SELFTEST=1 runs only the child collector against synthetic children (no database) to prove a failing child fails it.
set -euo pipefail
P="psql -X -q -v ON_ERROR_STOP=1"

# collect_children <label> <count> <fn>: launches children in the background, stores each $! and waits every pid, so no exit status is lost.
collect_children() {
  local label="$1" count="$2" fn="$3" dir i rc failed=0
  local -a pids=()
  dir=$(mktemp -d)
  for i in $(seq 1 "$count"); do
    "$fn" "$i" >"$dir/$i.out" 2>"$dir/$i.err" &
    pids+=("$!")
  done
  for i in "${!pids[@]}"; do
    rc=0
    wait "${pids[$i]}" || rc=$?
    if [ "$rc" -ne 0 ]; then
      failed=$((failed + 1))
      echo "claim concurrency: $label child $((i + 1)) failed with exit $rc: $(head -c 400 "$dir/$((i + 1)).err")" >&2
    fi
  done
  FIRST_COUNT=$(cat "$dir"/*.out | grep -c '"replayed": false' || true)
  REPLAY_COUNT=$(cat "$dir"/*.out | grep -c '"replayed": true' || true)
  rm -rf "$dir"
  [ "$failed" -eq 0 ]
}

if [ "${CLAIM_CONCURRENCY_SELFTEST:-}" = "1" ]; then
  replay_child() { [ "$1" = 1 ] && echo '{"replayed": false}' || echo '{"replayed": true}'; }
  bad_child() { if [ "$1" = 3 ]; then echo 'ERROR: unexpected sql error' >&2; return 3; fi; echo '{"replayed": true}'; }
  collect_children selftest-ok 4 replay_child 2>/dev/null || { echo "selftest: healthy children must pass"; exit 1; }
  [ "$FIRST_COUNT" = 1 ] && [ "$REPLAY_COUNT" = 3 ] || { echo "selftest: outcome counting wrong"; exit 1; }
  if collect_children selftest-bad 4 bad_child 2>/dev/null; then echo "selftest: a failing child did not fail the collector"; exit 1; fi
  echo "claim concurrency selftest ok (a failing child fails the script)"
  exit 0
fi

[ "$($P -At -c "select current_database() || '|' || case when inet_server_addr() is null then 'local' else 'remote' end")" = "byus_clean|local" ] || { echo "byus_clean required"; exit 1; }
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
claim_a() { $P -At -c "select public.claim_passport_page('$UA','$C',1,'claim-a-$1')"; }
claim_b() { $P -At -c "select public.claim_passport_page('$UB','$C',1,'claim-b-same')"; }
# A: different request keys. B: the same request key. Exactly one child per case mints; the rest must be idempotent replays.
collect_children case-A 8 claim_a || { echo "claim concurrency failed: a case A child errored"; exit 1; }
[ "$FIRST_COUNT" = 1 ] && [ "$REPLAY_COUNT" = 7 ] || { echo "claim concurrency failed case A outcomes first=$FIRST_COUNT replayed=$REPLAY_COUNT"; exit 1; }
collect_children case-B 8 claim_b || { echo "claim concurrency failed: a case B child errored"; exit 1; }
[ "$FIRST_COUNT" = 1 ] && [ "$REPLAY_COUNT" = 7 ] || { echo "claim concurrency failed case B outcomes first=$FIRST_COUNT replayed=$REPLAY_COUNT"; exit 1; }
ha=$($P -At -c "select count(*) from public.creator_heart_ledger where app_user_id='$UA' and celebrity_id='$C' and source_type='passport_page_claim'")
hb=$($P -At -c "select count(*) from public.creator_heart_ledger where app_user_id='$UB' and celebrity_id='$C' and source_type='passport_page_claim'")
ca=$($P -At -c "select count(*) from public.passport_page_claims x join public.fan_passports f on f.id=x.passport_id where f.app_user_id='$UA'")
cb=$($P -At -c "select count(*) from public.passport_page_claims x join public.fan_passports f on f.id=x.passport_id where f.app_user_id='$UB'")
[ "$ha" = "1" ] && [ "$hb" = "1" ] && [ "$ca" = "1" ] && [ "$cb" = "1" ] || { echo "claim concurrency failed hearts a=$ha b=$hb claims a=$ca b=$cb"; exit 1; }
echo "claim concurrency ok (different keys: 1 heart, same key: 1 heart)"
