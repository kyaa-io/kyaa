import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const exec = promisify(execFile);
const image = /^(\d{12}\.dkr\.ecr\.ap-northeast-2\.amazonaws\.com)\/([a-z0-9/_-]+)@(sha256:[a-f0-9]{64})$/;
const aws = args => exec('aws', ['--no-cli-pager', '--region', 'ap-northeast-2', ...args], { maxBuffer: 1024 * 1024 });

async function find(item) {
  const [, registry, repository] = image.exec(item.target);
  try {
    const { stdout } = await aws(['ecr', 'describe-images', '--registry-id', registry.split('.')[0], '--repository-name', repository, '--image-ids', `imageDigest=${item.digest}`, '--query', 'imageDetails[0].imageDigest', '--output', 'text']);
    return stdout.trim();
  } catch (error) {
    if (/\(ImageNotFoundException\)/.test(error.stderr ?? '')) return null;
    throw new Error(`ECR_IMAGE_LOOKUP_FAILED: ${item.kind}`, { cause: error });
  }
}

function docker(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { stdio: [input === undefined ? 'ignore' : 'pipe', 'inherit', 'inherit'] });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`DOCKER_${args[0].toUpperCase()}_FAILED: ${code}`)));
    if (input !== undefined) { child.stdin.on('error', reject); child.stdin.end(input); }
  });
}
async function login(registry) {
  const { stdout } = await aws(['ecr', 'get-login-password']);
  if (!stdout.trim()) throw new Error('ECR_LOGIN_PASSWORD_MISSING');
  await docker(['login', '--username', 'AWS', '--password-stdin', registry], stdout);
}
async function transfer(item) {
  const tag = `${item.target.split('@')[0]}:release-${item.sha}-${item.digest.slice(7)}`;
  await docker(['pull', item.source]);
  await docker(['tag', item.source, tag]);
  await docker(['push', tag]);
}

export async function promoteImages(entries, deps = { find, login, transfer }) {
  for (const item of entries) {
    if (!['web', 'media'].includes(item.kind) || !/^[a-f0-9]{40}$/.test(item.sha ?? '') ||
        !image.test(item.source ?? '') || !image.test(item.target ?? '') ||
        image.exec(item.source)[3] !== item.digest || image.exec(item.target)[3] !== item.digest) throw new Error('INVALID_IMAGE_PROMOTION');
  }
  const present = await Promise.all(entries.map(item => deps.find(item)));
  present.forEach((digest, index) => {
    if (digest !== null && digest !== entries[index].digest) throw new Error('IMAGE_DIGEST_MISMATCH');
  });
  const missing = entries.filter((_, index) => present[index] === null);
  // Docker logins share one config file, so finish them before parallel transfers.
  for (const registry of new Set(missing.flatMap(item => [image.exec(item.source)[1], image.exec(item.target)[1]]))) await deps.login(registry);
  const results = await Promise.allSettled(entries.map(async (item, index) => {
    const start = Date.now();
    if (present[index] === null) {
      await deps.transfer(item);
      if (await deps.find(item) !== item.digest) throw new Error(`IMAGE_DIGEST_MISMATCH: ${item.kind}`);
    }
    return { kind: item.kind, digest: item.digest, reused: present[index] !== null, elapsedMs: Date.now() - start };
  }));
  const failure = results.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
  return results.map(result => result.value);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = process.env;
  const entries = [
    { kind: 'web', source: env.SOURCE_IMAGE, target: env.TARGET_IMAGE, digest: env.RELEASE_DIGEST, sha: env.RELEASE_SHA },
    { kind: 'media', source: env.SOURCE_MEDIA_IMAGE, target: env.TARGET_MEDIA_IMAGE, digest: env.MEDIA_DIGEST, sha: env.RELEASE_SHA },
  ];
  try {
    const results = await promoteImages(entries);
    await mkdir('work/aws-release', { recursive: true });
    await writeFile('work/aws-release/image-promotion.json', JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results));
    if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, `\n### Image promotion\n${results.map(item => `- ${item.kind}: ${item.reused ? 'existing target digest verified' : 'copied and verified'}, ${(item.elapsedMs / 1000).toFixed(1)}s`).join('\n')}\n`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
