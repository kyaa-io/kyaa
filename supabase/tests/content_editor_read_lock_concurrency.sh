#!/usr/bin/env bash
# ADMIN-LOCK-1117: overlapping read-only CMS calls by one administrator do not queue on the actor row,
# while writes and revocations by/of that administrator still wait for them.
# All writes target the disposable clean-chain database supplied by the caller.
set -euo pipefail
ACTOR=ad000000-0000-4000-8000-000000000117
NONE=00000000-0000-0000-0000-000000000000
psql -X -v ON_ERROR_STOP=1 -q <<SQL
insert into public.admin_allowlist(id,email,role,active) values('$ACTOR','admin-read-lock@example.test','admin',true);
do \$\$ begin
  if has_function_privilege('anon','public.require_content_editor(uuid,boolean)','execute')
     or has_function_privilege('authenticated','public.require_content_editor(uuid,boolean)','execute') then
    raise exception 'require_content_editor must stay closed to anon and authenticated';
  end if;
end \$\$;
-- A transaction that took the read lock and then asks for the write lock could deadlock with a twin.
-- No function may call a reader (or the read check) before its own write check.
do \$\$
declare offenders text;
begin
  with fns as (
    select p.proname, p.prosrc from pg_proc p where p.pronamespace='public'::regnamespace and p.prolang=(select oid from pg_language where lanname='plpgsql')
  ), readers as (
    select proname from fns where prosrc ~* 'require_content_editor\s*\(\s*\w+\s*,\s*false'
  ), writers as (
    select proname, substring(prosrc from '(?is)^(.*?)require_content_editor\s*\(\s*\w+\s*,\s*true') as before_write
    from fns where prosrc ~* 'require_content_editor\s*\(\s*\w+\s*,\s*true'
  )
  select string_agg(w.proname,', ') into offenders from writers w
  where w.before_write ~* 'require_content_editor\s*\(\s*\w+\s*,\s*false'
     or exists(select 1 from readers r where w.before_write ~* ('\m'||r.proname||'\s*\('));
  if offenders is not null then raise exception 'read lock taken before write lock in: %', offenders; end if;
  if (select count(*) from pg_proc where pronamespace='public'::regnamespace and prosrc ~* 'require_content_editor\s*\(\s*\w+\s*,\s*true') < 5 then
    raise exception 'write callers of require_content_editor not found; selection broke';
  end if;
end \$\$;
SQL

wait_sleep() {
  for _ in {1..50}; do
    [[ "$(psql -X -Atq -c "select exists(select 1 from pg_stat_activity where application_name='$1' and wait_event='PgSleep')")" == t ]] && return 0
    sleep 0.1
  done
  echo "holder did not reach checkpoint: $1" >&2; return 1
}
hold() { # $1 app name, $2 SQL run inside the held transaction
  PGAPPNAME="$1" psql -X -v ON_ERROR_STOP=1 -q -o /dev/null -c "begin; $2; select pg_sleep(3); commit;" &
  HOLDER=$!
  wait_sleep "$1"
}
# Prints the SQLSTATE of the statement run with a 1s lock_timeout, or ok.
try() {
  psql -X -Atq -v ON_ERROR_STOP=1 <<SQL
set lock_timeout='1s';
do \$\$ begin $1; raise notice 'ok'; exception when others then raise exception 'sqlstate=% %', sqlstate, sqlerrm; end \$\$;
select 'ok';
SQL
}
expect() { # $1 label, $2 expected (ok|55P03|P0001), $3 statement
  local out; out="$(try "$3" 2>&1 || true)"
  if [[ "$2" == ok ]]; then [[ "$out" == *ok* && "$out" != *sqlstate=* ]] || { echo "FAIL $1: $out" >&2; exit 1; }
  else [[ "$out" == *"sqlstate=$2"* ]] || { echo "FAIL $1: expected $2, got: $out" >&2; exit 1; }; fi
  echo "pass: $1"
}

READ_CELEB="perform public.read_admin_celebrity_cms('$ACTOR','$NONE')"
READ_QUIZ="perform public.read_admin_quiz_cms('$ACTOR','$NONE')"
WRITE_CHECK="perform public.require_content_editor('$ACTOR',true)"

hold read_holder "select public.read_admin_celebrity_cms('$ACTOR','$NONE')"
expect "second read by the same admin does not wait" ok "$READ_QUIZ"
expect "write check waits for a running read" 55P03 "$WRITE_CHECK"
expect "revocation waits for a running read" 55P03 "update public.admin_allowlist set active=false where id='$ACTOR'"
wait "$HOLDER"

hold write_holder "select public.require_content_editor('$ACTOR',true)"
expect "second write by the same admin stays serialized" 55P03 "$WRITE_CHECK"
expect "read waits for a running write" 55P03 "$READ_CELEB"
wait "$HOLDER"

psql -X -v ON_ERROR_STOP=1 -q -c "update public.admin_allowlist set active=false where id='$ACTOR'"
expect "read after committed revocation is refused" P0001 "$READ_CELEB"
expect "write after committed revocation is refused" P0001 "$WRITE_CHECK"
psql -X -v ON_ERROR_STOP=1 -q -c "delete from public.admin_allowlist where id='$ACTOR'"
echo 'content editor read lock concurrency passed'
