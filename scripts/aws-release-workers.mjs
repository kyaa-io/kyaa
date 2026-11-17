// Proposal: update code only; preserve environment switches, concurrency and schedules.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
export const workers = { 'mint-worker': 'index.cjs', 'notification-worker': 'notification-index.cjs', 'benefit-maintenance': 'notification-index.cjs', 'creator-registration-worker': 'creator-registration-index.cjs' };
const digest = bytes => createHash('sha256').update(bytes).digest('base64');
const envHash = config => {
  if (config.Environment?.Error) throw Error('ENVIRONMENT_UNREADABLE');
  return digest(JSON.stringify(Object.entries(config.Environment?.Variables ?? {}).sort(([a], [b]) => a.localeCompare(b))));
};
export async function prepareWorkers(sha, folder, aws, environment = 'prod', download = async url => {
  const response = await fetch(url);
  if (!response.ok) throw Error('BACKUP_DOWNLOAD_FAILED');
  return Buffer.from(await response.arrayBuffer());
}) {
  if (!['dev', 'prod'].includes(environment)) throw Error('INVALID_ENVIRONMENT');
  if (!/^[a-f0-9]{40}$/.test(sha)) throw Error('INVALID_RELEASE_SHA');
  const prepared = { sourceSha: sha, environment, functions: [] };
  for (const [worker, bundle] of Object.entries(workers)) {
    const name = `byus-${worker}-${environment}`;
    let before;
    try {
      before = aws(['lambda', 'get-function-configuration', '--function-name', name]);
    } catch (error) {
      if (environment !== 'dev' || !/An error occurred \(ResourceNotFoundException\) when calling the GetFunctionConfiguration operation:/.test(String(error.stderr ?? ''))) throw error;
      console.log(JSON.stringify({ function: name, skipped: 'absent' }));
      continue;
    }
    if (before.FunctionArn !== `arn:aws:lambda:ap-northeast-2:996702758024:function:${name}` || before.PackageType !== 'Zip' || before.Handler !== 'index.handler' || before.Runtime !== 'nodejs24.x' || before.Architectures?.join(',') !== 'arm64' || !before.RevisionId || before.LastUpdateStatus !== 'Successful' || before.State !== 'Active') throw Error('WORKER_IDENTITY_OR_STATE_MISMATCH');
    const beforeEnv = envHash(before);
    const dir = join(folder, worker); await mkdir(dir, { recursive: true });
    const current = aws(['lambda', 'get-function', '--function-name', name]);
    if (current.Configuration?.RevisionId !== before.RevisionId) throw Error('BACKUP_REVISION_CHANGED');
    const backup = await download(current.Code.Location);
    if (digest(backup) !== before.CodeSha256) throw Error('BACKUP_HASH_MISMATCH');
    await writeFile(join(dir, 'backup.zip'), backup, { mode: 0o600 });
    await writeFile(join(dir, 'receipt.json'), JSON.stringify({ function: name, sourceSha: sha, previousCodeSha256: before.CodeSha256, environmentHash: beforeEnv }));

    await copyFile(join(folder, 'apps/worker/dist-lambda', bundle), join(dir, 'index.cjs'));
    execFileSync('zip', ['-X', '-q', 'code.zip', 'index.cjs'], { cwd: dir });
    const hash = createHash('sha256').update(await readFile(join(dir, 'code.zip'))).digest('base64');
    aws(['lambda', 'update-function-code', '--dry-run', '--function-name', name, '--revision-id', before.RevisionId, '--zip-file', `fileb://${join(dir, 'code.zip')}`]);
    prepared.functions.push({ worker, function: name, revisionId: before.RevisionId, codeSha256: before.CodeSha256, environmentHash: beforeEnv, preparedZipHash: hash });
  }
  return prepared;
}
export async function applyWorkers(prepared, folder, aws) {
  for (const entry of prepared.functions) {
    const name = entry.function;
    const zip = join(folder, entry.worker, 'code.zip');
    if (digest(await readFile(zip)) !== entry.preparedZipHash) throw Error('PREPARED_ZIP_CHANGED');
    const current = aws(['lambda', 'get-function-configuration', '--function-name', name]);
    if (current.RevisionId !== entry.revisionId || current.CodeSha256 !== entry.codeSha256 || envHash(current) !== entry.environmentHash) throw Error('PREPARED_WORKER_CHANGED');
    aws(['lambda', 'update-function-code', '--function-name', name, '--revision-id', entry.revisionId, '--zip-file', `fileb://${zip}`]);
    aws(['lambda', 'wait', 'function-updated-v2', '--function-name', name]);
    const after = aws(['lambda', 'get-function-configuration', '--function-name', name]);
    if (after.CodeSha256 !== entry.preparedZipHash || after.LastUpdateStatus !== 'Successful' || envHash(after) !== entry.environmentHash || after.State !== 'Active') throw Error('WORKER_VERIFY_FAILED');
    console.log(JSON.stringify({ function: name, sourceSha: prepared.sourceSha, codeSha256: entry.preparedZipHash, verified: true }));
  }
}
export async function updateWorkers(...args) {
  const prepared = await prepareWorkers(...args);
  await applyWorkers(prepared, args[1], args[2]);
}

export async function main() {
  const mode = process.argv[2];
  if (!['prepare', 'apply'].includes(mode)) throw Error('INVALID_WORKER_MODE');
  const release = JSON.parse(await readFile('work/aws-release/aws-release.json', 'utf8'));
  const environment = process.env.RELEASE_ENV;
  if (!['dev', 'prod'].includes(environment)) throw Error('RELEASE_ENVIRONMENT_MISMATCH');
  if (!/^[a-f0-9]{40}$/.test(release.sourceSha)) throw Error('INVALID_RELEASE_SHA');
  const aws = args => { const out = execFileSync('aws', [...args, '--region', 'ap-northeast-2', '--output', 'json', '--no-cli-pager'], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }); return out.trim() ? JSON.parse(out) : {}; };
  if (aws(['sts','get-caller-identity']).Account !== '996702758024') throw Error('ACCOUNT_MISMATCH');
  const preparedPath = 'work/aws-release/worker-backups/prepared.json';
  if (mode === 'apply') {
    const prepared = JSON.parse(await readFile(preparedPath, 'utf8'));
    if (prepared.sourceSha !== release.sourceSha || prepared.environment !== environment) throw Error('PREPARED_RELEASE_MISMATCH');
    await applyWorkers(prepared, prepared.folder, aws);
    return;
  }
  await rm(preparedPath, { force: true });
  await mkdir('work/aws-release/worker-backups', { recursive: true });
  const folder = await mkdtemp(join(process.cwd(), 'work/aws-release/worker-backups/run-'));
  try {
    execFileSync('tar', ['-x', '-C', folder], { input: execFileSync('git', ['archive', release.sourceSha], { maxBuffer: 256*1024*1024 }) });
    execFileSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--workspace', '@byus/worker', '--include-workspace-root'], { cwd: folder, stdio: 'pipe' });
    execFileSync(process.execPath, ['apps/worker/scripts/build-lambda.mjs'], { cwd: folder, stdio: 'pipe' });
    const prepared = await prepareWorkers(release.sourceSha, folder, aws, environment);
    await writeFile(preparedPath, JSON.stringify({ ...prepared, folder }), { mode: 0o600 });
  } finally { await rm(join(folder, 'node_modules'), { recursive: true, force: true }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => { console.error('WORKER_RELEASE_FAILED; inspect AWS state before retry'); process.exitCode = 1; });
