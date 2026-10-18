#!/usr/bin/env bash
set -euo pipefail
: "${PGHOST:?Disposable database socket required}"
: "${PGPORT:?Disposable database port required}"
: "${PGDATABASE:?Disposable database name required}"
if [[ "$PGDATABASE" != "byus_clean" || "$PGHOST" != /*/byus-clean-db.*/socket || ! -S "$PGHOST/.s.PGSQL.$PGPORT" || -n "${PGHOSTADDR:-}${PGSERVICE:-}" ]]; then
  echo "Installation race check refuses non-disposable PostgreSQL targets" >&2
  exit 1
fi
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
insert into public.app_users(id,privy_user_id,verified_email)values
 ('5c200000-0000-4000-8000-000000000001','did:privy:installation-race-a','installation-race-a@example.invalid'),
 ('5c200000-0000-4000-8000-000000000002','did:privy:installation-race-b','installation-race-b@example.invalid');
select public.mobile_register_owned_installation('5c200000-0000-4000-8000-000000000001','5c200000-0000-4000-8000-000000000010','ios','race-token-a','authorized','1','ko',0,'5c200000-0000-4000-8000-000000000011');
select public.mobile_disable_owned_installation('5c200000-0000-4000-8000-000000000001','5c200000-0000-4000-8000-000000000010',1,'5c200000-0000-4000-8000-000000000012');
SQL
psql -X -v ON_ERROR_STOP=1 -q <<'SQL' >/dev/null &
begin;
select public.mobile_register_owned_installation('5c200000-0000-4000-8000-000000000002','5c200000-0000-4000-8000-000000000010','android','race-token-b','authorized','1','ko',2,'5c200000-0000-4000-8000-000000000013');
select pg_sleep(1);
commit;
SQL
winner_pid=$!
sleep 0.2
set +e
stale_output="$(psql -X -v ON_ERROR_STOP=1 -qAt <<'SQL' 2>&1
select public.mobile_register_owned_installation('5c200000-0000-4000-8000-000000000001','5c200000-0000-4000-8000-000000000010','ios','race-token-stale','authorized','2','ko',2,'5c200000-0000-4000-8000-000000000014');
SQL
)"
stale_status=$?
set -e
wait "$winner_pid"
if [[ "$stale_status" -eq 0 || "$stale_output" != *"MOBILE_INSTALLATION_REVISION_CONFLICT"* ]]; then
  echo "Stale registration was not rejected: $stale_output" >&2
  exit 1
fi
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
do $$ begin
 if not exists(select 1 from public.mobile_installations where installation_id='5c200000-0000-4000-8000-000000000010'and app_user_id='5c200000-0000-4000-8000-000000000002'and disabled_at is null and installation_version=3)then raise exception'winning installation link missing';end if;
 if exists(select 1 from public.mobile_installations where installation_id='5c200000-0000-4000-8000-000000000010'and app_user_id='5c200000-0000-4000-8000-000000000001'and disabled_at is null)then raise exception'stale owner became active';end if;
end$$;
SQL
echo "PASS: delayed registration cannot overwrite the current installation owner"
