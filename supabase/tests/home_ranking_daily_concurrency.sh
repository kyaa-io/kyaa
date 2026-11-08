#!/usr/bin/env bash
# Two first readers of the same day at once (20261215010000): one builds, the other waits on the lock and only reads.
# Session A builds day 2099-05-01 inside a transaction that stays open for two seconds; session B asks for the same day meanwhile.
# Uses the caller's PG* environment (local: PGHOST=127.0.0.1 PGPORT=55433 PGUSER=localsuper, database byus). Leaves no rows behind.
set -euo pipefail
DB="${1:-byus}"
AT="2099-05-01 12:00+09"
cleanup() { psql -X -q -d "$DB" -c "delete from public.home_ranking_daily where day = '2099-05-01'; delete from public.home_ranking_builds where day = '2099-05-01';" >/dev/null; }
trap cleanup EXIT
cleanup
out_a=$(mktemp); out_b=$(mktemp)
psql -X -At -d "$DB" -c "begin" -c "select public.ensure_home_rankings('$AT') ->> 'built'" -c "select pg_sleep(2)" -c "commit" > "$out_a" &
pid=$!
sleep 0.5
start=$(date +%s)
psql -X -At -d "$DB" -c "select public.ensure_home_rankings('$AT') ->> 'built'" > "$out_b"
waited=$(( $(date +%s) - start ))
wait "$pid"
a=$(grep -E '^(true|false)$' "$out_a"); b=$(grep -E '^(true|false)$' "$out_b")
builds=$(psql -X -At -d "$DB" -c "select count(*) from public.home_ranking_builds where day = '2099-05-01'")
third=$(psql -X -At -d "$DB" -c "select public.ensure_home_rankings('$AT') ->> 'built'")
rm -f "$out_a" "$out_b"
[ "$a" = "true" ] || { echo "FAIL first reader did not build: $a"; exit 1; }
[ "$b" = "false" ] || { echo "FAIL second reader built again: $b"; exit 1; }
[ "$waited" -ge 1 ] || { echo "FAIL second reader did not wait for the lock (${waited}s)"; exit 1; }
[ "$builds" = "1" ] || { echo "FAIL build marks: $builds"; exit 1; }
[ "$third" = "false" ] || { echo "FAIL a later read built again: $third"; exit 1; }
echo "PASS home ranking daily concurrency (A=$a B=$b waited=${waited}s)"
