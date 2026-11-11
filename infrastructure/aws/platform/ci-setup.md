# AWS release and scheduler setup

All current kyaa environments use Sallylab account `996702758024`, Seoul
`ap-northeast-2`, with separate environment roles, stacks, VPC/security boundaries,
secrets, databases and buckets. Earlier split-account examples are not deployment
authority. No resources or notices are sent by creating these files.

## GitHub Environment and OIDC bootstrap

The active release path uses GitHub Environments `dev` and `prod`; staging is no
longer a release target or a production prerequisite. Restrict `prod` deployment
branches to `main`; `dev` permits only `main` and the exact `release/production`
branch (no wildcard). Require production approval and prevent self-review where available.
The OIDC subject is `repo:kyaa-io/kyaa:environment:<environment>`, audience
`sts.amazonaws.com`. Environment subjects do not contain the branch, so the
Environment branch restriction and the workflow's environment/branch guard are both required.

Provision `ci-role.json` once through the administrator bootstrap with
`CAPABILITY_NAMED_IAM` (the role name is explicit). Supply the exact
web/scheduler stack names, source and target ECR repository ARNs, code bucket ARN,
runtime secret ARN, and an existing CloudFormation service execution role ARN.
That execution role must trust CloudFormation and have reviewed permissions for
these stack resources. GitHub's role can pass only that role, change the two named
stacks, push its repository, read the source repository, and inspect deployment
health. It has no general IAM administration or web-secret read permission.
The execution role's managed policies (`byus-<env>-cfn-platform-N`) are not defined in
this repository and the pipeline does not update them. When `environment.json` adds an
`AWS::CloudWatch::Alarm`, the administrator bootstrap must first allow
`cloudwatch:PutMetricAlarm` and `cloudwatch:DeleteAlarms` for that alarm's exact name
(`arn:aws:cloudwatch:<region>:<account>:alarm:byus-<env>-database-replication-slot-lag`
and `...:alarm:byus-<env>-database-transaction-log-usage`), in dev before prod. Otherwise the
stack update fails with CREATE_FAILED and rolls back (run 41836220645).
Before updating application roles, the administrator bootstrap must create the
`byus-${Environment}-app-execution-boundary` and `byus-${Environment}-app-task-boundary`
policies and attach them to the existing execution/task roles. Preserve their current
permissions and allow only the environment's PostgREST secret, image repository and
webhook resources needed by the update. Scope `PutRolePolicy`, `DeleteRolePolicy` and
`PutRolePermissionsBoundary` to the exact roles with `iam:PermissionsBoundary` equal
to the corresponding policy ARN. The CloudFormation execution role must not be able
to remove or change those boundary policies.
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

Dispatch `prod` with `source_run_id` from that successful dev run. Production
downloads both the source artifact and its successful dev deployment result, and
requires their source SHA, web/media digests, cron bytes, workflow and run IDs to
match. No staging deployment is required. Each source run must be successful,
on main (or an exact `release/production` push), in this repository, and from
`.github/workflows/aws-platform.yml`. Production execution itself remains on main.
The source SHA must remain an ancestor of main. Promotion copies rather than
rebuilds the images and compares the destination digest; a conversion mismatch
fails instead of accepting a different image.

For an explicitly approved production release, reserve promotion immediately
after the main push creates its dev run, instead of keeping a local laptop awake:

```sh
gh workflow run aws-approved-promotion.yml --ref main \
  -f source_run_id=DEV_RUN_ID -f expected_sha=FULL_APPROVED_SHA
```

This manual-only reservation waits on a GitHub runner for that exact main-push
dev run to succeed, then requests the existing production workflow. A failed,
cancelled or timed-out dev run, a mismatched SHA, or main advancing before the
request stops promotion. The production workflow still verifies its artifacts,
serializes deployment and applies its own stale/duplicate release protections.
An uncertain dispatch response is not retried: inspect Actions before creating
another request. Reservations for the same dev run and source SHA are one-shot:
reruns and duplicate reservations stop for inspection even if the earlier
reservation failed or was cancelled. After inspecting Actions, use the existing
manual `prod` dispatch when a retry or same-version redeployment is intended.
A successful reservation means production was requested;
the production workflow's deployment result is the completion evidence. Laptop
sleep or loss of local network does not interrupt an accepted reservation.

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

## Isolated production hotfix

Use `release/production` only for a reviewed patch based on the actual live
production SHA, not a copy of current main. Keep unrelated application, database,
Pencil/group and infrastructure changes out of its diff. This branch may only
push-build/deploy **dev**; manual dev/prod dispatches from it are rejected.

Operator sequence (these steps are not performed by editing this repository):

1. Read the live production SHA and stable ECS state. Start the candidate from
   that exact commit and add only the approved fix, necessary pipeline support,
   tests and release notes. Review the entire diff against production.
2. Merge that candidate into main **without squashing/rebasing it**, preserving
   main's existing functionality. Push main with the support present before
   pushing the candidate to `release/production`: even hotfix dev requires the
   candidate to be an ancestor of `origin/main`. Do not promote the main build.
3. An authorized operator adds only the exact `release/production` branch to the
   GitHub **dev** Environment policy and reads it back. Read back **prod** as
   main-only; do not change AWS roles, OIDC subjects, secrets or resource policy.
   Verify dev availability before starting its release.
4. Push the reviewed candidate to `release/production`, identify its exact
   `aws-platform.yml` **push** run and SHA, and reserve immediately on main:

   ```sh
   gh workflow run aws-approved-promotion.yml --ref main \
     -f source_run_id=HOTFIX_DEV_RUN_ID -f expected_sha=FULL_HOTFIX_SHA
   ```

5. The reservation waits for success, checks the hotfix branch still points to
   the approved SHA and that SHA is an ancestor of main (main need not equal it),
   then dispatches production on main. Duplicate/rerun reservations and uncertain
   dispatch responses still require inspection, not automatic retries.
6. Production downloads the exact tested dev web/media/cron artifacts, rechecks
   all five latest push CI runs/attempts on the **source run's branch and SHA**,
   and always requires the actual stable live production revision to be an
   ancestor of the hotfix, even if `require_forward_only` is false. A newer live
   release blocks a stale hotfix. Inspect the verified production result, public
   exact-SHA health and automatic production notice receipt to establish completion.

There is no user-supplied CI branch override. DEV notices deliberately remain
main-only: the existing DEV endpoint trusts main, and supporting a hotfix does
not justify backporting server product changes. Production notices remain main
dispatches with source-main ancestry, exact live SHA and unchanged receipt rules.
Media cache lookup remains main-only with ancestor and fingerprint checks; a
hotfix may build media afresh rather than weakening provenance.

Backport integration: at baseline `52641b4183e78c03ea0a9725cdddeb560c5f4e19`,
`aws-platform.yml` lacks main's DEV notice job and its test command. When applying
this support diff to that baseline, keep that job absent and keep the baseline
test list (plus the new `aws-release*.test.mjs` test discovered by the glob).
Do not copy main's workflow wholesale or add DEV notice server code. The hotfix
test accepts either no DEV notice job or an explicitly main-only one. Reconcile
documentation against baseline rather than importing unrelated updates; run the
release, reservation, media and notice suites on the final candidate.

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

## Verified reuse and release checks

Before either environment changes CloudFormation, `aws-release-ci.mjs` requires
successful latest source-branch push runs and attempts for the exact source SHA: backend
security (including full typecheck), fan design system, dependency audit,
deployment-notice validation and CS inquiries. Missing, failed, cancelled or
untrusted runs block deployment; pending runs are bounded by a 40-minute wait.
The AWS Next build excludes test/e2e roots from its own typecheck only; the full
CI typecheck remains mandatory. All five workflows run on every main and exact
`release/production` push so the gate does not infer path-filter exemptions.

The DEV build cache (`dev-next-v2-…`, main only) carries the Turbopack compiler
cache and Next's typecheck build info, nothing else. With the build info Next
re-checks only files affected by the change; without it (first run, lockfile,
`next.config.ts` or `Dockerfile.aws` change) it checks everything, which takes
4.5–7 minutes on the runner. The typecheck itself is never skipped, and a type
error fails the image build either way. Each run replaces the cache instead of
merging into it. `cs-inquiries` reuses its own build info the same way.

Media reuse accepts only the newest successful main-push release, verified dev
result and proof from an ancestor commit. Its fingerprint covers bundled code,
dependency manifests, build/security tools and pinned Linux amd64 base digests.
The original build commit must also be an ancestor of that release. A matching
ECR digest in the configured account is required. Missing or malformed cached
metadata is a miss; API, authorization and transport failures stop the build.
Fresh images retain native smoke checks. Web/media promotion checks destination
digests and copies missing images concurrently; both results must pass.

Cron ZIPs use deterministic entries and timestamps. Scheduler updates are skipped
only after ownership/resource validation when the stable stack template, runtime
configuration, code hash and media digest match. The existing matching revision
parameters are retained on a no-op; current verified SHA and the decision remain
in diagnostics. This does not enable previously disabled schedules.

The release job publishes source/result artifacts before a separate production
notice job. Notice failure remains visible in its check and step summary without
changing verified service deployment success. Workflow-level serialization covers
the notice through completion; uncertain-delivery receipts are never retried or
modified automatically. Reruns overwrite same-run diagnostic/proof artifacts.
Timing and decisions are available in `aws-release-diagnostics-ENV` and CI proof;
reuse metadata is in `aws-media-proof`. A first release establishes the proof and
may still build media from scratch.

## Dev availability

Dev ECS and RDS run around the clock; no schedule stops them. If a dev release
fails because the DB or service is stopped (PostgREST 503, a service that cannot
stabilize, including during rollback), treat it as an environment availability
failure, not an image-build or CI-check failure. An operator with existing
permissions verifies the account, exact dev DB identifier and Environment=dev tag,
starts the existing DB, and waits for availability and any stack rollback to
complete. The GitHub release role has no DB start/stop permission. Do not disable
health checks or extend timeouts to hide this state.

On a failed/timed-out run, inspect the live CloudFormation/ECS state before a retry:
GitHub cancellation does not cancel the server-side stack operation. A failed
one-shot promotion reservation cannot be reused; follow the inspected manual
production retry path above, or reserve a new main-push run for a new reviewed
commit. Preserve the failed run as evidence and report retry time separately from
normal dev-to-production timing.

## Database alarms

The environment stack carries the free-storage alarm (`DatabaseStorageAlarm`, with a
CloudFormation-generated name) and the `byus-<env>-database-replication-slot-lag` (>5 GiB)
and `byus-<env>-database-transaction-log-usage` (>10 GiB) alarms. Only
the `prod` ones reach the KYAA-ALERT room through the notification monitor. For dev
and for a second human path, set `AlarmEmail` in the environment stack parameters to a
monitored address and confirm the SNS email subscription. The deploy script prints a
warning when `AlarmEmail` is empty.

Setting `AlarmEmail` makes CloudFormation create an `AWS::SNS::Subscription`, which needs
`sns:Subscribe` (and `sns:Unsubscribe`/`sns:GetSubscriptionAttributes` to read or remove it)
on the environment's `AlarmTopic`. Without them the update fails and rolls back (prod,
2026-11-11 08:05). Before setting `AlarmEmail` in an environment, the administrator applies
`cfn-execution-alarm-sns.json` for that environment (dev before prod), for example:

```sh
aws cloudformation deploy --stack-name byus-<env>-cfn-alarm-sns \
  --template-file infrastructure/aws/platform/cfn-execution-alarm-sns.json \
  --parameter-overrides Environment=<env> --capabilities CAPABILITY_NAMED_IAM
```

It attaches one inline policy to `byus-<env>-cfn-execution`, limited to topics named
`byus-<env>-platform-AlarmTopic-*` in this account and region. CI never updates it.

