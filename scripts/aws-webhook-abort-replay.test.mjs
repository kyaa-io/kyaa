import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { loadConsumer, replayRecord, acquireTargetLease, createAwsIO, openConnection, assertSourceWrapper, parseArgs, selfCheck, assertProducerClosed, main } from './aws-webhook-abort-replay.mjs';
import { DmsAdapter } from './aws-db-dms-adapter.mjs';

const requireWeb = createRequire(new URL('../apps/web/package.json', import.meta.url));
const { Client } = requireWeb('pg');
const hash = value => createHash('sha256').update(value).digest('hex');
const shared = await loadConsumer();
const source = { APP_ENV: 'dev', WEBHOOK_REPLAY_ENABLED: 'false', WEBHOOK_BUFFER_QUEUE_URL: 'https://sqs.ap-northeast-2.amazonaws.com/996702758024/byus-webhook-buffer-dev.fifo', WEBHOOK_BUFFER_BUCKET: 'byus-fixture-dev-996702758024', WEBHOOK_BUFFER_KMS_KEY_ID: 'arn:aws:kms:ap-northeast-2:996702758024:key/00000000-0000-0000-0000-000000000001' };
const queueArn = 'arn:aws:sqs:ap-northeast-2:996702758024:byus-webhook-buffer-dev.fifo';
function fixture(provider = 'instagram-deletion', id = 'ok') {
  const commands = provider === 'solapi' ? [{ name: 'record_kakao_notification_receipt', args: { p_delivery_id: '00000000-0000-0000-0000-000000000001', p_provider_message_id: id, p_group_id: 'fixture' } }] : [{ name: 'instagram_delete_subject', args: { p_scoped_id: id, p_issued_at: '2026-10-24T00:00:00Z', p_confirmation_hash: 'c'.repeat(64) } }];
  const raw = JSON.stringify({ version: 1, environment: 'dev', provider, receivedAt: new Date().toISOString(), body: Buffer.from(id).toString('base64'), bodyHash: hash(id), headers: {}, commands });
  return { raw, record: { body: JSON.stringify({ version: 1, environment: 'dev', key: 'webhook-intake/dev/00000000-0000-0000-0000-000000000001.json', hash: hash(raw) }), eventSourceARN: queueArn, receiptHandle: 'synthetic-receipt' } };
}

test('shared pointer validation rejects environment, path, hash, commands and AWS storage metadata tampering before writes', async () => {
  const f = fixture(), order = [];
  const io = await createAwsIO({ source }, { s3: { async send() { return { Body: { transformToString: async () => f.raw }, ContentLength: Buffer.byteLength(f.raw), ServerSideEncryption: 'AES256', SSEKMSKeyId: source.WEBHOOK_BUFFER_KMS_KEY_ID }; } } });
  await assert.rejects(io.read('key'), /ENCRYPTED_ENVELOPE/);
  for (const change of [{ environment: 'prod' }, { key: 'webhook-intake/prod/00000000-0000-0000-0000-000000000001.json' }, { hash: '0'.repeat(64) }]) {
    await assert.rejects(shared.processPointer(JSON.stringify({ ...JSON.parse(f.record.body), ...change }), { source: { ...source, WEBHOOK_REPLAY_ENABLED: 'true' }, read: async () => f.raw, apply: async () => { order.push('write'); } }));
  }
  const invalidEnvelope = JSON.parse(f.raw); invalidEnvelope.commands[0].name = 'arbitrary_operation';
  const invalidRaw = JSON.stringify(invalidEnvelope);
  await assert.rejects(shared.processPointer(JSON.stringify({ ...JSON.parse(f.record.body), hash: hash(invalidRaw) }), { source: { ...source, WEBHOOK_REPLAY_ENABLED: 'true' }, read: async () => invalidRaw, apply: async () => { order.push('write'); } }));
  await assert.rejects(shared.processPointer(f.record.body, { source, read: async () => f.raw, apply: async () => { order.push('write'); } }), /paused/);
  assert.deepEqual(order, []);
});

test('receipt failure retains the message and retry commits idempotently before ACK while lease stays held', async () => {
  const f = fixture(), order = []; let receiptFails = true, held = false;
  const deps = { queueArn, source, runId: 'run', mode: 'aborted', proofHash: 'a'.repeat(64), processPointer: shared.processPointer,
    assertOperational: async () => { order.push('admit'); },
    acquireTargetLease: async () => { held = true; order.push('lock'); return async () => { held = false; order.push('unlock'); }; },
    sourceDb: { async query(sql) { assert(held); order.push(sql.split(' ')[0]); return { rows: [{ mode: 'aborted', proof_hash: 'a'.repeat(64) }] }; } },
    read: async () => f.raw, assertSourceWrapper: async () => {}, assertTargetAlive: async () => { assert(held); },
    completeReceipt: async () => { assert(held); order.push('receipt'); if (receiptFails) throw Error('synthetic receipt failure'); },
    ack: async () => { assert(held); order.push('ack'); },
  };
  await assert.rejects(replayRecord(f.record, deps), /receipt failure/);
  assert.equal(order.includes('ack'), false); assert.equal(held, false);
  assert(order.indexOf('commit') < order.indexOf('receipt')); assert(order.indexOf('receipt') < order.indexOf('unlock'));
  order.length = 0; receiptFails = false;
  await replayRecord(f.record, deps);
  assert.deepEqual(order.slice(-3), ['receipt', 'ack', 'unlock']);
  await assert.rejects(replayRecord({ ...f.record, eventSourceARN: queueArn.replace('996702758024', '200151116034') }, deps), /QUEUE_RECORD/);
});

const pgEnv = { ...process.env, PATH: `/opt/homebrew/opt/postgresql@17/bin:${process.env.PATH}` };
for (const key of Object.keys(pgEnv)) if (key.startsWith('PG')) delete pgEnv[key];
const available = /^PostgreSQL 17\./.test(spawnSync('pg_config', ['--version'], { env: pgEnv, encoding: 'utf8' }).stdout ?? '');
test('real PG17 target lease excludes enable/first-write through source commit and receipt; duplicate and conflict use private SQL', { skip: !available, timeout: 30000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'byus-abort-runner-')), listener = createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve)); const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  Object.assign(pgEnv, { PGHOST: '127.0.0.1', PGPORT: String(port) });
  const run = (bin, args, input) => { const r = spawnSync(bin, args, { env: pgEnv, input, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  const sql = (database, input, user = 'postgres') => run('psql', ['-XqAt', '-v', 'ON_ERROR_STOP=1', '-U', user, '-d', database], input);
  const clients = [];
  let started = false;
  try {
    run('initdb', ['-D', join(dir, 'pg'), '-A', 'trust', '--no-locale', '-E', 'UTF8', '-U', 'fixture_admin']);
    run('pg_ctl', ['-D', join(dir, 'pg'), '-l', join(dir, 'server.log'), '-o', `-h127.0.0.1 -p${port}`, '-w', 'start']); started = true;
    run('psql', ['-U', 'fixture_admin', '-d', 'postgres', '-c', 'create role postgres login; create role anon; create role authenticated; create role service_role;']);
    for (const name of ['source_fixture', 'target_fixture']) run('createdb', ['-U', 'fixture_admin', '-O', 'postgres', name]);
    sql('source_fixture', `create schema _byus_migration; create schema extensions; create extension pgcrypto with schema extensions;
      create table _byus_migration.auth_fence(singleton boolean primary key,run_id text,fenced boolean); insert into _byus_migration.auth_fence values(true,'run',false);
      create table _byus_migration.storage_fence(like _byus_migration.auth_fence including all); insert into _byus_migration.storage_fence values(true,'run',false);
      create table _byus_migration.state(run_id text primary key,side text,fenced boolean); insert into _byus_migration.state values('run','source',false);
      create table public.effects(value text);
      create function public.instagram_delete_subject(text,timestamptz,text) returns void language sql as $$ insert into public.effects values($1); $$;
      create function public.record_kakao_notification_receipt(uuid,text,text) returns void language sql as $$ insert into public.effects values($2); $$;`);
    sql('source_fixture', await readFile(new URL('../infrastructure/aws/database/webhook-abort-replay.sql', import.meta.url), 'utf8'));
    sql('source_fixture', `insert into _byus_migration.webhook_replay_control values('run','aborted','${'a'.repeat(64)}',default);`);
    sql('target_fixture', `create schema _byus_migration; create table _byus_migration.state(run_id text primary key,side text,fenced boolean,first_write_at timestamptz,enabled_at timestamptz,imports_open boolean); insert into _byus_migration.state values('run','target',true,null,null,true);
      create function _byus_migration.guard() returns trigger language plpgsql as $$ begin return null; end $$;
      create table public.fixture(id int); create trigger byus_migration_guard before insert or update or delete or truncate on public.fixture for each statement execute function _byus_migration.guard(); alter table public.fixture enable always trigger byus_migration_guard;`);
    const connect = async database => { const db = new Client({ host: '127.0.0.1', port, database, user: 'postgres' }); await db.connect(); clients.push(db); return db; };
    const sourceDb = await connect('source_fixture'), target = await connect('target_fixture'), contender = await connect('target_fixture');
    await contender.query("set lock_timeout='150ms'");
    const c = { runId: 'run', schemas: ['public'] }, expected = { functionHash: sql('target_fixture', "select md5(pg_get_functiondef('_byus_migration.guard()'::regprocedure));"), tables: ['public.fixture'] };
    await contender.query("update _byus_migration.state set enabled_at=clock_timestamp() where run_id='run'");
    await assert.rejects(acquireTargetLease(target,c,expected,'prepared-cancel-complete'),/TARGET_NOT_SEALED/);
    let receipts = 0, acknowledgments = 0, failReceipt = true;
    const f = fixture();
    const deps = { source, queueArn, runId: 'run', mode: 'aborted', proofHash: 'a'.repeat(64), processPointer: shared.processPointer, sourceDb,
      assertOperational: async () => {}, assertSourceWrapper: () => assertSourceWrapper(sourceDb, sql('source_fixture', "select md5(pg_get_functiondef('_byus_migration.replay_aborted_webhook(text,text,text,text,jsonb)'::regprocedure));")), acquireTargetLease: () => acquireTargetLease(target, c, expected, 'aborted'), read: async () => f.raw,
      assertTargetAlive: async () => { await target.query('select 1'); },
      completeReceipt: async () => {
        assert.equal((await sourceDb.query('select count(*)::int as n from public.effects')).rows[0].n, 1);
        await assert.rejects(contender.query("update _byus_migration.state set fenced=false,enabled_at=clock_timestamp(),first_write_at=clock_timestamp() where run_id='run'"), error => error.code === '55P03');
        receipts++; if (failReceipt) throw Error('receipt failure');
      }, ack: async () => { acknowledgments++; },
    };
    await assert.rejects(replayRecord(f.record, deps), /receipt failure/);
    assert.equal(acknowledgments, 0); assert.equal(receipts, 1);
    failReceipt = false; await replayRecord(f.record, deps);
    assert.equal((await sourceDb.query('select count(*)::int as n from public.effects')).rows[0].n, 1);
    assert.equal(acknowledgments, 1);
    const conflicting = JSON.parse(f.raw); conflicting.commands[0].args.p_scoped_id = 'changed'; const conflictingRaw = JSON.stringify(conflicting);
    const bad = { ...f.record, body: JSON.stringify({ ...JSON.parse(f.record.body), hash: hash(conflictingRaw) }) };
    await assert.rejects(replayRecord(bad, { ...deps, read: async () => conflictingRaw }), /WEBHOOK_EVENT_CONFLICT/);
    assert.equal(acknowledgments, 1);
    const pending = fixture('solapi', 'uncommitted');
    await assert.rejects(replayRecord(pending.record, { ...deps, read: async () => pending.raw, proofHash: 'b'.repeat(64) }), /SOURCE_AUTHORIZATION_CHANGED/);
    await assert.rejects(replayRecord(pending.record, { ...deps, read: async () => pending.raw, assertTargetAlive: async () => { throw Error('synthetic target connection loss'); } }), /target connection loss/);
    assert.equal((await sourceDb.query('select count(*)::int as n from public.effects')).rows[0].n, 1);
    assert.equal(acknowledgments, 1);
    await contender.query("update _byus_migration.state set fenced=false,first_write_at=clock_timestamp() where run_id='run'");
    await assert.rejects(replayRecord(f.record, deps), /TARGET_NOT_SEALED/);
    const db = database => ({run(query,{json=true}={}){const value=sql(database,query);return json?JSON.parse(value):value;}});
    const adapter=new DmsAdapter({source:db('source_fixture'),target:db('target_fixture')});
    await assert.rejects(adapter.webhookHistory(),/not held and drained/);
    await sourceDb.query("update _byus_migration.webhook_replay_control set mode='hold'");
    await target.query('create table public.webhook_intake_inbox(provider text not null,event_key text not null,body_hash text not null,command_hash text not null,processed_at timestamptz not null,primary key(provider,event_key))');
    await assert.rejects(adapter.webhookHistory(),/seeded exactly/);
    const history=(await sourceDb.query('select provider,event_key,body_hash,command_hash,processed_at::text from _byus_migration.webhook_abort_inbox')).rows;
    for(const row of history)await target.query('insert into public.webhook_intake_inbox values($1,$2,$3,$4,$5)',[row.provider,row.event_key,row.body_hash,row.command_hash,row.processed_at]);
    assert.equal((await adapter.webhookHistory()).rows,'1');
    await target.query("update public.webhook_intake_inbox set processed_at=processed_at+interval '1 microsecond'");
    await assert.rejects(adapter.webhookHistory(),/seeded exactly/);
    await target.query('alter table public.webhook_intake_inbox add column unexpected text');
    await assert.rejects(adapter.webhookHistory(),/schema differs/);
    assert.equal(acknowledgments, 1);
    // Exercise the same validated URL/DNS/identity opening path on a separate pg connection.
    const dbConfig = { localRehearsal: true, runId: 'run', schemas: ['public'], source: { host: '127.0.0.1', migrationRole: 'postgres', connectionEnv: 'ABORT_SQL_TEST_URL', identity: { database: 'source_fixture', sessionUser: 'postgres', serverAddress: '127.0.0.1', serverPort: port } } };
    process.env.ABORT_SQL_TEST_URL = `postgresql://postgres:synthetic@127.0.0.1:${port}/source_fixture`;
    try { const verified = await openConnection(dbConfig, 'source'); await verified.end(); } finally { delete process.env.ABORT_SQL_TEST_URL; }
  } finally {
    await Promise.all(clients.map(client => client.end()));
    if (started) run('pg_ctl', ['-D', join(dir, 'pg'), '-m', 'immediate', '-w', 'stop']);
    await rm(dir, { recursive: true, force: true });
  }
});

test('live replay must be disabled with exact Lambda/env/queue/KMS identities; no AWS mutation is performed by admission', async () => {
  const c = { source, replayFunctionArn: 'arn:aws:lambda:ap-northeast-2:996702758024:function:byus-webhook-replay-dev' };
  const fn = { FunctionArn: c.replayFunctionArn, State: 'Active', LastUpdateStatus: 'Successful', Environment: { Variables: source } };
  let mappingState = 'Disabled', kms = source.WEBHOOK_BUFFER_KMS_KEY_ID;
  const clients = { lambda: { async send(command) { if (command.constructor.name === 'GetFunctionConfigurationCommand') return fn; assert.equal(command.constructor.name, 'ListEventSourceMappingsCommand'); return { EventSourceMappings: [{ State: mappingState, EventSourceArn: queueArn }] }; } }, sqs: { async send(command) { assert.equal(command.constructor.name, 'GetQueueAttributesCommand'); return { Attributes: { QueueArn: queueArn, FifoQueue: 'true', KmsMasterKeyId: kms } }; } } };
  const io = await createAwsIO(c, clients);
  await io.assertReplayDisabled();
  mappingState = 'Enabling'; await assert.rejects(io.assertReplayDisabled(), /NOT_DISABLED/);
  mappingState = 'Disabled'; kms = 'wrong'; await assert.rejects(io.assertReplayDisabled(), /IDENTITY_REJECTED/);
  kms = source.WEBHOOK_BUFFER_KMS_KEY_ID;
  fn.Environment = { Variables: { ...source, WEBHOOK_REPLAY_ENABLED: 'true' } }; await assert.rejects(io.assertReplayDisabled(), /NOT_DISABLED/);
});


test('CLI defaults to local dry run and requires a pinned config and bounded explicit apply', async () => {
  assert.equal(parseArgs(['--config','private.json'])['--apply'], undefined);
  for (const args of [['--apply'], ['--config','private.json','--apply'], ['--config','private.json','--max-messages','0'], ['--config','private.json','--max-messages','1001'], ['--deploy'], ['--self-check','--apply']]) assert.throws(() => parseArgs(args));
  assert.deepEqual(await selfCheck(), { selfCheck: true, pointerChecks: 2, networkRequests: 0, executed: false });
});


test('producer admission binds fresh hashed retirement/drain evidence to both live hold routes and stopped AWS tasks', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'byus-abort-proof-'));
  try {
    const now = Date.now(), evidence = join(dir,'retirement.json'), path = join(dir,'closure.json');
    await writeFile(evidence, '{"synthetic":true}', { mode: 0o600 });
    const identity = name => ({ database:name, sessionUser:'postgres', serverAddress:'127.0.0.1', serverPort:5432 });
    const c = { source, cronSecretEnv:'ABORT_FIXTURE_CRON', producerClosure:{path}, migration:{runId:'run',environment:'dev',source:{identity:identity('source')},target:{identity:identity('target')}} };
    const taskArn = 'arn:aws:ecs:ap-northeast-2:996702758024:task/cluster/00000000000000000000000000000001';
    const proof = {schemaVersion:1,runId:'run',environment:'dev',sourceIdentityHash:hash(JSON.stringify(c.migration.source.identity)),targetIdentityHash:hash(JSON.stringify(c.migration.target.identity)),queueArn,bucket:source.WEBHOOK_BUFFER_BUCKET,kmsKeyArn:source.WEBHOOK_BUFFER_KMS_KEY_ID,closedAt:new Date(now-302000).toISOString(),observedAt:new Date(now).toISOString(),
      vercel:{teamId:'team_VnIRt1lESthQEUcpyXms4nOe',projectId:'prj_kGkUOgGXU01nXsRhpwZ0n9jTuavv',deploymentId:'dpl_fixture',immutableOrigin:'https://byus-fixture-team.vercel.app',canonicalOrigin:'https://kyaa.io',revision:'f'.repeat(40),retiredDeploymentIds:['dpl_old'],callbackMaxDurationSeconds:300,drainedAt:new Date(now-1000).toISOString()},
      aws:{clusterArn:'arn:aws:ecs:ap-northeast-2:996702758024:cluster/byus-dev',serviceArn:'arn:aws:ecs:ap-northeast-2:996702758024:service/byus-dev/web',taskDefinitionArns:['arn:aws:ecs:ap-northeast-2:996702758024:task-definition/web:1'],stoppedTaskArns:[taskArn]},evidence:[{path:evidence,sha256:hash('{"synthetic":true}')}]
    };
    const setProof = async value => { const raw=JSON.stringify(value); await writeFile(path,raw,{mode:0o600}); c.producerClosure.sha256=hash(raw); };
    const inventoryPath=join(dir,'inventory.json'),inventory={schemaVersion:1,runId:'run',environment:'dev',observedAt:new Date(now-303000).toISOString(),vercel:{teamId:proof.vercel.teamId,projectId:proof.vercel.projectId,producingDeploymentIds:['dpl_old']},aws:{clusterArn:proof.aws.clusterArn,serviceArn:proof.aws.serviceArn,taskArns:[taskArn],taskDefinitionArns:proof.aws.taskDefinitionArns}};
    const inventoryRaw=JSON.stringify(inventory);await writeFile(inventoryPath,inventoryRaw,{mode:0o600});proof.inventory={path:inventoryPath,sha256:hash(inventoryRaw)};
    const metadataPath=join(dir,'vercel.json'),metadata={schemaVersion:1,observedAt:new Date(now).toISOString(),project:{id:proof.vercel.projectId,accountId:proof.vercel.teamId,defaultResourceConfig:{functionDefaultTimeout:300}},deployment:{id:proof.vercel.deploymentId,projectId:proof.vercel.projectId,ownerId:proof.vercel.teamId,gitSource:{sha:proof.vercel.revision},readyState:'READY',url:new URL(proof.vercel.immutableOrigin).hostname},alias:{alias:'kyaa.io',projectId:proof.vercel.projectId,deploymentId:proof.vercel.deploymentId,deployment:{id:proof.vercel.deploymentId,url:new URL(proof.vercel.immutableOrigin).hostname}}};
    const setMetadata=async value=>{const raw=JSON.stringify(value);await writeFile(metadataPath,raw,{mode:0o600});proof.vercel.metadata={path:metadataPath,sha256:hash(raw)};await setProof(proof);};
    await setMetadata(metadata);
    let accepting=false,runningCount=0,lastStatus='STOPPED',extraStopping=false; const routes=[];
    const extraArn=taskArn.replace(/1$/,'2');
    const deps = {now,env:{ABORT_FIXTURE_CRON:'s'.repeat(32)}, request:async(url,options)=>{routes.push(url); assert.equal(options.redirect,'error'); assert.equal(options.cache,'no-store'); assert.equal(options.headers.authorization,`Bearer ${'s'.repeat(32)}`);return new Response(JSON.stringify({provider:'vercel',manifestVersion:1,revision:proof.vercel.revision,webhookIntake:{mode:accepting?'direct':'hold',accepting}}));},readAws:async args=>{
      if(args[1]==='describe-services')return {services:[{serviceArn:proof.aws.serviceArn,clusterArn:proof.aws.clusterArn,desiredCount:0,runningCount,pendingCount:0,taskDefinition:proof.aws.taskDefinitionArns[0]}]};
      if(args[1]==='list-tasks')return {taskArns:args[args.indexOf('--desired-status')+1]==='STOPPED'?[taskArn,...extraStopping?[extraArn]:[]]:[]};
      return {tasks:args.slice(args.indexOf('--tasks')+1).map(arn=>({taskArn:arn,clusterArn:proof.aws.clusterArn,lastStatus:arn===extraArn?'STOPPING':lastStatus,taskDefinitionArn:proof.aws.taskDefinitionArns[0]}))};
    }};
    await assertProducerClosed(c,deps); assert.equal(new Set(routes).size,2);
    const beforeReject=routes.length;
    await setProof({...proof,vercel:{...proof.vercel,immutableOrigin:'https://other.vercel.app'}});await assert.rejects(assertProducerClosed(c,deps),/IDENTITY_MISMATCH/);assert.equal(routes.length,beforeReject);
    await setMetadata({...metadata,deployment:{...metadata.deployment,ownerId:'team_foreign'}});await assert.rejects(assertProducerClosed(c,deps),/IDENTITY_MISMATCH/);assert.equal(routes.length,beforeReject);
    await setMetadata(metadata);
    await setProof({...proof,closedAt:new Date(now-3000).toISOString()});await assert.rejects(assertProducerClosed(c,deps),/CALLBACK_DRAIN/);assert.equal(routes.length,beforeReject);
    await setMetadata({...metadata,alias:{...metadata.alias,alias:'byus.kr'}});await setProof({...proof,vercel:{...proof.vercel,canonicalOrigin:'https://byus.kr'}});await assertProducerClosed(c,deps);
    await setMetadata(metadata);
    extraStopping=true;await assert.rejects(assertProducerClosed(c,deps),/UNDRAINED_TASK/);extraStopping=false;
    await setProof({...proof,vercel:{...proof.vercel,retiredDeploymentIds:[]}});await assert.rejects(assertProducerClosed(c,deps),/INVENTORY_COVERAGE/);
    await setProof({...proof,aws:{...proof.aws,stoppedTaskArns:[]}});await assert.rejects(assertProducerClosed(c,deps),/INVENTORY_COVERAGE/);
    await setProof(proof);
    accepting=true;await assert.rejects(assertProducerClosed(c,deps),/HOLD_NOT_PROVEN/);accepting=false;
    runningCount=1;await assert.rejects(assertProducerClosed(c,deps),/STILL_RUNNING/);runningCount=0;
    lastStatus='RUNNING';await assert.rejects(assertProducerClosed(c,deps),/NOT_DRAINED/);lastStatus='STOPPED';
    for (const observedAt of [new Date(now-60001).toISOString(),new Date(now+1).toISOString()]) {await setProof({...proof,observedAt});await assert.rejects(assertProducerClosed(c,deps),/STALE_OR_MISMATCHED/);}
    await setProof({...proof,targetIdentityHash:'0'.repeat(64)});await assert.rejects(assertProducerClosed(c,deps),/STALE_OR_MISMATCHED/);
    await setProof(proof);await writeFile(evidence,'changed');await assert.rejects(assertProducerClosed(c,deps),/EVIDENCE_CHANGED/);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('complete CLI local dry run opens no DB or AWS connection and apply refuses a local rehearsal', async()=>{
  const dir=await mkdtemp(join(tmpdir(),'byus-abort-dry-'));
  try{
    const c={mode:'aborted',proofHash:'a'.repeat(64),sourceWrapperHash:'b'.repeat(32),targetGuard:{functionHash:'c'.repeat(32),tables:['public.fixture']},source,replayFunctionArn:'arn:aws:lambda:ap-northeast-2:996702758024:function:byus-webhook-replay-dev',producerClosure:{path:'not-opened-in-dry-run',sha256:'d'.repeat(64)},cronSecretEnv:'ABORT_FIXTURE_CRON',migration:{localRehearsal:true,environment:'dev',accountId:'996702758024',region:'ap-northeast-2',profile:'fixture-only',runId:'run',schemas:['public'],applicationRoles:['service_role'],writers:['web'],source:{host:'127.0.0.1',migrationRole:'postgres',connectionEnv:'ABORT_SOURCE',identity:{database:'source',sessionUser:'postgres',serverAddress:'127.0.0.1',serverPort:5432}},target:{host:'127.0.0.1',migrationRole:'operator',connectionEnv:'ABORT_TARGET',identity:{database:'target',sessionUser:'operator',serverAddress:'127.0.0.1',serverPort:5432}}}};
    const raw=JSON.stringify(c),path=join(dir,'config.json');await writeFile(path,raw,{mode:0o600});
    const result=await main(['--config',path]);assert.equal(result.executed,false);assert.equal(result.networkRequests,0);assert.equal(result.databaseConnections,0);
    await assert.rejects(main(['--config',path,'--config-sha256',hash(raw),'--apply']),/LOCAL_REHEARSAL/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
