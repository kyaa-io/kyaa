#!/usr/bin/env bash
# Disposable replay only; wraps the existing gallery/Shorts regression suite.
# BYUS_CLEAN_DB_SHELL_ASSERTION_FILE=supabase/tests/home_gallery_relative_url.sh TMPDIR=/tmp scripts/verify-clean-migration-chain.sh
set -euo pipefail
if [[ "${PGDATABASE:-}" != byus_clean || "${PGHOST:-}" != /*/byus-clean-db.*/socket || ! -d "$PGHOST" ]]; then
  echo 'Relative gallery checks require the disposable local replay socket' >&2; exit 1
fi
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATION="$ROOT_DIR/supabase/migrations/20261220100000_home_gallery_relative_url.sql"
ROLLBACK="$ROOT_DIR/supabase/rollback/20261220100000_home_gallery_relative_url.sql"
run() { psql -X -q -v ON_ERROR_STOP=1 "$@"; }
# Baseline suite changes function ownership and exercises the old rollback. Run it on its own version.
run -f "$ROLLBACK"
bash "$ROOT_DIR/supabase/tests/home_gallery_shorts.sh"
# Upgrade an ordinary existing owner, with the baseline's documented grants/policies.
run -c "alter function public.read_public_home_gallery_photos(public.content_locale,integer,integer) owner to r8data_n2r_owner"
awk '/^do \$access\$/{on=1} on{print} /^\$access\$;/{on=0}' "$ROOT_DIR/supabase/migrations/20261220022000_home_gallery_shorts_reads.sql" | run
run <<'SQL'
create table r8test.relative_before as select pg_get_functiondef(p.oid) definition, p.proowner, p.proacl
from pg_proc p where p.oid='public.read_public_home_gallery_photos(public.content_locale,integer,integer)'::regprocedure;
create function r8test.check_relative(p_ok boolean, p_label text) returns void language plpgsql as $$
begin if p_ok is distinct from true then raise exception 'FAIL %', p_label; end if; raise notice 'PASS %', p_label; end $$;
SQL
run -f "$MIGRATION"
run -f "$ROOT_DIR/supabase/tests/home_gallery_relative_url.sql"
if [[ -n "${HOME_GALLERY_RELATIVE_FIXTURE_FILE:-}" ]]; then
  psql -X -Atq -v ON_ERROR_STOP=1 -c "set role service_role; select jsonb_pretty(jsonb_build_object('items',jsonb_path_query_array(public.read_public_home_gallery_photos('ko',0,24),'\$.items[*] ? (@.image.url starts with \"/api/content-assets/\")'),'hasMore',false))" > "$HOME_GALLERY_RELATIVE_FIXTURE_FILE"
fi
run -f "$ROLLBACK"
run <<'SQL'
select r8test.check_relative(pg_get_functiondef(p.oid)=b.definition and p.proowner=b.proowner and p.proacl is not distinct from b.proacl,'rollback restores exact definition/owner/ACL')
from pg_proc p cross join r8test.relative_before b where p.oid='public.read_public_home_gallery_photos(public.content_locale,integer,integer)'::regprocedure;
select r8test.check_relative(to_regprocedure('public.home_gallery_public_content_asset(text)') is null,'rollback drops private helper');
SQL
# Corrupt only the expected old predicate; migration must fail atomically with SHAPE.
run <<'SQL'
do $$ begin execute (select replace(definition, '^https://', '^http://') from r8test.relative_before); end $$;
SQL
if out="$(run -f "$MIGRATION" 2>&1)"; then echo 'FAIL forward SHAPE accepted drift'; exit 1; fi
[[ "$out" == *HOME_GALLERY_RELATIVE_URL_SHAPE* ]] || { echo "$out"; exit 1; }
run <<'SQL'
select r8test.check_relative(to_regprocedure('public.home_gallery_public_content_asset(text)') is null,'SHAPE failure rolls back helper creation');
do $$ begin execute (select definition from r8test.relative_before); end $$;
SQL
run -f "$MIGRATION"
run <<'SQL'
create table r8test.relative_after as select pg_get_functiondef('public.read_public_home_gallery_photos(public.content_locale,integer,integer)'::regprocedure) definition;
do $$ begin execute (select replace(definition, '^https://', '^http://') from r8test.relative_after); end $$;
SQL
if out="$(run -f "$ROLLBACK" 2>&1)"; then echo 'FAIL rollback SHAPE accepted drift'; exit 1; fi
[[ "$out" == *HOME_GALLERY_RELATIVE_URL_ROLLBACK_SHAPE* ]] || { echo "$out"; exit 1; }
run <<'SQL'
do $$ begin execute (select definition from r8test.relative_after); end $$;
select r8test.check_relative((select count(*)=9 from jsonb_array_elements(public.read_public_home_gallery_photos('ko',0,24)->'items') i where i->'image'->>'url' like '/api/content-assets/%'),'reapply restores nine photos');
SQL
echo 'home gallery relative URL checks passed (baseline, public/private, source preservation, rollback, SHAPE)'
