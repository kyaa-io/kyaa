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

# The committed concurrency fixtures also exercise the real HTTP handlers.
BYUS_SHARE_TAG_DB=1 npm --prefix "$ROOT/apps/web" run test -- --run server/share-proof/share-tag-integration.test.ts --maxWorkers=1

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

# 20261221150000 rollback: the repost submit returns to the B3 body (one key per member), owner and ACL are unchanged, and the migration applies
# again over it. One transaction that rolls back. Run newest first: this one before the 140000 rollback checks above would have.
strip "$ROOT/supabase/rollback/20261221150000_repost_global_url_reuse.sql" > "$TMP/rollback150.sql"
strip "$ROOT/supabase/migrations/20261221150000_repost_global_url_reuse.sql" > "$TMP/apply150.sql"
SIG="public.submit_fan_insta_repost(uuid,uuid,text,text,text,uuid,boolean)"
$P -q -f - <<SQL
begin;
create temp table meta150 as select pg_get_userbyid(proowner) o, coalesce(proacl::text, 'none') a from pg_proc where oid = '$SIG'::regprocedure;
\i $TMP/rollback150.sql
do \$\$ begin
  if pg_get_functiondef('$SIG'::regprocedure) ~ 'SHARE_PROOF_URL_REUSED' then raise exception 'rollback kept the global rule'; end if;
  if (select o || a from meta150) is distinct from (select pg_get_userbyid(proowner) || coalesce(proacl::text, 'none') from pg_proc where oid = '$SIG'::regprocedure) then raise exception 'rollback changed owner or ACL'; end if;
end \$\$;
\i $TMP/apply150.sql
do \$\$ begin
  if pg_get_functiondef('$SIG'::regprocedure) !~ 'SHARE_PROOF_URL_REUSED' then raise exception 're-apply lost the global rule'; end if;
  if (select o || a from meta150) is distinct from (select pg_get_userbyid(proowner) || coalesce(proacl::text, 'none') from pg_proc where oid = '$SIG'::regprocedure) then raise exception 're-apply changed owner or ACL'; end if;
end \$\$;
rollback;
SQL
echo "repost rollback and re-apply ok"
