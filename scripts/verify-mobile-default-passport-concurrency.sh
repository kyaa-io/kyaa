#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "${BYUS_MOBILE_DEFAULT_PASSPORT_CONCURRENCY_MODE:-}" != "1" ]]; then
  BYUS_CLEAN_DB_PORT="${BYUS_CLEAN_DB_PORT:-55457}" \
  BYUS_MOBILE_DEFAULT_PASSPORT_CONCURRENCY_MODE=1 \
  BYUS_CLEAN_DB_SHELL_ASSERTION_FILE="$ROOT_DIR/scripts/verify-mobile-default-passport-concurrency.sh" \
    "$ROOT_DIR/scripts/verify-clean-migration-chain.sh"
  exit 0
fi

: "${PGHOST:?PGHOST is required in assertion mode}"
: "${PGPORT:?PGPORT is required in assertion mode}"
: "${PGDATABASE:?PGDATABASE is required in assertion mode}"
if [[ "$PGDATABASE" != "byus_clean" || "$PGHOST" != /*/byus-clean-db.*/socket \
  || ! -d "$PGHOST" || ! -S "$PGHOST/.s.PGSQL.$PGPORT" ]]; then
  echo "Mobile default passport concurrency verification refuses non-disposable PostgreSQL targets" >&2
  exit 1
fi

PSQL=(psql -X -v ON_ERROR_STOP=1 -h "$PGHOST" -p "$PGPORT" -d "$PGDATABASE")
"${PSQL[@]}" <<'SQL' >/dev/null
insert into public.app_users(id,privy_user_id,verified_email) values
  ('7d130000-0000-4000-8000-000000000001','did:privy:default-passport-race','default-passport-race@example.test');
delete from public.mobile_default_passports where app_user_id='7d130000-0000-4000-8000-000000000001';
SQL

python3 - <<'PY'
import os
import subprocess
import time

base = ["psql", "-X", "-v", "ON_ERROR_STOP=1", "-Atq"]
statement = "select public.ensure_mobile_default_passport('7d130000-0000-4000-8000-000000000001');"

holder = subprocess.Popen(base, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1, env={**os.environ, "PGAPPNAME": "default-passport-holder"})
assert holder.stdin and holder.stdout
holder.stdin.write(f"begin;\n{statement}\n\\echo HELD\n")
holder.stdin.flush()
first_id = holder.stdout.readline().strip()
if holder.stdout.readline().strip() != "HELD":
    raise AssertionError("first provision did not reach the held transaction")

racer = subprocess.Popen(base + ["-c", statement], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env={**os.environ, "PGAPPNAME": "default-passport-racer"})
deadline = time.monotonic() + 5
while True:
    waiting = subprocess.check_output(base + ["-c", "select count(*) from pg_catalog.pg_stat_activity where application_name='default-passport-racer' and wait_event_type='Lock';"], text=True).strip()
    if waiting == "1":
        break
    if racer.poll() is not None:
        stdout, stderr = racer.communicate()
        raise AssertionError(("concurrent provision completed before lock overlap", stdout, stderr))
    if time.monotonic() > deadline:
        raise AssertionError("concurrent provision did not enter a lock wait")
    time.sleep(0.03)

holder.stdin.write("commit;\n\\q\n")
holder.stdin.flush()
if holder.wait(timeout=5) != 0:
    raise AssertionError(holder.stderr.read())
stdout, stderr = racer.communicate(timeout=5)
if racer.returncode != 0 or stdout.strip() != first_id:
    raise AssertionError(("concurrent provision returned a different passport", first_id, stdout, stderr))
print("Mobile default passport concurrent provision lock and stable UUID: PASS")
PY

"${PSQL[@]}" <<'SQL'
do $$ begin
  if (select count(*) from public.mobile_default_passports where app_user_id='7d130000-0000-4000-8000-000000000001')<>1 then
    raise exception 'concurrent provisioning created duplicate or missing default passports';
  end if;
  if exists(select 1 from public.community_stamps where app_user_id='7d130000-0000-4000-8000-000000000001' and kind='invite')
    or exists(select 1 from public.fan_passports where app_user_id='7d130000-0000-4000-8000-000000000001') then
    raise exception 'concurrent default passport provisioning created rewards or fan certification';
  end if;
end $$;
select 'Mobile default passport concurrency PASS' as result;
SQL
