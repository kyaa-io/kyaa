#!/usr/bin/env bash
set -euo pipefail
work=$(mktemp -d)
old=$(psql -XAtqc 'select gen_random_uuid()')
a=$(psql -XAtqc 'select gen_random_uuid()')
b=$(psql -XAtqc 'select gen_random_uuid()')
cleanup() { psql -Xq -c "delete from public.cognito_email_sessions where id in ('$old','$a','$b')"; rm -rf "$work"; }
trap cleanup EXIT
psql -Xv ON_ERROR_STOP=1 -q -c "insert into public.cognito_email_sessions(id,legacy_user_id,encrypted_session,refresh_hash,expires_at) values('$old','$old','fixture',md5('$old')||md5('$old'),now()+interval '1 hour')"
rotate() { echo "select public.rotate_cognito_email_session('$1','$old','fixture',md5('$1')||md5('$1'),now()+interval '1 hour',md5('$old')||md5('$old'),'$2');"; }
{ echo 'begin;'; rotate "$a" winner; echo "\\! touch '$work/locked'"; echo 'select pg_sleep(2); commit;'; } | psql -XAtqv ON_ERROR_STOP=1 > "$work/a" &
pid=$!
# Start the second connection while the first still holds its rotation lock.
for attempt in {1..100}; do test -f "$work/locked" && break; kill -0 "$pid" 2>/dev/null || { wait "$pid"; exit 1; }; sleep 0.02; done
test -f "$work/locked"
rotate "$b" challenger | psql -XAtqv ON_ERROR_STOP=1 > "$work/b"
wait "$pid"
test "$(awk 'NF' "$work/a")" = "$(awk 'NF' "$work/b")"
psql -Xv ON_ERROR_STOP=1 -q <<SQL
do \$\$ begin
 if (select count(*) from public.cognito_email_sessions where id in ('$a','$b'))<>1 then raise exception 'duplicate rotation'; end if;
 if public.read_cognito_email_rotation(md5('$old')||md5('$old')) is null then raise exception 'missing replay'; end if;
end \$\$;
update public.cognito_email_sessions set revoked_at=now() where id in ('$a','$b');
do \$\$ begin
 if public.read_cognito_email_rotation(md5('$old')||md5('$old')) is not null then raise exception 'logout bypass'; end if;
end \$\$;
SQL
