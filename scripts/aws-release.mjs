import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { loadTemplate, validateConfig } from './aws-platform-deploy.mjs';
export const WORKFLOW_PATH = '.github/workflows/aws-platform.yml';
export const REPOSITORY = 'kyaa-io/kyaa';
export const REPOSITORY_ID = 1307387500;
const SHA = /^[a-f0-9]{40}$/, DIGEST = /^sha256:[a-f0-9]{64}$/;
const fail = message => { throw new Error(message); };
export function trustedRun(run, id, completed = true) {
  if (!Number.isSafeInteger(Number(id)) || Number(id) < 1 || run?.id !== Number(id) || run.repository?.id !== REPOSITORY_ID || run.repository?.full_name !== REPOSITORY || run.path !== WORKFLOW_PATH || run.head_branch !== 'main' || !SHA.test(run.head_sha ?? '') || !['push', 'workflow_dispatch'].includes(run.event) || (completed && (run.status !== 'completed' || run.conclusion !== 'success'))) fail('UNTRUSTED_AWS_WORKFLOW_RUN');
  return run;
}
export function validateRelease(release, run) {
  if (!release || Object.keys(release).some(key => !['schemaVersion', 'sourceSha', 'sourceRunId', 'imageDigest', 'imageUri', 'repositoryId', 'workflowPath', 'mediaImageDigest', 'mediaImageUri', 'cronCodeSha256'].includes(key)) || release.schemaVersion !== 1 || !SHA.test(release.sourceSha ?? '') || !DIGEST.test(release.imageDigest ?? '') || release.sourceSha !== run.head_sha || release.sourceRunId !== run.id || release.repositoryId !== REPOSITORY_ID || release.workflowPath !== WORKFLOW_PATH || !/^\d{12}\.dkr\.ecr\.ap-northeast-2\.amazonaws\.com\/[a-z0-9/_-]+@sha256:[a-f0-9]{64}$/.test(release.imageUri ?? '') || !release.imageUri.endsWith(`@${release.imageDigest}`) || !DIGEST.test(release.mediaImageDigest ?? '') || !/^[a-f0-9]{64}$/.test(release.cronCodeSha256 ?? '') || !release.mediaImageUri?.startsWith(release.imageUri.split('/')[0] + '/') || !release.mediaImageUri.endsWith(`@${release.mediaImageDigest}`)) fail('INVALID_AWS_RELEASE_ARTIFACT');
  return release;
}
export function assertPromotion(environment, release, proof, sourceRun) {
  if (!['dev', 'prod'].includes(environment)) fail('INVALID_ENVIRONMENT');
  if (environment === 'prod' && (!proof || proof.schemaVersion !== 1 || proof.environment !== 'dev' || proof.status !== 'success' || proof.workflowRunId !== sourceRun?.id || proof.sourceSha !== release.sourceSha || proof.imageDigest !== release.imageDigest || proof.mediaImageDigest !== release.mediaImageDigest || proof.cronCodeSha256 !== release.cronCodeSha256 || proof.sourceRunId !== release.sourceRunId || proof.workflowPath !== WORKFLOW_PATH || proof.repositoryId !== REPOSITORY_ID)) fail('SUCCESSFUL_MATCHING_DEV_REQUIRED');
}
export async function github(path, init = {}) {
  if (!process.env.GITHUB_TOKEN) fail('GITHUB_TOKEN_REQUIRED');
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}${path}`, { ...init, headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json', 'content-type': 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(20_000) });
  if (!response.ok) fail(`GITHUB_HTTP_${response.status}`);
  return response.json();
}
// Read persisted API records; creation responses may omit fields used by notice verification.
export async function recordedDeploymentEvent(id, githubCall = github) {
  if (!Number.isSafeInteger(id) || id < 1) fail('INVALID_DEPLOYMENT_ID');
  const deployment = await githubCall(`/deployments/${id}`);
  const [status] = await githubCall(`/deployments/${id}/statuses?per_page=1`);
  if (deployment.id !== id || status?.state !== 'success') fail('VERIFIED_DEPLOYMENT_REQUIRED');
  return { repository: { id: REPOSITORY_ID, full_name: REPOSITORY }, deployment, deployment_status: status };
}
const execute = (file, args, options = {}) => execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...options }).trim();
const aws = args => { const output = execute('aws', ['--no-cli-pager', '--region', 'ap-northeast-2', ...args, '--output', 'json']); return output ? JSON.parse(output) : {}; };
export async function releaseConfig(environment, release, sourceConfig, { assertOnMain = sha => execute('git', ['merge-base', '--is-ancestor', sha, 'origin/main']) } = {}) {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.GITHUB_REF !== 'refs/heads/main' || process.env.GITHUB_REPOSITORY !== REPOSITORY) fail('MAIN_GITHUB_ACTIONS_ONLY');
  assertOnMain(release.sourceSha);
  const config = structuredClone(sourceConfig);
  if (config.kind !== 'environment' || config.environment !== environment || config.region !== 'ap-northeast-2') fail('CONFIG_ENVIRONMENT_MISMATCH');
  config.profile = 'oidc';
  const repository = config.parameters.WebImageUri?.split('@')[0];
  if (!repository || !repository.startsWith(`${config.accountId}.dkr.ecr.ap-northeast-2.amazonaws.com/`)) fail('TARGET_ECR_REPOSITORY_REQUIRED');
  config.parameters.WebImageUri = `${repository}@${release.imageDigest}`;
  const ownership = JSON.parse(await readFile(new URL('../infrastructure/aws/platform/cron-ownership.json', import.meta.url), 'utf8'));
  if (ownership.environments[environment].owner === 'aws' && !process.env.AWS_SCHEDULE_CONFIG_JSON) fail('AWS_CRON_OWNERSHIP_REQUIRES_SCHEDULE_CONFIG');
  config.runtimeEnvironment = { ...config.runtimeEnvironment, RELEASE_SHA: release.sourceSha, CRON_OWNER: ownership.environments[environment].owner, ...(process.env.AWS_SCHEDULE_CONFIG_JSON ? { MEDIA_WORKER_FUNCTION_ARN: `arn:aws:lambda:ap-northeast-2:${config.accountId}:function:byus-media-${environment}` } : {}) };
  validateConfig(config, await loadTemplate(config.kind));
  return config;
}
export async function verifyDeployment(config, release, { awsCall = aws, fetcher = fetch } = {}) {
  const identity = awsCall(['sts', 'get-caller-identity']);
  if (identity.Account !== config.accountId) fail('AWS_CALLER_ACCOUNT_MISMATCH');
  const stack = awsCall(['cloudformation', 'describe-stacks', '--stack-name', config.stackName]).Stacks?.[0];
  if (!['CREATE_COMPLETE', 'UPDATE_COMPLETE'].includes(stack?.StackStatus)) fail('CLOUDFORMATION_NOT_SUCCESSFUL');
  const outputs = Object.fromEntries((stack.Outputs ?? []).map(item => [item.OutputKey, item.OutputValue]));
  if (!outputs.ClusterName || !outputs.ServiceName || !/^[a-z0-9-]+\.cloudfront\.net$/.test(outputs.CloudFrontDomainName ?? '')) fail('DEPLOYMENT_OUTPUTS_MISSING');
  awsCall(['ecs', 'wait', 'services-stable', '--cluster', outputs.ClusterName, '--services', outputs.ServiceName]);
  const service = awsCall(['ecs', 'describe-services', '--cluster', outputs.ClusterName, '--services', outputs.ServiceName]).services?.[0];
  if (!service || service.runningCount !== service.desiredCount || service.desiredCount < 1 || service.deployments?.length !== 1 || service.deployments[0].rolloutState !== 'COMPLETED') fail('ECS_NOT_HEALTHY');
  const task = awsCall(['ecs', 'describe-task-definition', '--task-definition', service.taskDefinition]).taskDefinition;
  if (!task?.containerDefinitions?.some(container => container.name === 'web' && container.image === config.parameters.WebImageUri && container.environment?.some(item => item.name === 'RELEASE_SHA' && item.value === release.sourceSha))) fail('ECS_RELEASE_IDENTITY_MISMATCH');
  async function health(origin, ready) {
    try {
      const response = await fetcher(`${origin}/api/health/${ready ? 'ready' : 'live'}`, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15_000) });
      const body = await response.json();
      return response.ok && (ready ? body.status === 'ready' : body.status === 'ok' && body.revision === release.sourceSha);
    } catch { return false; }
  }
  const candidate = `https://${outputs.CloudFrontDomainName}`;
  if (!await health(candidate, false) || !await health(candidate, true)) fail('AWS_RELEASE_READINESS_FAILED');
  const publicLive = config.environment === 'prod' && await health(`https://${config.parameters.WebDomainName}`, false);
  return { schemaVersion: 1, environment: config.environment, status: 'success', sourceSha: release.sourceSha, sourceRunId: release.sourceRunId, imageDigest: release.imageDigest, imageUri: config.parameters.WebImageUri, mediaImageDigest: release.mediaImageDigest, cronCodeSha256: release.cronCodeSha256, repositoryId: REPOSITORY_ID, workflowPath: WORKFLOW_PATH, workflowRunId: Number(process.env.GITHUB_RUN_ID), accountId: config.accountId, stackName: config.stackName, publicLive, deployedAt: new Date().toISOString() };
}
async function main() {
  const [action, environment, ...args] = process.argv.slice(2);
  await mkdir('work/aws-release', { recursive: true });
  if (action === 'source') {
    const run = trustedRun(await github(`/actions/runs/${args[0]}`), args[0]);
    await appendFile(process.env.GITHUB_OUTPUT, `sha=${run.head_sha}\nrun_id=${run.id}\n`); return;
  }
  if (action === 'preflight') {
    if (process.env.GITHUB_ACTIONS !== 'true' || process.env.GITHUB_REF !== 'refs/heads/main' || process.env.GITHUB_REPOSITORY !== REPOSITORY || !process.env.AWS_SESSION_TOKEN) fail('OIDC_MAIN_ONLY');
    const config = JSON.parse(process.env.AWS_PLATFORM_CONFIG_JSON);
    config.profile = 'oidc';
    if (config.kind !== 'environment' || config.environment !== environment || config.region !== 'ap-northeast-2' || !config.cloudFormationRoleArn) fail('EXPLICIT_ENVIRONMENT_EXECUTION_ROLE_REQUIRED');
    validateConfig(config, await loadTemplate(config.kind));
    if (aws(['sts','get-caller-identity']).Account !== config.accountId) fail('AWS_CALLER_ACCOUNT_MISMATCH');
    return;
  }
  if (action === 'build-record') {
    const digest = args[0], uri = args[1];
    const run = trustedRun(await github(`/actions/runs/${process.env.GITHUB_RUN_ID}`), process.env.GITHUB_RUN_ID, false);
    const release = validateRelease({ schemaVersion: 1, sourceSha: run.head_sha, sourceRunId: run.id, imageDigest: digest, imageUri: uri, mediaImageDigest: args[2], mediaImageUri: args[3], cronCodeSha256: args[4], repositoryId: REPOSITORY_ID, workflowPath: WORKFLOW_PATH }, run);
    await writeFile('work/aws-release/aws-release.json', JSON.stringify(release)); return;
  }
  const release = JSON.parse(await readFile('work/aws-release/aws-release.json', 'utf8'));
  if (environment !== 'dev' && release.sourceRunId !== Number(process.env.SOURCE_RUN_ID)) fail('SOURCE_ARTIFACT_RUN_MISMATCH');
  const run = trustedRun(await github(`/actions/runs/${release.sourceRunId}`), release.sourceRunId, environment !== 'dev');
  validateRelease(release, run);
  if (environment === 'prod') {
    assertPromotion(environment, release, JSON.parse(await readFile('work/aws-release/aws-dev-result.json', 'utf8')), run);
  } else assertPromotion(environment, release);
  const config = await releaseConfig(environment, release, JSON.parse(process.env.AWS_PLATFORM_CONFIG_JSON));
  await writeFile('work/aws-release/aws-release-config.json', JSON.stringify(config), { mode: 0o600 });
  if (action === 'prepare') {
    const targetMedia = process.env.AWS_SCHEDULE_CONFIG_JSON ? JSON.parse(process.env.AWS_SCHEDULE_CONFIG_JSON).parameters.MediaImageUri.split('@')[0] + '@' + release.mediaImageDigest : config.parameters.WebImageUri.split('@')[0] + '@' + release.mediaImageDigest;
    if (!targetMedia.startsWith(`${config.accountId}.dkr.ecr.ap-northeast-2.amazonaws.com/`)) fail('MEDIA_TARGET_ACCOUNT_MISMATCH');
    await appendFile(process.env.GITHUB_OUTPUT, `source_media_image=${release.mediaImageUri}\ntarget_media_image=${targetMedia}\nmedia_digest=${release.mediaImageDigest}\nsource_image=${release.imageUri}\ntarget_image=${config.parameters.WebImageUri}\nsha=${release.sourceSha}\ndigest=${release.imageDigest}\n`); return;
  }
  if (action === 'record') {
    const result = JSON.parse(await readFile(`work/aws-release/aws-${environment}-result.json`, 'utf8'));
    if (result.status !== 'success' || result.imageDigest !== release.imageDigest || result.sourceSha !== release.sourceSha || result.workflowRunId !== Number(process.env.GITHUB_RUN_ID)) fail('VERIFIED_DEPLOYMENT_REQUIRED');
    const payload = { provider: 'aws', schemaVersion: 1, environment, sourceSha: release.sourceSha, imageDigest: release.imageDigest, sourceRunId: release.sourceRunId, workflowRunId: result.workflowRunId, workflowPath: WORKFLOW_PATH, publicLive: result.publicLive };
    const deployment = await github('/deployments', { method: 'POST', body: JSON.stringify({ ref: release.sourceSha, auto_merge: false, required_contexts: [], environment: `AWS ${environment === 'prod' ? 'production' : environment}`, production_environment: environment === 'prod', transient_environment: environment !== 'prod', payload }) });
    await github(`/deployments/${deployment.id}/statuses`, { method: 'POST', body: JSON.stringify({ state: 'success', environment: deployment.environment, environment_url: `https://${config.parameters.WebDomainName}`, log_url: `https://github.com/${REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` }) });
    await writeFile('work/aws-release/aws-deployment-event.json', JSON.stringify(await recordedDeploymentEvent(deployment.id))); return;
  }
  if (action === 'verify') { const result=await verifyDeployment(config,release);await writeFile(`work/aws-release/aws-${environment}-result.json`,JSON.stringify(result));if(process.env.GITHUB_OUTPUT)await appendFile(process.env.GITHUB_OUTPUT,`public_live=${result.publicLive}\n`);return; }
  fail('INVALID_RELEASE_COMMAND');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
