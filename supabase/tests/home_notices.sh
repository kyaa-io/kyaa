#!/usr/bin/env bash
# Home notices (20261220021000) on the disposable replay database:
#   BYUS_CLEAN_DB_SHELL_ASSERTION_FILE=supabase/tests/home_notices.sh TMPDIR=/tmp scripts/verify-clean-migration-chain.sh
# Numbered checks follow plan 4th edition §8.1 for N1. Ends with the rollback of both N1 migrations and a re-apply.
set -euo pipefail
trap 'echo "FAIL at line $LINENO: $BASH_COMMAND" >&2' ERR
if [[ "${PGDATABASE:-}" != "byus_clean" || "${PGHOST:-}" != /*/byus-clean-db.*/socket || ! -d "$PGHOST" ]]; then
  echo 'Home notice checks require the disposable local replay socket' >&2; exit 1
fi
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATION="$ROOT_DIR/supabase/migrations/20261220021000_home_notices.sql"
q() { psql -X -Atq -v ON_ERROR_STOP=1 -c "$1"; }
run() { psql -X -q -v ON_ERROR_STOP=1 "$@" >/dev/null; }
pass() { echo "PASS N1-$1 $2"; }
expect_fail() { # number, pattern, sql
  local out
  if out="$(psql -X -Atq -v ON_ERROR_STOP=1 -c "$3" 2>&1)"; then echo "FAIL N1-$1 expected error /$2/, got success: $out" >&2; exit 1; fi
  grep -Eq "$2" <<<"$out" || { echo "FAIL N1-$1 expected /$2/, got: $out" >&2; exit 1; }
  pass "$1" "refused: $2"
}
access_block() { awk '/^do \$access\$/{on=1} on{print} /^\$access\$;/{on=0}' "$MIGRATION"; }
# 20261220021500 (linked fan page) replaces the reads with ones that call its helpers, so its block runs after the N1 block when present.
LINK_MIGRATION="$ROOT_DIR/supabase/migrations/20261220021500_home_notice_linked_page.sql"
link_block() { [[ -f "$LINK_MIGRATION" ]] && awk '/^do \$access\$/{on=1} on{print} /^\$access\$;/{on=0}' "$LINK_MIGRATION" || true; }
check_only_block() { access_block | awk '/^begin$/&&!b{print;b=1;skip=1;next} /-- checks:/{skip=0} !skip{print}'; }

actor='97000000-0000-4000-8000-000000000001'; allow='97000000-0000-4000-8000-000000000002'
viewer='97000000-0000-4000-8000-000000000003'; viewer_allow='97000000-0000-4000-8000-000000000004'
stranger='97000000-0000-4000-8000-000000000005'
run <<SQL
insert into public.app_users(id,privy_user_id,verified_email,status) values
 ('$actor','did:privy:r8data-n1-admin','r8data-n1-admin@example.invalid','active'),
 ('$viewer','did:privy:r8data-n1-viewer','r8data-n1-viewer@example.invalid','active'),
 ('$stranger','did:privy:r8data-n1-stranger','r8data-n1-stranger@example.invalid','active');
insert into public.admin_allowlist(id,email,role,active) values
 ('$allow','r8data-n1-admin@example.invalid','admin',true),
 ('$viewer_allow','r8data-n1-viewer@example.invalid','viewer',true);
SQL
doc() { printf '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"%s"}]}]}' "$1"; }
empty='{"type":"doc","content":[{"type":"paragraph"}]}'
save() { # id-or-null rev slug category pinned title_ko body_ko title_en body_en
  q "set role service_role; select public.save_admin_home_notice('$actor','$allow',gen_random_uuid(),$1,$2,'$3','$4',$5,'$6','$7','$8','$9')"
}
state() { q "set role service_role; select public.set_admin_home_notice_state('$actor','$allow',gen_random_uuid(),'$1',$2,'$3',$4)"; }

# 1. anon and authenticated cannot touch the tables or functions; service_role cannot read the tables directly.
for role in anon authenticated service_role; do
  expect_fail 1 'permission denied' "set role $role; select count(*) from public.home_notices"
done
for role in anon authenticated; do
  expect_fail 1 'permission denied' "set role $role; select public.read_public_home_notices('ko')"
  expect_fail 1 'permission denied' "set role $role; select public.list_admin_home_notices('$actor','$allow')"
done
# 2. writes need an active admin with write rights; a viewer admin and a user without an allowlist row are refused.
expect_fail 2 'admin|permission|forbidden|Admin' "set role service_role; select public.save_admin_home_notice('$viewer','$viewer_allow',gen_random_uuid(),null,null,'r8data-v','guide',false,'t','$(doc x)','t','$(doc x)')"
expect_fail 2 'admin|permission|forbidden|Admin' "set role service_role; select public.save_admin_home_notice('$stranger','$allow',gen_random_uuid(),null,null,'r8data-s','guide',false,'t','$(doc x)','t','$(doc x)')"
[[ "$(q 'select count(*) from public.home_notices')" == 0 ]]; pass 2 'no row after refused writes'

# 3. save, en empty body cannot be published, category check, slug check.
a="$(save null null r8data-a guide false '안내 A' "$(doc 본문A)" 'Notice A' "$(doc bodyA)")"
expect_fail 3 'home_notices_category_check|violates check' "set role service_role; select public.save_admin_home_notice('$actor','$allow',gen_random_uuid(),null,null,'r8data-x','news',false,'t','$(doc x)','t','$(doc x)')"
expect_fail 3 'slug|violates check' "set role service_role; select public.save_admin_home_notice('$actor','$allow',gen_random_uuid(),null,null,'R8 bad','guide',false,'t','$(doc x)','t','$(doc x)')"
b="$(save null null r8data-b event true '안내 B' "$(doc 본문B)" 'Notice B' "$empty")"
expect_fail 3 'complete ko and en' "set role service_role; select public.set_admin_home_notice_state('$actor','$allow',gen_random_uuid(),'$b',1,'publish',null)"
# 4. revision conflict, publish, published notice is immutable.
# Exact SQL texts the admin route maps (SLUG_TAKEN 409, NOT_FOUND 404).
expect_fail 4 'duplicate key value violates unique constraint "home_notices_slug_key"' "set role service_role; select public.save_admin_home_notice('$actor','$allow',gen_random_uuid(),null,null,'r8data-a','guide',false,'t','$(doc x)','t','$(doc x)')"
expect_fail 4 'home notice not found' "set role service_role; select public.set_admin_home_notice_state('$actor','$allow',gen_random_uuid(),gen_random_uuid(),1,'publish',null)"
expect_fail 4 'revision conflict' "set role service_role; select public.save_admin_home_notice('$actor','$allow',gen_random_uuid(),'$a',7,'r8data-a','guide',false,'t','$(doc x)','t','$(doc x)')"
state "$a" 1 publish null >/dev/null
expect_fail 4 'immutable' "set role service_role; select public.save_admin_home_notice('$actor','$allow',gen_random_uuid(),'$a',2,'r8data-a','guide',false,'t','$(doc x)','t','$(doc x)')"
pass 4 'publish ok, published edit refused'
# 5. archive reason 9 characters and NULL are refused; archive leaves a draft; NULL reason at table level violates the check.
expect_fail 5 'archive reason required' "set role service_role; select public.set_admin_home_notice_state('$actor','$allow',gen_random_uuid(),'$b',1,'archive','123456789')"
expect_fail 5 'archive reason required' "set role service_role; select public.set_admin_home_notice_state('$actor','$allow',gen_random_uuid(),'$b',1,'archive',null)"
state "$b" 1 archive "'r8data archive test'" >/dev/null
[[ "$(q "select publication_status||'|'||(archived_at is not null) from public.home_notices where id='$b'")" == 'draft|true' ]]; pass 5 'archived row is draft'
expect_fail 5 'home_notices_archive_shape' "update public.home_notices set archive_reason=null where id='$b'"
expect_fail 5 'home_notices_archive_shape' "update public.home_notices set publication_status='published', published_at=now() where id='$b'"
expect_fail 5 'archived' "set role service_role; select public.set_admin_home_notice_state('$actor','$allow',gen_random_uuid(),'$b',2,'publish',null)"

# 6. public list: pinned first then newest, keyset cursor, limit 1..20, en localization, single read, unpublished hidden.
c="$(save null null r8data-c update true '고정 C' "$(doc 본문C)" 'Pinned C' "$(doc bodyC)")"; state "$c" 1 publish null >/dev/null
d="$(save null null r8data-d creator false '최신 D' "$(doc 본문D)" 'Latest D' "$(doc bodyD)")"; state "$d" 1 publish null >/dev/null
e="$(save null null r8data-e guide false '초안 E' "$(doc 본문E)" 'Draft E' "$(doc bodyE)")"
order="$(q "set role service_role; select string_agg(i->>'slug', ',' order by o) from jsonb_array_elements(public.read_public_home_notices('ko')->'items') with ordinality x(i,o)")"
[[ "$order" == 'r8data-c,r8data-d,r8data-a' ]] || { echo "FAIL N1-6 order $order" >&2; exit 1; }; pass 6 "order $order"
page="$(q "set role service_role; select public.read_public_home_notices('en',null,null,null,2)::text")"
grep -q '"hasMore": true' <<<"$page" && grep -q 'Pinned C' <<<"$page" && ! grep -q 'r8data-a' <<<"$page"; pass 6 'first page of 2 has more, en titles'
cursor="$(q "set role service_role; select concat_ws(',', quote_literal(i->>'pinned'), quote_literal(i->>'publishedAt'), quote_literal(i->>'id')) from jsonb_array_elements(public.read_public_home_notices('ko',null,null,null,2)->'items') with ordinality x(i,o) where o=2")"
rest="$(q "set role service_role; select public.read_public_home_notices('ko',$cursor,2)::text")"
grep -q 'r8data-a' <<<"$rest" && grep -q '"hasMore": false' <<<"$rest" && ! grep -q 'r8data-c' <<<"$rest"; pass 6 'cursor page continues without repeats'
expect_fail 6 'invalid home notice page' "set role service_role; select public.read_public_home_notices('ko',null,null,null,21)"
expect_fail 6 'invalid home notice page' "set role service_role; select public.read_public_home_notices('ko',null,null,null,0)"
expect_fail 6 'invalid home notice cursor' "set role service_role; select public.read_public_home_notices('ko',true,null,null,5)"
[[ "$(q "set role service_role; select public.read_public_home_notice('en','r8data-d')->>'title'")" == 'Latest D' ]]
# Real SQL responses for the web contract test (apps/web/server/home-notice/home-notice-contract.test.ts).
if [[ -n "${HOME_NOTICE_FIXTURE_DIR:-}" ]]; then
  q "set role service_role; select jsonb_pretty(public.read_public_home_notices('ko',null,null,null,2))" > "$HOME_NOTICE_FIXTURE_DIR/read_public_home_notices.json"
  q "set role service_role; select jsonb_pretty(public.read_public_home_notices('en',null,null,null,20))" > "$HOME_NOTICE_FIXTURE_DIR/read_public_home_notices_en.json"
  q "set role service_role; select jsonb_pretty(public.read_public_home_notice('ko','r8data-d'))" > "$HOME_NOTICE_FIXTURE_DIR/read_public_home_notice.json"
  q "set role service_role; select jsonb_pretty(public.list_admin_home_notices('$actor','$allow'))" > "$HOME_NOTICE_FIXTURE_DIR/list_admin_home_notices.json"
fi
[[ -z "$(q "set role service_role; select public.read_public_home_notice('ko','r8data-e')")" ]]
[[ -z "$(q "set role service_role; select public.read_public_home_notice('ko','r8data-b')")" ]]; pass 6 'single read: published only'
admin_list="$(q "set role service_role; select jsonb_array_length(public.list_admin_home_notices('$actor','$allow'))||'|'||(public.list_admin_home_notices('$viewer','$viewer_allow')->0 ? 'home_notice_localizations')")"
[[ "$admin_list" == '5|true' ]] || { echo "FAIL N1-6 admin list $admin_list" >&2; exit 1; }; pass 6 'admin list for admin and viewer'
[[ "$(q "select count(*) from public.audit_logs where entity_type='home_notice'")" -ge 8 ]]; pass 6 'audit rows'

# 7. ordinary owner without bypassrls: re-run the migration's access block, then write and read as that owner.
run <<'SQL'
create role r8data_n1_owner nologin nobypassrls;
grant usage on schema extensions to r8data_n1_owner; -- Supabase grants extensions usage to its roles; the replay shim does not.
alter function public.assert_home_notice_publishable(uuid) owner to r8data_n1_owner;
alter function public.save_admin_home_notice(uuid,uuid,uuid,uuid,integer,text,text,boolean,text,jsonb,text,jsonb) owner to r8data_n1_owner;
alter function public.set_admin_home_notice_state(uuid,uuid,uuid,uuid,integer,text,text) owner to r8data_n1_owner;
alter function public.list_admin_home_notices(uuid,uuid) owner to r8data_n1_owner;
alter function public.read_public_home_notices(public.content_locale,boolean,timestamptz,uuid,integer) owner to r8data_n1_owner;
alter function public.read_public_home_notice(public.content_locale,text) owner to r8data_n1_owner;
SQL
[[ -f "$LINK_MIGRATION" ]] && run <<'SQL'
alter function public.home_notice_link_target_ok(uuid) owner to r8data_n1_owner;
alter function public.home_notice_link_json(uuid) owner to r8data_n1_owner;
alter function public.save_admin_home_notice(uuid,uuid,uuid,uuid,integer,text,text,boolean,text,jsonb,text,jsonb,uuid) owner to r8data_n1_owner;
alter function public.list_admin_home_notice_link_targets(uuid,uuid) owner to r8data_n1_owner;
SQL
expect_fail 7 'permission denied|row-level security|HOME' "set role service_role; select public.list_admin_home_notices('$actor','$allow')"
access_block | run; link_block | run
[[ "$(q "select count(*) from pg_policy where polname like 'home_n1_owner_r8data_n1_owner_%'")" == 7 ]]; pass 7 'access block made 7 owner policies'
access_block | run; [[ "$(q "select count(*) from pg_policy where polname like 'home_n1_owner_r8data_n1_owner_%'")" == 7 ]]; pass 7 'access block re-run is idempotent'
before="$(q "select count(*) from public.audit_logs where entity_type='home_notice'")"
f="$(save null null r8data-f guide false '소유자 F' "$(doc 본문F)" 'Owner F' "$(doc bodyF)")"
state "$f" 1 publish null >/dev/null; state "$f" 2 unpublish null >/dev/null
f2="$(save "'$f'" 3 r8data-f guide true '소유자 F2' "$(doc 본문F2)" 'Owner F2' "$(doc bodyF2)")"
state "$f" 4 publish null >/dev/null
[[ "$(q "set role service_role; select public.read_public_home_notices('ko')->'items'->0->>'slug'")" == 'r8data-f' ]]
[[ "$(q "set role service_role; select public.read_public_home_notice('ko','r8data-f')->>'title'")" == '소유자 F2' ]]
[[ "$(q "set role service_role; select jsonb_array_length(public.list_admin_home_notices('$actor','$allow'))")" == 6 ]]
g="$(save null null r8data-g guide false '보관 G' "$(doc 본문G)" 'Archive G' "$(doc bodyG)")"; state "$g" 1 archive "'r8data owner archive'" >/dev/null
after="$(q "select count(*) from public.audit_logs where entity_type='home_notice'")"
[[ $((after - before)) == 7 ]] || { echo "FAIL N1-7 audit delta $((after - before))" >&2; exit 1; }
pass 7 'non-bypassrls owner: save, publish, unpublish, edit, archive, list, read, audit +7'
run -c "drop policy home_n1_owner_r8data_n1_owner_a on public.audit_logs"
if out="$(check_only_block | psql -X -q -v ON_ERROR_STOP=1 2>&1)"; then echo 'FAIL N1-7 check-only block passed without the audit policy' >&2; exit 1; fi
grep -q 'HOME_CONTENT_OWNER_GAP: r8data_n1_owner has no insert policy on audit_logs' <<<"$out"; pass 7 'missing insert policy -> HOME_CONTENT_OWNER_GAP'
run -c "drop policy home_n1_owner_r8data_n1_owner_w on public.home_notices"
if out="$(check_only_block | psql -X -q -v ON_ERROR_STOP=1 2>&1)"; then echo 'FAIL N1-7 check-only block passed without the update policy' >&2; exit 1; fi
grep -q 'has no w policy on home_notices' <<<"$out"; pass 7 'missing update policy -> HOME_CONTENT_OWNER_GAP'
access_block | run
# a policy under another name does not satisfy the bundle check
run -c "drop policy home_n1_owner_r8data_n1_owner_a on public.audit_logs; create policy other_owner_insert on public.audit_logs for insert to r8data_n1_owner with check (true)"
if check_only_block | psql -X -q -v ON_ERROR_STOP=1 >/dev/null 2>&1; then echo 'FAIL N1-7 another bundle policy satisfied the check' >&2; exit 1; fi
run -c "drop policy other_owner_insert on public.audit_logs"; access_block | run; pass 7 'only home_n1 policies count'
# a reserved role as owner fails the block
run -c "alter function public.list_admin_home_notices(uuid,uuid) owner to service_role"
if out="$(access_block | psql -X -q -v ON_ERROR_STOP=1 2>&1)"; then echo 'FAIL N1-7 service_role owner accepted' >&2; exit 1; fi
grep -q 'service_role may not own' <<<"$out"; run -c "alter function public.list_admin_home_notices(uuid,uuid) owner to r8data_n1_owner"; pass 7 'service_role owner -> gap'

# 8. reserved handles notices and gallery.
def="$(q "select pg_get_constraintdef(oid) from pg_constraint where conname='celebrities_slug_not_reserved'")"
grep -q "'notices'" <<<"$def" && grep -q "'gallery'" <<<"$def" && grep -q "'rankings'" <<<"$def"; pass 8 'constraint reserves notices and gallery'

# 9. rollback: stops while rows exist, succeeds empty, leaves other policies, then the migrations re-apply.
# Roll the linked-page migration back first when present (rollback order: newest first).
[[ -f "$LINK_MIGRATION" ]] && run -f "$ROOT_DIR/supabase/rollback/20261220021500_home_notice_linked_page.sql"
other_policies="$(q "select count(*) from pg_policy where polname not like 'home\_n1\_owner\_%'")"
if out="$(psql -X -q -v ON_ERROR_STOP=1 -f "$ROOT_DIR/supabase/rollback/20261220021000_home_notices.sql" 2>&1)"; then echo 'FAIL N1-9 rollback ran with rows' >&2; exit 1; fi
grep -q HOME_NOTICES_ROLLBACK_HAS_ROWS <<<"$out"; pass 9 'rollback with rows stops'
run -c "delete from public.home_notices"
run -f "$ROOT_DIR/supabase/rollback/20261220021000_home_notices.sql"
[[ "$(q "select to_regclass('public.home_notices') is null and to_regprocedure('public.save_admin_home_notice(uuid,uuid,uuid,uuid,integer,text,text,boolean,text,jsonb,text,jsonb)') is null")" == t ]]
[[ "$(q "select count(*) from pg_policy where polname like 'home\_n1\_owner\_%'")" == 0 ]]
[[ "$(q "select count(*) from pg_policy where polname not like 'home\_n1\_owner\_%'")" == "$other_policies" ]]; pass 9 'rollback empty: tables, functions, home_n1 policies gone; other policies kept'
run -f "$ROOT_DIR/supabase/rollback/20261220020000_reserve_notices_gallery_handles.sql"
expected="$(awk '/add constraint celebrities_slug_not_reserved/,/::text\[\]/' "$ROOT_DIR/supabase/migrations/20261211020000_reserve_rankings_handle.sql" | grep -o "'[^']*'" | sort | tr -d "'" | paste -sd, -)"
actual="$(q "select pg_get_constraintdef(oid) from pg_constraint where conname='celebrities_slug_not_reserved'" | grep -o "'[^']*'" | sort | tr -d "'" | paste -sd, -)"
[[ "$expected" == "$actual" ]] || { echo "FAIL N1-9 M-R rollback array differs" >&2; exit 1; }; pass 9 'M-R rollback equals the 20261211020000 array'
run -f "$ROOT_DIR/supabase/migrations/20261220020000_reserve_notices_gallery_handles.sql"
run -f "$MIGRATION"
[[ -f "$LINK_MIGRATION" ]] && run -f "$LINK_MIGRATION"
[[ "$(q "set role service_role; select public.read_public_home_notices('ko')::text")" == '{"items": [], "hasMore": false}' ]]; pass 9 're-apply after rollback; empty read'
if [[ -n "${HOME_NOTICE_FIXTURE_DIR:-}" ]]; then
  q "set role service_role; select jsonb_pretty(public.read_public_home_notices('ko'))" > "$HOME_NOTICE_FIXTURE_DIR/read_public_home_notices_empty.json"
  q "set role service_role; select coalesce(public.read_public_home_notice('ko','none')::text, 'null')" > "$HOME_NOTICE_FIXTURE_DIR/read_public_home_notice_missing.json"
fi
# Fixtures stay: audit logs are append-only and the replay database is discarded on exit.
echo 'home notices checks passed'
