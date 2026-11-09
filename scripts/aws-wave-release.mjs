import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdir, readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { github, recordedDeploymentEvent } from './aws-release.mjs';

export const WAVE_BRANCH = 'codex/kyaawave-homepage-20261018';
export const WORKFLOW_PATH = '.github/workflows/kyaawave-aws.yml';
const MARKER = '.well-known/kyaa-wave-release.json';
// prod is the unchanged default; dev is selected only by WAVE_ENVIRONMENT=dev from the wave/dev job.
export const TARGETS = {
  prod: { branch: WAVE_BRANCH, bucket: 'kyaawave-prod-996702758024', region: 'ap-northeast-2', host: 'kyaawave.com', deploymentEnvironment: 'AWS wave production', production: true },
  dev: { branch: 'wave/dev', bucket: 'kyaawave-dev-site', region: 'us-east-1', host: 'dev.kyaawave.com', deploymentEnvironment: 'AWS wave dev', production: false },
};
export function waveTarget(environment = 'prod') {
  if (!Object.hasOwn(TARGETS, environment)) throw new Error('INVALID_WAVE_ENVIRONMENT');
  return { environment, ...TARGETS[environment] };
}
const shaPattern = /^[a-f0-9]{40}$/;
const execute = (file, args) => execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
const awsIn = region => args => {
  const output = execute('aws', ['--no-cli-pager', '--region', region, ...args]);
  return output ? JSON.parse(output) : {};
};
export async function files(root, relative = '') {
  const result = [];
  for (const name of (await readdir(join(root, relative))).sort()) {
    const path = join(relative, name);
    const stat = await lstat(join(root, path));
    if (stat.isSymbolicLink()) throw new Error('SYMLINK_NOT_ALLOWED');
    if (stat.isDirectory()) result.push(...await files(root, path));
    else if (stat.isFile() && path !== MARKER) result.push(path);
    else if (!stat.isFile()) throw new Error('REGULAR_FILES_ONLY');
  }
  return result.sort();
}
export async function artifactDigest(root) {
  const entries = await files(root);
  for (const required of ['index.html', 'en/index.html', 'app.mjs', 'styles.css', 'content.json', 'robots.txt', 'sitemap.xml']) {
    if (!entries.includes(required)) throw new Error(`MISSING_WAVE_FILE:${required}`);
  }
  const hash = createHash('sha256');
  for (const path of entries) hash.update(path + '\0').update(createHash('sha256').update(await readFile(join(root, path))).digest('hex') + '\n');
  return 'sha256:' + hash.digest('hex');
}
export async function prepare(root, sourceSha) {
  if (!shaPattern.test(sourceSha)) throw new Error('INVALID_SOURCE_SHA');
  const marker = { schemaVersion: 1, sourceSha, artifactDigest: await artifactDigest(root) };
  await mkdir(join(root, '.well-known'), { recursive: true });
  await writeFile(join(root, MARKER), JSON.stringify(marker) + '\n');
  return marker;
}
export function validateRun(run, sourceSha, runId, branch = WAVE_BRANCH) {
  if (run.id !== runId || run.repository?.id !== 1307387500 || run.repository?.full_name !== 'kyaa-io/kyaa' || run.head_branch !== branch || run.head_sha !== sourceSha || run.path !== WORKFLOW_PATH || !['push', 'workflow_dispatch'].includes(run.event) || run.status !== 'in_progress') throw new Error('UNTRUSTED_WAVE_RUN');
}
export async function verifyFiles(root, origin, fetcher = fetch) {
  const marker = JSON.parse(await readFile(join(root, MARKER), 'utf8'));
  for (const path of [...await files(root), MARKER]) {
    const response = await fetcher(`${origin}/${path}`, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000) });
    if (!response.ok || !Buffer.from(await response.arrayBuffer()).equals(await readFile(join(root, path)))) throw new Error(`PUBLIC_FILE_MISMATCH:${path}`);
  }
  return marker;
}
async function main() {
  const [action, directory, sourceSha] = process.argv.slice(2);
  const root = resolve(directory || '');
  if (action === 'prepare') { await prepare(root, sourceSha); return; }
  if (action === 'verify') { await verifyFiles(root, sourceSha); return; }
  const target = waveTarget(process.env.WAVE_ENVIRONMENT || 'prod');
  const { bucket: BUCKET } = target, aws = awsIn(target.region);
  if (action !== 'deploy' || process.env.GITHUB_ACTIONS !== 'true' || process.env.GITHUB_REPOSITORY !== 'kyaa-io/kyaa' || process.env.GITHUB_REF !== `refs/heads/${target.branch}` || !shaPattern.test(sourceSha) || sourceSha !== process.env.GITHUB_SHA) throw new Error('WAVE_ACTIONS_ONLY');
  const runId = Number(process.env.GITHUB_RUN_ID);
  validateRun(await github(`/actions/runs/${runId}`), sourceSha, runId, target.branch);
  const branch = await github(`/branches/${encodeURIComponent(target.branch)}`);
  if (branch.commit?.sha !== sourceSha) throw new Error('STALE_WAVE_RELEASE');
  if (aws(['sts', 'get-caller-identity', '--output', 'json']).Account !== '996702758024') throw new Error('WRONG_AWS_ACCOUNT');
  const distributionId = process.env.AWS_WAVE_DISTRIBUTION_ID;
  if (!/^[A-Z0-9]+$/.test(distributionId || '')) throw new Error('INVALID_DISTRIBUTION');
  const distribution = aws(['cloudfront', 'get-distribution', '--id', distributionId, '--output', 'json']).Distribution;
  if (!distribution?.DistributionConfig?.Aliases?.Items?.includes(target.host) || !distribution.DistributionConfig.Origins.Items.some(o => o.DomainName === `${BUCKET}.s3.${target.region}.amazonaws.com` && o.OriginPath === '/current')) throw new Error('WRONG_WAVE_DISTRIBUTION');
  const marker = JSON.parse(await readFile(join(root, MARKER), 'utf8'));
  if (marker.schemaVersion !== 1 || marker.sourceSha !== sourceSha || marker.artifactDigest !== await artifactDigest(root)) throw new Error('ARTIFACT_CHANGED');
  // Publish the marker only after all bytes; invalidate every fixed-name file before verification.
  execute('aws', ['s3', 'sync', root, `s3://${BUCKET}/releases/${sourceSha}/`, '--cache-control', 'public,max-age=0,must-revalidate', '--only-show-errors']);
  execute('aws', ['s3', 'sync', root, `s3://${BUCKET}/current/`, '--delete', '--exclude', MARKER, '--cache-control', 'public,max-age=0,must-revalidate', '--only-show-errors']);
  // awscli guesses .mjs as binary on some runners; set the browser module MIME explicitly.
  for (const path of await files(root)) {
    if (path.endsWith('.mjs') || path.startsWith('assets/')) {
      execute('aws', ['s3', 'cp', join(root, path), `s3://${BUCKET}/current/${path}`, '--cache-control', path.startsWith('assets/') ? 'public,max-age=86400' : 'public,max-age=0,must-revalidate', ...(path.endsWith('.mjs') ? ['--content-type', 'text/javascript'] : []), '--only-show-errors']);
    }
  }
  execute('aws', ['s3', 'cp', join(root, MARKER), `s3://${BUCKET}/current/${MARKER}`, '--cache-control', 'no-store', '--content-type', 'application/json', '--only-show-errors']);
  const invalidation = aws(['cloudfront', 'create-invalidation', '--distribution-id', distributionId, '--paths', '/*', '--output', 'json']).Invalidation.Id;
  execute('aws', ['cloudfront', 'wait', 'invalidation-completed', '--distribution-id', distributionId, '--id', invalidation]);
  await verifyFiles(root, 'https://' + distribution.DomainName);
  await verifyFiles(root, `https://${target.host}`);
  const payload = { provider: 'aws', schemaVersion: 1, environment: target.environment, site: 'wave', sourceSha, artifactDigest: marker.artifactDigest, workflowRunId: runId, workflowPath: WORKFLOW_PATH, publicLive: true };
  const deployment = await github('/deployments', { method: 'POST', body: JSON.stringify({ ref: sourceSha, environment: target.deploymentEnvironment, auto_merge: false, required_contexts: [], production_environment: target.production, payload }) });
  await github(`/deployments/${deployment.id}/statuses`, { method: 'POST', body: JSON.stringify({ state: 'success', environment: target.deploymentEnvironment, environment_url: `https://${target.host}`, log_url: `https://github.com/kyaa-io/kyaa/actions/runs/${runId}`, auto_inactive: false }) });
  await mkdir('work/aws-wave', { recursive: true });
  await writeFile('work/aws-wave/deployment-event.json', JSON.stringify(await recordedDeploymentEvent(deployment.id), null, 2) + '\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
