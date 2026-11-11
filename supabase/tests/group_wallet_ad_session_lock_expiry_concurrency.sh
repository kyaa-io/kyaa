#!/usr/bin/env bash
# Rewarded-ad exchange vs group_wallet_lock: connection A holds the owner's wallet lock while connection B calls
# exchange_owned_group_wallet with an ad session. After A releases, B's expiry decision must be made against the time the
# exchange actually runs (inside the lock), never against a time sampled before waiting for the lock.
#   case 1 control: long-lived session, B waits for A, then exchanges exactly once.
#   case 2 near expiry: the session is still valid when B is called but expires while B waits -> B must be refused with
#          GROUP_WALLET_AD_SESSION_INVALID, the session must stay unconsumed and no ledger row may be written.
#   case 3 double spend: two callers with different request keys race for one session -> one exchange, one debit.
# Disposable Unix-socket byus_clean only (same guard as the other group wallet concurrency scripts).
set -euo pipefail
P="psql -X -q -v ON_ERROR_STOP=1"
$P <<'SQL' >/dev/null
do $$begin if current_database()<>'byus_clean'or inet_server_addr()is not null then raise exception 'Disposable Unixsocket byus_clean required';end if;end $$;
SQL
U='e9300000-0000-4000-8000-000000000001'
$P <<SQL >/dev/null
insert into public.app_users(id,privy_user_id,verified_email)values('$U','did:privy:wallet-ad-lock','wallet-ad-lock@example.test');
update public.group_wallet_release set enabled=true,write_fenced=false,legacy_writers_verified=true,migration_evidence_sha256=repeat('b',64),rewards_start_on=current_date;
select public.group_wallet_post('$U','fan_point',1000,'group_exchange','e9300000-0000-4000-8000-0000000000f0');
SQL
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
fail() { echo "FAIL $1" >&2; for f in "$work"/*.log; do [ -f "$f" ] && { echo "--- $f" >&2; cat "$f" >&2; }; done; exit 1; }
new_session() { # <expires_in_seconds> -> session id, granted and not yet consumed
  $P -At <<SQL
insert into public.group_wallet_ad_sessions(app_user_id,issued_at,expires_at,shown_at,granted_at)
values('$U',clock_timestamp()-interval '10 seconds',clock_timestamp()+make_interval(secs=>$1),clock_timestamp()-interval '9 seconds',clock_timestamp()-interval '5 seconds')returning id;
SQL
}
hold_lock() { # <hold_seconds>: connection A takes the wallet lock, signals, holds, releases
  $P >"$work/a.log" 2>&1 <<SQL &
begin;
select public.group_wallet_lock('$U');
\\! touch "$work/a.locked"
select pg_sleep($1);
commit;
SQL
  HOLD_PID=$!
  for _ in $(seq 1 100); do [ -f "$work/a.locked" ] && return 0; sleep 0.1; done
  fail "connection A never acquired the wallet lock"
}
exchange() { # <session> <request_key> <logname>: connection B; prints PRE_EXPIRY=t|f then OK or the error
  $P -At >"$work/$3.log" 2>&1 <<SQL
select 'PRE_EXPIRY='||case when clock_timestamp()<(select expires_at from public.group_wallet_ad_sessions where id='$1') then 't' else 'f' end;
select 'OK '||(public.exchange_owned_group_wallet('$U','$2','group-wallet-v1','ticket',1,'$1',5)->>'pointsSpent');
SQL
}
points() { $P -At -c "select public.group_wallet_balance('$U','fan_point')"; }
consumed() { $P -At -c "select consumed_at is not null from public.group_wallet_ad_sessions where id='$1'"; }

# case 1 control
S1=$(new_session 600); K1=e9300000-0000-4000-8000-0000000000a1
before=$(points)
rm -f "$work/a.locked"; hold_lock 2
exchange "$S1" "$K1" b1 & BPID=$!
wait "$HOLD_PID" || fail "case 1 connection A failed"
wait "$BPID" || fail "case 1 connection B failed"
grep -q '^OK 100$' "$work/b1.log" || fail "case 1 valid session was not exchanged"
[ "$(consumed "$S1")" = t ] && [ "$(points)" = "$((before - 100))" ] || fail "case 1 expected one consumed session and one 100 point debit"

# case 2 near expiry: valid when B is called (checked inside B), expired when A releases
S2=$(new_session 2); K2=e9300000-0000-4000-8000-0000000000a2
before=$(points)
rm -f "$work/a.locked"; hold_lock 4
exchange "$S2" "$K2" b2 & BPID=$!
wait "$HOLD_PID" || fail "case 2 connection A failed"
b2=0; wait "$BPID" || b2=$?
grep -q '^PRE_EXPIRY=t$' "$work/b2.log" || fail "case 2 inconclusive: the session had already expired before B ran (slow host?)"
[ "$($P -At -c "select clock_timestamp()>expires_at from public.group_wallet_ad_sessions where id='$S2'")" = t ] || fail "case 2 inconclusive: session did not expire during the lock wait"
if [ "$b2" = 0 ] || ! grep -q 'GROUP_WALLET_AD_SESSION_INVALID' "$work/b2.log"; then
  fail "case 2 an ad session that expired during the wallet lock wait was exchanged (expiry decided before the lock was held); exit=$b2"
fi
[ "$(consumed "$S2")" = f ] || fail "case 2 failed exchange consumed the session"
[ "$(points)" = "$before" ] || fail "case 2 failed exchange changed the point balance"
[ "$($P -At -c "select count(*) from public.group_wallet_receipts where app_user_id='$U' and request_key='$K2'")" = 0 ] || fail "case 2 failed exchange left a receipt"

# case 3 double spend: two different request keys, one session, behind the same lock
S3=$(new_session 600); K3=e9300000-0000-4000-8000-0000000000a3; K4=e9300000-0000-4000-8000-0000000000a4
before=$(points)
rm -f "$work/a.locked"; hold_lock 2
exchange "$S3" "$K3" b3 & P3=$!
exchange "$S3" "$K4" b4 & P4=$!
wait "$HOLD_PID" || fail "case 3 connection A failed"
r3=0; r4=0; wait "$P3" || r3=$?; wait "$P4" || r4=$?
ok=$(cat "$work/b3.log" "$work/b4.log" | grep -c '^OK 100$' || true)
bad=$(cat "$work/b3.log" "$work/b4.log" | grep -c 'GROUP_WALLET_AD_SESSION_INVALID' || true)
[ "$ok" = 1 ] && [ "$bad" = 1 ] || fail "case 3 expected exactly one exchange and one AD_SESSION_INVALID, got ok=$ok invalid=$bad"
[ "$(points)" = "$((before - 100))" ] || fail "case 3 double spend: balance moved by more than one exchange"

echo "group wallet ad session lock/expiry concurrency ok"
