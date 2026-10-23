# Storage backend

Supabase remains the default. `AWS_STORAGE_ENABLED=true` requires `AWS_REGION`,
`S3_PUBLIC_BUCKET`, `S3_PRIVATE_BUCKET`, and an HTTPS `ASSET_PUBLIC_BASE_URL`.
The S3 SDK uses its standard IAM credential chain; production does not configure
access keys in this adapter. Apply `20261130001000_aws_asset_storage.sql` before
activation and complete the object copy before switching a live environment.

Only `cms-assets` maps to the public bucket. `fan-avatars`, certification proofs,
fan content, mobile media (including DMs), and photocards remain private. Every
private physical key starts with its logical bucket, such as
`certification-proofs/<owner>/<mission>/<upload>.webp`. Public URLs use
`<ASSET_PUBLIC_BASE_URL>/cms-assets/<path>`. Set the base to
`https://<distribution>/public-assets`; public physical keys are
`public-assets/cms-assets/<path>`, matching the CloudFront OAC policy. Keep the Next image allowlist aligned
with that exact host and prefix.

Uploads retain their existing reservation and content validation. Mobile PUT
signatures additionally bind the reservation's MIME type, byte length and
`If-None-Match: *`, expire after two hours, and require the existing client to
send the no-overwrite header. The returned `s3.*` token carries expiry information
only; the AWS signature authorizes the PUT. Private reads remain behind the
existing application authorization and support HEAD and byte ranges.

Metadata is service-role-only. Upload intent creates delayed orphan cleanup;
confirmed uploads cancel that intent. Deletes queue durable intent before S3
I/O, retain a fenced retry on failure, and report success only after deletion.
Mobile maintenance and account deletion processing drain due retries. The
compatibility view includes original Supabase metadata and confirmed S3 metadata
while keeping tombstones and unfinished uploads out of guarded publication.

`POSTGREST_URL` and `POSTGREST_SERVICE_TOKEN` independently switch database REST
calls through `server/data/client.ts`; configure both or neither. Supabase auth
remains separate, and its URL/key are still required while that provider is used.
