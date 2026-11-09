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

## dev.kyaawave.com

`dev-site.yaml` is one stack, `kyaawave-dev-site`, in **us-east-1** (CloudFront needs
its ACM certificate there; the dev bucket therefore lives there too). It holds bucket
`kyaawave-dev-site`, the `dev.kyaawave.com` certificate (DNS-validated in zone
Z014565610XXUC51BLYF2), CloudFront, Route 53 A/AAAA aliases and role
`kyaawave-dev-github-release`. It does not reference the production stacks, bucket,
distribution, certificate or role. Hosting matches `site.json` except for names, the
host, `/api/events` going to dev.kyaa.io and an `X-Robots-Tag: noindex` header;
`aws-wave-release.test.mjs` fails on any other difference.

Release: a push to `wave/dev` (or a manual run on `wave/dev` with `environment=dev`)
runs the same `kyaawave-aws.yml` job with `WAVE_ENVIRONMENT=dev`. Its GitHub
deployment record is `AWS wave dev` (not production, so no Bug Report notice). The
role trusts only `ref:refs/heads/wave/dev` and can only write the dev bucket's
`current/` and `releases/` and invalidate the dev distribution. A run whose branch and
environment do not match fails.

Apply, with the write profile (example name `kyaa-admin`):

    aws cloudformation create-change-set --profile kyaa-admin --region us-east-1 \
      --stack-name kyaawave-dev-site --change-set-name initial --change-set-type CREATE \
      --template-body file://infrastructure/aws/wave/dev-site.yaml --capabilities CAPABILITY_NAMED_IAM
    aws cloudformation wait change-set-create-complete --profile kyaa-admin --region us-east-1 \
      --stack-name kyaawave-dev-site --change-set-name initial
    aws cloudformation describe-change-set --profile kyaa-admin --region us-east-1 \
      --stack-name kyaawave-dev-site --change-set-name initial \
      --query 'Changes[].ResourceChange.[Action,LogicalResourceId,ResourceType,Replacement]' --output table

Expect exactly 12 `Add` rows: Certificate, Bucket, OAC, Routes, Cache, Headers,
EventsHeaders, Distribution, BucketPolicy, AliasA, AliasAAAA, ReleaseRole. Any
`Modify`/`Remove` or a production name means the wrong stack or region: stop.

    aws cloudformation execute-change-set --profile kyaa-admin --region us-east-1 \
      --stack-name kyaawave-dev-site --change-set-name initial
    aws cloudformation wait stack-create-complete --profile kyaa-admin --region us-east-1 \
      --stack-name kyaawave-dev-site
    aws cloudformation describe-stacks --profile kyaa-readonly --region us-east-1 \
      --stack-name kyaawave-dev-site --query 'Stacks[0].Outputs' --output table
    gh variable set AWS_WAVE_DEV_DISTRIBUTION_ID --repo kyaa-io/kyaa --body <DistributionId output>

Order and checks:
1. Merge the `aws-wave-release.mjs` change into `main` first. Before that, a `wave/dev`
   run stops at `WAVE_ACTIONS_ONLY` without touching AWS.
2. Create the stack (above). ACM adds its own validation CNAME to the zone;
   certificate issuance blocks stack completion (usually minutes).
3. Check that `dig +short dev.kyaawave.com A` resolves and that
   `kyaawave.com`/`www.kyaawave.com` records and the prod stacks are unchanged.
4. Set `AWS_WAVE_DEV_DISTRIBUTION_ID`. Without it the job stops at
   `INVALID_DISTRIBUTION`; a production ID stops at AccessDenied or
   `WRONG_WAVE_DISTRIBUTION`.
5. Create `wave/dev` from `codex/kyaawave-homepage-20261018` plus the workflow change
   and push it. The `AWS wave dev` deployment environment is created by that first
   record. The release verifies every file through CloudFront and dev.kyaawave.com.
   Putting the workflow change on the production branch is a separate push that
   releases production; do it together with the approved content.

Removing dev: empty the bucket, delete the stack (the bucket is retained by policy;
delete it afterwards), then delete the repository variable.
