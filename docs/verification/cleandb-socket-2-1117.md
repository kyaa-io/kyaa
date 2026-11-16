# CLEANDB-SOCKET-2-1117 — partial implementation

Baseline: 49da8227733214ce59c9c93ae3c3539a9ef442ee.

Four standalone local fixtures now disable TCP, use their private socket directory in every psql URL, and set LC_ALL=C. BYUS_TEMP_DB_PORT defaults to 55473 and allows repeatable collision checks. No release notice: verification-only changes.

Verified on 2026-11-17 with PostgreSQL 17:
- verify-content-thumbnails-local-db.mjs: two concurrent processes, port 55473, both PASS.
- verify-video-thumbnails-local-db.mjs: two concurrent processes, port 55473, both PASS.
- verify-fan-ticket-activity-local-db.mjs and verify-gggi-event-local-db.mjs: concurrent processes sharing port 55473, both PASS (not two copies of each).

Gate shell wrappers delegate to verify-clean-migration-chain.sh, already socket-only at baseline.

## Outstanding scope

Repository-wide pg_ctl/initdb/postgres search also identified AWS fixtures: scripts/aws-db-{migrate,dms-adapter,dms-infinity,dms-execute-lease,storage-fence,storage-projection,identity-import}.test.mjs, scripts/aws-storage-migrate.test.mjs, and scripts/aws-webhook-abort-{sql,replay}.test.mjs. These remain TCP-based. The migration fixtures depend on production module localRehearsal validation requiring loopback host/serverAddress and numeric inet_server_port; Unix sockets return null serverAddress/serverPort. Changing only startup flags would invalidate the identity assertions. Socket support needs explicit local-only identity and connection handling plus regression coverage, preserving remote TLS/DNS checks.

infrastructure/aws/database/{live-portability-rehearsal.mjs,dms-fixture/sql.test.mjs} already use private sockets and disable TCP; locale normalization still needs review. portability.test.mjs availability detection does not start a cluster. verify-e2e-fix-batch-1650.mjs uses postgres --single (no listener); locale normalization remains.

Reproduce collision checks: run the relevant node script twice concurrently with PATH including PostgreSQL 17 binaries and BYUS_TEMP_DB_PORT=55473; retain both exit statuses and outputs. Full requested repository-wide conversion is not complete.
