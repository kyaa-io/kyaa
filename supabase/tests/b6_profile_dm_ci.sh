#!/usr/bin/env bash
# CI shell assertion for B6: runs the rollback check (S18) on a copy, since it commits. Called by verify-clean-migration-chain.sh.
set -euo pipefail
: "${PGHOST:?}" "${PGPORT:?}" "${PGDATABASE:?}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
createdb -h "$PGHOST" -p "$PGPORT" -T "$PGDATABASE" b6_rollback_scratch
bash "$ROOT/supabase/tests/b6_rollback.sh" "$PGHOST" "$PGPORT" b6_rollback_scratch
dropdb -h "$PGHOST" -p "$PGPORT" b6_rollback_scratch
