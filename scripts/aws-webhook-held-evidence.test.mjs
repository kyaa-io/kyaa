import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { validateHeldWebhookEvidence } from './aws-webhook-held-evidence.mjs';
import { evidence } from './aws-db-migrate.mjs';
const hash = (v, algorithm = 'sha256', encoding = 'hex') => createHash(algorithm).update(v).digest(encoding);
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'held-webhook-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const now = Date.parse('2026-10-24T00:00:00Z'), observedAt = new Date(now - 1000).toISOString();
  const c = { runId: 'migration_test', environment: 'dev', accountId: '123456789012', region: 'ap-northeast-2', writers: ['web', 'cron', 'native-workers', 'legacy-auth', 'webhooks'], target: { host: 'target.example.rds.amazonaws.com', identity: { database: 'byus' } } };
  const revision = 'a'.repeat(40), sourceIdentityHash = 'b'.repeat(64), targetIdentityHash = 'c'.repeat(64);
  const id = '12345678-1234-1234-1234-123456789012';
  const secretArn = `arn:aws:secretsmanager:${c.region}:${c.accountId}:secret:byus/${c.environment}/webhook-replay-credentials-ABC123`, secretVersion = id;
  const r = {
    stackId: `arn:aws:cloudformation:${c.region}:${c.accountId}:stack/webhook-dev/${id}`,
    queueArn: `arn:aws:sqs:${c.region}:${c.accountId}:byus-webhook-buffer-dev.fifo`,
    queueUrl: `https://sqs.${c.region}.amazonaws.com/${c.accountId}/byus-webhook-buffer-dev.fifo`,
    dlqArn: `arn:aws:sqs:${c.region}:${c.accountId}:byus-webhook-buffer-dev-dlq.fifo`,
    dlqUrl: `https://sqs.${c.region}.amazonaws.com/${c.accountId}/byus-webhook-buffer-dev-dlq.fifo`,
    bucket: `byus-webhooks-dev-${c.accountId}`, kmsKeyArn: `arn:aws:kms:${c.region}:${c.accountId}:key/${id}`,
    replayFunctionArn: `arn:aws:lambda:${c.region}:${c.accountId}:function:byus-webhook-replay-dev`, replayMappingId: id,
  };
  async function file(path, value) {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === 'string' ? value : JSON.stringify(value));
    await writeFile(join(directory, path), bytes);
    return { path, sha256: hash(bytes) };
  }
  const receipt = (path, response, extra = {}) => file(path, { observedAt, response, ...extra });
  const definition = Buffer.from('begin return; end;');
  const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00, 0x80]);
  const artifact = await file('tests.log', 'passed');
  const env = { APP_ENV: c.environment, WEBHOOK_BUFFER_QUEUE_URL: r.queueUrl, WEBHOOK_BUFFER_BUCKET: r.bucket, WEBHOOK_BUFFER_KMS_KEY_ID: r.kmsKeyArn };
  const proofs = {
    runtimeConfig: await file('runtime.json', { runtimeEnvironment: env, parameters: { WebhookBufferStackName: 'webhook-dev' } }),
    cloudformation: await file('stack.json', { Stacks: [{ StackId: r.stackId, StackStatus: 'CREATE_COMPLETE', Outputs: Object.entries({ QueueUrl: r.queueUrl, QueueArn: r.queueArn, BucketName: r.bucket, KmsKeyArn: r.kmsKeyArn, ReplayFunctionName: 'byus-webhook-replay-dev', ReplayMappingId: id, DeadLetterQueueUrl: r.dlqUrl }).map(([OutputKey, OutputValue]) => ({ OutputKey, OutputValue })) }] }),
    replayBundle: await file('bundle.json', { codeSha256: hash(zip, 'sha256', 'base64'), zip: await file('replay.zip', zip) }),
    targetRpc: await file('rpc.json', { targetIdentityHash, fingerprint: 'audited-rpc', secretArn, secretVersion, database: { host: c.target.host, port: 5432, database: c.target.identity.database, username: 'byus_webhook_replay' }, evidence: [artifact] }),
    sourceAbort: await file('abort.json', { sourceIdentityHash, owner: 'postgres', securityDefiner: false, searchPath: '', privateACL: 0, functionMD5: hash(definition, 'md5'), functionDefinition: await file('definition.sql', definition), source: await file('source.sql', '-- source'), runner: await file('runner.mjs', '// runner'), testArtifact: artifact, checks: { aborted: true, preparedCancelComplete: true, targetLockHeldThroughSourceCommit: true, receiptBeforeAck: true } }),
    preservedRecovery: await file('recovery.json', { checks: { expiredQueueRecovery: true, exactS3Version: true, validatedPointer: true, inboxDedup: true }, evidence: [artifact] }),
  };
  const b = { schemaVersion: 2, ...Object.fromEntries(['runId', 'environment', 'accountId', 'region'].map((k) => [k, c[k]])), sourceIdentityHash, targetIdentityHash, runtimeRevision: revision, resources: r, proofs };
  const bindings = await file('bindings.json', b);
  const digest = hash(JSON.stringify({ environment: c.environment, queueUrl: r.queueUrl, bucket: r.bucket, kmsKeyArn: r.kmsKeyArn }));
  const td = `arn:aws:ecs:${c.region}:${c.accountId}:task-definition/byus:1`, taskArn = `arn:aws:ecs:${c.region}:${c.accountId}:task/cluster/${id}`;
  const ownership = { manifestVersion: 1, revision, webhookIntake: { mode: 'buffer', accepting: true, configDigest: digest } };
  const producers = [
    { provider: 'vercel', deploymentId: 'dpl_123', immutableOrigin: 'https://byus-123.vercel.app', revision, mode: 'buffer', accepting: true, configDigest: digest, metadata: await receipt('vercel.json', { id: 'dpl_123', url: 'byus-123.vercel.app', readyState: 'READY', projectId: 'prj_kGkUOgGXU01nXsRhpwZ0n9jTuavv', ownerId: 'team_VnIRt1lESthQEUcpyXms4nOe', gitSource: { sha: revision } }), ownership: await receipt('vercel-ownership.json', { ...ownership, provider: 'vercel' }, { status: 200, request: { origin: 'https://byus-123.vercel.app', authenticated: true } }) },
    { provider: 'aws', taskDefinitionArn: td, taskArns: [taskArn], immutableOrigin: 'https://aws.example.com', revision, mode: 'buffer', accepting: true, configDigest: digest, metadata: await receipt('ecs.json', { taskDefinition: { taskDefinitionArn: td, containerDefinitions: [{ environment: Object.entries({ ...env, WEBHOOK_BUFFER_ENABLED: 'true' }).map(([name, value]) => ({ name, value })) }] }, tasks: [{ taskArn, taskDefinitionArn: td, lastStatus: 'RUNNING' }] }), ownership: await receipt('aws-ownership.json', { ...ownership, provider: 'aws' }, { status: 200, request: { origin: 'https://aws.example.com', authenticated: true } }) },
  ];
  const mapping = { LastModified: (now - 33000) / 1000, UUID: id, EventSourceArn: r.queueArn, FunctionArn: r.replayFunctionArn, State: 'Disabled' };
  const queue = (arn) => ({ arn, visible: 1, invisible: 2, delayed: 3, retentionSeconds: 1209600, ...(arn === r.queueArn ? { visibilitySeconds: 180 } : {}) });
  const attributes = (QueueArn) => ({ Attributes: { QueueArn, FifoQueue: 'true', KmsMasterKeyId: r.kmsKeyArn, ...(QueueArn === r.queueArn ? { RedrivePolicy: JSON.stringify({ deadLetterTargetArn: r.dlqArn, maxReceiveCount: '5' }) } : { RedriveAllowPolicy: JSON.stringify({ redrivePermission: 'byQueue', sourceQueueArns: [r.queueArn] }) }), ApproximateNumberOfMessages: '1', ApproximateNumberOfMessagesNotVisible: '2', ApproximateNumberOfMessagesDelayed: '3', MessageRetentionPeriod: '1209600', VisibilityTimeout: '180' } });
  const o = { schemaVersion: 2, bindingsSha256: bindings.sha256, observedAt, producers, sourceReplay: { runId: c.runId, mode: 'hold', inflight: 0, publicFenced: true, authFenced: true, storageFenced: true }, targetReplay: { functionArn: r.replayFunctionArn, codeSha256: hash(zip, 'sha256', 'base64'), runtimeEnabled: false, inflight: 0, holdEffectiveAt: new Date(now - 32000).toISOString(), timeoutSeconds: 30, mappings: [{ uuid: id, eventSourceArn: r.queueArn, state: 'Disabled' }] }, queues: { main: queue(r.queueArn), dlq: queue(r.dlqArn) }, storage: { bucket: r.bucket, versioning: 'Enabled', kmsKeyArn: r.kmsKeyArn, kmsState: 'Enabled', applicableExpirationRules: [] }, api: {
    lambda: await receipt('lambda.json', { LastModified: new Date(now - 33000).toISOString(), FunctionArn: r.replayFunctionArn, CodeSha256: hash(zip, 'sha256', 'base64'), Timeout: 30, State: 'Active', LastUpdateStatus: 'Successful', Environment: { Variables: { ...env, WEBHOOK_DB_SECRET_ARN: secretArn, WEBHOOK_REPLAY_ENABLED: 'false' } } }),
    mappings: await receipt('mappings.json', { EventSourceMappings: [mapping] }),
    mainQueue: await receipt('main.json', attributes(r.queueArn)), dlqQueue: await receipt('dlq.json', attributes(r.dlqArn)),
    bucketVersioning: await receipt('versioning.json', { Status: 'Enabled' }, { bucket: r.bucket }),
    bucketLifecycle: await receipt('lifecycle.json', { Rules: [] }, { bucket: r.bucket }),
    bucketEncryption: await receipt('encryption.json', { ServerSideEncryptionConfiguration: { Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: 'aws:kms', KMSMasterKeyID: r.kmsKeyArn } }] } }, { bucket: r.bucket }),
    replaySecret: await receipt('secret.json', { ARN: secretArn, VersionIdsToStages: { [secretVersion]: ['AWSCURRENT'] } }),
    kms: await receipt('kms.json', { KeyMetadata: { Arn: r.kmsKeyArn, KeyState: 'Enabled', Enabled: true } }),
  } };
  const observations = await file('observations.json', o);
  const e = { webhookGate: { schemaVersion: 2, durable: true, accepting: true, revision, backlogCount: 12, bindings, observations }, files: [bindings, observations], writerDeployments: [{ name: 'web', revision, targetIdentityHash, ready: true }] };
  const args = { c, e, evidencePath: join(directory, 'evidence.json'), state: {}, sourceIdentityHash, targetIdentityHash, targetRpcFingerprint: 'audited-rpc', now };
  async function update(kind, mutate) {
    const path = kind === 'binding' ? 'bindings.json' : 'observations.json';
    const value = kind === 'binding' ? b : o;
    await mutate(value);
    const next = await file(path, value);
    if (kind === 'binding') { Object.assign(bindings, next); o.bindingsSha256 = next.sha256; Object.assign(observations, await file('observations.json', o)); }
    else Object.assign(observations, next);
  }
  async function child(r, mutate) { const value = JSON.parse(await readFile(join(directory, r.path), 'utf8')); await mutate(value); Object.assign(r, await file(r.path, value)); }
  return { args, b, o, r, update, child, file, directory };
}

test('accepts positive backlog and raw binary ZIP digest', async (t) => { const f = await fixture(t); assert.equal(await validateHeldWebhookEvidence(f.args), f.args.e.webhookGate.bindings.sha256); });
test('migration enable admits v2 binding and rejects downgrade after the binding is pinned', async t => {
  const f = await fixture(t), { c, e, evidencePath, now, sourceIdentityHash, targetIdentityHash, targetRpcFingerprint } = f.args;
  t.mock.method(Date, 'now', () => now);
  Object.assign(e, { runId:c.runId, operator:'synthetic', ddlFreeze:{active:true}, workersStopped:true, schedulesStopped:true, inflightWriters:0, observedAt:new Date(now-1000).toISOString(), writerDeployments:c.writers.map(name=>({name,revision:e.webhookGate.revision,ready:true,targetIdentityHash})) });
  const save=()=>writeFile(evidencePath,JSON.stringify(e));
  await save();
  const options={enable:true,sourceIdentityHash,targetIdentityHash,targetRpcFingerprint};
  const admitted=await evidence(c,evidencePath,options);assert.equal(admitted.webhookGateBindingsSha256,e.webhookGate.bindings.sha256);
  const state={webhookGateBindingsSha256:admitted.webhookGateBindingsSha256};
  assert.equal((await evidence(c,evidencePath,{...options,state})).webhookGateBindingsSha256,admitted.webhookGateBindingsSha256);
  e.webhookGate={schemaVersion:1,durable:true,accepting:true,backlogCount:0,revision:'a'.repeat(40)};await save();
  assert.equal((await evidence(c,evidencePath,options)).webhookGateBindingsSha256,undefined);
  await assert.rejects(evidence(c,evidencePath,{...options,state}),/cannot be downgraded/);
  e.webhookGate.schemaVersion=3;await save();await assert.rejects(evidence(c,evidencePath,options),/gate is required/);
});
for (const [name, mutate] of [
  ['wrong replay database host', (f) => f.update('binding', (b) => f.child(b.proofs.targetRpc, (v) => { v.database.host = 'foreign.rds.amazonaws.com'; }))],
  ['wrong replay database name', (f) => f.update('binding', (b) => f.child(b.proofs.targetRpc, (v) => { v.database.database = 'foreign'; }))],
  ['wrong replay database role', (f) => f.update('binding', (b) => f.child(b.proofs.targetRpc, (v) => { v.database.username = 'postgres'; }))],
  ['wrong replay database port', (f) => f.update('binding', (b) => f.child(b.proofs.targetRpc, (v) => { v.database.port = 6432; }))],
  ['wrong replay secret account', (f) => f.update('binding', (b) => f.child(b.proofs.targetRpc, (v) => { v.secretArn = v.secretArn.replace('123456789012', '000000000000'); }))],
  ['wrong actual secret ARN', (f) => f.update('observation', (o) => f.child(o.api.replaySecret, (v) => { v.response.ARN = 'foreign'; }))],
  ['rotated secret current version', (f) => f.update('observation', (o) => f.child(o.api.replaySecret, (v) => { v.response.VersionIdsToStages = { rotated: ['AWSCURRENT'] }; }))],
  ['ambiguous current secret versions', (f) => f.update('observation', (o) => f.child(o.api.replaySecret, (v) => { v.response.VersionIdsToStages.rotated = ['AWSCURRENT']; }))],
  ['wrong Lambda secret environment', (f) => f.update('observation', (o) => f.child(o.api.lambda, (v) => { v.response.Environment.Variables.WEBHOOK_DB_SECRET_ARN = 'foreign'; }))],
  ['missing replay connection evidence', (f) => f.update('binding', (b) => f.child(b.proofs.targetRpc, (v) => { v.evidence = []; }))],
  ['Lambda configuration changed after hold', (f) => f.update('observation', (o) => f.child(o.api.lambda, (v) => { v.response.LastModified = new Date(f.args.now - 10000).toISOString(); }))],
  ['mapping changed after hold', (f) => f.update('observation', (o) => f.child(o.api.mappings, (v) => { v.response.EventSourceMappings[0].LastModified = (f.args.now - 10000) / 1000; }))],
  ['Lambda resource mismatch', (f) => f.update('observation', (o) => f.child(o.api.lambda, (v) => { v.response.Environment.Variables.WEBHOOK_BUFFER_BUCKET = 'foreign'; }))],
  ['non-FIFO queue', (f) => f.update('observation', (o) => f.child(o.api.mainQueue, (v) => { v.response.Attributes.FifoQueue = 'false'; }))],
  ['foreign queue key', (f) => f.update('observation', (o) => f.child(o.api.dlqQueue, (v) => { v.response.Attributes.KmsMasterKeyId = 'foreign'; }))],
  ['foreign DLQ target', (f) => f.update('observation', (o) => f.child(o.api.mainQueue, (v) => { v.response.Attributes.RedrivePolicy = JSON.stringify({ deadLetterTargetArn: 'foreign', maxReceiveCount: 5 }); }))],
  ['wrong DLQ max receive count', (f) => f.update('observation', (o) => f.child(o.api.mainQueue, (v) => { v.response.Attributes.RedrivePolicy = JSON.stringify({ deadLetterTargetArn: f.r.dlqArn, maxReceiveCount: 6 }); }))],
  ['DLQ allows all source queues', (f) => f.update('observation', (o) => f.child(o.api.dlqQueue, (v) => { v.response.Attributes.RedriveAllowPolicy = JSON.stringify({ redrivePermission: 'allowAll' }); }))],
  ['wrong database identity', (f) => { f.args.targetIdentityHash = 'e'.repeat(64); }],
  ['wrong web writer revision', (f) => { f.args.e.writerDeployments[0].revision = 'd'.repeat(40); }],
  ['ownership HTTP failure', (f) => f.update('observation', (o) => f.child(o.producers[0].ownership, (v) => { v.status = 503; }))],
  ['ownership config mismatch', (f) => f.update('observation', (o) => f.child(o.producers[0].ownership, (v) => { v.response.webhookIntake.configDigest = '0'.repeat(64); }))],
  ['foreign Vercel project', (f) => f.update('observation', (o) => f.child(o.producers[0].metadata, (v) => { v.response.projectId = 'foreign'; }))],
  ['mapping pagination', (f) => f.update('observation', (o) => f.child(o.api.mappings, (v) => { v.response.NextMarker = 'more'; }))],
  ['mapping receipt before hold', (f) => f.update('observation', (o) => f.child(o.api.mappings, (v) => { v.observedAt = new Date(f.args.now - 40000).toISOString(); }))],
  ['abort acknowledgement mismatch', (f) => f.update('binding', (b) => f.child(b.proofs.sourceAbort, (v) => { v.checks.receiptBeforeAck = false; }))],
  ['no rebind', (f) => { f.args.state.webhookGateBindingsSha256 = '0'.repeat(64); }],
  ['bad gate hash', (f) => { f.args.e.webhookGate.observations.sha256 = '0'.repeat(64); }],
  ['stale observations', (f) => f.update('observation', (o) => { o.observedAt = '2026-10-23T00:00:00Z'; })],
  ['stale actual metadata', (f) => f.update('observation', (o) => f.child(o.api.kms, (v) => { v.observedAt = '2026-10-23T00:00:00Z'; }))],
  ['current expiration', (f) => f.update('observation', (o) => f.child(o.api.bucketLifecycle, (v) => { v.response.Rules = [{ Status: 'Enabled', Expiration: { Days: 1 } }]; }))],
  ['noncurrent expiration', (f) => f.update('observation', (o) => f.child(o.api.bucketLifecycle, (v) => { v.response.Rules = [{ Status: 'Enabled', NoncurrentVersionExpiration: { NoncurrentDays: 1 } }]; }))],
  ['enabled runtime', (f) => f.update('observation', (o) => f.child(o.api.lambda, (v) => { v.response.Environment.Variables.WEBHOOK_REPLAY_ENABLED = 'true'; }))],
  ['enabled mapping', (f) => f.update('observation', (o) => f.child(o.api.mappings, (v) => { v.response.EventSourceMappings[0].State = 'Enabled'; }))],
  ['first-write incompatible RPC', (f) => { f.args.targetRpcFingerprint = 'changed'; }],
  ['missing abort', (f) => f.update('binding', (b) => { delete b.proofs.sourceAbort; })],
  ['missing recovery', (f) => f.update('binding', (b) => { delete b.proofs.preservedRecovery; })],
  ['missing recovery behavior', (f) => f.update('binding', (b) => f.child(b.proofs.preservedRecovery, (v) => { v.checks.exactS3Version = false; }))],
  ['changed nested artifact', (f) => f.file('tests.log', 'changed')],
  ['invalid ZIP digest', (f) => f.update('binding', (b) => f.child(b.proofs.replayBundle, (v) => { v.codeSha256 = hash('not zip', 'sha256', 'base64'); }))],
  ['short hold', (f) => f.update('observation', (o) => { o.targetReplay.holdEffectiveAt = new Date(f.args.now - 5000).toISOString(); })],
  ['unknown lifecycle state', (f) => f.update('observation', (o) => f.child(o.api.bucketLifecycle, (v) => { v.response.Rules = [{ Status: 'Unknown' }]; }))],
  ['wrong producer revision', (f) => f.update('observation', (o) => { o.producers[0].revision = 'd'.repeat(40); })],
  ['synthetic metadata', (f) => f.update('observation', (o) => f.child(o.producers[0].metadata, (v) => { v.response = { synthetic: true }; }))],
  ['unsafe queue count', (f) => f.update('observation', (o) => { o.queues.main.visible = Number.MAX_SAFE_INTEGER + 1; })],
]) test(`rejects ${name}`, async (t) => { const f = await fixture(t); await mutate(f); await assert.rejects(validateHeldWebhookEvidence(f.args)); });

test('rejects cyclic explicit evidence even with a repeated binding path', async (t) => {
  const f = await fixture(t);
  await f.update('binding', (b) => { b.evidence = [{ path: 'bindings.json', sha256: '0'.repeat(64) }]; });
  await assert.rejects(validateHeldWebhookEvidence(f.args), /cyclic/);
});

test('allows multipart abort without expiring completed envelopes', async (t) => {
  const f = await fixture(t);
  await f.update('observation', (o) => f.child(o.api.bucketLifecycle, (v) => { v.response.Rules = [{ Status: 'Enabled', AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 } }]; }));
  assert.equal(await validateHeldWebhookEvidence(f.args), f.args.e.webhookGate.bindings.sha256);
});

test('resolves named proof and recursive child refs against their containing JSON', async (t) => {
  const f = await fixture(t);
  await mkdir(join(f.directory, 'nested'));
  await mkdir(join(f.directory, 'nested', 'children'));
  const leaf = await f.file('nested/children/leaf.log', 'passed');
  const child = await f.file('nested/children/recovery.json', { checks: { expiredQueueRecovery: true, exactS3Version: true, validatedPointer: true, inboxDedup: true }, evidence: [{ ...leaf, path: 'leaf.log' }] });
  await f.update('binding', (b) => { b.proofs.preservedRecovery = child; });
  assert.equal(await validateHeldWebhookEvidence(f.args), f.args.e.webhookGate.bindings.sha256);
  await f.file('nested/children/leaf.log', 'changed');
  await assert.rejects(validateHeldWebhookEvidence(f.args), /checksum/);
});
