#!/usr/bin/env node
import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Database, validateConfig as validateDatabaseConfig, verifyIdentity } from './aws-db-migrate.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requireWeb = createRequire(join(ROOT, 'apps/web/package.json'));
const ACCOUNT = '996702758024', REGION = 'ap-northeast-2';
const VERCEL_TEAM = 'team_VnIRt1lESthQEUcpyXms4nOe', VERCEL_PROJECT = 'prj_kGkUOgGXU01nXsRhpwZ0n9jTuavv';
const digest = value => createHash('sha256').update(value).digest('hex');
const fail = code => { const error = Error(code); error.abortReplayCode = code; throw error; };
const IDENTITY = "select current_database() as database,(select oid::text from pg_database where datname=current_database()) as \"databaseOid\",session_user as \"sessionUser\",host(inet_server_addr()) as \"serverAddress\",inet_server_port() as \"serverPort\",current_setting('server_version_num')::int as version,pg_is_in_recovery() as \"inRecovery\"";
let consumer;
export async function loadConsumer() {
  if (!consumer) consumer = (async () => {
    const { build } = createRequire(join(ROOT, 'apps/worker/package.json'))('esbuild');
    const output = await build({ stdin: { contents: `export { processPointer,eventKey } from ${JSON.stringify(join(ROOT, 'apps/web/server/webhook-intake/consumer.ts'))}; export { bufferConfig } from ${JSON.stringify(join(ROOT, 'apps/web/server/webhook-intake/core.ts'))};`, resolveDir: ROOT }, bundle: true, write: false, platform: 'node', target: 'node24', format: 'esm', logLevel: 'silent', plugins: [{ name: 'server-only-marker', setup(plugin) { plugin.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'marker' })); plugin.onLoad({ filter: /.*/, namespace: 'marker' }, () => ({ contents: '' })); } }] });
    return import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);
  })();
  return consumer;
}
export async function privateJson(path, expectedHash) {
  const info = await stat(path);
  if (!info.isFile() || (info.mode & 0o077) !== 0 || info.size > 4 * 1024 * 1024) fail('PRIVATE_ARTIFACT_REQUIRED');
  const raw = await readFile(path, 'utf8');
  if (expectedHash && digest(raw) !== expectedHash) fail('ARTIFACT_HASH_MISMATCH');
  return JSON.parse(raw);
}
export async function openConnection(c, side) {
  // Reuse the migrator's exact URL, DNS, TLS endpoint and SSM evidence checks.
  const approved = await Database.open(c, side);
  const { Client } = requireWeb('pg');
  const tunnel = c.engine === 'dms' && side === 'target' ? c.target.sqlTunnel : null;
  let client;
  try {
    client = new Client({ ...approved.value, host: tunnel?.hostaddr ?? approved.address, port: tunnel?.port ?? approved.value.port,
      ssl: c.localRehearsal ? false : { rejectUnauthorized: true, servername: approved.value.host, ca: await readFile(c[side].sslRootCert, 'utf8') },
      connectionTimeoutMillis: 10000, statement_timeout: 20000, lock_timeout: 5000, keepAlive: true,
      application_name: `byus-webhook-abort/${c.runId}` });
    client.byusConnectionLost = false;
    client.on('error', () => { client.byusConnectionLost = true; });
    await client.connect();
    verifyIdentity(c[side].identity, (await client.query(IDENTITY)).rows[0]);
    await client.query("set row_security=off; set session characteristics as transaction isolation level read committed");
    return client;
  } catch { await client?.end().catch(() => {}); fail('DATABASE_IDENTITY_OR_CONNECTION_REJECTED'); }
  finally { await approved.close(); }
}
export async function acquireTargetLease(target, c, expected, mode) {
  if (!['aborted', 'prepared-cancel-complete'].includes(mode)) fail('EXPLICIT_ABORT_PROOF_REQUIRED');
  await target.query('begin isolation level read committed');
  try {
    const row = (await target.query('select side,fenced,first_write_at,enabled_at from _byus_migration.state where run_id=$1 for share', [c.runId])).rows[0];
    if (!row || row.side !== 'target' || row.fenced !== true || row.first_write_at !== null || (mode === 'prepared-cancel-complete' && row.enabled_at !== null)) fail('TARGET_NOT_SEALED_BEFORE_FIRST_WRITE');
    const proof = (await target.query(`select md5(pg_get_functiondef('_byus_migration.guard()'::regprocedure)) as hash,
      bool_and(tr.tgfoid='_byus_migration.guard()'::regprocedure and tr.tgtype=62 and tr.tgqual is null and tr.tgnargs=0) as valid,
      coalesce(array_agg(n.nspname||'.'||cl.relname order by n.nspname,cl.relname) filter(where tr.oid is not null),'{}') as tables
      from pg_trigger tr join pg_class cl on cl.oid=tr.tgrelid join pg_namespace n on n.oid=cl.relnamespace
      where tr.tgname='byus_migration_guard' and tr.tgenabled='A' and n.nspname=any($1::text[])`, [c.schemas])).rows[0];
    if (proof.valid !== true || proof.hash !== expected.functionHash || JSON.stringify(proof.tables) !== JSON.stringify(expected.tables)) fail('TARGET_GUARD_PROOF_CHANGED');
    return async () => { await target.query('rollback'); };
  } catch (error) { await target.query('rollback').catch(() => {}); throw error; }
}
export async function replayRecord(record, deps) {
  if (record.eventSourceARN !== deps.queueArn || !record.receiptHandle) fail('QUEUE_RECORD_REJECTED');
  await deps.assertOperational();
  const release = await deps.acquireTargetLease();
  let committed = false;
  try {
    await deps.processPointer(record.body, {
      // Local validation adapter only; the deployed replay Lambda must remain false.
      source: { ...deps.source, WEBHOOK_REPLAY_ENABLED: 'true' },
      read: deps.read,
      async apply(envelope, key) {
        let receiptHash;
        if (envelope.provider.startsWith('instagram-')) {
          receiptHash = envelope.commands[0].args.p_confirmation_hash;
          if (typeof receiptHash !== 'string' || !/^[a-f0-9]{64}$/.test(receiptHash)) fail('RECEIPT_HASH_REJECTED');
        }
        await deps.sourceDb.query('begin isolation level read committed');
        try {
          await deps.assertSourceWrapper();
          await deps.sourceDb.query('select _byus_migration.replay_aborted_webhook($1,$2,$3,$4,$5::jsonb)', [deps.runId, envelope.provider, key, envelope.bodyHash, JSON.stringify(envelope.commands)]);
          const pinned = (await deps.sourceDb.query('select mode,proof_hash from _byus_migration.webhook_replay_control where run_id=$1', [deps.runId])).rows[0];
          if (!pinned || pinned.mode !== deps.mode || pinned.proof_hash !== deps.proofHash) fail('SOURCE_AUTHORIZATION_CHANGED');
          await deps.assertTargetAlive();
          await deps.sourceDb.query('commit'); committed = true;
        } catch (error) { await deps.sourceDb.query('rollback').catch(() => {}); throw error; }
        if (receiptHash) await deps.completeReceipt(receiptHash);
      },
    });
    if (!committed) fail('SOURCE_COMMIT_MISSING');
    await deps.assertTargetAlive();
    // ACK stays inside the target lease, after the durable source commit and receipt.
    await deps.ack(record.receiptHandle);
    return { committed: true, acknowledged: true };
  } finally { await release(); }
}
export async function assertSourceWrapper(sourceDb, expectedHash) {
  const row = (await sourceDb.query(`select md5(pg_get_functiondef(p.oid)) as hash,
    p.proowner='postgres'::regrole and not p.prosecdef and p.proconfig=array['search_path=""'] as valid
    from pg_proc p where p.oid='_byus_migration.replay_aborted_webhook(text,text,text,text,jsonb)'::regprocedure`)).rows[0];
  if (!row?.valid || row.hash !== expectedHash) fail('SOURCE_WRAPPER_CHANGED');
}
export async function validateConfig(c) {
  if (!c || !['aborted', 'prepared-cancel-complete'].includes(c.mode) || !/^[a-f0-9]{64}$/.test(c.proofHash ?? '') || !/^[a-f0-9]{32}$/.test(c.sourceWrapperHash ?? '')) fail('EXPLICIT_ABORT_PROOF_REQUIRED');
  if (!c.producerClosure?.path || !/^[a-f0-9]{64}$/.test(c.producerClosure.sha256 ?? '') || !/^[A-Z][A-Z0-9_]*$/.test(c.cronSecretEnv ?? '')) fail('PRODUCER_CLOSURE_REQUIRED');
  const migration = validateDatabaseConfig(c.migration);
  if (migration.accountId !== ACCOUNT || migration.source.migrationRole !== 'postgres') fail('APPROVED_SOURCE_OPERATOR_REQUIRED');
  if (!/^[a-f0-9]{32}$/.test(c.targetGuard?.functionHash ?? '') || !Array.isArray(c.targetGuard?.tables) || !c.targetGuard.tables.length || c.targetGuard.tables.some(name => typeof name !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) || JSON.stringify([...new Set(c.targetGuard.tables)].sort()) !== JSON.stringify(c.targetGuard.tables)) fail('TARGET_GUARD_PROOF_REQUIRED');
  if (c.replayFunctionArn !== `arn:aws:lambda:${REGION}:${ACCOUNT}:function:byus-webhook-replay-${migration.environment}`) fail('REPLAY_FUNCTION_IDENTITY_REQUIRED');
  const shared = await loadConsumer();
  shared.bufferConfig(c.source);
  if (c.source.APP_ENV !== migration.environment || c.source.WEBHOOK_REPLAY_ENABLED !== 'false') fail('DEPLOYED_REPLAY_MUST_REMAIN_DISABLED');
  return c;
}

// Producer-closure admission is deliberately supplied by the CLI's reviewed live
// check, never by an envelope or an environment boolean.
export async function createAwsIO(c, clients) {
  const shared = await loadConsumer(), config = shared.bufferConfig(c.source);
  const { GetObjectCommand, PutObjectCommand } = requireWeb('@aws-sdk/client-s3');
  const { GetQueueAttributesCommand, ReceiveMessageCommand, DeleteMessageCommand } = requireWeb('@aws-sdk/client-sqs');
  const { GetFunctionConfigurationCommand, ListEventSourceMappingsCommand } = requireWeb('@aws-sdk/client-lambda');
  const queueArn = `arn:aws:sqs:${REGION}:${ACCOUNT}:byus-webhook-buffer-${config.environment}.fifo`;
  return {
    queueArn,
    async assertReplayDisabled() {
      const fn = await clients.lambda.send(new GetFunctionConfigurationCommand({ FunctionName: c.replayFunctionArn }));
      if (fn.FunctionArn !== c.replayFunctionArn || fn.State !== 'Active' || fn.LastUpdateStatus !== 'Successful' || fn.Environment?.Variables?.WEBHOOK_REPLAY_ENABLED !== 'false' || ['APP_ENV','WEBHOOK_BUFFER_QUEUE_URL','WEBHOOK_BUFFER_BUCKET','WEBHOOK_BUFFER_KMS_KEY_ID'].some(key => fn.Environment?.Variables?.[key] !== c.source[key])) fail('LIVE_REPLAY_NOT_DISABLED');
      let marker;
      do {
        const mappings = await clients.lambda.send(new ListEventSourceMappingsCommand({ FunctionName: c.replayFunctionArn, Marker: marker }));
        for (const mapping of mappings.EventSourceMappings ?? []) if (mapping.State !== 'Disabled') fail('LIVE_REPLAY_MAPPING_NOT_DISABLED');
        marker = mappings.NextMarker;
      } while (marker);
      const queue = await clients.sqs.send(new GetQueueAttributesCommand({ QueueUrl: config.queueUrl, AttributeNames: ['QueueArn', 'KmsMasterKeyId', 'FifoQueue'] }));
      if (queue.Attributes?.QueueArn !== queueArn || queue.Attributes?.KmsMasterKeyId !== config.kmsKeyId || queue.Attributes?.FifoQueue !== 'true') fail('LIVE_QUEUE_IDENTITY_REJECTED');
    },
    async read(key) {
      const object = await clients.s3.send(new GetObjectCommand({ Bucket: config.bucket, Key: key, ExpectedBucketOwner: ACCOUNT }));
      if (!object.Body || !object.ContentLength || object.ContentLength > 1600000 || object.ServerSideEncryption !== 'aws:kms' || object.SSEKMSKeyId !== config.kmsKeyId) fail('ENCRYPTED_ENVELOPE_REJECTED');
      return object.Body.transformToString();
    },
    async completeReceipt(hash) {
      await clients.s3.send(new PutObjectCommand({ Bucket: config.bucket, Key: `webhook-receipts/${config.environment}/${hash}.json`, Body: JSON.stringify({ state: 'complete', expiresAt: Date.now() + 30 * 86400000 }), ContentType: 'application/json', ServerSideEncryption: 'aws:kms', SSEKMSKeyId: config.kmsKeyId, ExpectedBucketOwner: ACCOUNT }));
    },
    async receive() {
      const result = await clients.sqs.send(new ReceiveMessageCommand({ QueueUrl: config.queueUrl, MaxNumberOfMessages: 1, WaitTimeSeconds: 0, VisibilityTimeout: 120 }));
      return (result.Messages ?? []).map(message => ({ messageId: message.MessageId, eventSourceARN: queueArn, receiptHandle: message.ReceiptHandle, body: message.Body }));
    },
    async ack(receiptHandle) { await clients.sqs.send(new DeleteMessageCommand({ QueueUrl: config.queueUrl, ReceiptHandle: receiptHandle })); },
  };
}
export async function selfCheck() {
  const shared = await loadConsumer();
  const source = { APP_ENV: 'dev', WEBHOOK_REPLAY_ENABLED: 'true', WEBHOOK_BUFFER_QUEUE_URL: `https://sqs.${REGION}.amazonaws.com/${ACCOUNT}/byus-webhook-buffer-dev.fifo`, WEBHOOK_BUFFER_BUCKET: `byus-fixture-dev-${ACCOUNT}`, WEBHOOK_BUFFER_KMS_KEY_ID: `arn:aws:kms:${REGION}:${ACCOUNT}:key/00000000-0000-0000-0000-000000000001` };
  const body = '{}', raw = JSON.stringify({ version: 1, environment: 'dev', provider: 'telegram', receivedAt: new Date().toISOString(), body: Buffer.from(body).toString('base64'), bodyHash: digest(body), headers: {}, commands: [{ name: 'ingest_telegram_bug_report', args: { p_telegram_update_id: '1' } }] });
  const pointer = JSON.stringify({ version: 1, environment: 'dev', key: 'webhook-intake/dev/00000000-0000-0000-0000-000000000001.json', hash: digest(raw) });
  let checked = 0;
  await shared.processPointer(pointer, { source, read: async () => raw, apply: async (e, key) => { if (key !== shared.eventKey(e)) fail('SELF_CHECK_FAILED'); checked++; } });
  try { await shared.processPointer(pointer, { source: { ...source, WEBHOOK_REPLAY_ENABLED: 'false' }, read: async () => raw, apply: async () => { checked++; } }); fail('SELF_CHECK_FAILED'); } catch (error) { if (error.message !== 'Webhook replay paused') throw error; }
  if (checked !== 1) fail('SELF_CHECK_FAILED');
  return { selfCheck: true, pointerChecks: 2, networkRequests: 0, executed: false };
}
export function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!['--config', '--config-sha256', '--max-messages', '--apply', '--self-check'].includes(key) || Object.hasOwn(flags, key)) fail('INVALID_CLI_OPTION');
    if (['--apply', '--self-check'].includes(key)) flags[key] = true;
    else { if (!argv[i + 1] || argv[i + 1].startsWith('--')) fail('MISSING_CLI_VALUE'); flags[key] = argv[++i]; }
  }
  if (flags['--self-check']) { if (Object.keys(flags).length !== 1) fail('SELF_CHECK_IS_LOCAL_ONLY'); return flags; }
  if (!flags['--config'] || flags['--config-sha256'] && !/^[a-f0-9]{64}$/.test(flags['--config-sha256'])) fail('PRIVATE_CONFIG_REQUIRED');
  if (flags['--max-messages'] && (!/^\d+$/.test(flags['--max-messages']) || +flags['--max-messages'] < 1 || +flags['--max-messages'] > 1000)) fail('MESSAGE_BOUND_REQUIRED');
  if (flags['--apply'] && !flags['--config-sha256']) fail('REVIEWED_CONFIG_HASH_REQUIRED');
  return flags;
}
const exec = promisify(execFile);
export async function awsRead(c, args) {
  try {
    const result = await exec('aws', [...args, '--profile', c.migration.profile, '--region', REGION, '--output', 'json', '--no-cli-pager'], { encoding: 'utf8', timeout: 15000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, AWS_PAGER: '' } });
    return JSON.parse(result.stdout);
  } catch { fail('AWS_READ_PROOF_FAILED'); }
}
function origin(value) {
  let url; try { url = new URL(value); } catch { fail('PRODUCER_ORIGIN_REJECTED'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) fail('PRODUCER_ORIGIN_REJECTED');
  return url.origin;
}
export async function assertProducerClosed(c, { now = Date.now(), request = fetch, readAws = args => awsRead(c, args), env = process.env } = {}) {
  const ref = c.producerClosure;
  if (!ref?.path || !/^[a-f0-9]{64}$/.test(ref.sha256 ?? '') || !/^[A-Z][A-Z0-9_]*$/.test(c.cronSecretEnv ?? '')) fail('PRODUCER_CLOSURE_REQUIRED');
  const proof = await privateJson(ref.path, ref.sha256), m = c.migration;
  const shared = await loadConsumer(), config = shared.bufferConfig(c.source);
  const closed = Date.parse(proof.closedAt), observed = Date.parse(proof.observedAt), drained = Date.parse(proof.vercel?.drainedAt);
  if (proof.schemaVersion !== 1 || proof.runId !== m.runId || proof.environment !== m.environment || proof.sourceIdentityHash !== digest(JSON.stringify(m.source.identity)) || proof.targetIdentityHash !== digest(JSON.stringify(m.target.identity)) || proof.queueArn !== `arn:aws:sqs:${REGION}:${ACCOUNT}:byus-webhook-buffer-${m.environment}.fifo` || proof.bucket !== config.bucket || proof.kmsKeyArn !== config.kmsKeyId || !Number.isFinite(closed) || !Number.isFinite(observed) || !Number.isFinite(drained) || closed > drained || drained > observed || observed > now || now - observed > 60000) fail('PRODUCER_CLOSURE_STALE_OR_MISMATCHED');
  const v = proof.vercel, a = proof.aws;
  if (v.teamId !== VERCEL_TEAM || v.projectId !== VERCEL_PROJECT || !/^dpl_[A-Za-z0-9]+$/.test(v.deploymentId ?? '') || !/^[a-f0-9]{40}$/.test(v.revision ?? '') || !Array.isArray(v.retiredDeploymentIds) || v.retiredDeploymentIds.some(id => !/^dpl_[A-Za-z0-9]+$/.test(id) || id === v.deploymentId) || !Array.isArray(proof.evidence) || !proof.evidence.length) fail('PRODUCER_RETIREMENT_EVIDENCE_REQUIRED');
  if (!v.metadata?.path || !/^[a-f0-9]{64}$/.test(v.metadata.sha256 ?? '')) fail('PRODUCER_VERCEL_METADATA_REQUIRED');
  const metadata = await privateJson(resolve(dirname(ref.path), v.metadata.path), v.metadata.sha256);
  const metadataAt = Date.parse(metadata.observedAt), project = metadata.project, deployment = metadata.deployment, alias = metadata.alias;
  const immutableOrigin = origin(v.immutableOrigin), canonicalOrigin = origin(v.canonicalOrigin);
  if (metadata.schemaVersion !== 1 || !Number.isFinite(metadataAt) || metadataAt < drained || metadataAt > now || now - metadataAt > 60000 || project?.id !== VERCEL_PROJECT || project.accountId !== VERCEL_TEAM || deployment?.id !== v.deploymentId || deployment.projectId !== VERCEL_PROJECT || deployment.ownerId !== VERCEL_TEAM || deployment.gitSource?.sha !== v.revision || deployment.readyState !== 'READY' || immutableOrigin !== `https://${deployment.url}` || !deployment.url.endsWith('.vercel.app') || alias?.projectId !== VERCEL_PROJECT || alias.deploymentId !== v.deploymentId || alias.deployment?.id !== v.deploymentId || alias.deployment?.url !== deployment.url || canonicalOrigin !== `https://${alias.alias}`) fail('PRODUCER_VERCEL_IDENTITY_MISMATCH');
  // The deployed callback routes inherit this inspected project timeout; re-review overrides before changing it.
  if (project.defaultResourceConfig?.functionDefaultTimeout !== 300 || v.callbackMaxDurationSeconds !== 300 || drained - closed < 300000) fail('PRODUCER_CALLBACK_DRAIN_INCOMPLETE');
  if (!proof.inventory?.path || !/^[a-f0-9]{64}$/.test(proof.inventory.sha256 ?? '')) fail('PRODUCER_INVENTORY_REQUIRED');
  const inventory = await privateJson(resolve(dirname(ref.path), proof.inventory.path), proof.inventory.sha256);
  const equalSet = (left,right) => Array.isArray(left) && Array.isArray(right) && new Set(left).size === left.length && new Set(right).size === right.length && JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
  if (inventory.schemaVersion !== 1 || inventory.runId !== m.runId || inventory.environment !== m.environment || !Number.isFinite(Date.parse(inventory.observedAt)) || Date.parse(inventory.observedAt) > closed || inventory.vercel?.teamId !== v.teamId || inventory.vercel?.projectId !== v.projectId || !equalSet(inventory.vercel?.producingDeploymentIds,v.retiredDeploymentIds) || inventory.aws?.clusterArn !== a?.clusterArn || inventory.aws?.serviceArn !== a?.serviceArn || !equalSet(inventory.aws?.taskArns,a?.stoppedTaskArns) || !equalSet(inventory.aws?.taskDefinitionArns,a?.taskDefinitionArns)) fail('PRODUCER_INVENTORY_COVERAGE_MISMATCH');
  for (const item of proof.evidence) {
    if (!item.path || !/^[a-f0-9]{64}$/.test(item.sha256 ?? '')) fail('PRODUCER_EVIDENCE_HASH_REQUIRED');
    const path = resolve(dirname(ref.path), item.path), info = await stat(path);
    if (!info.isFile() || (info.mode & 0o077) !== 0 || info.size > 4 * 1024 * 1024 || digest(await readFile(path)) !== item.sha256) fail('PRODUCER_EVIDENCE_CHANGED');
  }
  const token = env[c.cronSecretEnv];
  if (!token || token.length < 32 || /[\r\n]/.test(token)) fail('PRIVATE_CRON_SECRET_REQUIRED');
  const headers = { authorization: `Bearer ${token}`, 'cache-control': 'no-store' };
  if (c.vercelBypassEnv) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(c.vercelBypassEnv) || !env[c.vercelBypassEnv] || /[\r\n]/.test(env[c.vercelBypassEnv])) fail('PRIVATE_VERCEL_BYPASS_REQUIRED');
    headers['x-vercel-protection-bypass'] = env[c.vercelBypassEnv];
  }
  for (const base of new Set([immutableOrigin, canonicalOrigin])) {
    const response = await request(`${base}/api/internal/cron/ownership`, { headers, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!response.ok) fail('PRODUCER_HOLD_NOT_PROVEN');
    const raw = await response.text(); if (Buffer.byteLength(raw) > 16384) fail('PRODUCER_RESPONSE_REJECTED');
    const state = JSON.parse(raw);
    if (state.provider !== 'vercel' || state.manifestVersion !== 1 || state.revision !== v.revision || state.webhookIntake?.mode !== 'hold' || state.webhookIntake?.accepting !== false) fail('PRODUCER_HOLD_NOT_PROVEN');
  }
  if (!a || !new RegExp(`^arn:aws:ecs:${REGION}:${ACCOUNT}:cluster/[A-Za-z0-9_-]+$`).test(a.clusterArn ?? '') || !new RegExp(`^arn:aws:ecs:${REGION}:${ACCOUNT}:service/[A-Za-z0-9_/-]+$`).test(a.serviceArn ?? '') || !Array.isArray(a.taskDefinitionArns) || !a.taskDefinitionArns.length || a.taskDefinitionArns.some(arn => !new RegExp(`^arn:aws:ecs:${REGION}:${ACCOUNT}:task-definition/[A-Za-z0-9_-]+:[0-9]+$`).test(arn)) || !Array.isArray(a.stoppedTaskArns) || a.stoppedTaskArns.some(arn => !new RegExp(`^arn:aws:ecs:${REGION}:${ACCOUNT}:task/[A-Za-z0-9_/-]+$`).test(arn))) fail('PRODUCER_AWS_IDENTITY_REQUIRED');
  const services = await readAws(['ecs', 'describe-services', '--cluster', a.clusterArn, '--services', a.serviceArn]);
  const service = services.services?.[0];
  if (services.failures?.length || services.services?.length !== 1 || service.serviceArn !== a.serviceArn || service.clusterArn !== a.clusterArn || service.desiredCount !== 0 || service.runningCount !== 0 || service.pendingCount !== 0 || !a.taskDefinitionArns.includes(service.taskDefinition)) fail('PRODUCER_AWS_STILL_RUNNING');
  for (let i = 0; i < a.stoppedTaskArns.length; i += 100) {
    const requested = a.stoppedTaskArns.slice(i, i + 100), tasks = await readAws(['ecs', 'describe-tasks', '--cluster', a.clusterArn, '--tasks', ...requested]);
    if (tasks.failures?.length || tasks.tasks?.length !== requested.length || tasks.tasks.some(task => !requested.includes(task.taskArn) || task.clusterArn !== a.clusterArn || task.lastStatus !== 'STOPPED' || !a.taskDefinitionArns.includes(task.taskDefinitionArn))) fail('PRODUCER_TASK_NOT_DRAINED');
  }
  const discovered = new Set();
  for (const desired of ['RUNNING','STOPPED']) {
    let token;
    do {
      const listed = await readAws(['ecs','list-tasks','--cluster',a.clusterArn,'--service-name',a.serviceArn.split('/').at(-1),'--desired-status',desired,'--no-paginate',...(token?['--next-token',token]:[])]);
      if (!Array.isArray(listed.taskArns)) fail('PRODUCER_TASK_INVENTORY_UNAVAILABLE');
      for (const arn of listed.taskArns) discovered.add(arn);
      token = listed.nextToken;
    } while (token);
  }
  const all = [...discovered];
  for (let i=0;i<all.length;i+=100) {
    const requested=all.slice(i,i+100),result=await readAws(['ecs','describe-tasks','--cluster',a.clusterArn,'--tasks',...requested]);
    if (result.failures?.length || result.tasks?.length!==requested.length || result.tasks.some(task=>!requested.includes(task.taskArn)||task.clusterArn!==a.clusterArn||task.lastStatus!=='STOPPED')) fail('PRODUCER_UNDRAINED_TASK_DISCOVERED');
  }
  return { producerClosed: true, proofHash: ref.sha256 };
}
export async function main(argv = process.argv.slice(2)) {
  const flags = parseArgs(argv);
  if (flags['--self-check']) return selfCheck();
  const path = resolve(flags['--config']);
  const c = await validateConfig(await privateJson(path, flags['--config-sha256']));
  if (!flags['--apply']) return { executed: false, localDryRun: true, configHash: digest(await readFile(path)), mode: c.mode, environment: c.migration.environment, maxMessages: +(flags['--max-messages'] ?? 1), producerClosureRequired: true, databaseConnections: 0, networkRequests: 0 };
  if (c.migration.localRehearsal) fail('USE_SYNTHETIC_TESTS_FOR_LOCAL_REHEARSAL');
  const { defaultProvider } = requireWeb('@aws-sdk/credential-provider-node');
  const { NodeHttpHandler } = requireWeb('@smithy/node-http-handler');
  const { S3Client } = requireWeb('@aws-sdk/client-s3'), { SQSClient } = requireWeb('@aws-sdk/client-sqs'), { LambdaClient } = requireWeb('@aws-sdk/client-lambda');
  const settings = { region: REGION, credentials: defaultProvider({ profile: c.migration.profile }), maxAttempts: 2, requestHandler: new NodeHttpHandler({ connectionTimeout: 3000, requestTimeout: 10000 }) };
  const clients = { s3: new S3Client(settings), sqs: new SQSClient(settings), lambda: new LambdaClient(settings) };
  let sourceDb, target;
  try {
    const io = await createAwsIO(c, clients);
    const assertOperational = async () => { await assertProducerClosed(c); await io.assertReplayDisabled(); };
    await assertOperational();
    sourceDb = await openConnection(c.migration, 'source'); target = await openConnection(c.migration, 'target');
    await assertSourceWrapper(sourceDb, c.sourceWrapperHash);
    const deps = { ...io, source: c.source, runId: c.migration.runId, mode: c.mode, proofHash: c.proofHash, sourceDb,
      processPointer: (await loadConsumer()).processPointer, assertOperational,
      assertSourceWrapper: () => assertSourceWrapper(sourceDb, c.sourceWrapperHash),
      acquireTargetLease: () => acquireTargetLease(target, c.migration, c.targetGuard, c.mode),
      assertTargetAlive: async () => { if (target.byusConnectionLost) fail('TARGET_LEASE_LOST'); await target.query('select 1'); },
    };
    let acknowledged = 0;
    for (let i = 0; i < +(flags['--max-messages'] ?? 1); i++) {
      const records = await io.receive(); if (!records.length) break;
      for (const record of records) { await replayRecord(record, deps); acknowledged++; }
    }
    return { executed: true, acknowledged, environment: c.migration.environment, mode: c.mode, proofHash: c.proofHash };
  } finally {
    await sourceDb?.end().catch(() => {}); await target?.end().catch(() => {});
    for (const client of Object.values(clients)) client.destroy();
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().then(result => console.log(JSON.stringify(result))).catch(error => { const code = /^[A-Z0-9]{5}$/.test(error.code ?? '') ? error.code : /^[A-Z][A-Z0-9_]{2,80}$/.test(error.abortReplayCode ?? '') ? error.abortReplayCode : 'REPLAY_FAILED'; console.error(JSON.stringify({ failed: true, code, furtherMessagesAcknowledged: false })); process.exitCode = 1; });
