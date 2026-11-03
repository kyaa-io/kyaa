import { readFile, writeFile, appendFile, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { github, trustedRun, validateRelease, assertPromotion, REPOSITORY, REPOSITORY_ID, WORKFLOW_PATH } from './aws-release.mjs';
const SHA = /^[a-f0-9]{40}$/, DIGEST = /^sha256:[a-f0-9]{64}$/, HASH = /^[a-f0-9]{64}$/;
const fail = message => { throw new Error(message); };
const execute = (file, args) => execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const aws = args => JSON.parse(execute('aws', ['--no-cli-pager', '--region', 'ap-northeast-2', ...args, '--output', 'json']));
export function resolvedBase(tag, manifest) {
  const descriptors = (Array.isArray(manifest) ? manifest : [manifest]).map(item => item?.Descriptor).filter(item => item?.platform?.os === 'linux' && item.platform.architecture === 'amd64');
  if (descriptors.length !== 1 || !DIGEST.test(descriptors[0].digest ?? '')) fail('MEDIA_BASE_DIGEST_REQUIRED');
  return `${tag}@${descriptors[0].digest}`;
}
export async function fingerprintMedia(bases, root = '.') {
  for (const base of Object.values(bases)) if (!/@sha256:[a-f0-9]{64}$/.test(base)) fail('MEDIA_BASE_DIGEST_REQUIRED');
  async function files(directory) {
    const entries = await readdir(join(root, directory), { withFileTypes: true });
    return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`]))).flat();
  }
  const paths = ['work/aws-media/index.cjs', 'package.json', 'package-lock.json', 'apps/web/package.json', 'apps/worker/package.json', 'Dockerfile.media.aws', 'scripts/apply-security-patches.mjs', 'scripts/aws-release-media-build.mjs', 'scripts/aws-release-media-reuse.mjs', ...await files('tools')].sort();
  const hash = createHash('sha256').update(JSON.stringify(bases));
  for (const path of paths) { const bytes = await readFile(join(root, path)); hash.update(JSON.stringify([path, bytes.length])); hash.update(bytes); }
  return hash.digest('hex');
}
export function reusableProof({ proof, release, dev, run, fingerprint, currentSha }, { assertAncestor = (ancestor, revision) => execute('git', ['merge-base', '--is-ancestor', ancestor, revision]) } = {}) {
  trustedRun(run, run.id); validateRelease(release, run); assertPromotion('prod', release, dev, run);
  if (run.event !== 'push' || run.id === Number(process.env.GITHUB_RUN_ID) || !SHA.test(currentSha)) fail('UNTRUSTED_MEDIA_SOURCE');
  if (!proof) return false;
  if (proof.schemaVersion !== 1 || proof.repositoryId !== REPOSITORY_ID || proof.workflowPath !== WORKFLOW_PATH || proof.sourceSha !== release.sourceSha || proof.sourceRunId !== run.id || proof.mediaImageDigest !== release.mediaImageDigest || !SHA.test(proof.originalBuildSha ?? '') || !HASH.test(proof.fingerprint ?? '')) return false;
  if (proof.fingerprint !== fingerprint) return false;
  if (proof.originalBuildSha !== run.head_sha) {
    try { assertAncestor(proof.originalBuildSha, run.head_sha); }
    catch (error) { if (error.status === 1) return false; throw error; }
  }
  return true;
}
export function imageExists(response, digest) {
  if (response.failures?.some(item => item.failureCode !== 'ImageNotFound')) fail('MEDIA_ECR_LOOKUP_FAILED');
  return response.images?.length === 1 && response.images[0].imageId?.imageDigest === digest;
}
export async function readPriorMetadata(directory) {
  const json = async (name, file) => JSON.parse(await readFile(join(directory, name, file), 'utf8'));
  try {
    return { release: await json('aws-release-source', 'aws-release.json'), dev: await json('aws-result-dev', 'aws-dev-result.json'), proof: await json('aws-media-proof', 'aws-media-proof.json') };
  } catch (error) {
    if (error instanceof SyntaxError || error.code === 'ENOENT') return null;
    throw error;
  }
}
async function priorCandidate(currentSha) {
  // shortcut: only the newest successful main push is eligible; older cache search can be added if measured misses matter.
  const listing = await github('/actions/workflows/aws-platform.yml/runs?event=push&branch=main&status=success&per_page=1');
  const candidate = listing.workflow_runs?.[0];
  if (!candidate || candidate.head_sha === currentSha || candidate.id === Number(process.env.GITHUB_RUN_ID)) return null;
  const run = trustedRun(await github(`/actions/runs/${candidate.id}`), candidate.id);
  if (run.event !== 'push') fail('UNTRUSTED_MEDIA_SOURCE');
  try { execute('git', ['merge-base', '--is-ancestor', run.head_sha, currentSha]); }
  catch (error) { if (error.status === 1) return null; throw error; }
  const artifacts = await github(`/actions/runs/${run.id}/artifacts?per_page=100`);
  const names = ['aws-release-source', 'aws-result-dev', 'aws-media-proof'];
  if (names.some(name => !artifacts.artifacts?.some(item => item.name === name && !item.expired))) return null;
  const directory = await mkdtemp(join(tmpdir(), 'media-proof-'));
  try {
    for (const name of names) execute('gh', ['run', 'download', String(run.id), '--repo', REPOSITORY, '--name', name, '--dir', join(directory, name)]);
    const metadata = await readPriorMetadata(directory);
    return metadata ? { run, ...metadata } : null;
  } finally { await rm(directory, { recursive: true, force: true }); }
}
export async function prepare(currentSha) {
  if (!SHA.test(currentSha ?? '')) fail('CURRENT_SHA_REQUIRED');
  execute('git', ['diff', '--exit-code', 'HEAD']);
  if (execute('git', ['rev-parse', 'HEAD']) !== currentSha) fail('MEDIA_CHECKOUT_SHA_MISMATCH');
  const nodeTag = 'node:24-bookworm-slim', lambdaTag = 'public.ecr.aws/lambda/nodejs:24';
  const inspect = tag => resolvedBase(tag, JSON.parse(execute('docker', ['manifest', 'inspect', '--verbose', tag])));
  const bases = { node: inspect(nodeTag), lambda: inspect(lambdaTag) };
  execute(process.execPath, ['scripts/aws-release-media-build.mjs']);
  const fingerprint = await fingerprintMedia(bases);
  const candidate = await priorCandidate(currentSha);
  let reuse = false;
  if (candidate && reusableProof({ ...candidate, fingerprint, currentSha })) {
    const config = JSON.parse(process.env.AWS_PLATFORM_CONFIG_JSON ?? 'null');
    const repositoryUri = config?.parameters?.WebImageUri?.split('@')[0];
    if (!/^\d{12}\.dkr\.ecr\.ap-northeast-2\.amazonaws\.com\/[a-z0-9/_-]+$/.test(repositoryUri ?? '')) fail('MEDIA_TARGET_REPOSITORY_REQUIRED');
    const [registry, ...repository] = repositoryUri.split('/');
    const account = registry.split('.')[0];
    if (account !== config.accountId) fail('MEDIA_ECR_ACCOUNT_MISMATCH');
    if (aws(['sts', 'get-caller-identity']).Account !== account) fail('MEDIA_ECR_ACCOUNT_MISMATCH');
    reuse = imageExists(aws(['ecr', 'batch-get-image', '--registry-id', account, '--repository-name', repository.join('/'), '--image-ids', `imageDigest=${candidate.release.mediaImageDigest}`]), candidate.release.mediaImageDigest);
  }
  const prepared = { sourceSha: currentSha, fingerprint, bases, reuse, mediaImageDigest: reuse ? candidate.release.mediaImageDigest : '', originalBuildSha: reuse ? candidate.proof.originalBuildSha : currentSha, priorRunId: reuse ? candidate.run.id : null };
  await mkdir('work/aws-release', { recursive: true });
  await writeFile('work/aws-release/aws-media-prepared.json', JSON.stringify(prepared, null, 2));
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `media_reuse=${reuse}\nmedia_digest=${prepared.mediaImageDigest}\nmedia_node_base=${bases.node}\nmedia_lambda_base=${bases.lambda}\n`);
  console.log(JSON.stringify(prepared));
}
export async function finish(currentSha, digest) {
  const prepared = JSON.parse(await readFile('work/aws-release/aws-media-prepared.json', 'utf8'));
  if (!SHA.test(currentSha ?? '') || prepared.sourceSha !== currentSha || !DIGEST.test(digest ?? '') || (prepared.reuse && digest !== prepared.mediaImageDigest)) fail('MEDIA_PROOF_BINDING_MISMATCH');
  const proof = { schemaVersion: 1, repositoryId: REPOSITORY_ID, workflowPath: WORKFLOW_PATH, sourceRunId: Number(process.env.GITHUB_RUN_ID), sourceSha: currentSha, originalBuildSha: prepared.originalBuildSha, priorRunId: prepared.priorRunId, fingerprint: prepared.fingerprint, bases: prepared.bases, mediaImageDigest: digest };
  if (!Number.isSafeInteger(proof.sourceRunId) || proof.sourceRunId < 1) fail('MEDIA_RUN_ID_REQUIRED');
  await writeFile('work/aws-release/aws-media-proof.json', JSON.stringify(proof, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [action, sha, digest] = process.argv.slice(2);
  (action === 'prepare' ? prepare(sha) : action === 'finish' ? finish(sha, digest) : Promise.reject(new Error('Use prepare or finish'))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
