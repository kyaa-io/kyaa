import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyAction, hash } from './aws-db-migrate.mjs';
import { DmsAdapter } from './aws-db-dms-adapter.mjs';

// Protocol fixture exercises the real adapter and barrier orchestration. The helper's
// atomic SQL behavior is covered separately against disposable PostgreSQL.
function fixture({ failRefresh = false, importerRemainsLogin = false, sourceUnfenced = false } = {}) {
  const events = [], closedAt = '2026-10-24T00:00:00.000Z';
  const shape = { relations: [], unexpectedRelations: 0, unexpectedRoutines: 0, writerPrivileges: [] };
  const projection = { buckets: { rows: '0', sha256: 'a'.repeat(64) }, objects: { rows: '0', sha256: 'b'.repeat(64) } };
  const c = { engine: 'dms', runId: 'storage_integration', timeoutSeconds: 30,
    source: { migrationRole: 'source_operator' }, target: { migrationRole: 'target_operator' },
    applicationRoles: ['app_login'], dms: { targetRole: 'dms_apply_login' } };
  const state = { phase: 'fenced', fencedAt: Date.now(), events: [],
    dmsStorageShapeHash: hash(shape), dmsStorageGuardHash: 'guard-hash' };
  let open = true, login = true, active = 1;
  const source = { run(sql) {
    if (sql.includes('with actors as')) return { actorCount: 4, subscribers: 0, unsafe: false, defaults: false, definers: false, triggerPrivilege: true };
    if (sql.includes("'functionHash'")) { events.push('source-fence-check');return { run: c.runId, fenced: !sourceUnfenced, functionHash: state.dmsStorageGuardHash, guards: 4 }; }
    if (sql.startsWith("select jsonb_build_object('snapshot'")) {
      events.push('snapshot'); assert.equal(open,false);assert.equal(login,false);assert.equal(active,0);
      return { snapshot: '{"format":1,"buckets":[],"objects":[]}', projection };
    }
    if (sql.includes('insert into "_byus_barrier".barriers')) { events.push('barrier-insert');return ''; }
    if (sql.includes('pg_current_wal_lsn')) return '0/1234';
    if (sql.includes('update "_byus_barrier".barriers')) { events.push('barrier-confirm');return ''; }
    assert.fail('unexpected source database operation');
  } };
  const target = { run(sql) {
    if (sql.startsWith('update _byus_migration.state')) { events.push('close-import-fence');open=false;return closedAt; }
    if (sql.startsWith('alter role')) { events.push('nologin');login=importerRemainsLogin;return ''; }
    if (sql.includes('pg_terminate_backend')) { events.push('drain');active=0;return [true]; }
    if (sql.startsWith('select count(*)::int from pg_stat_activity')) return active;
    if (sql.includes('with importer as')) {
      events.push('importer-role-check');
      return { login, bypass: true, unsafe: false, appCount: 1, appAccess: false, ownsApp: false, schemaCreate: false, otherWrites: false, exactAccess: true };
    }
    if (sql.includes("'open',imports_open")) { events.push('sealed-state-check');return { open, closedAt, fenced: true, firstWriteAt: null }; }
    if (sql.startsWith('begin;')) {
      events.push('refresh-transaction');
      assert.equal(open,false);assert.equal(login,false);assert.equal(active,0);
      if (failRefresh) throw new Error('private database failure');
      return projection;
    }
    if (sql.includes('with bucket_rows as')) { events.push('projection-inventory');return { ...shape, projection }; }
    assert.fail('unexpected target database operation');
  } };
  const adapter = new DmsAdapter({ c, source, target, state,
    aws() { assert.fail('no AWS calls expected'); },
    checkpoint: async detail => events.push(detail.storageProjection ? 'refresh-checkpoint' : 'seal-checkpoint') });
  return { c, state, source, target, adapter, events, projection };
}

async function barrier(f) {
  const directory = await mkdtemp(join(tmpdir(), 'byus-storage-order-'));
  try {
    await applyAction('barrier', f.c, f.source, f.target, f.state, join(directory,'ledger.json'), {}, { adapter: f.adapter });
  } finally { await rm(directory, { recursive:true, force:true }); }
}

test('barrier seals importer, drains sessions, rechecks live fence, refreshes, then publishes', async () => {
  const f = fixture();
  await barrier(f);
  assert.deepEqual(f.events, ['close-import-fence','nologin','drain','importer-role-check','seal-checkpoint',
    'sealed-state-check','importer-role-check','source-fence-check','projection-inventory','snapshot',
    'refresh-transaction','refresh-checkpoint','barrier-insert','barrier-confirm']);
  assert.deepEqual(f.state.dmsFinalStorageProjection, f.projection);
  assert.equal(f.state.phase, 'barrier');
  assert.match(f.state.barrierId, /^[a-f0-9-]{36}$/);
});

test('importer that still has LOGIN prevents projection reads and barrier publication', async () => {
  const f = fixture({ importerRemainsLogin:true });
  await assert.rejects(barrier(f), /Storage import login privilege\/state invalid/);
  assert.deepEqual(f.events, ['close-import-fence','nologin','drain','importer-role-check']);
  assert.equal(f.state.phase, 'fenced');assert.equal(f.state.barrierId, undefined);
});

test('missing live source fence prevents projection reads and barrier publication', async () => {
  const f = fixture({ sourceUnfenced:true });
  await assert.rejects(barrier(f), /Source storage fence proof missing\/changed/);
  assert.equal(f.events.includes('snapshot'), false);
  assert.equal(f.events.includes('refresh-transaction'), false);
  assert.equal(f.events.includes('barrier-insert'), false);
  assert.equal(f.state.barrierId, undefined);
});

test('refresh transaction failure leaves source barrier unpublished and ledger fenced', async () => {
  const f = fixture({ failRefresh:true });
  await assert.rejects(barrier(f), { message:'Legacy storage projection refresh failed' });
  assert.equal(f.events.at(-1), 'refresh-transaction');
  assert.equal(f.events.includes('refresh-checkpoint'), false);
  assert.equal(f.events.includes('barrier-insert'), false);
  assert.equal(f.state.dmsFinalStorageProjection, undefined);
  assert.equal(f.state.barrierId, undefined);
  assert.equal(f.state.phase, 'fenced');
});
