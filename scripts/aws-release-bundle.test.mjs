import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, utimes, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { deterministicZip } from './aws-release-bundle.mjs';
const hash = async file => createHash('sha256').update(await readFile(file)).digest('hex');
test('zip baseline changes with mtime; normalized UTC timestamp and order yield identical bytes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cron-zip-'));
  try {
    const a = join(dir, 'index.cjs'), b = join(dir, 'mint-cadence.cjs'), zip = join(dir, 'cron.zip');
    await writeFile(a, 'module.exports = 1;'); await writeFile(b, 'module.exports = 2;');
    const raw = () => execFileSync('zip', ['-j', '-X', zip, a, b], { stdio: 'pipe' });
    await utimes(a, new Date('2020-01-01Z'), new Date('2020-01-01Z')); raw(); const before = await hash(zip);
    await rm(zip); await utimes(a, new Date('2021-01-01Z'), new Date('2021-01-01Z')); raw(); assert.notEqual(await hash(zip), before);
    await deterministicZip(zip, [b, a]); const stable = await hash(zip);
    await utimes(a, new Date(), new Date()); await deterministicZip(zip, [a, b]); assert.equal(await hash(zip), stable);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
