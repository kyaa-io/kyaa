#!/usr/bin/env bash
# Runs inside verify-clean-migration-chain.sh, which sets PGHOST, PGPORT and PGDATABASE.
set -euo pipefail
psql -X -v ON_ERROR_STOP=1 -q -f supabase/tests/social_profile_sql_responses.sql | grep -v '^\(BEGIN\|ROLLBACK\|DO\)$' > "$SOCIAL_PROFILE_SQL_RESPONSES"
