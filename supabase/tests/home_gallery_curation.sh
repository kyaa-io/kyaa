#!/usr/bin/env bash
# Disposable database only: BYUS_CLEAN_DB_SHELL_ASSERTION_FILE=supabase/tests/home_gallery_curation.sh scripts/verify-clean-migration-chain.sh
set -euo pipefail
HOME_GALLERY_SETUP_ONLY=1 source "$(dirname "${BASH_SOURCE[0]}")/home_gallery_shorts.sh"
MIGRATION="$ROOT_DIR/supabase/migrations/20261220120000_home_gallery_curation.sql"
ROLLBACK="$ROOT_DIR/supabase/rollback/20261220120000_home_gallery_curation.sql"
DATA="$ROOT_DIR/docs/ops/dev-gallery-curation/dev-01-gallery-curation.sql"
baseline="$(sq "select public.read_public_home_gallery_photos('ko',0,24)")"
run -f "$ROLLBACK"
eq "$(q "select to_regclass('public.home_gallery_curation') is null")" t 'rollback removes table/FORCE/policies/grants'
eq "$(sq "select public.read_public_home_gallery_photos('ko',0,24)")" "$baseline" 'empty table identical to original read'
run -f "$MIGRATION"
eq "$(sq "select public.read_public_home_gallery_photos('ko',0,24)")" "$baseline" 'reapply empty table identical'
eq "$(q "select relrowsecurity and relforcerowsecurity from pg_class where oid='public.home_gallery_curation'::regclass")" t 'FORCE RLS'
# Helpers deliberately differ from the public read owner, own the forced table,
# and cannot bypass RLS. A SELECT grant without a policy would silently ignore rows.
run <<'SQL'
create role curation_test_owner nologin nosuperuser nobypassrls;
grant usage, create on schema public to curation_test_owner;
alter table public.home_gallery_curation owner to curation_test_owner;
alter function public.home_gallery_curation_hidden(text) owner to curation_test_owner;
alter function public.home_gallery_curation_rank(text) owner to curation_test_owner;
SQL
access_block | run
run -c "insert into public.home_gallery_curation(photo_id,hidden,rank,reason) values ('$ok1:1',true,null,'test hide'),('$ok2:1',false,1,'test rank')"
eq "$(sq "select public.read_public_home_gallery_photos('ko',0,24)->'items'->0->>'id'")" "$ok2:1" 'rank applied through NOBYPASSRLS helper'
eq "$(sq "select count(*) from jsonb_array_elements(public.read_public_home_gallery_photos('ko',0,24)->'items') i where i->>'id'='$ok1:1'")" 0 'hidden applied through NOBYPASSRLS helper'
eq "$(q "select has_table_privilege('curation_test_owner','public.home_gallery_curation','select')")" t 'helper SELECT grant'
for role in anon authenticated service_role; do
  expect_fail 'table ACL' 'permission denied' "set role $role; select * from public.home_gallery_curation"
  expect_fail 'helper ACL' 'permission denied' "set role $role; select public.home_gallery_curation_hidden('$ok1:1')"
done
run -c 'drop policy home_curation_owner_curation_test_owner_r on public.home_gallery_curation'
out="$(check_only_block | psql -X -q -v ON_ERROR_STOP=1 2>&1)" && { echo 'FAIL missing policy accepted'; exit 1; }
[[ "$out" == *HOME_GALLERY_CURATION_OWNER_GAP* ]] || { echo "$out"; exit 1; }
pass OWNER_GAP 'missing policy rejected'
access_block | run
# Check SELECT detection independently of the owner implicit privilege.
run -c "alter table public.home_gallery_curation owner to current_user; revoke select on public.home_gallery_curation from curation_test_owner"
out="$(check_only_block | psql -X -q -v ON_ERROR_STOP=1 2>&1)" && { echo 'FAIL missing grant accepted'; exit 1; }
[[ "$out" == *'lacks select'* ]] || { echo "$out"; exit 1; }
pass OWNER_GAP 'missing SELECT grant rejected'
access_block | run
run -c 'delete from public.home_gallery_curation'
eq "$(sq "select public.read_public_home_gallery_photos('ko',0,24)")" "$baseline" 'cleared table identical'
# Missing production/dev IDs abort BEFORE a backup or any curation writes.
if out="$(psql -X -q -v ON_ERROR_STOP=1 -f "$DATA" 2>&1)"; then echo 'FAIL absent source accepted'; exit 1; fi
[[ "$out" == *DEV_GALLERY_CURATION_MISSING_SOURCE_IDS* ]] || { echo "$out"; exit 1; }
eq "$(q "select count(*) from public.home_gallery_curation")" 0 'missing source atomic abort'
eq "$(q "select to_regclass('public.dev_01_gallery_curation_backup') is null")" t 'missing source creates no backup'
# Same asset, two role aliases: the public read deduplicates one, apply must accept both.
run -c "update public.public_image_role_bindings set asset_id='$AL' where owner_id='$C1' and role='portrait'"
run -c "insert into public.home_gallery_curation(photo_id,hidden,rank,reason,updated_at) values
 ('celebrity:$C1:landscape',true,null,'previous hidden','2026-01-01'),
 ('$ok1:1',false,9,'previous rank','2026-01-02'),('unrelated',true,null,'untouched','2026-01-03')"
prior="$(q 'select jsonb_agg(to_jsonb(c) order by photo_id) from public.home_gallery_curation c')"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
python3 - "$DATA" "$tmp" "$C1" "$ok1" <<'PY'
from pathlib import Path
import sys
src=Path(sys.argv[1]).read_text(); out=Path(sys.argv[2]); creator, notice=sys.argv[3:]
a=src.index('insert into gallery_curation_input values\n'); b=src.index('-- Source candidates',a)
values=f"insert into gallery_curation_input values ('celebrity:{creator}:landscape',false,1,'new rank'),('celebrity:{creator}:portrait',false,1,'alias'),('{notice}:1',true,null,'new hide');\n"
valid=src[:a]+values+src[b:]; (out/'apply.sql').write_text(valid)
(out/'missing.sql').write_text(valid.replace("('celebrity:", "('missing:",1))
undo=src.split('-- UNDO',1)[1].split('\n',1)[1]
(out/'undo.sql').write_text('\n'.join(line[3:] for line in undo.splitlines() if line.startswith('-- ')))
PY
if out="$(psql -X -q -v ON_ERROR_STOP=1 -f "$tmp/missing.sql" 2>&1)"; then echo 'FAIL partial match accepted'; exit 1; fi
[[ "$out" == *DEV_GALLERY_CURATION_MISSING_SOURCE_IDS* ]] || { echo "$out"; exit 1; }
eq "$(q 'select jsonb_agg(to_jsonb(c) order by photo_id) from public.home_gallery_curation c')" "$prior" 'one missing ID aborts entire apply'
run -f "$tmp/apply.sql"
eq "$(q 'select count(*) from public.dev_01_gallery_curation_backup')" 3 'backup includes both deduplicated aliases'
eq "$(q "select hidden || '|' || rank from public.home_gallery_curation where photo_id='celebrity:$C1:portrait'")" 'false|1' 'alias upsert applied'
if psql -X -q -v ON_ERROR_STOP=1 -f "$tmp/apply.sql" >"$tmp/repeat.log" 2>&1; then echo 'FAIL backup overwritten'; exit 1; fi
pass backup 'repeat apply cannot overwrite snapshot'
run -f "$tmp/undo.sql"
eq "$(q 'select jsonb_agg(to_jsonb(c) order by photo_id) from public.home_gallery_curation c')" "$prior" 'UNDO restores previous values/timestamps and removes only inserted rows'
run -f "$ROLLBACK"
run -f "$MIGRATION"
eq "$(q "select relforcerowsecurity and exists(select 1 from pg_policy where polrelid=c.oid) from pg_class c where oid='public.home_gallery_curation'::regclass")" t 'rollback/reapply restores FORCE and owner policy'
echo 'PASS home_gallery_curation: FORCE RLS, helper owner ACL, hide/rank, empty equivalence, source validation, backup/UNDO, rollback/reapply'
