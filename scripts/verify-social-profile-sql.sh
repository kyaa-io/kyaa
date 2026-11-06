#!/usr/bin/env bash
# Sends real SQL answers through the real profile route, on a disposable database with every migration applied.
# A route test with a mocked RPC cannot see what SQL returns: canSend once came back null and every such test passed.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
OUT="$(mktemp "${TMPDIR:-/tmp}/social-profile-sql.XXXXXX")"
trap 'rm -f "$OUT"' EXIT
export SOCIAL_PROFILE_SQL_RESPONSES="$OUT"
BYUS_CLEAN_DB_SHELL_ASSERTION_FILE=supabase/tests/social_profile_sql_responses.sh bash scripts/verify-clean-migration-chain.sh >/dev/null
(cd apps/web && ../../node_modules/.bin/vitest run server/social/profile-sql-responses.test.ts)
diff -u apps/web/server/social/profile-sql-responses.json "$OUT"
echo "PASS social profile SQL responses"
