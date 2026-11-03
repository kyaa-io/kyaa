# kyaa wave AWS hosting

The independent static source remains on `codex/kyaawave-homepage-20261018` in
`sites/kyaa-wave`. That branch's `kyaawave-aws.yml` tests/builds its exact SHA before
assuming the branch-scoped static release role. Trusted release and notice scripts
come from `main`. The role can change only the Wave bucket objects and invalidate
its distribution; no application secrets, DB, IAM or stack updates are permitted.

Bootstrap `site.json` in account 996702758024, Seoul, then `ci-role.json` with the
DistributionId output and CAPABILITY_NAMED_IAM. Set repository variable
AWS_WAVE_DISTRIBUTION_ID to that output. The existing ACM certificate is in
us-east-1. OAC serves the private bucket's `current/` prefix. Bucket/version history
is retained; immutable source-keyed build copies are under `releases/<sha>/`.

The root, English directory, www and legacy language-query redirects match the
prior Vercel behavior. `/api/events` forwards uncached POST requests to kyaa.io;
no application server is added. Query strings never reach the S3 origin. The
source-bound marker is uploaded last, followed by full cache invalidation and
byte verification of every served file through both CloudFront and the public
hostname. Do not record a successful deployment before those checks pass.

AWS Wave deployment records use environment `AWS wave production`, site `wave`,
sourceSha, artifactDigest, workflowRunId/path and publicLive. Both the trusted
sender and server verify the exact branch/run/SHA plus the public marker.
Workflow-level `telegram-production-notices` concurrency preserves the existing
receipt/uncertain-delivery protections. Never reset or retry an uncertain receipt
without destination evidence.

Before cutover export every current DNS record. Preserve TXT, CAA and ACM CNAMEs.
Move authoritative DNS to Route53, then apex/www to the distribution alias. Keep
previous Vercel deployment and DNS recovery evidence until live parity is verified;
only then disconnect the Wave project's Git integration. Other Vercel projects
and the team plan are separate retirement decisions.

Rollback: restore a verified `releases/<sha>/` build into `current/` (preserve module
MIME text/javascript and asset Cache-Control max-age=86400), upload its marker last,
invalidate `/*`, wait and run `aws-wave-release.mjs verify DIST_DIR PUBLIC_ORIGIN`.
Alternatively restore the saved Vercel DNS target. Neither rollback sends a notice
or rewrites a receipt automatically.
