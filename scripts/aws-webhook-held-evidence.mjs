import { readFile, lstat, realpath } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';

const fail = (message) => { throw new Error(`Held webhook evidence: ${message}`); };
const check = (condition, message) => { if (!condition) fail(message); };
const sha = (bytes, encoding = 'hex') => createHash('sha256').update(bytes).digest(encoding);
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const count = (v) => Number.isSafeInteger(v) && v >= 0;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const resourceKeys = ['stackId', 'queueArn', 'queueUrl', 'dlqArn', 'dlqUrl', 'bucket', 'kmsKeyArn', 'replayFunctionArn', 'replayMappingId'];

// configDigest = SHA256(UTF8(JSON.stringify({environment,queueUrl,bucket,kmsKeyArn}))).
// References resolve relative to their containing JSON file; absolute paths are allowed. JSON
// receipts wrap unmodified API JSON as {observedAt,response}; only those receipts are fresh.
// Producer metadata uses the same wrapper: Vercel GET deployment response, or ECS
// {taskDefinition: DescribeTaskDefinition.taskDefinition,tasks: DescribeTasks.tasks}.
// Producer ownership is {observedAt,status:200,request:{origin,authenticated:true},
// response:<GET /api/ops/ownership JSON>}; no credentials are stored in the receipt.
// Vercel metadata is the raw /v13/deployments response (projectId/ownerId/gitSource.sha).
export async function validateHeldWebhookEvidence({ c, e, evidencePath, state = {}, sourceIdentityHash, targetIdentityHash, targetRpcFingerprint, now = Date.now() }) {
  check(Number.isFinite(now), 'invalid clock');
  const gate = e.webhookGate;
  check(gate?.schemaVersion === 2 && gate.durable === true && gate.accepting === true && /^[a-f0-9]{40}$/.test(gate.revision ?? '') && count(gate.backlogCount), 'invalid v2 gate');
  check(['web', 'cron', 'native-workers', 'legacy-auth', 'webhooks'].every((w) => c.writers?.includes(w)), 'writer inventory incomplete');
  const base = dirname(resolve(evidencePath));
  const loaded = new Map(), active = new Set();
  async function ref(r, json = true, parent = base) {
    check(object(r) && typeof r.path === 'string' && r.path.length > 0 && /^[a-f0-9]{64}$/.test(r.sha256 ?? ''), 'invalid file reference');
    const path = resolve(parent, r.path);
    check((await lstat(path)).isFile(), 'reference must be a regular file');
    const canonical = await realpath(path);
    check(!active.has(canonical), 'cyclic evidence reference');
    const prior = loaded.get(canonical);
    if (prior) {
      check(prior.sha256 === r.sha256, 'conflicting file hashes');
      if (!json) return prior.bytes;
      if ('json' in prior) return prior.json;
    }
    const bytes = prior?.bytes ?? await readFile(path);
    check(sha(bytes) === r.sha256, 'file checksum mismatch');
    if (!json) { loaded.set(canonical, { sha256: r.sha256, bytes }); return bytes; }
    let value;
    try { value = JSON.parse(bytes.toString('utf8')); } catch {
      if (json !== 'auto') fail('invalid JSON proof');
      loaded.set(canonical, { sha256: r.sha256, bytes });
      return bytes;
    }
    active.add(canonical);
    await evidenceRefs(value, dirname(path));
    active.delete(canonical);
    loaded.set(canonical, { sha256: r.sha256, bytes, json: value });
    return value;
  }
  async function evidenceRefs(value, parent) {
    if (Array.isArray(value)) { for (const item of value) await evidenceRefs(item, parent); }
    else if (object(value)) {
      for (const [key, child] of Object.entries(value)) {
        if (key === 'evidence') {
          check(Array.isArray(child), 'evidence must be an array');
          for (const item of child) {
            // Parse JSON evidence regardless of suffix; binary/log/SQL leaves use raw hashes.
            await ref(item, 'auto', parent);
          }
        } else await evidenceRefs(child, parent);
      }
    }
  }
  function fresh(at) {
    const t = typeof at === 'string' ? Date.parse(at) : NaN;
    check(Number.isFinite(t) && now - t >= -5000 && now - t <= 60000, 'stale or future observation');
    return t;
  }
  async function receipt(r) { const v = await ref(r, true, observationBase); fresh(v.observedAt); check(object(v.response), 'missing API response'); return v.response; }
  for (const r of [gate.bindings, gate.observations]) check(e.files?.some((f) => f.path === r?.path && f.sha256 === r?.sha256), 'gate reference absent from evidence files');
  check(!state.webhookGateBindingsSha256 || state.webhookGateBindingsSha256 === gate.bindings.sha256, 'binding cannot be replaced');
  const b = await ref(gate.bindings), o = await ref(gate.observations);
  const bindingBase = dirname(resolve(base, gate.bindings.path)), observationBase = dirname(resolve(base, gate.observations.path));
  check(b.schemaVersion === 2 && o.schemaVersion === 2 && o.bindingsSha256 === gate.bindings.sha256, 'binding schema/hash mismatch');
  for (const key of ['runId', 'environment', 'accountId', 'region']) check(typeof c[key] === 'string' && b[key] === c[key], `binding ${key} mismatch`);
  check(/^[a-f0-9]{64}$/.test(sourceIdentityHash ?? '') && /^[a-f0-9]{64}$/.test(targetIdentityHash ?? '') && sourceIdentityHash !== targetIdentityHash && b.sourceIdentityHash === sourceIdentityHash && b.targetIdentityHash === targetIdentityHash, 'database identity mismatch');
  check(b.runtimeRevision === gate.revision, 'runtime revision mismatch');
  const web = e.writerDeployments?.filter((w) => w.name === 'web');
  check(web?.length === 1 && web[0].revision === gate.revision && web[0].ready === true && web[0].targetIdentityHash === targetIdentityHash, 'web deployment mismatch');
  const r = b.resources;
  check(object(r) && resourceKeys.every((k) => typeof r[k] === 'string' && r[k]), 'incomplete resources');
  const prefix = `arn:aws:sqs:${c.region}:${c.accountId}:byus-webhook-buffer-${c.environment}`;
  check(r.queueArn === `${prefix}.fifo` && r.dlqArn === `${prefix}-dlq.fifo`, 'noncanonical queue');
  check(r.queueUrl === `https://sqs.${c.region}.amazonaws.com/${c.accountId}/byus-webhook-buffer-${c.environment}.fifo` && r.dlqUrl === `https://sqs.${c.region}.amazonaws.com/${c.accountId}/byus-webhook-buffer-${c.environment}-dlq.fifo`, 'queue URL mismatch');
  check(r.bucket === `byus-webhooks-${c.environment}-${c.accountId}` && r.replayFunctionArn === `arn:aws:lambda:${c.region}:${c.accountId}:function:byus-webhook-replay-${c.environment}`, 'noncanonical bucket/function');
  check(uuid.test(r.replayMappingId) && r.kmsKeyArn.startsWith(`arn:aws:kms:${c.region}:${c.accountId}:key/`) && uuid.test(r.kmsKeyArn.split('/').at(-1)), 'invalid KMS/mapping identity');
  const digest = sha(JSON.stringify({ environment: c.environment, queueUrl: r.queueUrl, bucket: r.bucket, kmsKeyArn: r.kmsKeyArn }));
  const p = b.proofs;
  check(object(p), 'missing immutable proofs');
  const runtime = await ref(p.runtimeConfig, true, bindingBase), cf = await ref(p.cloudformation, true, bindingBase);
  const env = runtime.runtimeEnvironment;
  check(env?.APP_ENV === c.environment && env.WEBHOOK_BUFFER_QUEUE_URL === r.queueUrl && env.WEBHOOK_BUFFER_BUCKET === r.bucket && env.WEBHOOK_BUFFER_KMS_KEY_ID === r.kmsKeyArn, 'runtime resources mismatch');
  const stacks = cf.Stacks;
  check(stacks?.length === 1 && stacks[0].StackId === r.stackId && ['CREATE_COMPLETE', 'UPDATE_COMPLETE', 'IMPORT_COMPLETE'].includes(stacks[0].StackStatus), 'stack is not complete');
  const stack = stacks[0];
  check(typeof runtime.parameters?.WebhookBufferStackName === 'string' && runtime.parameters.WebhookBufferStackName.length > 0 && r.stackId.startsWith(`arn:aws:cloudformation:${c.region}:${c.accountId}:stack/${runtime.parameters?.WebhookBufferStackName}/`) && uuid.test(r.stackId.split('/').at(-1)), 'stack identity mismatch');
  const outputs = Object.fromEntries((stack.Outputs ?? []).map((v) => [v.OutputKey, v.OutputValue]));
  for (const [key, value] of Object.entries({ QueueUrl: r.queueUrl, QueueArn: r.queueArn, BucketName: r.bucket, KmsKeyArn: r.kmsKeyArn, ReplayFunctionName: r.replayFunctionArn.split(':function:')[1], ReplayMappingId: r.replayMappingId, DeadLetterQueueUrl: r.dlqUrl })) check(outputs[key] === value, `stack output ${key} mismatch`);
  const bundle = await ref(p.replayBundle, true, bindingBase), zip = await ref(bundle.zip, false, dirname(resolve(bindingBase, p.replayBundle.path)));
  check(bundle.codeSha256 === sha(zip, 'base64'), 'replay ZIP digest mismatch');
  const rpc = await ref(p.targetRpc, true, bindingBase);
  check(typeof targetRpcFingerprint === 'string' && targetRpcFingerprint.length > 0 && rpc.targetIdentityHash === targetIdentityHash && rpc.fingerprint === targetRpcFingerprint, 'target RPC fingerprint mismatch');
  const secretPrefix = `arn:aws:secretsmanager:${c.region}:${c.accountId}:secret:byus/${c.environment}/webhook-replay-`;
  check(typeof rpc.secretArn === 'string' && rpc.secretArn.startsWith(secretPrefix) && /^[A-Za-z0-9][A-Za-z0-9_+=.@-]{0,200}-[A-Za-z0-9]{6}$/.test(rpc.secretArn.slice(secretPrefix.length)) && typeof rpc.secretVersion === 'string' && rpc.secretVersion.length > 0, 'replay secret identity missing');
  check(typeof c.target?.host === 'string' && c.target.host.length > 0 && typeof c.target.identity?.database === 'string' && c.target.identity.database.length > 0 && rpc.database?.host === c.target.host && rpc.database.port === 5432 && rpc.database.database === c.target.identity.database && rpc.database.username === 'byus_webhook_replay', 'replay database connection mismatch');
  check(Array.isArray(rpc.evidence) && rpc.evidence.length > 0, 'replay database connection evidence required');
  // sourceAbort contract: audited function fields plus exact source, runner and test artifacts.
  const abort = await ref(p.sourceAbort, true, bindingBase);
  check(abort.sourceIdentityHash === sourceIdentityHash && abort.owner === 'postgres' && abort.securityDefiner === false && abort.searchPath === '' && abort.privateACL === 0 && /^[a-f0-9]{32}$/.test(abort.functionMD5 ?? ''), 'source abort audit mismatch');
  const abortBase = dirname(resolve(bindingBase, p.sourceAbort.path));
  const definition = await ref(abort.functionDefinition, false, abortBase);
  check(createHash('md5').update(definition).digest('hex') === abort.functionMD5, 'abort definition mismatch');
  await ref(abort.source, false, abortBase); await ref(abort.runner, false, abortBase); await ref(abort.testArtifact, false, abortBase);
  for (const key of ['aborted', 'preparedCancelComplete', 'targetLockHeldThroughSourceCommit', 'receiptBeforeAck']) check(abort.checks?.[key] === true, `abort proof missing ${key}`);
  const recovery = await ref(p.preservedRecovery, true, bindingBase);
  for (const key of ['expiredQueueRecovery', 'exactS3Version', 'validatedPointer', 'inboxDedup']) check(recovery.checks?.[key] === true, `recovery proof missing ${key}`);
  check(recovery.evidence?.length > 0, 'recovery artifacts required');
  const observed = fresh(o.observedAt);
  check(Array.isArray(o.producers) && o.producers.length === 2 && new Set(o.producers.map((x) => x.provider)).size === 2, 'both producer platforms required');
  for (const producer of o.producers) {
    check(['vercel', 'aws'].includes(producer.provider) && producer.revision === gate.revision && producer.mode === 'buffer' && producer.accepting === true && producer.configDigest === digest, 'producer not accepting bound buffer');
    const metadata = await receipt(producer.metadata);
    const ownership = await ref(producer.ownership, true, observationBase);
    fresh(ownership.observedAt);
    check(ownership.status === 200 && ownership.request?.authenticated === true && ownership.request.origin === producer.immutableOrigin && /^https:\/\/[^/?#]+$/.test(producer.immutableOrigin ?? '') && ownership.response?.provider === producer.provider && ownership.response.revision === gate.revision && ownership.response.manifestVersion === 1 && ownership.response.webhookIntake?.mode === 'buffer' && ownership.response.webhookIntake.accepting === true && ownership.response.webhookIntake.configDigest === digest, 'authenticated ownership response mismatch');
    if (producer.provider === 'vercel') {
      check(typeof producer.deploymentId === 'string' && producer.deploymentId && metadata.id === producer.deploymentId && metadata.readyState === 'READY' && metadata.gitSource?.sha === gate.revision && metadata.projectId === 'prj_kGkUOgGXU01nXsRhpwZ0n9jTuavv' && metadata.ownerId === 'team_VnIRt1lESthQEUcpyXms4nOe' && producer.immutableOrigin === `https://${metadata.url}` && /^[a-z0-9-]+\.vercel\.app$/.test(metadata.url ?? ''), 'Vercel deployment not bound');
    } else {
      const td = metadata.taskDefinition;
      check(typeof producer.taskDefinitionArn === 'string' && producer.taskDefinitionArn.startsWith(`arn:aws:ecs:${c.region}:${c.accountId}:task-definition/`) && td?.taskDefinitionArn === producer.taskDefinitionArn && Array.isArray(producer.taskArns) && producer.taskArns.length > 0 && new Set(producer.taskArns).size === producer.taskArns.length && metadata.tasks?.length === producer.taskArns.length, 'ECS deployment not bound');
      check(new Set(metadata.tasks.map((t) => t.taskArn)).size === producer.taskArns.length && metadata.tasks.every((t) => producer.taskArns.includes(t.taskArn) && t.taskArn.startsWith(`arn:aws:ecs:${c.region}:${c.accountId}:task/`) && t.taskDefinitionArn === producer.taskDefinitionArn && t.lastStatus === 'RUNNING'), 'ECS tasks not running');
      const containers = td.containerDefinitions?.filter((container) => container.environment?.some((v) => v.name === 'WEBHOOK_BUFFER_QUEUE_URL'));
      check(containers?.length === 1, 'buffer container missing');
      const ce = Object.fromEntries(containers[0].environment.map((v) => [v.name, v.value]));
      check((ce.RELEASE_SHA === undefined || ce.RELEASE_SHA === gate.revision) && ce.APP_ENV === c.environment && ce.WEBHOOK_BUFFER_QUEUE_URL === r.queueUrl && ce.WEBHOOK_BUFFER_BUCKET === r.bucket && ce.WEBHOOK_BUFFER_KMS_KEY_ID === r.kmsKeyArn && ce.WEBHOOK_BUFFER_ENABLED === 'true', 'ECS runtime not bound');
    }
  }
  const source = o.sourceReplay, target = o.targetReplay;
  check(source?.runId === c.runId && source.mode === 'hold' && source.inflight === 0 && source.publicFenced === true && source.authFenced === true && source.storageFenced === true, 'source not fenced/held');
  check(target?.functionArn === r.replayFunctionArn && target.codeSha256 === bundle.codeSha256 && target.runtimeEnabled === false && target.inflight === 0 && Number.isSafeInteger(target.timeoutSeconds) && target.timeoutSeconds > 0 && target.timeoutSeconds <= 900, 'target replay not held');
  const held = Date.parse(target.holdEffectiveAt);
  check(Number.isFinite(held) && held <= observed && observed - held >= target.timeoutSeconds * 1000 && now - held >= target.timeoutSeconds * 1000, 'replay hold has not drained');
  const api = o.api;
  check(object(api), 'actual API receipts required');
  const lambda = await receipt(api.lambda), mappings = await receipt(api.mappings), secret = await receipt(api.replaySecret);
  check(secret.ARN === rpc.secretArn && object(secret.VersionIdsToStages) && Object.values(secret.VersionIdsToStages).every((stages) => Array.isArray(stages) && stages.every((stage) => typeof stage === 'string')), 'secret metadata mismatch');
  const currentVersions = Object.entries(secret.VersionIdsToStages).filter(([, stages]) => stages.includes('AWSCURRENT')).map(([version]) => version);
  check(currentVersions.length === 1 && currentVersions[0] === rpc.secretVersion && lambda.Environment?.Variables?.WEBHOOK_DB_SECRET_ARN === rpc.secretArn, 'replay secret version/runtime mismatch');
  for (const key of ['lambda', 'mappings']) check(Date.parse((await ref(api[key], true, observationBase)).observedAt) >= held, 'replay API receipt predates hold');
  check(!mappings.NextMarker, 'mapping pagination must be exhausted');
  const modifiedAt = (value) => typeof value === 'number' ? value * 1000 : typeof value === 'string' ? Date.parse(value) : NaN;
  check(Number.isFinite(modifiedAt(lambda.LastModified)) && held >= modifiedAt(lambda.LastModified), 'Lambda changed after hold');
  check(lambda.FunctionArn === r.replayFunctionArn && lambda.CodeSha256 === bundle.codeSha256 && lambda.Timeout === target.timeoutSeconds && lambda.State === 'Active' && lambda.LastUpdateStatus === 'Successful' && lambda.Environment?.Variables?.WEBHOOK_REPLAY_ENABLED === 'false' && lambda.Environment.Variables.APP_ENV === c.environment && lambda.Environment.Variables.WEBHOOK_BUFFER_QUEUE_URL === r.queueUrl && lambda.Environment.Variables.WEBHOOK_BUFFER_BUCKET === r.bucket && lambda.Environment.Variables.WEBHOOK_BUFFER_KMS_KEY_ID === r.kmsKeyArn, 'Lambda runtime receipt mismatch');
  check(Array.isArray(target.mappings) && target.mappings.length > 0 && Array.isArray(mappings.EventSourceMappings) && mappings.EventSourceMappings.length === target.mappings.length, 'mapping inventory missing');
  for (const m of mappings.EventSourceMappings) check(Number.isFinite(modifiedAt(m.LastModified)) && held >= modifiedAt(m.LastModified) && m.State === 'Disabled' && m.FunctionArn === r.replayFunctionArn && target.mappings.some((v) => v.uuid === m.UUID && v.eventSourceArn === m.EventSourceArn && v.state === 'Disabled'), 'replay mapping enabled or mismatched');
  check(mappings.EventSourceMappings.some((m) => m.UUID === r.replayMappingId && m.EventSourceArn === r.queueArn), 'bound mapping missing');
  let backlog = 0;
  for (const name of ['main', 'dlq']) {
    const q = o.queues?.[name], actual = await receipt(api[`${name}Queue`]);
    check(q?.arn === (name === 'main' ? r.queueArn : r.dlqArn) && q.retentionSeconds === 1209600 && (name !== 'main' || q.visibilitySeconds === 180), 'queue retention/identity mismatch');
    const a = actual.Attributes;
    check(a?.FifoQueue === 'true' && a.KmsMasterKeyId === r.kmsKeyArn && a.QueueArn === q.arn && a.MessageRetentionPeriod === '1209600' && (name !== 'main' || a.VisibilityTimeout === '180'), 'actual queue settings mismatch');
    let policy;
    try { policy = JSON.parse(name === 'main' ? a.RedrivePolicy : a.RedriveAllowPolicy); } catch { fail('invalid queue redrive policy'); }
    if (name === 'main') check(policy.deadLetterTargetArn === r.dlqArn && [5, '5'].includes(policy.maxReceiveCount), 'main queue DLQ mismatch');
    else check(policy.redrivePermission === 'byQueue' && Array.isArray(policy.sourceQueueArns) && policy.sourceQueueArns.length === 1 && policy.sourceQueueArns[0] === r.queueArn, 'DLQ redrive allow mismatch');
    for (const [key, attribute] of [['visible', 'ApproximateNumberOfMessages'], ['invisible', 'ApproximateNumberOfMessagesNotVisible'], ['delayed', 'ApproximateNumberOfMessagesDelayed']]) { check(count(q[key]) && String(q[key]) === a[attribute], 'queue count mismatch'); backlog += q[key]; }
  }
  check(Number.isSafeInteger(backlog) && backlog === gate.backlogCount, 'backlog total mismatch');
  const storage = o.storage;
  check(storage?.bucket === r.bucket && storage.versioning === 'Enabled' && storage.kmsKeyArn === r.kmsKeyArn && storage.kmsState === 'Enabled' && Array.isArray(storage.applicableExpirationRules) && storage.applicableExpirationRules.length === 0, 'storage custody mismatch');
  const versioning = await receipt(api.bucketVersioning), lifecycle = await receipt(api.bucketLifecycle), encryption = await receipt(api.bucketEncryption), kms = await receipt(api.kms);
  // The bucket field binds APIs whose raw responses omit their requested resource.
  // Conservatively reject every enabled expiration rule, even for unrelated prefixes.
  for (const key of ['bucketVersioning', 'bucketLifecycle', 'bucketEncryption']) check((await ref(api[key], true, observationBase)).bucket === r.bucket, 'bucket receipt identity mismatch');
  check(versioning.Status === 'Enabled' && Array.isArray(lifecycle.Rules) && lifecycle.Rules.every((rule) => rule.Status === 'Disabled' || (rule.Status === 'Enabled' && !rule.Expiration && !rule.NoncurrentVersionExpiration)), 'current/noncurrent expiration forbidden');
  check(encryption.ServerSideEncryptionConfiguration?.Rules?.some((rule) => rule.ApplyServerSideEncryptionByDefault?.SSEAlgorithm === 'aws:kms' && rule.ApplyServerSideEncryptionByDefault.KMSMasterKeyID === r.kmsKeyArn), 'bucket encryption mismatch');
  check(kms.KeyMetadata?.Arn === r.kmsKeyArn && kms.KeyMetadata.KeyState === 'Enabled' && kms.KeyMetadata.Enabled === true, 'KMS not enabled');
  return gate.bindings.sha256;
}
