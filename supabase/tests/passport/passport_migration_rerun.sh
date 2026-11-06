#!/usr/bin/env bash
# Section 15 migrations applied a second time, as the ledger's psql -1 does: each must fail and leave the functions as they were. Disposable byus_clean only.
set -uo pipefail
P="psql -X -q -v ON_ERROR_STOP=1"
[ "$($P -At -c 'select current_database()')" = "byus_clean" ] || { echo "byus_clean required"; exit 1; }
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS="$HERE/../../migrations"
BODIES="select md5(string_agg(p.oid::regprocedure::text || pg_get_functiondef(p.oid), '' order by p.oid::regprocedure::text)) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and (p.proname like 'dukjil%' or p.proname like 'passport%' or p.proname in ('void_passport_stamp', 'get_owned_community_stamps_legacy_projection', 'read_owned_mobile_profile', 'read_owned_mobile_passport_public_stamp_count', 'read_shared_passport_activity', 'retry_dukjil_wire_failures'))"
fail=0
for f in 20261211110000_void_sanction_on_voided_stamp 20261211120000_passport_stacking_pages 20261211130000_event_operator_attendance_no_reward 20261211140000_void_review_followups 20261211150000_event_operator_failure_recording 20261211160000_event_failure_resolution; do
  before=$($P -At -c "$BODIES")
  ERR=$(mktemp)
  if $P -1 -f "$MIGRATIONS/$f.sql" >/dev/null 2>"$ERR"; then
    echo "$f: a second run succeeded"; fail=1
  fi
  after=$($P -At -c "$BODIES")
  [ "$before" = "$after" ] || { echo "$f: a second run changed the functions"; fail=1; }
  echo "$f: $(grep -m1 ERROR "$ERR" | sed 's/.*ERROR: *//' | cut -c1-90)"
done
old=$($P -At -c "select count(*) from pg_proc where proname = 'dukjil_event_operator_attendance'")
[ "$old" = "0" ] || { echo "the old operator check came back"; fail=1; }
[ "$fail" = "0" ] || { echo "migration rerun failed"; exit 1; }
echo "migration rerun ok (six files refused, functions unchanged)"
