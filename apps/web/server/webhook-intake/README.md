# Cutover webhook intake

Default behavior is unchanged. Only `WEBHOOK_BUFFER_ENABLED=true` enables buffering on these POST paths:

- `/api/store/webhooks/apple`, `/api/store/webhooks/google`
- `/api/auth/apple/notifications`
- `/api/notifications/solapi/webhook`
- `/api/telegram/bug-reports/webhook`
- `/api/instagram/deauthorize`, `/api/instagram/data-deletion`

The exact existing provider validators run at intake, using captured repository calls rather than the real database. Invalid signatures/envelopes keep their existing rejection responses. Authenticated events that perform no business mutation (such as test notifications or unrelated Solapi/Telegram updates) keep their existing acknowledgement without queueing. A normal successful mutation is acknowledged only after an encrypted S3 envelope and an acknowledged SQS SendMessage. Any persistence failure returns503. No request body, identity, authentication header, queue payload or DB error text is logged.

Envelopes preserve exact original body bytes, content type, the applicable authentication header, trusted receive time and the verified fixed RPC batch. Unrelated cookies/auth headers are excluded. S3 SSE-KMS stores envelopes at `webhook-intake/<APP_ENV>/<random UUID>.json`; FIFO messages contain only version, environment, key and SHA256. They never contain arbitrary replay URLs. Consumer validates the source queue ARN, pointer namespace, environment, content digest, KMS identity, envelope digest and per-provider RPC allowlist.

Google OIDC issuer/audience/email/expiry/10minute age checks happen **at intake**, followed by existing Play API transaction verification. Consumer trusts only the protected producer→S3→SQS boundary and processes the captured verified operation; it does not replay an expired bearer over HTTP. Google token fingerprint is stable across refunds, so both FIFO deduplication and durable inbox keys include the verified operation hash. A later refund or purchase-state change cannot be discarded merely because its purchase token matches an earlier event.

## Configuration and packaging

Producer: `APP_ENV=dev|staging|prod`, `WEBHOOK_BUFFER_ENABLED=true`, `WEBHOOK_BUFFER_QUEUE_URL=https://sqs.ap-northeast-2.amazonaws.com/996702758024/byus-webhook-buffer-<APP_ENV>.fifo`, `WEBHOOK_BUFFER_BUCKET=byus-…-<APP_ENV>-996702758024`, `WEBHOOK_BUFFER_KMS_KEY_ID=arn:aws:kms:ap-northeast-2:996702758024:key/<UUID>`. Instagram intake also requires `WEBHOOK_BUFFER_INSTAGRAM_SECRET_SHA256=sha256(INSTAGRAM_APP_SECRET)`. Pin the same expected digest and active Instagram secret on both source and target before enabling buffering; a mismatch rejects intake. This digest is configuration, never a request-controlled value.

`WEBHOOK_INGRESS_HOLD=true` temporarily rejects all seven POST paths with503 before reading bodies, verifying providers or calling storage/DB. It takes precedence over buffering and must be deployed to every active ingress before an abort drain. The existing authenticated `/api/internal/cron/ownership` endpoint reports the actual revision and `webhookIntake:{mode:"hold"|"buffer"|"direct",accepting:boolean}`. A hold response alone does not prove earlier deployments are retired or inflight requests drained; record those separately before replay.

The temporary Vercel producer uses sensitive `WEBHOOK_BUFFER_ACCESS_KEY_ID` and `WEBHOOK_BUFFER_SECRET_ACCESS_KEY` variables only for webhook S3/SQS clients. General AWS credential variables remain forbidden by app configuration. Scope the temporary IAM key to this environment's intake/receipt prefixes, queue and KMS key, give its policy an expiry, and revoke it when retiring Vercel. AWS runtimes reject these overrides and use their assigned IAM roles.

Consumer entry: `server/webhook-intake/consumer.ts` export `handler`, bundled for Node24 as `index.handler`. Package external `pg@8.23.1` and its runtime dependencies under ZIP `node_modules`; bundle existing S3/SecretsManager SDKs. Include official AWS `global-bundle.pem`. The runtime uses `createRequire(process.cwd()+"/package.json")` for pg; ZIP root is `/var/task`. Do not bundle unrelated web config or require localhost PostgREST.

Consumer needs the common APP_ENV/queue/bucket/KMS values plus `WEBHOOK_REPLAY_ENABLED=true`, `RDS_CA_BUNDLE_PATH=/var/task/global-bundle.pem` and `WEBHOOK_DB_SECRET_ARN=arn:aws:secretsmanager:ap-northeast-2:996702758024:secret:byus/<APP_ENV>/webhook-replay-…`. Secret JSON contains exactly `{host,port:5432,database,username:"byus_webhook_replay",password}`. Host must be the explicit RDS TLS endpoint. Use private subnets and restricted RDS5432 access. The Lambda verifies TLS with the packaged CA. Do not put the password in environment literals or logs.

Apply `supabase/migrations/20261130002000_webhook_intake.sql` to the migration schema before fencing/replication. It creates a restricted NOLOGIN `webhook_replay_executor` group; grant membership to the separately provisioned login `byus_webhook_replay`. That login needs CONNECT and the inherited schema USAGE/function EXECUTE, not table access, BYPASSRLS or service-role privileges. The security-definer replay function has a fixed RPC dispatch allowlist and executes inbox deduplication, all business calls and inbox insertion in **one PostgreSQL transaction**. Failures roll back earlier batch effects too. Inbox rows hold hashes and event keys, not raw envelopes; service_role cannot select the table. Keep inbox deduplication records throughout payload retention and recovery.

Use FIFO SQS with FIFO DLQ and `ReportBatchItemFailures`. Consumer stops after its first failure and reports all subsequent batch records as failed, retaining order rather than skipping later events. Use timeout/visibility settings that exceed the bounded DB work; failed DB calls never produce an ACK. Keep the event-source mapping **disabled during both database fences**. S3 envelopes and receipts have no automatic expiration, so pending events remain recoverable beyond queue and DLQ retention; block public access and require TLS/SSE-KMS. Do not log Lambda event objects. Producer permissions: SendMessage, envelope/receipt PutObject, receipt-prefix GetObject and required KMS operations. Consumer: queue receive/delete, envelope GetObject, receipt-prefix PutObject, exact DB secret GetSecretValue and required KMS operations.

## Five-minute cutover order

1. Provision resources and test seven signatures with event-source mapping disabled. Enable buffering on the still-active source application before applying the DB write fence. Verify acknowledgement is backed by S3+SQS and that direct business writes stopped. Keep OAuth callbacks and internal scheduled writers out of this buffer; stop those writers separately.
2. Fence source and target, replicate/verify the committed barrier, switch application routing and enable only the selected database. Keep buffered ingress on for the queue drain.
3. Explicitly enable the consumer mapping and replay flag against the selected DB secret. Its first successful replay is a target write and closes simple source rollback, exactly like any application write.
4. Drain queue and resolve DLQ/failures before disabling buffering. Maintain one selected consumer database; never replay into source and target simultaneously. A crash after DB commit but before SQS ACK safely repeats the inbox transaction. Check metrics without inspecting sensitive payload logs.

## Instagram confirmation status

Buffering returns a stable opaque confirmation code derived from the original body and pinned Instagram app secret. Before SQS acknowledgement the producer writes an encrypted, nonpersonal `{state:"pending"}` receipt at `webhook-receipts/<APP_ENV>/<SHA256(code)>.json`. `IfNoneMatch:*` prevents retrying intake from replacing a completed status. Consumer changes that receipt to `complete` after atomic DB processing; a receipt-write failure retains the queue message for idempotent retry. The existing deletion status route prefers real DB completion, then reads only this tiny status object for a syntactically valid43-character code. It cannot expose identities or access envelopes. Completed confirmations expire after30days; pending confirmations stay available until processing completes; invalid/unknown codes retain the original unavailable result. Pending status does not claim deletion is complete.

Solapi buffered replies retain HTTP200 and accepted count but explicitly return `recorded:0,buffered:true`; durable receipt intake is not represented as an already-completed DB write. Default nonbuffered responses remain unchanged.

## Evidence

New fixture tests cover actual Solapi signature verification, source/target drift, opaque confirmations, expired Google bearer replay boundary, changed-refund keys, exact body capture, sensitive-header exclusion, S3/SQS failures and acknowledgement presence, FIFO failure retention, protected status and checksum/path tampering. Existing Apple/store/Telegram/Instagram tests remain in the targeted regression command. SQL assertions cover duplicate/conflicting events, role access, stale Telegram edits and atomic rollback with a controlled second business-call failure; the operator must execute them in the full target migration chain. Real AWS queue/KMS/IAM, S3, RDS and provider deliveries are not exercised by these local mocks.
