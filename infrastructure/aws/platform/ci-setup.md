# AWS release and scheduler setup

All current ByUs environments use Sallylab account `996702758024`, Seoul
`ap-northeast-2`, with separate environment roles, stacks, VPC/security boundaries,
secrets, databases and buckets. Earlier split-account examples are not deployment
authority. No resources or notices are sent by creating these files.

## GitHub Environment and OIDC bootstrap

Create GitHub Environments `dev`, `staging`, and `prod`. Restrict deployment branches
to `main`; require production approval and prevent self-review where available.
The OIDC subject is `repo:kyaa-io/kyaa:environment:<environment>`, audience
`sts.amazonaws.com`. Environment subjects do not contain the branch, so the
Environment branch restriction and the workflow's main-only guard are both required.

Provision `ci-role.json` once through the administrator bootstrap with
`CAPABILITY_NAMED_IAM` (the role name is explicit). Supply the exact
web/scheduler stack names, source and target ECR repository ARNs, code bucket ARN,
runtime secret ARN, and an existing CloudFormation service execution role ARN.
That execution role must trust CloudFormation and have reviewed permissions for
these stack resources. GitHub's role can pass only that role, change the two named
stacks, push its repository, read the source repository, and inspect deployment
health. It has no general IAM administration or web-secret read permission.
`CronSecretArn`, when supplied, must be a **dedicated** secret containing only the
same `CRON_SECRET` used by the application, not the complete web runtime secret.
The `AwsRoleArn` output becomes the Environment's `AWS_ROLE_ARN` variable.

Set the Environment variables:

- `AWS_ROLE_ARN`: the exact environment OIDC role.
- `AWS_PLATFORM_CONFIG_JSON`: the complete validated `environment` configuration
  described in `README.md`, with `profile: "oidc"`, the selected account, and
  `cloudFormationRoleArn`. `parameters.WebImageUri` identifies the target ECR
  repository; its digest is replaced by the release artifact before deployment.
- `AWS_SCHEDULE_CONFIG_JSON`: optional until scheduler bootstrap is ready; use
  `ci-schedules.example.json`, replacing every placeholder with stack outputs.
- `LEGACY_PG_CRON_PROOF_JSON`: required for the first scheduler activation;
  see retirement evidence below.

Keep `TELEGRAM_BUG_REPORT_OPERATOR_SECRET` in the existing GitHub secret. Builds
receive no secret files or Docker build arguments. Configure ECR tag immutability
and cross-repository read permission for the source repository if promotion uses
another repository/account. The current account is the same across environments.

`configure-aws-credentials` restricts the actual caller to the configured account;
`aws-release.mjs preflight` independently checks STS before Docker login/push, and
the existing deployment validator checks STS again before CloudFormation changes.
The OIDC path requires an Actions session token and never selects a local profile.
Provisioning/assumption of the real roles has to be verified in AWS; local tests
and cfn-lint do not prove IAM authorization or a live deployment.

## Build once, promote, and announce

A main push or a manual `dev` run builds the secretless web image, native media
image and cron ZIP, checks the runtime images, and deploys dev. Artifacts bind the
40-character source SHA, both immutable ECR digests, cron SHA-256, repository ID,
workflow path and run ID. No mutable image tag or operator-supplied digest can be
deployed. Artifacts are published only after successful deployment verification.

Dispatch `staging` with `source_run_id` from that successful dev run. Dispatch
`prod` with the same source run plus `staging_run_id` for a successful staging run
with the same web/media digests and cron bytes. Each source run must be successful,
on main, in this repository, and from `.github/workflows/aws-platform.yml`.
The source SHA must remain an ancestor of main. Promotion copies rather than
rebuilds the images and compares the destination digest; a conversion mismatch
fails instead of accepting a different image.

CloudFormation success, ECS stable desired/running counts, the exact task image
and `RELEASE_SHA`, and candidate CloudFront live/readiness responses must all pass.
A GitHub deployment success is recorded after these checks. Production can remain
a preview: a notice is eligible only when `https://kyaa.io/api/health/live` reports
that exact SHA. Both the script and server independently verify the trusted Actions
run/path, actor and payload. The existing Vercel and wave rules, bootstrap receipts,
same-commit baselines and uncertain-delivery protections remain in use. AWS calls
the existing sender from its own globally serialized workflow, because statuses
written by `GITHUB_TOKEN` do not start another workflow. Never resend an uncertain
receipt automatically and never send the same notice manually.

## One cron owner

`cron-ownership.json` is the single checked-in owner/enable manifest. All AWS
schedules default disabled. The six `vercel.json` paths are checked exactly.
Requests still use the existing constant-time Bearer secret check; AWS additionally
sends `x-byus-scheduler: aws`. The authenticated owner gate skips the other provider.
Unauthenticated requests retain their existing 401 behavior.

To enable a selected environment, change its manifest owner to `aws` and enable
its AWS schedules. The enable command requires the live AWS ownership endpoint
with provider `aws`, owner `aws`, and the exact release revision. For production it
also checks the old explicit `.vercel.app` origin, which must report provider
`vercel` and owner `aws` or `disabled`. Set `legacyGateRevision` to that deployed
legacy gate revision; it must be an ancestor of the new release. This lets a
retired Vercel deployment remain fixed on later AWS releases. A gate on the AWS
preview alone does not retire the old Vercel cron.

The pg_cron manifest maps all ten legacy job names. The old direct reclaim job and
Edge `queue-maintenance` both become one real `reclaim_stale_blockchain_jobs` RPC.
Seven retention RPCs run unchanged through a strict allowlist. Edge mint invocation
is replaced by the Lambda cadence worker. Disable all source cron jobs, both legacy
Edge entrypoints and their old static AWS invocation credentials before activation.
The source-fenced migration audit must be fresh; do not reuse an earlier audit
that showed active jobs. Retire the two legacy configure RPCs only through the
reviewed DB port process. `get_infrastructure_health()` still needs its genuine
AWS observation port; the migration blocker is not bypassed with dummy SQL.

Provide a reviewed projection as `LEGACY_PG_CRON_PROOF_JSON` and pin its SHA-256 in
`legacyPgCronProofSha256`. Required fields: `schemaVersion:1`, `environment`,
`accountId`, `phase:"enabled"`, `sourceIdentityHash`, `sourceGuardHash`,
`verifiedSourceGuardHash`, `outstandingWriters:0`, `activeCronJobs:0`,
`activeCronWorkers:0`, `legacyEdgeDisabled:true`, `observedAt`. The identity hash is
SHA-256 of `audit.source.identity`; guard hashes are the actual verified MD5 from
DB guard observation, not an invented success flag. Use the migration ledger's
fence state and a post-stop read-only source audit. The initial activation requires
an observation at most one hour old. The deployed scheduler stack pins the accepted
evidence hash; ordinary updates can reuse that same retirement receipt while the
owner remains AWS. Disabling then re-enabling requires fresh evidence again.
No live source observation has been fabricated by this implementation.

Mint polling is best-effort every five seconds, not a hard timing SLA. Scheduler
has 60-second delivery precision even with flexible windows off, so each delivered
minute starts a bounded 125-second overlapping window on the global five-second
wall-clock grid. Alternating 0/59-second delivery jitter is covered; missed ticks
are skipped, not fired in a catch-up burst. Overlapping attempts remain subject to
the existing target's single writer and atomic claims. The wrapper has concurrency
8, 128 MiB and a 400-second outer bound (125s window + 260s bounded synchronous
response wait + margin); the target remains concurrency **1**, Node 24/arm64 and at most
240 seconds. The enable command reads and checks those target settings and its
matching environment/secret binding. Only throttling is skipped. There is no
asynchronous target backlog and no change to mint claims, leases or nonces.
The old Edge code omitted InvocationType and was synchronous, which is why the
wrapper also uses RequestResponse with SDK retries disabled.

For a 30-day idle baseline with arrivals on the tick boundary, the wrapper adds
43,200 requests and 43,200 × 120 × 0.125 = 648,000 GB-seconds per active environment.
Depending on tick alignment it returns after roughly 120–125 seconds. AWS's Seoul
ARM first-tier list rates published 2026-10-22 are $0.0000133334/GB-second and
$0.0000002/request: about **$8.65–$9.01/month per active environment**, before free
tier. Slow target-response waiting, extra accepted target invokes from overlap,
logs and existing mint execution are separate. The target remains concurrency one;
throttled synchronous attempts do not create an asynchronous backlog. All schedules
are currently disabled. [AWS Seoul Lambda Price List](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSLambda/current/ap-northeast-2/index.json),
[AWS Scheduler delivery precision](https://docs.aws.amazon.com/scheduler/latest/UserGuide/schedule-types.html).

## Native media

`Dockerfile.media.aws` builds the existing ffmpeg/ffprobe/sharp worker independently
from Next. Its handler uses the same reservations, 115-second job bound, 50-MiB
video/60-second duration limits and fenced cleanup. Lambda is 2 GiB, 180 seconds,
2 GiB `/tmp`, x86_64 and reserved concurrency 1. The web role may invoke only
`byus-media-<its environment>` asynchronously after an owned upload completes;
a one-minute schedule picks up unfinished work. The Next native path remains the
default until AWS owns scheduling. Failed or uncertain immediate invocation does
not blindly retry; the durable validation job remains for the fallback.

The media secret needs its **private environment PostgREST URL**, not the web
container's localhost sidecar. Approved bases are `https://data.dev.kyaa.io`,
`https://data.staging.kyaa.io`, and `https://data.kyaa.io`; the private DNS zone and
selected VPC must resolve them. No credentials or public raw REST endpoint are
introduced. Keep `HOSTING_PROVIDER`, worker controls, Node options and IAM
credentials out of the secret. The application uses standard IAM task/Lambda roles.
Runtime-image native checks run in CI. Actual Lambda execution, 50-MiB/60-second
calibration, IAM authorization and private DNS connectivity still require the AWS
runtime verification; passing local mocks or Mac tests is not that evidence.
