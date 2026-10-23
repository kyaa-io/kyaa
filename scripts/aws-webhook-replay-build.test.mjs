import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { build, validateTarget } from './aws-webhook-replay-build.mjs';
import { CA_URL } from './aws-auth-migration-build.mjs';

const valid = { accountId: '996702758024', region: 'ap-northeast-2', environment: 'dev' };
test('only Sallylab Seoul and the three explicit environments are accepted', () => {
  for (const environment of ['dev', 'staging', 'prod']) assert.equal(validateTarget({ ...valid, environment }).environment, environment);
  for (const change of [{ accountId: '200151116034' }, { accountId: '996702758024 ' }, { region: 'us-east-1' }, { environment: 'production' }, { environment: undefined }]) assert.throws(() => validateTarget({ ...valid, ...change }), /Only approved/);
});
test('CLI rejects foreign targets and unknown/mutating options before creating a package', () => {
  for (const args of [['--account-id', '200151116034'], ['--region', 'us-east-1'], ['--deploy', 'true'], ['--out'], ['--out', 'one', '--out', 'two']]) {
    const result = spawnSync(process.execPath, [resolve('scripts/aws-webhook-replay-build.mjs'), ...args], { encoding: 'utf8', env: { PATH: '/does-not-exist' } });
    assert.notEqual(result.status, 0); assert.equal(result.stdout, '');
  }
});
test('self-contained Node24 ZIP bundles SDKs, preserves pg/TLS and binds one reproducible artifact to three disabled environments', { timeout: 60000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'byus-webhook-package-'));
  try {
    const response = await fetch(CA_URL, { redirect: 'error', signal: AbortSignal.timeout(30000) }); assert(response.ok);
    const ca = Buffer.from(await response.arrayBuffer()), caSha256 = createHash('sha256').update(ca).digest('hex');
    const caPath = join(directory, 'global-bundle.pem'); await writeFile(caPath, ca);
    const first = await build({ out: join(directory, 'first'), caPath, caSha256 });
    const second = await build({ out: join(directory, 'second'), caPath, caSha256 });
    assert.equal(first.sha256, second.sha256); assert.equal(first.dependencies.pg, '8.23.1');
    assert.equal(first.handler, 'index.handler'); assert.equal(first.runtime, 'nodejs24.x');
    assert.match(first.localImportCheckedWith, /^v24\./); assert.equal(first.ca.sha256, caSha256);
    const bytes = await readFile(first.zipPath); assert.equal(createHash('sha256').update(bytes).digest('base64'), first.codeSha256Base64);
    const files = execFileSync('unzip', ['-Z1', first.zipPath], { encoding: 'utf8' }).trim().split('\n');
    for (const name of ['index.js', 'package.json', 'global-bundle.pem', 'node_modules/pg/lib/index.js']) assert(files.includes(name));
    assert(files.every(path => !path.includes('.env') && !path.includes('@aws-sdk') && !path.includes('pg-native') && !path.endsWith('config.json')));
    const code = execFileSync('unzip', ['-p', first.zipPath, 'index.js'], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    assert.match(code, /rejectUnauthorized: true/); assert(code.includes('RDS_CA_BUNDLE_PATH'));
    assert.equal(execFileSync('unzip', ['-p', first.zipPath, 'global-bundle.pem']).compare(ca), 0);
    assert.deepEqual(first.environments.map(e => e.environment), ['dev', 'staging', 'prod']);
    for (const env of first.environments) {
      assert.equal(env.sha256, first.sha256); assert.equal(env.accountId, valid.accountId); assert.equal(env.region, valid.region);
      assert.equal(env.executed, false); assert.equal(env.uploaded, false); assert.equal(env.replayEnabled, false); assert.equal(env.eventSourceMappingEnabled, false);
      const manifest = JSON.parse(await readFile(env.manifestPath, 'utf8'));
      assert.equal(manifest.sha256, first.sha256); assert(manifest.queueArn.endsWith(`-${env.environment}.fifo`));
      assert(manifest.databaseSecretArnPrefix.endsWith(`byus/${env.environment}/webhook-replay-`));
    }
    assert(first.zipBytes < 10 * 1024 * 1024);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
