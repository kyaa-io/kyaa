#!/usr/bin/env bash
# Run through verify-clean-migration-chain.sh (disposable database with every migration applied; PGHOST/PGPORT/PGDATABASE are set by it).
# Content translation cache: SQL rules for the title/article slots and the leases, then the real translate route against this database
# (cache hit calls the provider 0 times, concurrent same-key misses call it once, expired holders cannot save, private posts are refused).
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
for file in content_translation_slots content_translation_leases; do
  psql -X -v ON_ERROR_STOP=1 -q -f "$ROOT_DIR/supabase/tests/$file.sql"
done
cd "$ROOT_DIR/apps/web"
TR_TITLE_DB=1 TR_LEASE_DB=1 ../../node_modules/.bin/vitest run --maxWorkers=4 \
  server/fan-posts/content-translation-slots.db.test.ts server/fan-posts/content-translation-lease.db.test.ts
