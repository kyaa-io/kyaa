#!/usr/bin/env bash
set -euo pipefail
[[ "$PGDATABASE" == byus_clean && "$PGHOST" == */byus-clean-db.*/socket ]]
cd apps/web
CHEMI_LOCAL_ROUTES=1 ../../node_modules/.bin/vitest run server/chemi-reading/routes.local-db.test.ts
