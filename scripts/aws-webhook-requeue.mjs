#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { loadConsumer, privateJson, validateConfig, assertProducerClosed, createAwsIO, openConnection, acquireTargetLease } from './aws-webhook-abort-replay.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..'), requireWeb = createRequire(join(ROOT, 'apps/web/package.json'));
const ACCOUNT = '996702758024', REGION = 'ap-northeast-2', LIMIT = 1600000;
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = code => { const error = Error(code); error.requeueCode = code; throw error; };
const keyPattern = environment => new RegExp(`^webhook-intake/${environment}/[a-f0-9-]{36}\\.json$`);
const plannedPattern = environment => new RegExp(`^webhook-intake/${environment}/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\\.json$`);
const order = (a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) || (a.versionId < b.versionId ? -1 : a.versionId > b.versionId ? 1 : 0);
const version = value => typeof value === 'string' && value.length > 0 && value.length <= 1024 && !/[\u0000-\u001f\u007f]/.test(value);
const ownKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
function binding(c) {
  return { schemaVersion: 1, purpose: 'webhook-abort-preserved-recovery', accountId: ACCOUNT, region: REGION, environment: c.migration.environment, runId: c.migration.runId, mode: c.mode, proofHash: c.proofHash,
    sourceIdentityHash: digest(JSON.stringify(c.migration.source.identity)), targetIdentityHash: digest(JSON.stringify(c.migration.target.identity)),
    bucket: c.source.WEBHOOK_BUFFER_BUCKET, kmsKeyArn: c.source.WEBHOOK_BUFFER_KMS_KEY_ID, queueArn: `arn:aws:sqs:${REGION}:${ACCOUNT}:byus-webhook-buffer-${c.migration.environment}.fifo`, prefix: `webhook-intake/${c.migration.environment}/` };
}
export async function inspectVersion(c, io, key, versionId) {
  const shared = await loadConsumer(), environment = c.migration.environment;
  shared.bufferConfig(c.source);
  if (!keyPattern(environment).test(key) || !version(versionId)) fail('VERSION_SCOPE_REJECTED');
  const object = await io.readObject(key, versionId);
  if (object.VersionId !== versionId || object.ServerSideEncryption !== 'aws:kms' || object.SSEKMSKeyId !== c.source.WEBHOOK_BUFFER_KMS_KEY_ID || !object.Body || !object.ContentLength || object.ContentLength > LIMIT) fail('VERSION_ENCRYPTION_REJECTED');
  const bytes = Buffer.from(await object.Body.transformToByteArray());
  if (bytes.length !== object.ContentLength || bytes.length > LIMIT) fail('VERSION_LENGTH_REJECTED');
  let raw; try { raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail('VERSION_ENCODING_REJECTED'); }
  const hash = digest(bytes); let details;
  await shared.processPointer(JSON.stringify({ version: 1, environment, key, hash }), {
    source: { ...c.source, WEBHOOK_REPLAY_ENABLED: 'true' }, read: async () => raw,
    async apply(envelope, eventKey) { details = { receivedAt: envelope.receivedAt, eventKeyHash: digest(`${envelope.provider}:${eventKey}`), commandHash: digest(JSON.stringify(envelope.commands)) }; },
  });
  if (!details) fail('VERSION_ENVELOPE_REJECTED');
  return { bytes, hash, ...details };
}
function conflicts(details, events) {
  const previous = events.get(details.eventKeyHash);
  if (previous && previous !== details.commandHash) fail('PRESERVED_EVENT_CONFLICT');
  events.set(details.eventKeyHash, details.commandHash);
}
export function validateManifest(c, manifest) {
  const expected = binding(c);
  if (!ownKeys(manifest, [...Object.keys(expected), 'createdAt', 'entries']) || Object.entries(expected).some(([key, value]) => manifest[key] !== value) || !Number.isFinite(Date.parse(manifest.createdAt)) || !Array.isArray(manifest.entries)) fail('MANIFEST_SCOPE_REJECTED');
  const sourceKeys = new Set(manifest.entries.map(entry => entry.key)), originals = new Set(), planned = new Set();
  for (const entry of manifest.entries) {
    if (!ownKeys(entry, ['key', 'versionId', 'hash', 'receivedAt', 'eventKeyHash', 'plannedKey']) || !keyPattern(expected.environment).test(entry.key) || !version(entry.versionId) || !/^[a-f0-9]{64}$/.test(entry.hash ?? '') || !/^[a-f0-9]{64}$/.test(entry.eventKeyHash ?? '') || !Number.isFinite(Date.parse(entry.receivedAt)) || !plannedPattern(expected.environment).test(entry.plannedKey) || sourceKeys.has(entry.plannedKey)) fail('MANIFEST_ENTRY_REJECTED');
    const original = JSON.stringify([entry.key, entry.versionId]);
    if (originals.has(original) || planned.has(entry.plannedKey)) fail('MANIFEST_DUPLICATE_REJECTED');
    originals.add(original); planned.add(entry.plannedKey);
  }
  for (let i = 1; i < manifest.entries.length; i++) if (order(manifest.entries[i - 1], manifest.entries[i]) >= 0) fail('MANIFEST_ORDER_REJECTED');
  return manifest;
}
export async function preview(c, io, uuid = randomUUID) {
  const entries = [], originals = new Set(), events = new Map(), markers = new Set(); let keyMarker, versionMarker;
  do {
    const page = await io.listVersions(keyMarker, versionMarker);
    for (const object of page.Versions ?? []) {
      const id = JSON.stringify([object.Key, object.VersionId]);
      if (originals.has(id)) continue;
      originals.add(id);
      const value = await inspectVersion(c, io, object.Key, object.VersionId); conflicts(value, events);
      entries.push({ key: object.Key, versionId: object.VersionId, hash: value.hash, receivedAt: value.receivedAt, eventKeyHash: value.eventKeyHash, plannedKey: `webhook-intake/${c.migration.environment}/${uuid()}.json` });
    }
    if (!page.IsTruncated) break;
    if (!page.NextKeyMarker || !page.NextVersionIdMarker || page.NextKeyMarker === keyMarker && page.NextVersionIdMarker === versionMarker) fail('VERSION_PAGINATION_REJECTED');
    const marker = JSON.stringify([page.NextKeyMarker, page.NextVersionIdMarker]);
    if (markers.has(marker)) fail('VERSION_PAGINATION_REJECTED');
    markers.add(marker); keyMarker = page.NextKeyMarker; versionMarker = page.NextVersionIdMarker;
  } while (true);
  entries.sort(order);
  return validateManifest(c, { ...binding(c), createdAt: new Date().toISOString(), entries });
}
export async function acquireSourceControl(sourceDb, c) {
  await sourceDb.query('begin isolation level read committed');
  try {
    const row = (await sourceDb.query('select mode,proof_hash from _byus_migration.webhook_replay_control where run_id=$1 for share', [c.migration.runId])).rows[0];
    if (!row || !['aborted', 'prepared-cancel-complete'].includes(row.mode) || row.mode !== c.mode || row.proof_hash !== c.proofHash) fail('SOURCE_CONTROL_REJECTED');
    return async () => { await sourceDb.query('rollback'); };
  } catch (error) { await sourceDb.query('rollback').catch(() => {}); throw error; }
}
export async function applyManifest(c, manifest, io, gates) {
  validateManifest(c, manifest);
  // shortcut: Keep full prevalidation for the current empty inventory; when validation/retry exceeds the 60-second closure window, fail closed and require separately reviewed bounded recovery.
  const events = new Map();
  for (const entry of manifest.entries) {
    const value = await inspectVersion(c, io, entry.key, entry.versionId); conflicts(value, events);
    if (value.hash !== entry.hash || value.receivedAt !== entry.receivedAt || value.eventKeyHash !== entry.eventKeyHash) fail('MANIFEST_VERSION_CHANGED');
  }
  let accepted = 0, copied = 0, reused = 0;
  for (const entry of manifest.entries) {
    await gates.assertOperational();
    const releaseTarget = await gates.acquireTargetLease(); let releaseSource;
    try {
      releaseSource = await gates.acquireSourceControl();
      const value = await inspectVersion(c, io, entry.key, entry.versionId);
      if (value.hash !== entry.hash || value.receivedAt !== entry.receivedAt || value.eventKeyHash !== entry.eventKeyHash) fail('MANIFEST_VERSION_CHANGED');
      try { const created = await io.putNew(entry.plannedKey, value.bytes); if (!version(created.VersionId) || created.ServerSideEncryption !== 'aws:kms' || created.SSEKMSKeyId !== c.source.WEBHOOK_BUFFER_KMS_KEY_ID) fail('RECOVERY_COPY_NOT_CONFIRMED'); copied++; }
      catch (error) {
        if (error?.$metadata?.httpStatusCode !== 412) throw error;
        const current = await io.readCurrent(entry.plannedKey);
        if (!version(current.VersionId)) fail('RECOVERY_KEY_CONFLICT');
        const existing = await inspectVersion(c, { readObject: async () => current }, entry.plannedKey, current.VersionId);
        if (existing.hash !== entry.hash || !existing.bytes.equals(value.bytes)) fail('RECOVERY_KEY_CONFLICT');
        reused++;
      }
      await gates.assertTargetAlive();
      const pointer = JSON.stringify({ version: 1, environment: c.migration.environment, key: entry.plannedKey, hash: entry.hash });
      const result = await io.send(pointer, digest(`webhook-recovery:${entry.plannedKey}:${entry.hash}`));
      if (!result.MessageId) fail('QUEUE_ACKNOWLEDGEMENT_MISSING');
      accepted++;
    } finally { try { await releaseSource?.(); } finally { await releaseTarget(); } }
  }
  return { accepted, copied, reused };
}
export async function createIO(c, clients) {
  const shared = await loadConsumer(), config = shared.bufferConfig(c.source);
  const { ListObjectVersionsCommand, GetObjectCommand, PutObjectCommand } = requireWeb('@aws-sdk/client-s3');
  const { SendMessageCommand } = requireWeb('@aws-sdk/client-sqs');
  return {
    listVersions: (KeyMarker, VersionIdMarker) => clients.s3.send(new ListObjectVersionsCommand({ Bucket: config.bucket, Prefix: `webhook-intake/${config.environment}/`, ExpectedBucketOwner: ACCOUNT, KeyMarker, VersionIdMarker })),
    readObject: (Key, VersionId) => clients.s3.send(new GetObjectCommand({ Bucket: config.bucket, Key, VersionId, ExpectedBucketOwner: ACCOUNT })),
    readCurrent: Key => clients.s3.send(new GetObjectCommand({ Bucket: config.bucket, Key, ExpectedBucketOwner: ACCOUNT })),
    putNew: (Key, Body) => clients.s3.send(new PutObjectCommand({ Bucket: config.bucket, Key, Body, ContentType: 'application/json', ServerSideEncryption: 'aws:kms', SSEKMSKeyId: config.kmsKeyId, ExpectedBucketOwner: ACCOUNT, IfNoneMatch: '*', ChecksumSHA256: createHash('sha256').update(Body).digest('base64') })),
    send: (MessageBody, MessageDeduplicationId) => clients.sqs.send(new SendMessageCommand({ QueueUrl: config.queueUrl, MessageBody, MessageGroupId: 'webhook-intake', MessageDeduplicationId })),
  };
}
export async function writeManifest(c, path, manifest) {
  validateManifest(c, manifest);
  const raw = JSON.stringify(manifest, null, 2) + '\n';
  if (Buffer.byteLength(raw) > 4 * 1024 * 1024) fail('MANIFEST_TOO_LARGE');
  await writeFile(path, raw, { mode: 0o600, flag: 'wx' });
  return { versions: manifest.entries.length, manifestHash: digest(raw) };
}
export function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!['--config', '--config-sha256', '--out', '--manifest', '--manifest-sha256', '--apply'].includes(key) || Object.hasOwn(flags, key)) fail('CLI_OPTION_REJECTED');
    if (key === '--apply') flags[key] = true;
    else { if (!argv[i + 1] || argv[i + 1].startsWith('--')) fail('CLI_VALUE_REQUIRED'); flags[key] = argv[++i]; }
  }
  if (!flags['--config']) fail('PRIVATE_ABORT_CONFIG_REQUIRED');
  for (const key of ['--config-sha256', '--manifest-sha256']) if (flags[key] && !/^[a-f0-9]{64}$/.test(flags[key])) fail('PINNED_SHA256_REQUIRED');
  if (flags['--apply']) { if (!flags['--config-sha256'] || !flags['--manifest'] || !flags['--manifest-sha256'] || flags['--out']) fail('REVIEWED_MANIFEST_REQUIRED'); }
  else if (!flags['--out'] || flags['--manifest'] || flags['--manifest-sha256']) fail('PREVIEW_OUTPUT_REQUIRED');
  return flags;
}
export async function main(argv = process.argv.slice(2)) {
  const flags = parseArgs(argv), c = await validateConfig(await privateJson(resolve(flags['--config']), flags['--config-sha256']));
  const { defaultProvider } = requireWeb('@aws-sdk/credential-provider-node'), { NodeHttpHandler } = requireWeb('@smithy/node-http-handler');
  const { S3Client } = requireWeb('@aws-sdk/client-s3'), { SQSClient } = requireWeb('@aws-sdk/client-sqs'), { LambdaClient } = requireWeb('@aws-sdk/client-lambda');
  const settings = { region: REGION, credentials: defaultProvider({ profile: c.migration.profile }), maxAttempts: 2, requestHandler: new NodeHttpHandler({ connectionTimeout: 3000, requestTimeout: 10000 }) };
  const clients = { s3: new S3Client(settings), sqs: new SQSClient(settings), lambda: new LambdaClient(settings) };
  let target, sourceDb;
  try {
    const io = await createIO(c, clients);
    if (!flags['--apply']) {
      return { applied: false, preview: true, ...await writeManifest(c, resolve(flags['--out']), await preview(c, io)) };
    }
    if (c.migration.localRehearsal) fail('USE_SYNTHETIC_TESTS_FOR_LOCAL_REHEARSAL');
    const manifest = validateManifest(c, await privateJson(resolve(flags['--manifest']), flags['--manifest-sha256']));
    const replay = await createAwsIO(c, clients), assertOperational = async () => { await assertProducerClosed(c); await replay.assertReplayDisabled(); };
    await assertOperational();
    target = await openConnection(c.migration, 'target'); sourceDb = await openConnection(c.migration, 'source');
    const result = await applyManifest(c, manifest, io, { assertOperational,
      acquireTargetLease: () => acquireTargetLease(target, c.migration, c.targetGuard, c.mode),
      acquireSourceControl: () => acquireSourceControl(sourceDb, c),
      assertTargetAlive: async () => { if (target.byusConnectionLost || sourceDb.byusConnectionLost) fail('RECOVERY_LEASE_LOST'); await target.query('select 1'); await sourceDb.query('select 1'); },
    });
    return { applied: true, ...result, manifestHash: flags['--manifest-sha256'] };
  } finally {
    await sourceDb?.end().catch(() => {}); await target?.end().catch(() => {});
    for (const client of Object.values(clients)) client.destroy();
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().then(result => console.log(JSON.stringify(result))).catch(error => { const code = /^[A-Z][A-Z0-9_]{2,80}$/.test(error.requeueCode ?? '') ? error.requeueCode : 'RECOVERY_FAILED'; console.error(JSON.stringify({ failed: true, code })); process.exitCode = 1; });
