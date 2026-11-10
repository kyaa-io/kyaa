#!/usr/bin/env bash
# DUKJIL-POLICY ④ clean-chain suite (20261221140000). The concurrency script commits the fixtures (members with passports, an admin, a
# creator) that the SQL tests read, so it runs first. Uses the caller's PG* environment.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
P="psql -X -v ON_ERROR_STOP=1"
bash "$ROOT/supabase/tests/share_tag_concurrency.sh"
$P -f "$ROOT/supabase/tests/share_proofs.sql"
$P -f "$ROOT/supabase/tests/share_tag_review.sql"
$P -f "$ROOT/supabase/tests/share_tag_cross_path.sql"
bash "$ROOT/supabase/tests/share_tag_nonsuper_apply.sh"

# 20261221130000 rollback: the function returns to cumulative counting (a gap no longer blocks), its owner and ACL are unchanged, and the
# migration applies again over it. Runs in one transaction that rolls back.
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
strip() { grep -v -x -e 'begin;' -e 'commit;' "$1"; }
strip "$ROOT/supabase/rollback/20261221130000_passport_steady_consecutive.sql" > "$TMP/rollback.sql"
strip "$ROOT/supabase/migrations/20261221130000_passport_steady_consecutive.sql" > "$TMP/apply.sql"
$P -q -f - <<SQL
begin;
create temp table meta_before as select pg_get_userbyid(proowner) o, proacl::text a from pg_proc where oid = 'public.passport_issue_steady_checkin(uuid,uuid)'::regprocedure;
\i $TMP/rollback.sql
do \$\$ begin
  if pg_get_functiondef('public.passport_issue_steady_checkin(uuid,uuid)'::regprocedure) ~ 'dukjil_kst_date' then raise exception 'rollback kept the consecutive rule'; end if;
  if (select o || a from meta_before) is distinct from (select pg_get_userbyid(proowner) || proacl::text from pg_proc where oid = 'public.passport_issue_steady_checkin(uuid,uuid)'::regprocedure) then raise exception 'rollback changed owner or ACL'; end if;
end \$\$;
\i $TMP/apply.sql
do \$\$ begin
  if pg_get_functiondef('public.passport_issue_steady_checkin(uuid,uuid)'::regprocedure) !~ 'dukjil_kst_date' then raise exception 're-apply lost the consecutive rule'; end if;
  if (select o || a from meta_before) is distinct from (select pg_get_userbyid(proowner) || proacl::text from pg_proc where oid = 'public.passport_issue_steady_checkin(uuid,uuid)'::regprocedure) then raise exception 're-apply changed owner or ACL'; end if;
end \$\$;
rollback;
SQL
echo "steady rollback and re-apply ok"
