#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile, stat, lstat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
const buckets = ['cms-assets','fan-avatars','certification-proofs','fan-content-assets','mobile-media','cheer-photocards'];
export const sha = value => createHash('sha256').update(value).digest('hex');
const fail = () => { throw new Error('Storage migration check failed'); };
// Every object owns one deadline, including BEGIN/lease, SDK retries, body reads and COMMIT.
export function objectDeadline(milliseconds = 15000) {
  const controller = new AbortController(), bodies = new Set(), started = Date.now();
  let expired;
  const failure = new Promise((_, reject) => { expired = reject; });
  failure.catch(() => {});
  const abort = () => {
    controller.abort(new Error('Storage object deadline exceeded'));
    for (const body of bodies) {
      try { if (typeof body.destroy === 'function') body.destroy(); else Promise.resolve(body.cancel?.()).catch(() => {}); } catch {}
    }
  };
  const timer = setTimeout(() => { abort(); expired(controller.signal.reason); }, milliseconds);
  return {
    signal: controller.signal,
    remaining: () => Math.max(1, milliseconds - (Date.now() - started)),
    run: async operation => {
      controller.signal.throwIfAborted();
      const value = await Promise.race([Promise.resolve().then(operation), failure]);
      controller.signal.throwIfAborted(); return value;
    },
    send: async (client, command) => {
      const response = await client.send(command, { abortSignal: controller.signal });
      if (response.Body) {
        bodies.add(response.Body);
        if (controller.signal.aborted) { try { response.Body.destroy?.(); } catch {} controller.signal.throwIfAborted(); }
      }
      return response;
    },
    body: async body => {
      bodies.add(body);
      try { return Buffer.from(await body.transformToByteArray()); } finally { bodies.delete(body); }
    },
    abort,
    close: () => { clearTimeout(timer); abort(); },
  };
}
const destroyConnection = db => { try { db.connection?.stream?.destroy(); } catch {} };
async function boundedCleanup(operation, milliseconds, onTimeout) {
  let timer;
  try { return await Promise.race([Promise.resolve().then(operation), new Promise((_, reject) => {
    timer = setTimeout(() => { onTimeout(); reject(new Error('Storage cleanup deadline exceeded')); }, milliseconds);
  })]); } finally { clearTimeout(timer); }
}
export async function configureObjectTimeout(target, milliseconds) {
  await target.query("select set_config('transaction_timeout',$1,true),set_config('statement_timeout',$1,true),set_config('idle_in_transaction_session_timeout',$1,true)", [String(milliseconds)]);
}
export async function objectTransaction(source, target, operation, milliseconds = 15000) {
  const deadline = objectDeadline(milliseconds);
  // pg query_timeout alone does not cancel a server query. Closing the transport
  // on deadline also releases a blocked lease/transaction on the PostgreSQL side.
  const disconnect = () => { destroyConnection(target); destroyConnection(source); };
  deadline.signal.addEventListener('abort', disconnect, { once:true });
  const query = db => ({ query: (text, values) => deadline.run(() => db.query({ text, values, query_timeout:deadline.remaining() })) });
  try {
    const tx = query(target), src = query(source);
    await tx.query('begin');
    // Server-side fallback also bounds a lease if a broken network hides FIN.
    await configureObjectTimeout(tx, deadline.remaining());
    const result = await deadline.run(() => operation({ target:tx, source:src, deadline }));
    await tx.query('commit');
    return result;
  } catch (error) {
    // Normal failures may still roll back gracefully. Expired transports are
    // already closed; a failed/stalled rollback must never retain the lease.
    deadline.signal.removeEventListener('abort', disconnect);
    deadline.abort();
    try { await boundedCleanup(() => target.query({text:'rollback',query_timeout:5000}),5000,()=>destroyConnection(target)); }
    catch { destroyConnection(target);await boundedCleanup(()=>target.end(),1000,()=>destroyConnection(target)).catch(()=>{}); }
    throw error;
  } finally {
    deadline.signal.removeEventListener('abort', disconnect);
    deadline.close();
  }
}
export async function acquireImportLease(target) {
  const {rows}=await target.query("select to_regnamespace('_byus_migration') is not null as guarded");
  if(rows[0]?.guarded)await target.query('select _byus_migration.begin_storage_import()');
}
export function location(c, row) {
  if (!buckets.includes(row.bucket_id) || typeof row.name !== 'string' || !row.name || row.name.includes('\\') || row.name.split('/').some(p => !p || p === '.' || p === '..' || /[\x00-\x1f\x7f]/.test(p))) fail();
  return { Bucket: row.bucket_id === 'cms-assets' ? c.publicBucket : c.privateBucket, Key: `${row.bucket_id === 'cms-assets' ? 'public-assets/' : ''}${row.bucket_id}/${row.name}` };
}
export function validateConfig(c) {
  if (!['dev','staging','prod'].includes(c.environment) || c.accountId !== '996702758024' || c.region !== 'ap-northeast-2' || !/^[a-z0-9]{20}$/.test(c.sourceProjectRef ?? '') || !c.profile) fail();
  for (const [key, resource] of [['publicBucket','publicassetsbucket'],['privateBucket','privateproofsbucket']]) {
    if (!new RegExp(`^(?:byus-[a-z0-9-]+-${c.environment}-996702758024|byus-${c.environment}-platform-${resource}-[a-z0-9]+)$`).test(c[key] ?? '')) fail();
  }
  if (c.publicBucket === c.privateBucket || !/^https:\/\/[^/?#]+(?:\/[^?#]*)?$/.test(c.publicBaseUrl ?? '')) fail();
  const publicUrl = new URL(c.publicBaseUrl);
  if (publicUrl.username || publicUrl.password || publicUrl.search || publicUrl.hash) fail();
  for (const side of ['source','target']) {
    if (!c[side]?.host || !c[side]?.database || !c[side]?.user || !/^[A-Z][A-Z0-9_]+$/.test(c[side]?.connectionEnv ?? '')) fail();
  }
  if (c.source.host !== `db.${c.sourceProjectRef}.supabase.co` || !c.target.host.endsWith('.rds.amazonaws.com') || !c.source.caFile || !c.target.caFile) fail();
  if (c.source.forwardedPort !== undefined || c.target.forwardedPort !== undefined && (!Number.isInteger(c.target.forwardedPort) || c.target.forwardedPort < 1024 || c.target.forwardedPort > 65535)) fail();
  return c;
}
export async function privateJson(path) {
  const s = await lstat(path);
  if (!s.isFile() || (s.mode & 0o077)) fail();
  return JSON.parse(await readFile(path, 'utf8'));
}
export const fingerprint = row => sha(JSON.stringify([row.id,row.bucket_id,row.name,row.owner,row.owner_id,row.created_at,row.updated_at,row.last_accessed_at,row.metadata,row.user_metadata]));
export function plan(source, previous) {
  const keys = new Set();
  for (const row of source) { const key = `${row.bucket_id}/${row.name}`; if (keys.has(key)) fail(); keys.add(key); }
  return { upserts: source, removed: previous.filter(row => !keys.has(`${row.bucket_id}/${row.name}`)) };
}
export function assertManaged(existing, prior) {
  if (existing && (!prior || existing.state !== 'ready' || existing.delete_queued)) fail();
}
// Compare PostgreSQL JSON values before trusting the driver's parsed number representation.
export async function readSourceRow(source, row) {
  return (await source.query(`select id::text,bucket_id,name,owner::text,owner_id,created_at::text,updated_at::text,last_accessed_at::text,metadata,user_metadata
    from storage.objects where bucket_id=$1 and name=$2
      and metadata::jsonb is not distinct from $3::jsonb
      and user_metadata::jsonb is not distinct from $4::jsonb`,
    [row.bucket_id,row.name,row.metadata,row.user_metadata])).rows[0] ?? fail();
}
export async function migrateObject({ row, prior, io, apply, verify = false }) {
  const before = fingerprint(row);
  const body = await io.sourceBody(row);
  const checksum = sha(body);
  let verifiedBody;
  const targetMatches = async () => { verifiedBody = await io.targetBody(row); return verifiedBody.length === body.length && sha(verifiedBody) === checksum; };
  if (Number(row.metadata?.size) !== body.length || !row.metadata?.mimetype) fail();
  if (fingerprint(await io.sourceRow(row)) !== before) fail();
  const existing = await io.targetRow(row);
  assertManaged(existing, prior);
  const head = await io.head(row);
  if (head && (!prior || head.Metadata?.['byus-source'] !== prior.source_hash || head.ETag !== prior.etag)) {
    // Recover only a prior interrupted write tagged with this exact source generation and matching bytes.
    if (head.Metadata?.['byus-source'] !== before || !(await targetMatches())) fail();
  }
  if (apply && prior && existing && head && prior.source_hash === before && prior.sha256 === checksum) {
    if (!(await targetMatches()) || !existing || JSON.stringify(existing.metadata) !== JSON.stringify(row.metadata) || JSON.stringify(existing.user_metadata) !== JSON.stringify(row.user_metadata ?? {})) fail();
  } else if (apply) {
    await io.put(row, body, checksum, before, head?.ETag);
    // Comparing actual bytes catches transport/metadata checksum errors; ETag is only a CAS token.
    if (!(await targetMatches()) || fingerprint(await io.sourceRow(row)) !== before) fail();
    await io.record(row, checksum, before, (await io.head(row)).ETag);
  } else if (prior && verify) {
    if (!head || !(await targetMatches()) || prior.sha256 !== checksum || prior.source_hash !== before || !existing || sha(JSON.stringify(existing.metadata)) !== sha(JSON.stringify(row.metadata)) || sha(JSON.stringify(existing.user_metadata)) !== sha(JSON.stringify(row.user_metadata ?? {}))) fail();
  }
  if (verify && (!prior || !verifiedBody)) fail();
  return { bytes: body.length, checksum, sourceHash: before, ...(verify ? {blobEvidence:{sourceObjectIdSha256:sha(String(row.id)),sourceSha256:checksum,targetSha256:sha(verifiedBody),sourceBytes:body.length,targetBytes:verifiedBody.length}} : {}) };
}
export async function tombstoneObject(old, io) {
  if (await io.sourceExists(old)) fail();
  assertManaged(await io.targetRow(old), old);
  const head = await io.head(old);
  if (head && (head.ETag !== old.etag || head.Metadata?.['byus-source'] !== old.source_hash)) fail();
  if (head) await io.remove(old, old.etag);
  await io.recordDeletion(old);
}
export async function connectionOptions(c, side, env = process.env) {
  const d = c[side]; let u;
  try { u = new URL(env[d.connectionEnv]); } catch { fail(); }
  if (!['postgres:','postgresql:'].includes(u.protocol) || u.hostname !== d.host || Number(u.port || 5432) !== 5432 || decodeURIComponent(u.pathname.slice(1)) !== d.database || decodeURIComponent(u.username) !== d.user || !u.password || [...u.searchParams.keys()].some(k => k !== 'sslmode')) fail();
  // SSM forwards transport only; TLS must still verify the configured RDS hostname.
  return {host:d.forwardedPort ? '127.0.0.1' : d.host,port:d.forwardedPort ?? 5432,database:d.database,user:d.user,password:decodeURIComponent(u.password),ssl:{rejectUnauthorized:true,servername:d.host,ca:await readFile(d.caFile,'utf8')},connectionTimeoutMillis:5000,statement_timeout:15000,query_timeout:15000};
}
async function connect(c, side) {
  const { Client } = require('pg');
  const db = new Client(await connectionOptions(c, side));
  // Transport destruction rejects active queries; never print raw connection errors.
  db.on('error', () => {});
  await db.connect(); return db;
}
export async function main(args = process.argv.slice(2), {deadlineAt, quiet=false} = {}) {
  const remaining = (reserve=0) => { const value=deadlineAt===undefined?15000:deadlineAt-Date.now()-reserve; if(!Number.isFinite(value)||value<1) throw new Error('Storage verification deadline exceeded'); return Math.min(15000,value); };
  remaining(3000);
  const configPath = args[0];
  if (!configPath || args.slice(1).some(a => !['--apply','--verify','--barrier','--delete-delta'].includes(a))) fail();
  const apply = args.includes('--apply'), verify = args.includes('--verify'), barrier = args.includes('--barrier');
  if (apply && verify || args.includes('--delete-delta') && (!apply || !barrier)) fail();
  let fence;
  const c = validateConfig(await privateJson(configPath));
  if (!c.outputFile) fail();
  // Refuse overwrite before any remote operation. Artifacts contain object names and stay private.
  try { await stat(c.outputFile); fail(); } catch(e) { if(e.code !== 'ENOENT') throw e; }
  if (barrier) {
    fence = await privateJson(c.barrierFile);
    if (fence.sourceProjectRef !== c.sourceProjectRef || fence.environment !== c.environment || fence.allStorageWritersStopped !== true || !Array.isArray(fence.writers) || !fence.writers.length || !fence.writers.every(w => typeof w === 'string' && w.length) || !Number.isFinite(Date.parse(fence.stoppedAt)) || Date.now()-Date.parse(fence.stoppedAt) > 3600000 || Date.parse(fence.stoppedAt) > Date.now()) fail();
  }
  const identity = JSON.parse(execFileSync('aws',['sts','get-caller-identity','--profile',c.profile,'--region',c.region,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:remaining(3000)}));
  if (identity.Account !== c.accountId || !identity.Arn?.startsWith(`arn:aws:sts::${c.accountId}:assumed-role/`)) fail();
  const token = process.env.SUPABASE_STORAGE_SERVICE_TOKEN;
  if (!token || token.length < 40) fail();
  const sdk = require('@aws-sdk/client-s3');
  const { fromIni } = require('@aws-sdk/credential-provider-ini');
  const s3 = new sdk.S3Client({ region:c.region,credentials:fromIni({profile:c.profile}) });
  const send = async (name, input, deadline) => {
    const own = !deadline; deadline ??= objectDeadline(remaining(3000));
    try { return await deadline.run(() => deadline.send(s3,new sdk[name]({...input,ExpectedBucketOwner:c.accountId}))); }
    finally { if(own)deadline.close(); }
  };
  const policies = [];
  let source, target;
  try {
    for (const Bucket of [c.publicBucket,c.privateBucket]) {
      const block = await send('GetPublicAccessBlockCommand',{Bucket});
      const acl = await send('GetBucketAclCommand',{Bucket});
      const policy = await send('GetBucketPolicyStatusCommand',{Bucket});
      const versioning = await send('GetBucketVersioningCommand',{Bucket});
      const ownership = await send('GetBucketOwnershipControlsCommand',{Bucket});
      if (!Object.values(block.PublicAccessBlockConfiguration ?? {}).every(v => v === true) || Object.keys(block.PublicAccessBlockConfiguration ?? {}).length !== 4 || policy.PolicyStatus?.IsPublic !== false || acl.Grants?.some(g => g.Grantee?.URI) || versioning.Status !== 'Enabled' || !ownership.OwnershipControls?.Rules?.some(r => r.ObjectOwnership === 'BucketOwnerEnforced')) fail();
      const rawPolicy = await send('GetBucketPolicyCommand',{Bucket});
      policies.push({bucket:Bucket,public:false,versioned:true,aclDisabled:true,policy:JSON.parse(rawPolicy.Policy)});
    }
    source = await connect(c,'source'); target = await connect(c,'target');
    const role = (await target.query('select rolsuper,rolbypassrls from pg_roles where rolname=current_user')).rows[0];
    if (!role || apply && !role.rolsuper && !role.rolbypassrls || ['service_role','authenticated','anon'].includes(c.target.user)) fail();
    const inventory = async () => (await source.query('select id::text,bucket_id,name,owner::text,owner_id,created_at::text,updated_at::text,last_accessed_at::text,metadata,user_metadata from storage.objects order by bucket_id,name')).rows;
    const rows = await inventory(); rows.forEach(r => location(c,r));
    const sourceBuckets = (await source.query('select id,public,file_size_limit,allowed_mime_types from storage.buckets order by id')).rows;
    if (sourceBuckets.some(b => !buckets.includes(b.id))) fail();
    const previous = (await target.query('select * from public.s3_storage_migration_objects where source_project=$1 and deleted_at is null',[c.sourceProjectRef])).rows;
    const changes = plan(rows,previous);
    if (changes.removed.length && apply && !args.includes('--delete-delta')) fail();
    const blobObjects=[];
    const summary = {objects:rows.length,bytes:0,deleted:changes.removed.length,checksums:[],policyHash:sha(JSON.stringify({policies,sourceBuckets})),verified:false};
    for (const row of rows) {
      const prior = previous.find(p => p.bucket_id === row.bucket_id && p.name === row.name);
      await objectTransaction(source,target,async ({source,target,deadline}) => {
        if(apply)await acquireImportLease(target);
        // Lock also excludes concurrent native reserve/delete transactions during object CAS and import.
        if (apply) await target.query('lock table public.s3_storage_objects,public.s3_storage_delete_outbox,public.s3_storage_migration_objects in exclusive mode');
        const loc = location(c,row);
        const io = {
          sourceRow:r => readSourceRow(source,r),
          sourceBody:async r => {
            const url = `https://${c.sourceProjectRef}.supabase.co/storage/v1/object/authenticated/${r.bucket_id}/${r.name.split('/').map(encodeURIComponent).join('/')}`;
            const res = await fetch(url,{headers:{Authorization:`Bearer ${token}`,apikey:token},redirect:'error',signal:deadline.signal});
            if (!res.ok || Number(r.metadata?.size) > 52428800) fail();
            const chunks=[]; let bytes=0;
            for await (const chunk of res.body) { bytes+=chunk.length; if (bytes > Number(r.metadata?.size)) fail(); chunks.push(chunk); }
            return Buffer.concat(chunks);
          },
          targetRow:async r => (await target.query('select o.*,exists(select 1 from public.s3_storage_delete_outbox d where d.bucket_id=o.bucket_id and d.name=o.name) as delete_queued from public.s3_storage_objects o where o.bucket_id=$1 and o.name=$2',[r.bucket_id,r.name])).rows[0],
          head:async () => { try { return await send('HeadObjectCommand',loc,deadline); } catch(e) { if(e.$metadata?.httpStatusCode === 404) return null; throw e; } },
          targetBody:async () => deadline.body((await send('GetObjectCommand',loc,deadline)).Body),
          put:async(r,Body,checksum,sourceHash,etag) => send('PutObjectCommand',{...loc,Body,ContentType:r.metadata.mimetype,CacheControl:'no-cache',ChecksumSHA256:Buffer.from(checksum,'hex').toString('base64'),Metadata:{'byus-source':sourceHash},...(etag ? {IfMatch:etag} : {IfNoneMatch:'*'})},deadline),
          record:async(r,checksum,sourceHash,etag) => {
            await target.query(`insert into public.s3_storage_objects(bucket_id,name,metadata,user_metadata,state,created_at,updated_at) values($1,$2,$3,$4,'ready',$5,$6) on conflict(bucket_id,name) do update set metadata=excluded.metadata,user_metadata=excluded.user_metadata,state='ready',updated_at=excluded.updated_at`,[r.bucket_id,r.name,r.metadata,r.user_metadata ?? {},r.created_at,r.updated_at]);
            await target.query(`insert into public.s3_storage_migration_objects(source_project,bucket_id,name,source_id,source_record,source_hash,sha256,etag) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(source_project,bucket_id,name) do update set source_id=excluded.source_id,source_record=excluded.source_record,source_hash=excluded.source_hash,sha256=excluded.sha256,etag=excluded.etag`,[c.sourceProjectRef,r.bucket_id,r.name,r.id,r,sourceHash,checksum,etag]);
          }
        };
        if (verify && !prior) fail();
        const result = await migrateObject({row,prior,io,apply,verify});
        summary.bytes += result.bytes; summary.checksums.push(result.checksum);
        if(verify)blobObjects.push(result.blobEvidence);
      },remaining(3000));
    }
    // Only migration-owned objects can be tombstoned, under the explicit final writer fence.
    if (apply && args.includes('--delete-delta')) for (const old of changes.removed) {
      await objectTransaction(source,target,async ({source,target,deadline}) => {
        await acquireImportLease(target);
        await target.query('lock table public.s3_storage_objects,public.s3_storage_delete_outbox,public.s3_storage_migration_objects in exclusive mode');
        const loc = location(c,old);
        await tombstoneObject(old, {
          sourceExists:async r => (await source.query('select 1 from storage.objects where bucket_id=$1 and name=$2',[r.bucket_id,r.name])).rowCount > 0,
          targetRow:async r => (await target.query('select o.*,exists(select 1 from public.s3_storage_delete_outbox d where d.bucket_id=o.bucket_id and d.name=o.name) as delete_queued from public.s3_storage_objects o where o.bucket_id=$1 and o.name=$2',[r.bucket_id,r.name])).rows[0],
          head:async () => { try { return await send('HeadObjectCommand',loc,deadline); } catch(e) { if(e.$metadata?.httpStatusCode === 404) return null; throw e; } },
          remove:async(r,etag) => send('DeleteObjectCommand',{...loc,IfMatch:etag},deadline),
          recordDeletion:async r => {
            await target.query("update public.s3_storage_objects set state='deleted',updated_at=clock_timestamp() where bucket_id=$1 and name=$2",[r.bucket_id,r.name]);
            await target.query('update public.s3_storage_migration_objects set deleted_at=clock_timestamp() where source_project=$1 and bucket_id=$2 and name=$3',[c.sourceProjectRef,r.bucket_id,r.name]);
          }
        });
      },remaining(3000));
    }
    if (verify && changes.removed.length) fail();
    if (verify) {
      const deleted = (await target.query('select * from public.s3_storage_migration_objects where source_project=$1 and deleted_at is not null',[c.sourceProjectRef])).rows;
      for (const old of deleted) {
        const state = (await target.query('select state from public.s3_storage_objects where bucket_id=$1 and name=$2',[old.bucket_id,old.name])).rows[0];
        if (state?.state !== 'deleted') fail();
        try { await send('HeadObjectCommand',location(c,old)); fail(); } catch(e) { if(e.$metadata?.httpStatusCode !== 404) throw e; }
      }
    }
    const after = await inventory();
    if (sha(JSON.stringify(rows)) !== sha(JSON.stringify(after))) fail();
    if (barrier && verify) summary.verified = true;
    const {checksums,...safe} = summary;
    remaining(3000);
    const artifact = {blobObjects,verified:summary.verified,verifiedAt:summary.verified?new Date().toISOString():null,sourceProjectRef:c.sourceProjectRef,environment:c.environment,sourceHash:sha(JSON.stringify(rows)),policies,sourceBuckets,sourcePolicies:(await source.query("select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname='storage' order by tablename,policyname")).rows,objects:rows,rewriteManifest:rows.filter(r => r.bucket_id === 'cms-assets').map(r => ({old:`https://${c.sourceProjectRef}.supabase.co/storage/v1/object/public/cms-assets/${r.name.split('/').map(encodeURIComponent).join('/')}`,new:`${c.publicBaseUrl.replace(/\/$/,'')}/cms-assets/${r.name.split('/').map(encodeURIComponent).join('/')}`}))};
    await writeFile(c.outputFile,JSON.stringify(artifact,null,2),{mode:0o600,flag:'wx'});
    if(!quiet)console.log(JSON.stringify({...safe,hash:sha(checksums.sort().join('')),artifactHash:sha(JSON.stringify(artifact)),dryRun:!apply}));
    return {...safe,artifact};
  } finally {
    s3.destroy();
    for(const db of [source,target])if(db)await boundedCleanup(()=>db.end(),1000,()=>destroyConnection(db)).catch(()=>{});
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => { console.error('Storage migration failed; no credentials or object paths are logged. Inspect private artifacts and retry after reconciliation.'); process.exitCode=1; });
