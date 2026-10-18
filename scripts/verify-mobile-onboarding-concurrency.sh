#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:?Disposable database socket required}"
: "${PGPORT:?Disposable database port required}"
: "${PGDATABASE:?Disposable database name required}"
if [[ "$PGDATABASE" != "byus_clean" || "$PGHOST" != /*/byus-clean-db.*/socket \
  || ! -S "$PGHOST/.s.PGSQL.$PGPORT" || -n "${PGHOSTADDR:-}${PGSERVICE:-}" ]]; then
  echo "Onboarding race check refuses non-disposable PostgreSQL targets" >&2
  exit 1
fi

psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
insert into public.app_users(id,privy_user_id,verified_email)
values('af040000-0000-4000-8000-000000000080','did:privy:onboarding-race','onboarding-race@example.invalid');
SQL
complete_profile() {
  psql -X -v ON_ERROR_STOP=1 -qAt <<'SQL' > /dev/null
set statement_timeout='8s';
select public.complete_owned_account_onboarding(
  'af040000-0000-4000-8000-000000000080','af040000-0000-4000-8000-000000000081',
  'Onboarding Race',true,true,'2026-10-11');
SQL
}
complete_profile & first_pid=$!
complete_profile & second_pid=$!
wait "$first_pid"
wait "$second_pid"
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
do $$ begin
  if (select count(*) from public.account_passports where app_user_id='af040000-0000-4000-8000-000000000080')<>1 then
    raise exception 'Concurrent completion did not issue exactly one account passport';
  end if;
end $$;
SQL
echo "PASS: concurrent onboarding issued one account passport"
