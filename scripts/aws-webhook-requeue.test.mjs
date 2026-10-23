import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, writeFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { preview, validateManifest, inspectVersion, applyManifest, createIO, acquireSourceControl, parseArgs, digest, writeManifest } from './aws-webhook-requeue.mjs';
import { loadConsumer, privateJson } from './aws-webhook-abort-replay.mjs';
const shared = await loadConsumer();
const config = { mode: 'prepared-cancel-complete', proofHash: 'a'.repeat(64), migration: { environment: 'dev', runId: 'recovery_run', source: { identity: { database: 'source' } }, target: { identity: { database: 'target' } } },
  source: { APP_ENV: 'dev', WEBHOOK_REPLAY_ENABLED: 'false', WEBHOOK_BUFFER_QUEUE_URL: 'https://sqs.ap-northeast-2.amazonaws.com/996702758024/byus-webhook-buffer-dev.fifo', WEBHOOK_BUFFER_BUCKET: 'byus-fixture-dev-996702758024', WEBHOOK_BUFFER_KMS_KEY_ID: 'arn:aws:kms:ap-northeast-2:996702758024:key/00000000-0000-0000-0000-000000000001' } };
const key = index => `webhook-intake/dev/00000000-0000-4000-8000-${String(index).padStart(12, '0')}.json`;
const uuid = () => { let n = 100; return () => key(n++).split('/').at(-1).slice(0, -5); };
const envelope = (id = 'same-event', command = 'same-command', receivedAt = '2026-10-01T00:00:00.000Z') => Buffer.from(JSON.stringify({ version: 1, environment: 'dev', provider: 'instagram-deletion', receivedAt, body: Buffer.from(id).toString('base64'), bodyHash: digest(id), headers: {}, commands: [{ name: 'instagram_delete_subject', args: { p_scoped_id: command, p_confirmation_hash: 'c'.repeat(64) } }] }));
function object(bytes, versionId, overrides = {}) { return { Body: { transformToByteArray: async () => bytes }, VersionId: versionId, ContentLength: bytes.length, ServerSideEncryption: 'aws:kms', SSEKMSKeyId: config.source.WEBHOOK_BUFFER_KMS_KEY_ID, ...overrides }; }
function store(versions = [{ key: key(1), versionId: 'old-version', bytes: envelope() }]) {
  const versionsById = new Map(versions.map(v => [JSON.stringify([v.key, v.versionId]), v]));
  const destinations = new Map(), sent = [], calls = []; let failSend = false;
  return { destinations, sent, calls, setFailSend(value) { failSend = value; },
    async listVersions() { calls.push('list'); return { Versions: [...versions].reverse().map(v => ({ Key: v.key, VersionId: v.versionId })) }; },
    async readObject(k, id) { calls.push(`get-version:${id}`); const v = versionsById.get(JSON.stringify([k, id])) ?? destinations.get(k); assert(v, 'synthetic exact version exists'); return object(v.bytes, v.versionId, v.overrides); },
    async readCurrent(k) { calls.push('get-current'); const v = destinations.get(k); assert(v); return object(v.bytes, v.versionId, v.overrides); },
    async putNew(k, bytes) { calls.push('put-new'); if (destinations.has(k)) throw Object.assign(Error('exists'), { $metadata: { httpStatusCode: 412 } }); destinations.set(k, { bytes: Buffer.from(bytes), versionId: `recovery-${destinations.size}` }); return { VersionId: `recovery-${destinations.size - 1}`, ServerSideEncryption: 'aws:kms', SSEKMSKeyId: config.source.WEBHOOK_BUFFER_KMS_KEY_ID }; },
    async send(pointer, dedup) { calls.push('send'); if (failSend) throw Error('synthetic send failure'); sent.push({ pointer, dedup }); return { MessageId: `message-${sent.length}` }; },
  };
}
function gates(io) {
  const held = { target: false, source: false }, order = [];
  for (const method of ['putNew', 'send']) { const original = io[method].bind(io); io[method] = async (...args) => { assert(held.target && held.source); order.push(method); return original(...args); }; }
  return { held, order,
    async assertOperational() { order.push('admit'); },
    async acquireTargetLease() { held.target = true; order.push('target-lock'); return async () => { held.target = false; order.push('target-unlock'); }; },
    async acquireSourceControl() { assert(held.target); held.source = true; order.push('source-lock'); return async () => { held.source = false; order.push('source-unlock'); }; },
    async assertTargetAlive() { assert(held.target && held.source); },
  };
}

test('preview pins old noncurrent versions, sorts chronologically and contains metadata only', async () => {
  const io = store([{ key: key(1), versionId: 'v2-latest', bytes: envelope('new', 'new', '2026-10-02T00:00:00.000Z') }, { key: key(1), versionId: 'v1-old', bytes: envelope('old', 'old') }]);
  const manifest = await preview(config, io, uuid());
  assert.deepEqual(manifest.entries.map(e => e.versionId), ['v1-old', 'v2-latest']);
  assert(manifest.entries.every(e => Object.keys(e).sort().join() === ['key', 'versionId', 'hash', 'receivedAt', 'eventKeyHash', 'plannedKey'].sort().join()));
  assert(!JSON.stringify(manifest).includes('same-command')); assert(!JSON.stringify(manifest).includes('p_scoped_id'));
  assert.equal(io.calls.some(call => call === 'put-new' || call === 'send'), false);
  assert(manifest.entries.every(e => e.key !== e.plannedKey));
});

test('duplicate listing versions are collapsed; same event versions remain and conflicting commands fail before mutations', async () => {
  const v = { key: key(1), versionId: 'one', bytes: envelope() }, io = store([v, v, { ...v, versionId: 'two' }]);
  const manifest = await preview(config, io, uuid());
  assert.equal(manifest.entries.length, 2); assert.equal(manifest.entries[0].eventKeyHash, manifest.entries[1].eventKeyHash);
  const conflict = store([v, { ...v, versionId: 'different', bytes: envelope('same-event', 'conflict') }]);
  await assert.rejects(preview(config, conflict, uuid()), /PRESERVED_EVENT_CONFLICT/);
  assert.equal(conflict.calls.includes('put-new'), false);
});

test('manifest rejects wrong scope, reordering, duplicate originals/planned keys, source key reuse and raw fields', async () => {
  const manifest = await preview(config, store([{ key: key(1), versionId: 'a', bytes: envelope('one') }, { key: key(2), versionId: 'b', bytes: envelope('two') }]), uuid());
  const mutations = [m => { m.bucket = 'foreign'; }, m => { m.environment = 'prod'; }, m => { m.entries.reverse(); }, m => { m.entries[1] = { ...m.entries[0] }; }, m => { m.entries[1].plannedKey = m.entries[0].plannedKey; }, m => { m.entries[0].plannedKey = m.entries[0].key; }, m => { m.entries[0].body = 'private'; }, m => { m.entries[0].versionId = ''; }];
  for (const change of mutations) { const m = structuredClone(manifest); change(m); assert.throws(() => validateManifest(config, m)); }
});

test('exact VersionId, KMS, raw hash/envelope and content length tampering fail closed', async () => {
  const bytes = envelope();
  for (const overrides of [{ VersionId: 'wrong' }, { SSEKMSKeyId: 'wrong' }, { ServerSideEncryption: 'AES256' }, { ContentLength: bytes.length + 1 }]) await assert.rejects(inspectVersion(config, { readObject: async () => object(bytes, 'v1', overrides) }, key(1), 'v1'));
  await assert.rejects(inspectVersion(config, { readObject: async () => object(Buffer.from([0xff]), 'v1') }, key(1), 'v1'), /ENCODING/);
  await assert.rejects(inspectVersion(config, { readObject: async () => object(bytes, 'v1') }, key(1).replace('/dev/', '/prod/'), 'v1'), /SCOPE/);
  const io = store(), manifest = await preview(config, io, uuid()); manifest.entries[0].hash = '0'.repeat(64);
  await assert.rejects(applyManifest(config, manifest, io, gates(io)), /MANIFEST_VERSION_CHANGED/);
  assert.equal(io.destinations.size, 0); assert.equal(io.sent.length, 0);
});

test('copy then send failure safely retries the same new key/dedup ID; both leases cover copy and send', async () => {
  const io = store(), manifest = await preview(config, io, uuid()), admission = gates(io);
  io.setFailSend(true); await assert.rejects(applyManifest(config, manifest, io, admission), /send failure/);
  assert.equal(io.destinations.size, 1); assert.equal(io.sent.length, 0); assert.deepEqual(admission.held, { target: false, source: false });
  io.setFailSend(false); assert.deepEqual(await applyManifest(config, manifest, io, admission), { accepted: 1, copied: 0, reused: 1 });
  const first = io.sent[0]; await applyManifest(config, manifest, io, admission);
  assert.equal(io.destinations.size, 1); assert.equal(io.sent[1].dedup, first.dedup); assert.equal(io.sent[1].pointer, first.pointer);
  assert.deepEqual(admission.order.slice(-4), ['putNew', 'send', 'source-unlock', 'target-unlock']);
  assert.equal(JSON.parse(first.pointer).key, manifest.entries[0].plannedKey);
  assert.deepEqual(io.destinations.get(manifest.entries[0].plannedKey).bytes, envelope());
});

test('reused destination must preserve exact bytes/KMS; admission or source lease rejection never copies/enqueues', async () => {
  const io = store(), manifest = await preview(config, io, uuid());
  io.destinations.set(manifest.entries[0].plannedKey, { bytes: envelope('changed'), versionId: 'conflict' });
  const admission = gates(io); await assert.rejects(applyManifest(config, manifest, io, admission), /RECOVERY_KEY_CONFLICT/); assert.equal(io.sent.length, 0);
  io.destinations.get(manifest.entries[0].plannedKey).bytes = envelope(); io.destinations.get(manifest.entries[0].plannedKey).overrides = { SSEKMSKeyId: 'wrong' };
  await assert.rejects(applyManifest(config, manifest, io, admission), /ENCRYPTION/);
  const clean = store(), m = await preview(config, clean, uuid());
  await assert.rejects(applyManifest(config, m, clean, { ...gates(clean), assertOperational: async () => { throw Error('closed proof rejected'); } }), /proof rejected/);
  const g = gates(clean); await assert.rejects(applyManifest(config, m, clean, { ...g, acquireSourceControl: async () => { throw Error('source rejected'); } }), /source rejected/);
  assert.equal(clean.destinations.size, 0); assert.equal(clean.sent.length, 0); assert.equal(g.held.target, false);
});

test('restored v1 pointers retain original event keys for the existing inbox dedup contract', async () => {
  const io = store([{ key: key(1), versionId: 'v1', bytes: envelope() }, { key: key(2), versionId: 'v2', bytes: envelope('same-event', 'same-command', '2026-10-02T00:00:00.000Z') }]);
  const manifest = await preview(config, io, uuid()); await applyManifest(config, manifest, io, gates(io));
  const eventKeys = [];
  for (const message of io.sent) {
    const pointer = JSON.parse(message.pointer);
    assert.deepEqual(Object.keys(pointer).sort(), ['version', 'environment', 'key', 'hash'].sort());
    await shared.processPointer(message.pointer, { source: { ...config.source, WEBHOOK_REPLAY_ENABLED: 'true' }, read: async k => io.destinations.get(k).bytes.toString('utf8'), apply: async (e, id) => eventKeys.push(`${e.provider}:${id}`) });
  }
  assert.equal(eventKeys.length, 2); assert.equal(new Set(eventKeys).size, 1);
});

test('source control lease only selects current authorized proof and always rolls back, never business writes', async () => {
  const commands = [], db = { async query(sql) { commands.push(sql); return { rows: [{ mode: config.mode, proof_hash: config.proofHash }] }; } };
  const release = await acquireSourceControl(db, config); await release();
  assert.match(commands[1], /for share$/); assert.equal(commands.at(-1), 'rollback');
  assert(commands.every(sql => !/insert|update|delete|replay_aborted_webhook/i.test(sql)));
  await assert.rejects(acquireSourceControl({ async query() { return { rows: [{ mode: 'hold', proof_hash: config.proofHash }] }; } }, config), /SOURCE_CONTROL_REJECTED/);
});

test('SDK calls pin version/encryption/owner, never overwrite/delete, and CLI requires reviewed apply hashes', async () => {
  const calls = [], clients = { s3: { async send(command) { calls.push(command); return {}; } }, sqs: { async send(command) { calls.push(command); return { MessageId: 'fixture' }; } } };
  const io = await createIO(config, clients); await io.listVersions('marker', 'version'); await io.readObject(key(1), 'old'); await io.putNew(key(100), envelope()); await io.send('{}', 'a'.repeat(64));
  assert.equal(calls[0].input.Prefix, 'webhook-intake/dev/'); assert.equal(calls[1].input.VersionId, 'old'); assert.equal(calls[2].input.IfNoneMatch, '*'); assert.equal(calls[2].input.ExpectedBucketOwner, '996702758024'); assert.equal(calls[2].input.SSEKMSKeyId, config.source.WEBHOOK_BUFFER_KMS_KEY_ID); assert.equal(calls[3].input.MessageGroupId, 'webhook-intake');
  assert(calls.every(call => !call.constructor.name.startsWith('Delete') && !call.constructor.name.startsWith('Copy')));
  assert.equal(parseArgs(['--config','private.json','--out','manifest.json'])['--apply'], undefined);
  for (const args of [['--config','c','--apply'], ['--config','c','--out','m','--prefix','other'], ['--config','c','--manifest','m'], ['--config','c','--apply','--manifest','m','--manifest-sha256','a'.repeat(64)]]) assert.throws(() => parseArgs(args));
  const dir = await mkdtemp(join(tmpdir(), 'byus-preserved-private-'));
  try { const path = join(dir,'manifest.json'), raw = JSON.stringify({ synthetic:true }); await writeFile(path,raw,{mode:0o600}); assert.deepEqual(await privateJson(path,digest(raw)),{synthetic:true}); await assert.rejects(privateJson(path,'0'.repeat(64)),/HASH_MISMATCH/); } finally { await rm(dir,{recursive:true,force:true}); }
  // Check the same installed SDK surface used by the actual CLI, without credentials/network.
  const requireWeb = createRequire(new URL('../apps/web/package.json', import.meta.url)); assert.equal(typeof requireWeb('@aws-sdk/client-s3').ListObjectVersionsCommand,'function');
});


test('a later send failure preserves earlier entries and safe rerun uses the fixed copies and dedup IDs',async()=>{
 const io=store([{key:key(1),versionId:'one',bytes:envelope('one')},{key:key(2),versionId:'two',bytes:envelope('two')}]);
 const manifest=await preview(config,io,uuid()),send=io.send.bind(io);let attempts=0,fail=true;
 io.send=async(...args)=>{if(++attempts===2&&fail)throw Error('later send failure');return send(...args);};
 const admission=gates(io);await assert.rejects(applyManifest(config,manifest,io,admission),/later send/);
 assert.equal(io.destinations.size,2);assert.equal(io.sent.length,1);const first=io.sent[0];
 fail=false;attempts=0;assert.deepEqual(await applyManifest(config,manifest,io,admission),{accepted:2,copied:0,reused:2});
 assert.equal(io.sent[1].pointer,first.pointer);assert.equal(io.sent[1].dedup,first.dedup);assert.equal(io.destinations.size,2);
});


test('preview manifest is actually 0600, hash-pinned, metadata-only and refuses output overwrite',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'byus-preserved-manifest-'));
 try{const manifest=await preview(config,store(),uuid()),path=join(dir,'manifest.json');const result=await writeManifest(config,path,manifest);
 assert.equal((await stat(path)).mode&0o777,0o600);assert.deepEqual(await privateJson(path,result.manifestHash),manifest);
 await assert.rejects(writeManifest(config,path,manifest),error=>error.code==='EEXIST');
 }finally{await rm(dir,{recursive:true,force:true});}
});


test('paginated version inventory pins both markers, deduplicates page overlap and rejects marker cycles',async()=>{
 const io=store([{key:key(1),versionId:'one',bytes:envelope('one')},{key:key(1),versionId:'two',bytes:envelope('two')}]);let pages=0;
 io.listVersions=async(k,v)=>{pages++;if(pages===1){assert.equal(k,undefined);return {Versions:[{Key:key(1),VersionId:'one'}],IsTruncated:true,NextKeyMarker:key(1),NextVersionIdMarker:'one'};}assert.equal(k,key(1));assert.equal(v,'one');return {Versions:[{Key:key(1),VersionId:'one'},{Key:key(1),VersionId:'two'}],DeleteMarkers:[{Key:key(1),VersionId:'deleted'}]};};
 assert.equal((await preview(config,io,uuid())).entries.length,2);assert.equal(pages,2);
 const cyclic=store([]);cyclic.listVersions=async()=>({Versions:[],IsTruncated:true,NextKeyMarker:key(1),NextVersionIdMarker:'one'});
 await assert.rejects(preview(config,cyclic,uuid()),/PAGINATION/);
});
