#!/usr/bin/env bash
# Home notice linked fan page (20261220021500) on the disposable replay database:
#   BYUS_CLEAN_DB_SHELL_ASSERTION_FILE=supabase/tests/home_notice_links.sh TMPDIR=/tmp scripts/verify-clean-migration-chain.sh
# HOME_NOTICE_FIXTURE_DIR, when set, receives the real SQL responses used by the web contract tests.
set -euo pipefail
trap 'echo "FAIL at line $LINENO: $BASH_COMMAND" >&2' ERR
if [[ "${PGDATABASE:-}" != "byus_clean" || "${PGHOST:-}" != /*/byus-clean-db.*/socket || ! -d "$PGHOST" ]]; then
  echo 'Home notice link checks require the disposable local replay socket' >&2; exit 1
fi
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATION="$ROOT_DIR/supabase/migrations/20261220021500_home_notice_linked_page.sql"
N1="$ROOT_DIR/supabase/migrations/20261220021000_home_notices.sql"
q() { psql -X -Atq -v ON_ERROR_STOP=1 -c "$1"; }
sq() { psql -X -Atq -v ON_ERROR_STOP=1 -c "set role service_role; $1"; }
run() { psql -X -q -v ON_ERROR_STOP=1 "$@" >/dev/null; }
pass() { echo "PASS $1 $2"; }
eq() { [[ "$1" == "$2" ]] || { echo "FAIL $3: got '$1', want '$2'" >&2; exit 1; }; pass "$3" "$2"; }
expect_fail() {
  local out
  if out="$(psql -X -Atq -v ON_ERROR_STOP=1 -c "$3" 2>&1)"; then echo "FAIL $1 expected error /$2/, got success: $out" >&2; exit 1; fi
  grep -Eq "$2" <<<"$out" || { echo "FAIL $1 expected /$2/, got: $out" >&2; exit 1; }
  pass "$1" "refused: $2"
}
block() { awk '/^do \$access\$/{on=1} on{print} /^\$access\$;/{on=0}' "$1"; }
check_only() { block "$1" | awk '/^begin$/&&!b{print;b=1;skip=1;next} /-- checks:/{skip=0} !skip{print}'; }

A='9a000000-0000-4000-8000-000000000001'; L='9a000000-0000-4000-8000-000000000002'
payload() { printf '{"slug":"%s","imageUrl":"/r8.jpg","imagePosition":"center","displayOrder":%s,"fanCount":0,"primaryRole":"actor","localizations":{"ko":{"name":"%s","summary":"r8data","imageAlt":"r8data"},"en":{"name":"%s EN","summary":"r8data","imageAlt":"r8data"}},"themes":[],"socialLinks":[]}' "$1" "$2" "$3" "$3"; }
run <<SQL
insert into public.app_users(id,privy_user_id,verified_email,status) values ('$A','did:privy:r8data-link','r8data-link@example.invalid','active');
insert into public.admin_allowlist(id,email,role,active) values ('$L','r8data-link@example.invalid','admin',true);
SQL
C1="$(q "select public.save_admin_celebrity('$L',gen_random_uuid(),null,'$(payload r8data-linked 981 'R8 연결')'::jsonb)->>'id'")"
C2="$(q "select public.save_admin_celebrity('$L',gen_random_uuid(),null,'$(payload r8data-unlisted 982 'R8 비노출')'::jsonb)->>'id'")"
run -c "update public.celebrities set status='published', published_at=now() where id in ('$C1','$C2')"
page() { local id; id="$(q "select id from public.group_pages where celebrity_id='$1' and kind='fan'")"; [[ -n "$id" ]] || id="$(q "insert into public.group_pages(kind,name,celebrity_id,status,listed) values ('fan','$2','$1','published',true) returning id")"; echo "$id"; }
G1="$(page "$C1" 'R8 연결 팬페이지')"; G2="$(page "$C2" 'R8 비노출 팬페이지')"
run -c "update public.group_pages set status='published', listed=true where id='$G1'; update public.group_pages set status='published', listed=false where id='$G2'"
H="$(q "insert into public.group_pages(kind,name,status,listed) values ('hobby','r8 취미 모임','published',true) returning id")"
doc='{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"본문"}]}]}'
save() { sq "select public.save_admin_home_notice('$A','$L',gen_random_uuid(),$1,$2,'$3','creator',false,'제목 $3','$doc','Title $3','$doc',$4)"; }
state() { sq "select public.set_admin_home_notice_state('$A','$L',gen_random_uuid(),'$1',$2,'$3',null)" >/dev/null; }
link_of() { sq "select coalesce(i->>'linkHref','none') from jsonb_array_elements(public.read_public_home_notices('ko')->'items') i where i->>'slug'='$1'"; }

# L-1 permissions and the target list: only published listed fan pages of public creators
expect_fail L-1 'permission denied' "set role authenticated; select public.list_admin_home_notice_link_targets('$A','$L')"
targets="$(sq "select string_agg(t->>'id', ',') from jsonb_array_elements(public.list_admin_home_notice_link_targets('$A','$L')) t")"
grep -q "$G1" <<<"$targets"; pass L-1 'listed fan page is a target'
grep -Eq "$G2|$H" <<<"$targets" && { echo 'FAIL L-1 unlisted or hobby page offered' >&2; exit 1; }; pass L-1 'unlisted fan page and hobby page are not'
G1_NAME="$(q "select name from public.group_pages where id='$G1'")"
eq "$(sq "select t->>'name' || '|' || (t->>'slug') from jsonb_array_elements(public.list_admin_home_notice_link_targets('$A','$L')) t where t->>'id'='$G1'")" "$G1_NAME|r8data-linked" L-1
# L-2 save with a link, publish: the list and detail give the fan page; the admin list keeps the id
N="$(save null null r8-linked "'$G1'")"; state "$N" 1 publish
eq "$(link_of r8-linked)" /r8data-linked L-2
eq "$(sq "select public.read_public_home_notice('ko','r8-linked')->>'linkHref'")" /r8data-linked L-2
eq "$(sq "select x->>'linked_group_page_id' from jsonb_array_elements(public.list_admin_home_notices('$A','$L')) x where x->>'slug'='r8-linked'")" "$G1" L-2
# L-3 invalid targets are refused before anything is written
for bad in "'$G2'" "'$H'" "gen_random_uuid()"; do
  expect_fail L-3 HOME_NOTICE_LINK_INVALID "set role service_role; select public.save_admin_home_notice('$A','$L',gen_random_uuid(),null,null,'r8-bad','creator',false,'t','$doc','t','$doc',$bad)"
done
eq "$(q "select count(*) from public.home_notices where slug='r8-bad'")" 0 L-3
# L-4 the page stops being a valid target after publication: the row falls back to the notice detail, and comes back when it is listed again
run -c "update public.group_pages set listed=false where id='$G1'"; eq "$(link_of r8-linked)" none L-4
eq "$(sq "select coalesce(public.read_public_home_notice('ko','r8-linked')->>'linkHref','none')")" none L-4
run -c "update public.group_pages set listed=true, status='hidden' where id='$G1'"; eq "$(link_of r8-linked)" none L-4
run -c "update public.group_pages set status='published' where id='$G1'"; eq "$(link_of r8-linked)" /r8data-linked L-4
run -c "update public.celebrities set status='draft', published_at=null where id='$C1'"; eq "$(link_of r8-linked)" none L-4
run -c "update public.celebrities set status='published', published_at=now() where id='$C1'"
# L-5 no link and unlinking
M="$(save null null r8-plain null)"; state "$M" 1 publish; eq "$(link_of r8-plain)" none L-5
state "$N" 2 unpublish; save "'$N'" 3 r8-linked null >/dev/null; state "$N" 4 publish; eq "$(link_of r8-linked)" none L-5
state "$N" 5 unpublish; save "'$N'" 6 r8-linked "'$G1'" >/dev/null; state "$N" 7 publish; eq "$(link_of r8-linked)" /r8data-linked L-5
# L-6 the 12-argument save from the web deployed before this still resolves and keeps the link
state "$N" 8 unpublish
sq "select public.save_admin_home_notice(p_actor_app_user_id=>'$A',p_actor_admin_allowlist_id=>'$L',p_correlation_id=>gen_random_uuid(),p_notice_id=>'$N',p_expected_revision=>9,p_slug=>'r8-linked',p_category=>'creator',p_pinned=>false,p_title_ko=>'제목',p_body_ko=>'$doc',p_title_en=>'Title',p_body_en=>'$doc')" >/dev/null
eq "$(q "select linked_group_page_id from public.home_notices where id='$N'")" "$G1" L-6
state "$N" 10 publish
if [[ -n "${HOME_NOTICE_FIXTURE_DIR:-}" ]]; then
  sq "select jsonb_pretty(public.read_public_home_notices('ko',null,null,null,20))" > "$HOME_NOTICE_FIXTURE_DIR/read_public_home_notices_linked.json"
  sq "select jsonb_pretty(public.list_admin_home_notice_link_targets('$A','$L'))" > "$HOME_NOTICE_FIXTURE_DIR/list_admin_home_notice_link_targets.json"
fi
# L-8 ordinary owner without bypassrls: the N1 block then this block give what the link reads need
run <<'SQL'
create role r8data_link_owner nologin nobypassrls;
grant usage on schema extensions to r8data_link_owner;
do $$ declare f regprocedure; begin
  foreach f in array array['public.assert_home_notice_publishable(uuid)', 'public.save_admin_home_notice(uuid,uuid,uuid,uuid,integer,text,text,boolean,text,jsonb,text,jsonb)',
    'public.set_admin_home_notice_state(uuid,uuid,uuid,uuid,integer,text,text)', 'public.list_admin_home_notices(uuid,uuid)',
    'public.read_public_home_notices(public.content_locale,boolean,timestamptz,uuid,integer)', 'public.read_public_home_notice(public.content_locale,text)',
    'public.home_notice_link_target_ok(uuid)', 'public.home_notice_link_json(uuid)',
    'public.save_admin_home_notice(uuid,uuid,uuid,uuid,integer,text,text,boolean,text,jsonb,text,jsonb,uuid)',
    'public.list_admin_home_notice_link_targets(uuid,uuid)']::regprocedure[]
  loop execute format('alter function %s owner to r8data_link_owner', f); end loop;
end $$;
SQL
if check_only "$MIGRATION" | psql -X -q -v ON_ERROR_STOP=1 >/dev/null 2>&1; then echo 'FAIL L-8 link block passed before the N1 block gave the notice policies' >&2; exit 1; fi
pass L-8 'link block alone fails without the N1 policies'
block "$N1" | run; block "$MIGRATION" | run
eq "$(link_of r8-linked)" /r8data-linked L-8
run -c "update public.group_pages set listed=false where id='$G1'"; eq "$(link_of r8-linked)" none L-8
run -c "update public.group_pages set listed=true where id='$G1'"
O="$(save null null r8-owner "'$G1'")"; state "$O" 1 publish; eq "$(link_of r8-owner)" /r8data-linked L-8
run -c "drop policy home_n1link_owner_r8data_link_owner_r on public.group_pages"
if out="$(check_only "$MIGRATION" | psql -X -q -v ON_ERROR_STOP=1 2>&1)"; then echo 'FAIL L-8 check passed without the group_pages policy' >&2; exit 1; fi
grep -q 'HOME_CONTENT_OWNER_GAP: r8data_link_owner has no read policy on group_pages' <<<"$out"; pass L-8 'missing policy -> HOME_CONTENT_OWNER_GAP'
block "$MIGRATION" | run

# L-9 rollback: stops while linked, then drops the column, the 13-argument save and only home_n1link policies; N1 keeps working
others="$(q "select count(*) from pg_policy where polname not like 'home\_n1link\_owner\_%'")"
if out="$(psql -X -q -v ON_ERROR_STOP=1 -f "$ROOT_DIR/supabase/rollback/20261220021500_home_notice_linked_page.sql" 2>&1)"; then echo 'FAIL L-9 rollback ran while linked' >&2; exit 1; fi
grep -q HOME_NOTICE_LINK_ROLLBACK_HAS_LINKS <<<"$out"; pass L-9 'rollback with links stops'
run -c "update public.home_notices set linked_group_page_id=null"
run -f "$ROOT_DIR/supabase/rollback/20261220021500_home_notice_linked_page.sql"
eq "$(q "select count(*) from information_schema.columns where table_name='home_notices' and column_name='linked_group_page_id'")" 0 L-9
eq "$(q "select (to_regprocedure('public.save_admin_home_notice(uuid,uuid,uuid,uuid,integer,text,text,boolean,text,jsonb,text,jsonb,uuid)') is null)::text")" true L-9
eq "$(q "select count(*) from pg_policy where polname like 'home\_n1link\_owner\_%'")" 0 L-9
eq "$(q "select count(*) from pg_policy where polname not like 'home\_n1link\_owner\_%'")" "$others" L-9
eq "$(sq "select public.read_public_home_notice('ko','r8-linked')->>'slug'")" r8-linked L-9
eq "$(sq "select (public.read_public_home_notice('ko','r8-linked') ? 'linkHref')::text")" false L-9
run -f "$MIGRATION"
eq "$(link_of r8-linked)" none L-9
echo 'home notice link checks passed'
