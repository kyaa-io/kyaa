#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ "${BYUS_WAVE_RACE_MODE:-}" != 1 ]]; then
 BYUS_CLEAN_DB_PORT="${BYUS_CLEAN_DB_PORT:-55491}" BYUS_WAVE_RACE_MODE=1 \
 BYUS_CLEAN_DB_ASSERTION_FILE="$ROOT_DIR/supabase/tests/kyaa_wave_programs.sql" \
 BYUS_CLEAN_DB_SHELL_ASSERTION_FILE="$ROOT_DIR/scripts/verify-kyaa-wave-programs.sh" \
 bash "$ROOT_DIR/scripts/verify-clean-migration-chain.sh"
 exit 0
fi
: "${PGHOST:?}" "${PGPORT:?}" "${PGDATABASE:?}"
if [[ "$PGDATABASE" != byus_clean || "$PGHOST" != /*/byus-clean-db.*/socket || ! -S "$PGHOST/.s.PGSQL.$PGPORT" ]]; then
 echo 'Wave race tests require disposable local PostgreSQL' >&2
 exit 1
fi
export BYUS_WAVE_TEST_SQL="$ROOT_DIR/supabase/tests/kyaa_wave_programs.sql"
python3 - <<'PY'
import concurrent.futures
import os
from pathlib import Path
import subprocess
import threading
base = ['psql', '-X', '-v', 'ON_ERROR_STOP=1', '-Atq']
def sql(statement):
    return subprocess.check_output(base + ['-c', statement], text=True).strip()
# Use the exact same fixture setup as the rollback-only SQL assertions.
setup = Path(os.environ['BYUS_WAVE_TEST_SQL']).read_text().split('\ndo $$\ndeclare owner')[0]
sql(setup + '\ncommit;')
owner = '91600000-0000-4000-8000-000000000004'
creator = '91600000-0000-4000-8000-000000000010'
notice = '91600000-0000-4000-8000-000000000023'
asset = '91600000-0000-4000-8000-000000000030'
key = '91600000-0000-4000-8000-000000000031'
sql(f"""insert into public.content_assets(id,app_user_id,celebrity_id,storage_path,byte_size,width,height,sha256,uploaded_at)
values('{asset}','{owner}','{creator}','wave-race-asset',40,100,100,repeat('b',64),clock_timestamp());""")
post = sql("select public.save_fan_program_post('91600000-0000-4000-8000-000000000005','kyaa-wave-fanpage','community-starts','race discussion','public','{}',extensions.gen_random_uuid())->>'id'")
notice_key = '91600000-0000-4000-8000-000000000032'
comment_key = '91600000-0000-4000-8000-000000000033'
barrier = threading.Barrier(12)
def race(i):
    barrier.wait(timeout=10)
    if i % 3 == 0:
        return sql(f"select public.save_fan_program_post('{owner}','kyaa-wave-fanpage','community-starts','race photo','public',array['{asset}']::uuid[],'{key}');")
    if i % 3 == 1:
        return sql(f"select public.post_celebrity_notice_comment('{owner}','kyaa-wave-fanpage','community-starts','race comment','{notice_key}');")
    return sql(f"select public.post_fan_post_comment('{owner}','{post}',null,'race post comment','{comment_key}');")
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
    list(pool.map(race, range(12)))
assert sql(f"select count(*) from public.fan_program_stamps where app_user_id='{owner}' and program_notice_id='{notice}'") == '1'
assert sql(f"select count(*) from public.fan_posts where app_user_id='{owner}' and idempotency_key='{key}'") == '1'
assert sql(f"select count(*) from public.celebrity_notice_comments where app_user_id='{owner}'") == '1'
assert sql(f"select count(*) from public.fan_post_comments where app_user_id='{owner}'") == '1'
print('Wave concurrent duplicate photos + notice comments + fan-post comments: one of each, one stamp passed')
PY
