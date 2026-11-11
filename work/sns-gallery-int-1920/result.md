# SNS-GALLERY-INT-1920

Integrated 07472726594a34919fff6a8979f8f105e0526318 into 6bea1fe470617c0d2a024a4903d206e5b5d8e183. Merge commit f9c2efe178d6775659103be2dcfcff072d573337. DESIGN append sections retained; home shorts retains main accessibility/caption/backdrop and prefers persisted thumbnail.

Passed: pre-commit, design-lint, deployment-notices check (full SHAs), notices-per-branch; tsc; exact workflow UI scope 101 files/1426 tests; API scope 153 passed files with 1648 passed tests and 13 skips, one resource-contention timeout in SDK source scan passed focused retry (6 tests). SNS scope 35 passed/1 DB skipped, including unset-secret 503 rejection. Backfill planner 3 tests passed; CLI dry-run fixture retained, not operational notice IDs. Source-only-content contract reviewed; originals unchanged.

An initial overbroad ui/app/api run was stopped after collecting unrelated failures; exact gate workflow scopes above completed. No secret configured, no operational DB access, no deployment or push. Real screens and operational migration execution not verified.

Migration order and operational effects:
1. 20261222000000_sns_ingest.sql: private ingest tracking/media tables and privileged RPCs; deploy notification worker accepting sns_ingest_stale first. Secret remains off.
2. 20261222001000_video_thumbnails.sql: private video cover metadata and service-role RPCs; public reads require visible notice and ready S3 objects; no automatic historic backfill.
3. 20261222002000_sns_thumbnail_storage_reservation.sql: updates shared S3 reservation function to authorize registered ingest/thumbnail uploads; apply after both preceding migrations, with thumbnail migration as a pair.
