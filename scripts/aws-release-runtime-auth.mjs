import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AUTH_CASES, INVALID_AUTH_ENV, probeProductionAuth } from '../apps/web/e2e/cs-local/production-auth.mjs';

const exec = promisify(execFile);
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const PROOF = 'work/aws-release/runtime-auth.json';
export const RUNTIME_AUTH_ENV = Object.freeze({ ...INVALID_AUTH_ENV, APP_ENV: 'dev', APP_URL: 'http://localhost:3000', NEXT_PUBLIC_APP_URL: 'http://localhost:3000', HOSTNAME: '0.0.0.0', PORT: '3000' });
const fail = code => { throw new Error(code); };
export function authContext(env = process.env) {
  const context = { sourceSha: env.GITHUB_SHA, sourceRunId: Number(env.GITHUB_RUN_ID), sourceRunAttempt: Number(env.GITHUB_RUN_ATTEMPT) };
  if (env.GITHUB_REPOSITORY !== 'kyaa-io/kyaa' || !/^[a-f0-9]{40}$/.test(context.sourceSha ?? '') || !Number.isSafeInteger(context.sourceRunId) || context.sourceRunId < 1 || !Number.isSafeInteger(context.sourceRunAttempt) || context.sourceRunAttempt < 1) fail('RUNTIME_AUTH_CONTEXT_REQUIRED');
  return context;
}
export function validateRuntimeAuth(proof, context, imageDigest) {
  const keys = ['contractVersion','status','checks','envProfile','imageId','sourceSha','sourceRunId','sourceRunAttempt', ...(imageDigest ? ['imageDigest'] : [])];
  if (!proof || Object.keys(proof).some(key => !keys.includes(key)) || proof.contractVersion !== 1 || proof.status !== 'success' || proof.checks !== 6 || proof.envProfile !== 'invalid-only-v1' || !DIGEST.test(proof.imageId ?? '') || !/^[a-f0-9]{40}$/.test(context.sourceSha ?? '') || !Number.isSafeInteger(context.sourceRunId) || context.sourceRunId < 1 || !Number.isSafeInteger(context.sourceRunAttempt) || context.sourceRunAttempt < 1 || proof.sourceSha !== context.sourceSha || proof.sourceRunId !== context.sourceRunId || proof.sourceRunAttempt !== context.sourceRunAttempt || (imageDigest && (!DIGEST.test(imageDigest) || proof.imageDigest !== imageDigest))) fail('INVALID_RUNTIME_AUTH_PROOF');
  return proof;
}
const docker = async args => (await exec('docker', args, { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, timeout: args[0] === 'exec' ? 60_000 : 10_000 })).stdout.trim();
const inspect = async (call, kind, id) => { const rows = JSON.parse(await call([kind, 'inspect', id])); if (rows.length !== 1) fail('RUNTIME_AUTH_INSPECT_REQUIRED'); return rows[0]; };
function environment(entries) {
  const result = {};
  for (const entry of entries ?? []) {
    const index = entry.indexOf('='), key = entry.slice(0, index);
    if (index < 1 || Object.hasOwn(result, key)) fail('RUNTIME_AUTH_ENV_INVALID');
    result[key] = entry.slice(index + 1);
  }
  return result;
}
export function assertRuntimeContainer(container, image) {
  const defaults = environment(image.Config?.Env);
  const allowed = { PATH: /^\/usr\/local\/sbin:\/usr\/local\/bin:\/usr\/sbin:\/usr\/bin:\/sbin:\/bin$/, NODE_VERSION: /^24\./, YARN_VERSION: /^1\./, NODE_ENV: /^production$/, HOSTING_PROVIDER: /^aws$/, NEXT_TELEMETRY_DISABLED: /^1$/, HOSTNAME: /^0\.0\.0\.0$/, PORT: /^3000$/, KEEP_ALIVE_TIMEOUT: /^65000$/ };
  for (const [key, value] of Object.entries(defaults)) if (!allowed[key]?.test(value)) fail(`RUNTIME_AUTH_IMAGE_ENV_REJECTED: ${key}`);
  const expected = { ...defaults, ...RUNTIME_AUTH_ENV }, actual = environment(container.Config?.Env);
  if (defaults.HOSTING_PROVIDER !== 'aws' || defaults.NODE_ENV !== 'production' || Object.keys(actual).length !== Object.keys(expected).length || Object.entries(actual).some(([key,value]) => expected[key] !== value)) fail('RUNTIME_AUTH_ENV_MISMATCH');
  if (!DIGEST.test(image.Id ?? '') || container.Image !== image.Id || !container.State?.Running || image.Config?.User !== 'app' || container.Config?.User !== image.Config.User || JSON.stringify(container.Config.Cmd) !== JSON.stringify(image.Config.Cmd) || JSON.stringify(container.Config.Entrypoint) !== JSON.stringify(image.Config.Entrypoint) || container.HostConfig?.NetworkMode !== 'none' || Object.keys(container.HostConfig?.PortBindings ?? {}).length || container.Mounts?.length) fail('RUNTIME_AUTH_CONTAINER_ISOLATION_FAILED');
  return Object.keys(actual).sort();
}
export async function verifyRuntimeImage(imageId, { call = docker, context, proofPath = PROOF, now = Date.now, wait = delay } = {}) {
  await rm(proofPath, { force: true });
  context ??= authContext();
  if (!DIGEST.test(imageId ?? '')) fail('RUNTIME_AUTH_IMAGE_ID_REQUIRED');
  const image = await inspect(call, 'image', imageId);
  if (image.Id !== imageId) fail('RUNTIME_AUTH_IMAGE_ID_MISMATCH');
  let containerId, failure;
  try {
    containerId = await call(['run', '--detach', '--network', 'none', ...Object.entries(RUNTIME_AUTH_ENV).flatMap(([key,value]) => ['--env', `${key}=${value}`]), imageId]);
    if (!/^[a-f0-9]{64}$/.test(containerId)) fail('RUNTIME_AUTH_CONTAINER_ID_REQUIRED');
    const started = now();
    let container = await inspect(call, 'container', containerId);
    const envKeys = assertRuntimeContainer(container, image);
    while (!/Ready in/i.test(await call(['logs', containerId]))) {
      if (now() - started >= 20_000) fail('RUNTIME_AUTH_STARTUP_TIMEOUT');
      await wait(100);
      container = await inspect(call, 'container', containerId);
      assertRuntimeContainer(container, image);
    }
    const probe = `(${probeProductionAuth.toString()})('http://127.0.0.1:3000',${JSON.stringify(AUTH_CASES)}).then(checks=>console.log(JSON.stringify({checks}))).catch(error=>{console.error(error.message);process.exitCode=1;});`;
    const result = JSON.parse(await call(['exec', containerId, 'node', '--input-type=module', '-e', probe]));
    if (result.checks !== 6) fail('RUNTIME_AUTH_SIX_CHECKS_REQUIRED');
    assertRuntimeContainer(await inspect(call, 'container', containerId), image);
    const proof = { contractVersion: 1, status: 'success', checks: 6, envProfile: 'invalid-only-v1', imageId, ...context };
    validateRuntimeAuth(proof, context);
    await mkdir(dirname(proofPath), { recursive: true });
    await writeFile(proofPath, JSON.stringify(proof));
    console.log(JSON.stringify({ runtimeAuth: proof, envKeys }));
    return proof;
  } catch (error) {
    failure = error;
    try { await rm(proofPath, { force: true }); } catch (cleanupError) { error.cause ??= cleanupError; }
    throw error;
  }
  finally {
    if (containerId && /^[a-f0-9]{64}$/.test(containerId)) {
      try { await call(['rm', '--force', containerId]); }
      catch (error) { await rm(proofPath, { force: true }); if (!failure) throw error; }
    }
  }
}
export async function assertTagImage(tag, proof, context, call = docker) {
  validateRuntimeAuth(proof, context);
  const image = await inspect(call, 'image', tag);
  if (image.Id !== proof.imageId) fail('RUNTIME_AUTH_TAG_IMAGE_MISMATCH');
  return image;
}
export async function publishedRuntimeAuth(proof, run, uri, { call = docker } = {}) {
  const context = { sourceSha: run.head_sha, sourceRunId: run.id, sourceRunAttempt: run.run_attempt };
  const [repository, digest] = uri.split('@');
  if (!DIGEST.test(digest ?? '')) fail('RUNTIME_AUTH_PUBLISHED_DIGEST_REQUIRED');
  const image = await assertTagImage(`${repository}:${context.sourceSha}-${context.sourceRunId}-${context.sourceRunAttempt}`, proof, context, call);
  if (!image.RepoDigests?.includes(uri)) fail('RUNTIME_AUTH_PUBLISHED_DIGEST_MISMATCH');
  return { ...proof, imageDigest: digest };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [action, tag] = process.argv.slice(2);
  (async () => {
    if (action !== 'before-push') fail('INVALID_RUNTIME_AUTH_COMMAND');
    await assertTagImage(tag, JSON.parse(await readFile(PROOF, 'utf8')), authContext());
  })().catch(error => { console.error(error.message); process.exitCode = 1; });
}
