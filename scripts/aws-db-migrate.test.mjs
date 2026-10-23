import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir, rm, copyFile } from 'node:fs/promises';
import { tmpdir, userInfo } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { validateConfig, connection, verifyIdentity, compareLsn, sequenceSql, guardSql, assertWindow, assertAbortAllowed, migrationInventory, hash, readiness, reviewPorts, objectFingerprints, catalogHash } from './aws-db-migrate.mjs';

function config(ports = [54321, 54322]) {
  return { environment: 'dev', accountId: '111111111111', region: 'ap-northeast-2', profile: 'local-test', localRehearsal: true, runId: 'rehearsal_test', schemas: ['public'], applicationRoles: ['app_login'], writers: ['web', 'worker'], timeoutSeconds: 300,
    ...Object.fromEntries(['source', 'target'].map((side, i) => [side, { connectionEnv: `TEST_DB_${side.toUpperCase()}`, host: '127.0.0.1', migrationRole: 'byus_migrator', identity: { database: 'byus_rehearsal', sessionUser: 'byus_migrator', serverAddress: '127.0.0.1', serverPort: ports[i] } }])) };
}

test('identity guards reject reversed endpoints, non-PG17, wrong migration role and pools', () => {
  const c = config(); validateConfig(c);
  const actual = { ...c.source.identity, version: 170000, inRecovery: false };
  verifyIdentity(c.source.identity, actual);
  assert.throws(() => verifyIdentity(c.target.identity, actual), /reversal/);
  assert.throws(() => verifyIdentity(c.source.identity, { ...actual, sessionUser: 'app_login' }), /mismatch/);
  assert.throws(() => verifyIdentity(c.source.identity, { ...actual, version: 160001 }), /17/);
  assert.throws(() => verifyIdentity({ ...c.source.identity, databaseOid: '1234' }, { ...actual, databaseOid: '4321' }), /mismatch/);
  c.applicationRoles.push('byus_migrator'); assert.throws(() => validateConfig(c), /application role/);
  const remote = config(); delete remote.localRehearsal;
  remote.source.host = 'aws.pooler.supabase.com'; remote.source.sslRootCert = 'system';
  assert.throws(() => validateConfig(remote), /direct/);
});

test('connection URLs are checked without echoing credential values', () => {
  const c = config(); const variable = c.source.connectionEnv;
  const secret = 'never-display-this-password';
  const env = { [variable]: `postgresql://byus_migrator:${secret}@127.0.0.1:54321/byus_rehearsal` };
  assert.equal(connection(c, 'source', env).password, secret);
  env[variable] = env[variable].replace(':54321', ':54322');
  assert.throws(() => connection(c, 'source', env), (e) => !e.message.includes(secret) && !e.message.includes('postgresql://'));
});

test('LSN comparisons use source origin positions with full 64 bit precision', () => {
  assert.equal(compareLsn('1/00000000', '0/FFFFFFFF'), 1);
  assert.equal(compareLsn('FFFFFFFF/FFFFFFFE', 'FFFFFFFF/FFFFFFFF'), -1);
  assert.equal(compareLsn('ABC/123', '00000ABC/00000123'), 0);
  assert.throws(() => compareLsn('0/1;drop', '0/0'));
});

test('fence uses immutable session_user and ALWAYS statement triggers including TRUNCATE', () => {
  const sql = guardSql(config(), 'source', { tables: [{ schema: 'public', name: `odd"name` }] });
  assert(sql.includes("if session_user='byus_migrator'"));
  assert(!sql.includes("if current_user="));
  assert(sql.includes('before insert or update or delete or truncate'));
  assert(sql.includes('enable always trigger'));
  assert(sql.includes('"odd""name"'));
  assert(!sql.includes("current_setting('session_replication_role')"));
  const targetSql = guardSql(config(), 'target', { tables: [{ schema: 'public', name: 'items' }] });
  assert(!targetSql.includes("if session_user='byus_migrator'"));
});

test('sequence alignment quotes relation identifiers and handles empty uncalled sequences', () => {
  const seq = { schema: 'odd"schema', name: "seq's", increment: '1', cycle: false, binding: {}, min: '1', max: '9223372036854775807', lastValue: '1', isCalled: false };
  assert.equal(sequenceSql(seq, null), `select pg_catalog.setval('"odd""schema"."seq''s"'::regclass,'1'::bigint,false);`);
  assert(sequenceSql(seq, '12').includes("'12'::bigint,true"));
  assert.throws(() => sequenceSql({ ...seq, increment: '-1' }, null));
});

test('timeout and post-first-write rollback fail closed', () => {
  const c = config();
  assertWindow(c, { fencedAt: 1000 }, 301000);
  assert.throws(() => assertWindow(c, { fencedAt: 1000 }, 301001), /expired/);
  assert.throws(() => assertWindow(c, { fencedAt: 1000 }, 999), /expired/);
  assertAbortAllowed({ phase: 'enabled' });
  assert.throws(() => assertAbortAllowed({ firstWriteAt: '2026-10-23T00:00:00Z' }), /cannot be reopened/);
});

test('repository inventory records migration versions/hashes and provider locations without SQL values', async () => {
  const inventory = await migrationInventory();
  assert(inventory.count >= 296);
  const email = inventory.files.find((f) => f.file.includes('mobile_email_login.sql'));
  assert(email.couplings.some((c) => c.providers.includes('auth')));
  assert(inventory.files.some((f) => f.couplings.some((c) => c.providers.includes('net'))));
  assert(!JSON.stringify(inventory).includes('decrypted_secret'));
});

const available = ['psql', 'initdb', 'pg_ctl', 'createdb'].every((cmd) => spawnSync('which', [cmd]).status === 0);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function freePort() {
  const server = createServer();
  await new Promise((r, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', r); });
  const port = server.address().port; await new Promise((r) => server.close(r)); return port;
}

for (const scenario of ['postwrite', 'prewrite-timeout']) test(`disposable PG17 rehearsal: ${scenario}`, { skip: !available, timeout: 90000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'byus-db-rehearsal-'));
  const output = resolve('work/aws-db-rehearsal'); await mkdir(output, { recursive: true });
  const ports = [await freePort(), await freePort()];
  const c = config(ports);
  if (scenario === 'prewrite-timeout') c.timeoutSeconds = 5;
  const configFile = join(directory, 'config.json'), evidenceFile = join(directory, 'evidence.json');
  const env = { ...process.env };
  const started = [];
  const command = (program, args, options = {}) => {
    const r = spawnSync(program, args, { encoding: 'utf8', timeout: 15000, env: { ...process.env, PGHOST: '127.0.0.1', PGUSER: userInfo().username }, ...options });
    assert.equal(r.status, 0, `${program} failed (${r.status}); see rehearsal server logs`); return r.stdout.trim();
  };
  const sql = (side, statement, role = 'byus_migrator', expectSuccess = true) => {
    const index = side === 'source' ? 0 : 1;
    const r = spawnSync('psql', ['-X', '-q', '-A', '-t', '-h', '127.0.0.1', '-p', String(ports[index]), '-U', role, '-d', 'byus_rehearsal', '-v', 'ON_ERROR_STOP=1'], { input: statement, encoding: 'utf8', timeout: 10000 });
    if (expectSuccess) assert.equal(r.status, 0, `SQL failed (${side}): ${r.stderr}`); else assert.notEqual(r.status, 0, `Expected ${side} fence to reject write`);
    return r.stdout.trim();
  };
  t.after(async () => {
    for (const side of started) {
      spawnSync('pg_ctl', ['-D', join(directory, side), '-m', 'fast', 'stop'], { encoding: 'utf8' });
      await copyFile(join(directory, `${side}.log`), join(output, `${scenario}-${side}.log`));
    }
    await rm(directory, { recursive: true, force: true });
  });
  for (const [i, side] of ['source', 'target'].entries()) {
    command('initdb', ['-D', join(directory, side), '-A', 'trust', '--no-locale', '-E', 'UTF8']);
    command('pg_ctl', ['-D', join(directory, side), '-l', join(directory, `${side}.log`), '-o', `-h 127.0.0.1 -p ${ports[i]} -c wal_level=logical -c max_replication_slots=8 -c max_wal_senders=8 -c max_logical_replication_workers=8`, 'start']);
    started.push(side);
    command('psql', ['-X', '-h', '127.0.0.1', '-p', String(ports[i]), '-d', 'postgres', '-c', 'create role byus_migrator login superuser; create role app_login login;']);
    command('createdb', ['-h', '127.0.0.1', '-p', String(ports[i]), '-O', 'byus_migrator', 'byus_rehearsal']);
    sql(side, `create table public."items odd's"("item id" bigint generated by default as identity primary key,value text); create function public.vault_alias_probe() returns text language sql as $$select vault.value from public.\"items odd's\" vault limit 1$$; create function public.mutate(v text) returns void language sql security definer set search_path='' as $$insert into public."items odd's"(value) values(v)$$; alter table public.\"items odd's\" enable row level security; alter table public.\"items odd's\" force row level security; create policy app_policy on public.\"items odd's\" for all to app_login using(true) with check(true); grant usage on schema public to app_login; grant select,insert,update,delete,truncate on public."items odd's" to app_login; grant usage on all sequences in schema public to app_login;`);
    env[c[side].connectionEnv] = `postgresql://byus_migrator:local-test-only@127.0.0.1:${ports[i]}/byus_rehearsal`;
  }
  sql('source', `insert into public."items odd's"(value) values('first'),('second');`);
  for (const side of ['source', 'target']) c[side].identity.databaseOid = sql(side, 'select oid::text from pg_database where datname=current_database();');
  await writeFile(configFile, JSON.stringify(c));
  const artifact = join(directory, 'operator-proof.txt'); await writeFile(artifact, 'Disposable local rehearsal: schedulers absent; both writer deployments represented by test clients.');
  const refreshEvidence = async () => {
    const identity = JSON.parse(sql('target', "select jsonb_build_object('database',current_database(),'databaseOid',(select oid::text from pg_database where datname=current_database()),'sessionUser',session_user,'serverAddress',host(inet_server_addr()),'serverPort',inet_server_port(),'version',current_setting('server_version_num')::int,'inRecovery',pg_is_in_recovery());"));
    const e = { runId: c.runId, operator: 'disposable-test', observedAt: new Date().toISOString(), ddlFreeze: { active: true }, workersStopped: true, schedulesStopped: true, inflightWriters: 0, files: [{ path: 'operator-proof.txt', sha256: hash(await readFile(artifact, 'utf8')) }], webhookGate: { durable: true, accepting: true, backlogCount: 0, revision: 'local-gate' }, writerDeployments: c.writers.map((name) => ({ name, revision: 'local-test', ready: true, targetIdentityHash: hash(identity) })) };
    await writeFile(evidenceFile, JSON.stringify(e));
  };
  const run = (action, apply = false, expectedSuccess = true) => {
    const r = spawnSync(process.execPath, [resolve('scripts/aws-db-migrate.mjs'), action, '--config', configFile, '--out', directory, '--evidence', evidenceFile, ...(apply ? ['--apply'] : [])], { encoding: 'utf8', env, timeout: 20000 });
    if (expectedSuccess) assert.equal(r.status, 0, `${action} failed: ${r.stderr}`); else assert.notEqual(r.status, 0, `${action} unexpectedly succeeded`);
    assert(!`${r.stdout}${r.stderr}`.includes('local-test-only'));
    return r;
  };
  await refreshEvidence();
  run('audit');
  const audit = JSON.parse(await readFile(join(directory, 'audit.json'), 'utf8'));
  assert.deepEqual(audit.readinessBlockers, []);
  const legacy = structuredClone(audit.source), ported = structuredClone(audit.target);
  legacy.routines[0].providers = ['auth']; legacy.catalogHash = catalogHash(legacy);
  ported.routines[0].definitionHash = 'reviewed-real-auth-port'; ported.catalogHash = catalogHash(ported);
  const routine = legacy.routines[0], key = `${routine.schema}.${routine.name}(${routine.arguments})`;
  const reviewed = { format: 1, environment: c.environment, accountId: c.accountId, sourceIdentityHash: hash(legacy.identity), targetIdentityHash: hash(ported.identity), evidence: [{ path: 'test-output.log', sha256: 'a'.repeat(64) }], objects: [{ kind: 'routines', key, sourceFingerprint: objectFingerprints(legacy)[`routines:${key}`], targetFingerprint: objectFingerprints(ported)[`routines:${key}`], reason: 'Actual auth replacement verified by separately hashed evidence', evidenceSha256: ['a'.repeat(64)] }] };
  const reviewedPorts = reviewPorts(c, legacy, ported, reviewed);
  assert.deepEqual(readiness(c, legacy, ported, { ports: reviewedPorts }), []);
  reviewed.objects[0].targetFingerprint = 'b'.repeat(64);
  assert.throws(() => reviewPorts(c, legacy, ported, reviewed), /fingerprint/);
  assert.equal(audit.source.routines.find((r) => r.name === 'vault_alias_probe').providers.length, 0);
  const blocked = structuredClone(audit.source);
  blocked.routines[0].providers = ['auth'];
  assert(readiness(c, blocked, audit.target).some((s) => s.includes('requires provider auth')));
  blocked.settings.preparedTransactions = 1;
  assert(readiness(c, blocked, audit.target).some((s) => s.includes('prepared transactions')));
  blocked.roles.find((r) => r.name === 'app_login').canAssumeMigration = true;
  assert(readiness(c, blocked, audit.target).some((s) => s.includes('assume migration')));
  if (scenario === 'postwrite') {
    sql('target', `create or replace function public.vault_alias_probe() returns text language sql as $$/* reviewed target change */ select vault.value from public.\"items odd's\" vault limit 1$$;`);
    run('audit');
    const current = JSON.parse(await readFile(join(directory, 'audit.json'), 'utf8'));
    assert(current.readinessBlockers.some((b) => b.includes('DDL/ownership')));
    const key = 'public.vault_alias_probe()';
    const portManifest = { format: 1, environment: c.environment, accountId: c.accountId, sourceIdentityHash: hash(current.source.identity), targetIdentityHash: hash(current.target.identity), evidence: [{ path: 'operator-proof.txt', sha256: hash(await readFile(artifact, 'utf8')) }], objects: [{ kind: 'routines', key, sourceFingerprint: current.source.objectFingerprints[`routines:${key}`], targetFingerprint: current.target.objectFingerprints[`routines:${key}`], reason: 'Actual target SQL replaced and compiled in this disposable rehearsal', evidenceSha256: [hash(await readFile(artifact, 'utf8'))] }] };
    const body = JSON.stringify(portManifest);
    c.portReviewFile = join(directory, 'port.json'); c.portReviewSha256 = hash(body);
    await writeFile(c.portReviewFile, body); await writeFile(configFile, JSON.stringify(c));
    run('audit');
    assert.deepEqual(JSON.parse(await readFile(join(directory, 'audit.json'), 'utf8')).readinessBlockers, []);
    await writeFile(c.portReviewFile, body + ' ');
    assert(run('audit', false, false).stderr.includes('Port review file changed'));
    await writeFile(c.portReviewFile, body);
    run('bootstrap', true);
    assert.equal(sql('target', "select count(*) from pg_extension where extname in('pgcrypto','btree_gist');"), '2');
  }
  const dry = run('prepare'); assert.equal(JSON.parse(dry.stdout).executed, false);
  const preparation = JSON.parse(await readFile(evidenceFile, 'utf8'));
  preparation.workersStopped = false; preparation.schedulesStopped = false; preparation.inflightWriters = 5;
  await writeFile(evidenceFile, JSON.stringify(preparation));
  run('prepare', true);
  const copyDeadline = Date.now() + 15000;
  while (sql('target', `select count(*) from pg_subscription_rel where srsubstate<>'r';`) !== '0' || sql('target', `select count(*) from public."items odd's";`) !== '2') { assert(Date.now() < copyDeadline, 'Initial copy timed out'); await sleep(100); }
  sql('target', `insert into public."items odd's"(value) values('blocked');`, 'app_login', false);
  sql('target', `insert into public."items odd's"(value) values('blocked migration write');`, 'byus_migrator', false);
  sql('target', `select public.mutate('blocked migration write');`, 'byus_migrator', false);
  await refreshEvidence();
  run('fence', true);
  assert.equal(sql('source', "select count(*) from pg_publication_tables where schemaname='_byus_migration';"), '0');
  sql('source', `begin; insert into public.\"items odd's\"(\"item id\",value) values(999,'migration exception'); rollback;`);
  for (const statement of [`insert into public."items odd's"(value) values('blocked')`, `truncate public."items odd's"`, `select public.mutate('blocked through SECURITY DEFINER')`]) sql('source', statement, 'app_login', false);
  run('barrier', true);
  const applyDeadline = Date.now() + 10000;
  while (sql('target', 'select count(*) from _byus_barrier.barriers where source_commit_fence_lsn is not null;') !== '1') { assert(Date.now() < applyDeadline); await sleep(100); }
  sql('source', `alter table public.\"items odd's\" disable trigger byus_migration_guard;`);
  assert(run('verify', false, false).stderr.includes('guards are incomplete'));
  sql('source', `alter table public.\"items odd's\" enable always trigger byus_migration_guard;`);
  run('verify'); run('sequences', true);
  assert.equal(sql('target', `select last_value from public."items odd's_item id_seq";`), '2');
  if (scenario === 'prewrite-timeout') {
    await sleep(5100);
    assert(run('verify', false, false).stderr.includes('expired'));
    run('abort', true);
    sql('source', `select public.mutate('safe source resume');`, 'app_login');
    sql('target', `select public.mutate('target remains closed');`, 'app_login', false);
    const state = JSON.parse(await readFile(join(directory, 'ledger.json'), 'utf8'));
    assert.equal(state.phase, 'aborted');
    await writeFile(join(output, 'prewrite-abort-report.json'), JSON.stringify({ localOnly: true, phase: state.phase, elapsedMs: Date.now()-state.fencedAt, sourceReopenedAfterTargetFence: true, targetWriteRejected: true, timeoutSeconds: c.timeoutSeconds }, null, 2)+'\n');
    return;
  }
  await refreshEvidence();
  const invalid = JSON.parse(await readFile(evidenceFile, 'utf8'));
  invalid.writerDeployments[0].targetIdentityHash = 'wrong-target';
  await writeFile(evidenceFile, JSON.stringify(invalid));
  assert(run('enable', true, false).stderr.includes('not proven'));
  sql('target', `select public.mutate('gate remains closed');`, 'app_login', false);
  await refreshEvidence();
  run('enable', true);
  const holder = spawn('psql', ['-X', '-q', '-A', '-t', '-h', '127.0.0.1', '-p', String(ports[1]), '-U', 'app_login', '-d', 'byus_rehearsal', '-v', 'ON_ERROR_STOP=1'], { stdio: ['pipe', 'pipe', 'pipe'] });
  try {
    const held = new Promise((resolve, reject) => {
      let text = ''; holder.stdout.on('data', (chunk) => { text += chunk; if (text.includes('WRITE_HELD')) resolve(); });
      holder.once('error', reject); holder.once('exit', () => reject(new Error('First-write holder exited early')));
    });
    holder.stdin.write("begin; select public.mutate('first target application write');\n\\echo WRITE_HELD\n");
    await held;
    const racer = spawn(process.execPath, [resolve('scripts/aws-db-migrate.mjs'), 'abort', '--config', configFile, '--out', directory, '--apply'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let errorText = ''; racer.stderr.on('data', (chunk) => { errorText += chunk; });
    const finished = new Promise((resolve, reject) => { racer.once('exit', resolve); racer.once('error', reject); });
    const waitDeadline = Date.now() + 5000;
    while (sql('target', "select count(*) from pg_stat_activity where application_name='byus-migration/rehearsal_test' and wait_event_type='Lock';") === '0') { assert(Date.now() < waitDeadline, 'Abort did not serialize behind first write'); await sleep(30); }
    holder.stdin.end('commit;\n');
    assert.equal(await finished, 1);
    assert(errorText.includes('source cannot be reopened'));
  } finally { if (holder.exitCode === null) holder.kill(); }
  sql('source', `select public.mutate('source still fenced');`, 'app_login', false);
  const ledger = JSON.parse(await readFile(join(directory, 'ledger.json'), 'utf8'));
  assert.equal(ledger.phase, 'post-write');
  assert(ledger.firstWriteAt);
  const verifyEvent = ledger.events.find((e) => e.rowsChecked);
  const report = { localOnly: true, PostgreSQLMajor: 17, elapsedMs: Date.now() - ledger.fencedAt, sourceCommitFenceLsn: ledger.sourceCommitFenceLsn, targetRemoteLsn: verifyEvent.remoteLsn, rowsChecked: verifyEvent.rowsChecked, outstandingWriters: 0, firstWriteRollbackRefused: true, sourceFenceRemained: true, checksumMode: 'row-counts plus replication origin barrier; no content checksum' };
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
});
