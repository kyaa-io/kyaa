#!/usr/bin/env bash
# Disposable local database only: runs the real route exports against it (Toss API is stubbed).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)/apps/web"
CHEMI_LOCAL_ROUTES=1 npx vitest run server/chemi-reading/routes.local-db.test.ts
