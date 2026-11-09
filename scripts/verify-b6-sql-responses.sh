#!/usr/bin/env bash
# B6: sends real SQL answers through the real profile, message and admin routes, on a disposable database with every migration.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
OUT="$(mktemp "${TMPDIR:-/tmp}/b6-sql.XXXXXX")"
trap 'rm -f "$OUT"' EXIT
export B6_SQL_RESPONSES="$OUT"
BYUS_CLEAN_DB_SHELL_ASSERTION_FILE=supabase/tests/b6_sql_responses.sh bash scripts/verify-clean-migration-chain.sh >/dev/null
(cd apps/web && ../../node_modules/.bin/vitest run --maxWorkers=4 server/social/b6-sql-responses.test.ts)
diff -u apps/web/server/social/b6-sql-responses.json "$OUT"
echo "PASS B6 SQL responses"
