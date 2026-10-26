import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DATABASE, connectRegistrationDatabase, queuedManifest, validateQueuedManifest, runQueueRegistration, queueMain } from './queue-giwa-registration.mjs';
import { CAMPAIGN_DEPLOYMENT, KYAA_BINDING_ID, prepareCampaignRegistration, prepareWaveCampaignRegistration } from './register-giwa-campaign.mjs';

const live = { id: 'c0960f8b-f01c-4308-97f8-3d13173922e8', celebrity_id: '18ec5319-95fb-4134-95f4-97ff95ae726b', slug: 'registration-live', publication_status: 'published', archived_at: null, creator_status: 'published', creator_archived_at: null };
const wave = { event_key: 'kyaa-wave-2026', campaign_id: '869cfb38-b438-4b66-a9e3-cbce3e2bbd38', creator_id: live.celebrity_id, campaign_slug: 'kyaa-wave-2026', context_id: '869cfb38-b438-4b66-a9e3-cbce3e2bbd38', context_creator_id: live.celebrity_id, wave_event_key: 'kyaa-wave-2026', live_event_id: null, creator_slug: 'kyaa-wave-fanpage', creator_status: 'published', creator_archived_at: null };
const jobId = 'b0000000-0000-4000-8000-000000000001';
function database(source = live, waveMode = false) {
  const calls = [], binding = waveMode ? KYAA_BINDING_ID : CAMPAIGN_DEPLOYMENT.binding;
  let status = 'queued', enqueues = 0;
  return { calls, get enqueues() { return enqueues; }, setStatus(value) { status = value; },
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('current_database')) return { rows: [{ database: DATABASE.database, username: DATABASE.user }] };
      if (sql.includes('from public.kyaa_wave_participation_config') || sql.includes('from public.live_events')) return { rows: source ? [source] : [] };
      if (sql.includes('from public.fan_action_producer_routes')) return { rows: (waveMode ? [4] : [2, 3, 4, 5]).map(action_code => ({ action_code, binding_id: binding })) };
      if (sql.includes('from public.fan_action_bindings')) return { rows: [{ id: binding, chain_id: '91342', hub_proxy: CAMPAIGN_DEPLOYMENT.hub }] };
      if (sql.includes('enqueue_campaign_registration')) { enqueues++; return { rows: [{ result: snapshot() }] }; }
      if (sql.includes('registration_job_status')) return { rows: [{ result: snapshot() }] };
      if (sql.includes('from public.creator_registration_jobs')) return { rows: [{ id: jobId }] };
      return { rows: [] };
    },
    async connect() {}, async end() {},
  };
  function snapshot() { return { job: { id: jobId, kind: 'campaign', campaign_id: waveMode ? wave.campaign_id : live.id, status, last_error_code: null }, attempt: { transaction_hash: '0x' + '1'.repeat(64), signed_transaction: 'PRIVATE_RAW_NEVER_OUTPUT' } }; }
}
function awsFixture(overrides = {}) {
  const calls = [];
  const descriptor = { DBInstanceIdentifier: DATABASE.instance, Endpoint: { Address: DATABASE.host, Port: 5432 }, MasterUsername: DATABASE.user, MasterUserSecret: { SecretArn: `arn:aws:secretsmanager:${DATABASE.region}:${DATABASE.account}:secret:rds!db-fixture` } };
  const secret = { username: DATABASE.user, password: 'in-memory-only-password' };
  return { calls, descriptor, secret,
    async aws(args) { calls.push(args); if (args.includes('get-caller-identity')) return { Account: overrides.account ?? DATABASE.account };
      if (args.includes('describe-db-instances')) return { DBInstances: [{ ...descriptor, ...overrides.db }] };
      if (args.includes('get-secret-value')) return { SecretString: JSON.stringify({ ...secret, ...overrides.secret }) };
      throw Error('UNEXPECTED_AWS_COMMAND'); },
  };
}
const options = { profile: 'explicit-profile', port: 15432, caPath: '/test/ca.pem' };
test('AWS identity, RDS endpoint and database credentials are pinned; secret stays out of argv and TLS verifies real host', async () => {
  const aws = awsFixture(), db = database(); let config;
  const client = await connectRegistrationDatabase(options, { aws: aws.aws, readFile: file => { assert.equal(file, options.caPath); return 'test-ca'; }, Client: class { constructor(value) { config = value; return db; } } });
  assert.equal(client, db);
  assert.deepEqual({ host: config.host, port: config.port, database: config.database, user: config.user }, { host: '127.0.0.1', port: 15432, database: 'byus', user: 'byus_admin' });
  assert.deepEqual(config.ssl, { rejectUnauthorized: true, servername: DATABASE.host, ca: 'test-ca' });
  assert.equal(config.password, aws.secret.password);
  assert.ok(aws.calls.every(args => args.includes('explicit-profile') && args.includes(DATABASE.region)));
  assert.doesNotMatch(JSON.stringify(aws.calls), /in-memory-only-password|keychain|signTransaction/);
});
test('wrong account, endpoint, instance, user, port, secret principal and database fail closed', async () => {
  for (const mismatch of [{ account: '111111111111' }, { db: { Endpoint: { Address: 'evil.example', Port: 5432 } } }, { db: { DBInstanceIdentifier: 'other' } }, { db: { MasterUsername: 'postgres' } }, { db: { Endpoint: { Address: DATABASE.host, Port: 5433 } } }, { secret: { username: 'postgres' } }]) {
    const fixture = awsFixture(mismatch);
    await assert.rejects(connectRegistrationDatabase(options, { aws: fixture.aws, readFile: () => 'ca', Client: class { constructor() { throw Error('MUST_NOT_CONNECT'); } } }), /CHANGED/);
  }
  const db = database(); let ended = false;
  db.query = async () => ({ rows: [{ database: 'wrong', username: DATABASE.user }] }); db.end = async () => { ended = true; };
  await assert.rejects(connectRegistrationDatabase(options, { aws: awsFixture().aws, readFile: () => 'ca', Client: class { constructor() { return db; } } }), /CONNECTED_DATABASE_IDENTITY_CHANGED/);
  assert.equal(ended, true);
  await assert.rejects(connectRegistrationDatabase({ ...options, profile: undefined }), /EXPLICIT_AWS_PROFILE_REQUIRED/);
  await assert.rejects(connectRegistrationDatabase({ ...options, port: 543 }), /LOCAL_TUNNEL_PORT_AND_CA_REQUIRED/);
});
test('LIVE and WAVE manifests preserve exact source validation and bind approval to worker queue plus AWS database', async () => {
  for (const [source, isWave] of [[live, false], [wave, true]]) {
    const db = database(source, isWave);
    const manifest = await runQueueRegistration(db, { mode: 'prepare', ...(isWave ? { waveEvent: wave.event_key } : { campaign: live.id }) });
    assert.equal(manifest.execution, 'dedicated-worker-queue');
    assert.equal(manifest.registration.source.id, isWave ? wave.campaign_id : live.id);
    assert.equal(validateQueuedManifest(manifest, source, manifest.hash), manifest);
    assert.throws(() => validateQueuedManifest(manifest, source, '0x' + '0'.repeat(64)), /APPROVED_QUEUE_HASH_REQUIRED/);
    assert.throws(() => validateQueuedManifest({ ...manifest, database: { ...DATABASE, account: 'other' } }, source, manifest.hash), /QUEUE_MANIFEST_IDENTITY_CHANGED/);
    assert.ok(db.calls.some(call => call.sql.includes('for share')));
  }
  assert.throws(() => validateQueuedManifest(queuedManifest(prepareCampaignRegistration(live)), { ...live, slug: 'changed' }, queuedManifest(prepareCampaignRegistration(live)).hash), /MANIFEST_OR_PUBLISHED_SOURCE_CHANGED/);
  await assert.rejects(runQueueRegistration(database({ ...live, creator_status: 'draft' }), { mode: 'prepare', campaign: live.id }), /PUBLISHED_CREATOR_REQUIRED/);
  await assert.rejects(runQueueRegistration(database({ ...wave, live_event_id: live.id }, true), { mode: 'prepare', waveEvent: wave.event_key }), /WAVE_CAMPAIGN_CONTEXT_REQUIRED/);
});
test('execute atomically locks and compares approved source before bounded idempotent enqueue, never signs or writes proofs', async () => {
  for (const isWave of [false, true]) {
    const source = isWave ? wave : live;
    const db = database(source, isWave), manifest = queuedManifest(isWave ? prepareWaveCampaignRegistration(source) : prepareCampaignRegistration(source));
    const first = await runQueueRegistration(db, { mode: 'execute', manifest, approvedHash: manifest.hash });
    const second = await runQueueRegistration(db, { mode: 'execute', manifest, approvedHash: manifest.hash });
    assert.equal(first.jobId, second.jobId); assert.equal(first.waiting, true); assert.equal(db.enqueues, 2);
    assert.equal(db.calls[0].sql, 'begin isolation level repeatable read');
    assert.equal(db.calls.at(-1).sql, 'commit');
    assert.ok(db.calls.findIndex(call => call.sql.includes('for share')) < db.calls.findIndex(call => call.sql.includes('enqueue_campaign_registration')));
    assert.doesNotMatch(JSON.stringify(first), /PRIVATE_RAW_NEVER_OUTPUT/);
    assert.doesNotMatch(db.calls.map(call => call.sql).join('\n'), /insert into|update public|delete from|verified_.*values/i);
  }
});
test('changed source, route, approval and caller source cannot enqueue and roll back', async () => {
  const manifest = queuedManifest(prepareCampaignRegistration(live));
  for (const [source, overrides, reason] of [[{ ...live, slug: 'changed' }, {}, /MANIFEST_OR_PUBLISHED_SOURCE_CHANGED/], [live, { approvedHash: 'wrong' }, /APPROVED_QUEUE_HASH_REQUIRED/], [live, { campaign: wave.campaign_id }, /MANIFEST_SOURCE_ARGUMENT_CHANGED/]]) {
    const db = database(source);
    await assert.rejects(runQueueRegistration(db, { mode: 'execute', manifest, approvedHash: manifest.hash, ...overrides }), reason);
    assert.equal(db.enqueues, 0);
  }
  const db = database(); const query = db.query.bind(db);
  db.query = (sql, values) => sql.includes('producer_routes') ? Promise.resolve({ rows: [] }) : query(sql, values);
  await assert.rejects(runQueueRegistration(db, { mode: 'execute', manifest, approvedHash: manifest.hash }), /PRODUCER_ROUTES_CHANGED/);
  assert.equal(db.calls.at(-1).sql, 'rollback');
});
test('finalize and job status report durable waiting/finality after withdrawal without changing proof', async () => {
  const db = database(null), manifest = queuedManifest(prepareCampaignRegistration(live));
  let status = await runQueueRegistration(db, { mode: 'finalize', manifest, approvedHash: manifest.hash });
  assert.equal(status.waiting, true); assert.equal(status.finalized, false);
  db.setStatus('finalized');
  status = await runQueueRegistration(db, { mode: 'finalize', jobId });
  assert.equal(status.finalized, true); assert.equal(status.waiting, false);
  assert.equal(db.enqueues, 0);
  assert.ok(db.calls.every(call => !/for share|enqueue_campaign_registration|begin/.test(call.sql)));
});
test('prepare creates a private exclusive manifest and rejects legacy signer options before AWS access', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'byus-registration-cli-')), file = path.join(dir, 'manifest.json'), db = database(), fixture = awsFixture();
  const args = ['prepare', '--aws-profile', options.profile, '--local-port', String(options.port), '--ssl-root-cert', options.caPath, '--manifest', file, '--campaign', live.id];
  const dependencies = { aws: fixture.aws, readFile: () => 'ca', Client: class { constructor() { return db; } }, output() {} };
  try {
    await queueMain(args, dependencies);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /in-memory-only-password|PRIVATE_RAW_NEVER_OUTPUT/);
    await assert.rejects(queueMain(args, dependencies), /EEXIST/);
    await assert.rejects(queueMain([...args, '--creator', live.celebrity_id], dependencies), /EXPLICIT_QUEUE_ARGUMENTS_REQUIRED/);
    await assert.rejects(queueMain([...args, '--env-file', 'private.env'], dependencies), /EXPLICIT_QUEUE_ARGUMENTS_REQUIRED/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
