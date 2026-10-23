# Supabase Storage → S3 operator tool

Run from the production migration worktree with Node24. This tool never deletes or edits Supabase objects or application owner UUIDs. No AWS operation has been executed during implementation.

## Preparation

1. Install the existing workspace dependencies. Use the existing AWS CLI login for Sallylab996, account `996702758024`, Seoul. No new package is required (`pg`, S3 SDK and its installed credential-provider-ini dependency).
2. Apply `supabase/migrations/20261130001000_aws_asset_storage.sql` to target RDS, then review/apply `import-schema.sql` **target only**. The guarded DMS path uses `byus_storage_migrator`, with BYPASSRLS and DML on only the three S3 metadata tables. Never grant this role to application roles. The barrier closes its durable import gate, sets NOLOGIN, and verifies session drain before final verification. Existing reserve/confirm RPCs deliberately require live upload reservations; importing historical objects through them would either fail or weaken application guards. This tool instead uses parameterized SQL imports, under an exclusive transaction lock shared with native upload/delete tables.
3. Supply source/target PostgreSQL connection URLs and `SUPABASE_STORAGE_SERVICE_TOKEN` through environment variables (or your existing secret launcher reading 0600 files). Never use command-line secrets. PostgreSQL URLs must match the exact configured host, login, database and port5432, using separate verified CA files. Target RDS is not inferred from environment defaults.
4. Create a **0600** config JSON, with these keys (example identities are placeholders):

```json
{
  "environment": "dev",
  "accountId": "996702758024",
  "region": "ap-northeast-2",
  "profile": "Sallylab996",
  "sourceProjectRef": "abcdefghijklmnopqrst",
  "publicBucket": "byus-public-dev-996702758024",
  "privateBucket": "byus-private-dev-996702758024",
  "publicBaseUrl": "https://assets-dev.example.test",
  "source": {"host":"db.abcdefghijklmnopqrst.supabase.co","database":"postgres","user":"postgres","connectionEnv":"SOURCE_STORAGE_DB_URL","caFile":"/private/source-ca.pem"},
  "target": {"host":"explicit-instance.rds.amazonaws.com","database":"postgres","user":"storage_migration","connectionEnv":"TARGET_STORAGE_DB_URL","caFile":"/private/global-bundle.pem","forwardedPort":15433},
  "outputFile": "/private/unique-inventory.json",
  "barrierFile": "/private/storage-fence.json"
}
```

Bucket names must contain the explicit environment and account suffix as shown, or match the platform stack’s environment-specific `publicassetsbucket` / `privateproofsbucket` names. STS account, assumed-role ARN, S3 ExpectedBucketOwner, public access block (all4), no public policy/ACL, versioning and bucket-owner-enforced ACLs are checked before any copy. Both buckets remain private at S3: only `cms-assets` maps to the CloudFront-served `public-assets/cms-assets/<original path>` prefix; all other logical buckets map to `<logical bucket>/<original path>` in the private bucket. Existing private presigned URL authorization remains unchanged. Inventory records actual bucket policies, source bucket flags/MIME/size limits and source storage RLS policies for review; checking policy status alone does not prove CloudFront OAC or private-access application authorization. Those require the platform access tests before cutover.

For an operator SSM tunnel, optional `target.forwardedPort` uses loopback transport while retaining the real RDS hostname in the connection URL and TLS certificate verification. Omit it when running inside the VPC. Source connections always use the direct verified endpoint.

## Initial copy, delta, cutover

```sh
node scripts/aws-storage-migrate.mjs /private/config.json
node scripts/aws-storage-migrate.mjs /private/config-next-output.json --apply
node scripts/aws-storage-migrate.mjs /private/config-new-output.json --apply
node scripts/aws-storage-migrate.mjs /private/config-final-delete-output.json --apply --barrier --delete-delta
node scripts/aws-storage-migrate.mjs /private/config-final-verify-output.json --verify --barrier
```

Default is read-only dry-run: fetch source bodies, calculate SHA256, inspect target collisions and write a new private local inventory. It never labels a dry-run as verified. `--verify` additionally requires every source object to have imported provenance and actual target body equality, original metadata/user_metadata equality, source generation equality, and deleted managed objects to remain tombstoned and absent from current S3 HEAD. A final `--verify --barrier` is the only mode that emits `verified:true`. Each command needs a **new** output filename; overwrite is refused before remote operations.

`--apply` copies sequentially (source objects bounded to50MiB), preserves original logical path, source UUID, owner UUID and all metadata in the private provenance record, and imports ready application metadata. It hashes downloaded bytes, supplies SHA256 on S3 Put, downloads the target body to hash it, then rereads the source row before committing. S3 ETag is used only as a conditional-write token, never as a content checksum. Same generation/hash/metadata is verified without another Put. Original source updates during copy fail closed; rerun to reconcile. Exact-generation interrupted tagged uploads can be adopted only after verifying body bytes. A different-generation orphan requires operator review; the tool never guesses ownership or overwrites native S3 objects. Partial failures retain prior committed objects and versioned S3 data for retry; they do not imply successful migration.

Each source reread also compares the parsed metadata parameters against PostgreSQL's original jsonb values. A JSON number that cannot round-trip through JavaScript is rejected before Put; rounded metadata is never accepted as an exact copy. SQL NULL remains distinct from an object value. Supporting such source values requires an explicitly tested lossless importer change.

A DB table lock prevents native reserve/delete transactions during each import. Conditional S3 Put/Delete protects against uploads already in flight; existing native objects, queued deletions and tombstones are conflicts. Source deletion delta requires `--apply --barrier --delete-delta`; only provenance-managed keys can be deleted, using the recorded ETag, and target metadata is tombstoned. Source files are never deleted. Versioning retains prior S3 bytes. An object reappearing at a tombstoned path is deliberately blocked for manual reconciliation, preventing resurrection of application-deleted assets.

When the target has migration controls, each apply/delete transaction acquires the import lease before any S3 work. One 15-second deadline covers BEGIN, lease acquisition, source download, S3 retries and body consumption, metadata writes and COMMIT. Expiry aborts network requests, destroys stalled bodies and DB transports, and fails the entire run without a success receipt. Rollback is bounded to five seconds; PG17 LOCAL `transaction_timeout` also terminates the server transaction if network failure prevents delivery of the socket close. An uncertain PUT/DELETE requires fresh CAS and downloaded-body reconciliation while the target remains fenced; it never permits automatic enable. The transaction timeout and blocked-lease release were tested in real disposable PG17 for active SQL and idle sessions. This per-object limit is not evidence that the whole cutover meets 300 seconds.

Before the final deletion pass and verify, stop **all** source and target storage writers (web, mobile direct uploads, workers, admin, cleanup/cron), drain in-flight requests and stop S3 deletion outbox consumers. Create a fresh0600 fence attestation:

```json
{"sourceProjectRef":"abcdefghijklmnopqrst","environment":"dev","allStorageWritersStopped":true,"stoppedAt":"2026-10-23T00:00:00.000Z","writers":["web","mobile-direct-upload","admin","media-worker","storage-cleanup"]}
```

Attestation must be less than1hour old; it is an operator claim, not an automatic distributed lock. Keep writers fenced through final verification and the atomic application routing switch. A live inventory before/after fingerprint also rejects concurrent source mutations. **Do not report cutover safe based on counts, HEAD or checksum metadata alone.** Test a public CMS asset via CloudFront, anonymous private rejection, authorized owner access and unauthorized-user rejection separately. A successful private file checksum is not proof of end-user access policy.

## URL review and retention

The0600 inventory includes explicit old→new public URL rewrite candidates, object paths/owners/metadata and policies. Treat it as private; stdout/errors contain only counts/bytes/hashes and generic failure text. Rewrite candidates use the existing storage client's `ASSET_PUBLIC_BASE_URL/cms-assets/path` contract; the CloudFront origin prefix must route to S3 `public-assets/`. The tool **never edits application DB URLs**. Review exact references and approve a separate DB rewrite before any change; no recursive string substitution is performed.

Keep Supabase Storage and existing public URL access working for at least90days after cutover so cached app versions and residual DB URLs still resolve. Private presigned URLs retain their own expiry; the legacy service's auth/API must remain until supported clients stop requesting those URLs. Retention does not permit continuing dual writes: after cutover, AWS is the sole storage writer and rollback needs explicit data reconciliation. No source deletion command is provided.

## Local evidence and remaining checks

`PATH=/Users/jewel/.nvm/versions/node/v24.13.1/bin:$PATH node --test scripts/aws-storage-migrate.test.mjs` covers configuration/path guards, byte hashes, no-write dry-run, delta classification, concurrent source changes, native/tombstone conflicts, idempotence and interrupted upload recovery. These are injected local fixtures, not AWS or PostgreSQL integration. Real S3 conditional writes/versioning, PostgreSQL import permissions/locks, source API download behavior, actual260-object inventory, CloudFront and private authorization must be rehearsed by the authorized operator before production copy. No local S3 server was available or claimed as tested.
