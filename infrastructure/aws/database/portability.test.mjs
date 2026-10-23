import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, open } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createServer } from 'node:net';
import { spawnSync } from 'node:child_process';

const available = ['psql', 'pg_dump', 'pg_restore', 'initdb', 'pg_ctl', 'createdb', 'dropdb'].every((p) => spawnSync('which', [p]).status === 0);
test('full app dump restores to standalone PG17 with real sealed metadata and target-only ports', { skip: !available, timeout: 180000 }, async () => {
  const directory = resolve('work/aws-db-portability'); await mkdir(directory, { recursive: true });
  const server = createServer(); await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port; await new Promise((r) => server.close(r));
  const log = await open(join(directory, 'rehearsal.log'), 'w', 0o600);
  const result = spawnSync('bash', ['scripts/verify-clean-migration-chain.sh'], { timeout: 170000, env: { ...process.env, BYUS_CLEAN_DB_PORT: String(port), BYUS_CLEAN_DB_SHELL_ASSERTION_FILE: resolve('infrastructure/aws/database/portability-rehearsal.sh'), BYUS_PORTABILITY_REHEARSAL: 'local-only', BYUS_PORTABILITY_NODE: process.execPath, BYUS_PORTABILITY_OUTPUT: directory }, stdio: ['ignore', log.fd, log.fd] });
  await log.close();
  assert.equal(result.status, 0, `Portable schema rehearsal failed; inspect ${join(directory, 'rehearsal.log')}`);
  const report = JSON.parse(await readFile(join(directory, 'report.json'), 'utf8'));
  assert.equal(report.migrationCount,(await readdir('supabase/migrations')).filter((f)=>f.endsWith('.sql')).length); assert(report.restoredPublicTables > 100); assert(report.restoredRoutines > 100);
  assert.deepEqual(report.forbiddenTargetSchemas, []); assert(report.exactMetadataCopy.exactMatch); assert(report.sealedMetadataDmlRejected);
  assert.equal(report.liveSupabaseOrRdsConnection, false);
});
