#!/usr/bin/env node
import { readFile, writeFile, mkdtemp, mkdir, chmod, rename, unlink, readdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {DmsAdapter,DmsBudgetError,validateDmsConfig,remainingBudget,validateFinalStorageReceipt,validateBlobEvidence,checksumSql,STORAGE_IMPORT_ROLE,STORAGE_IMPORT_TABLES} from './aws-db-dms-adapter.mjs';

import {IDENTITY_IMPORT_ROLE,IDENTITY_IMPORT_TABLES,validateIdentityReceipt} from './aws-db-identity-import.mjs';
import {validateHeldWebhookEvidence} from './aws-webhook-held-evidence.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SQL = join(ROOT, 'infrastructure/aws/database');
const CONTROL = '_byus_migration';
const BARRIER = '_byus_barrier';
const MUTATIONS = ['bootstrap', 'prepare', 'fence', 'barrier', 'sequences', 'enable', 'abort'];
const fail = (message) => { throw new Error(message); };
export const hash = (value) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export const ident = (name) => `"${String(name).replaceAll('"', '""')}"`;
export const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const tableName = (table) => `${ident(table.schema)}.${ident(table.name)}`;
const names = (values) => `ARRAY[${values.map(literal).join(',')}]::text[]`;
const jsonSql = (sql) => `select coalesce(jsonb_agg(to_jsonb(q)),'[]') from (${sql}) q;`;
const plainObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

export function compareLsn(left, right) {
  const parse = (s) => {
    if (typeof s !== 'string' || !/^[0-9A-Fa-f]{1,8}\/[0-9A-Fa-f]{1,8}$/.test(s)) fail('Invalid PostgreSQL LSN');
    const [hi, lo] = s.split('/').map((part) => BigInt(`0x${part}`));
    return (hi << 32n) + lo;
  };
  const l = parse(left), r = parse(right);
  return l < r ? -1 : l > r ? 1 : 0;
}

export function validateConfig(c) {
  if (!plainObject(c) || !['dev', 'staging', 'prod'].includes(c.environment) || !/^\d{12}$/.test(c.accountId ?? '')) fail('Explicit environment and AWS accountId are required');
  if (c.engine !== undefined && !['native','dms'].includes(c.engine)) fail('Unknown database migration engine');
  if (c.engine !== 'dms' && (c.dms || c.source?.sqlTunnel || c.target?.sqlTunnel)) fail('DMS configuration cannot enter native path');
  if (!/^[a-z][a-z0-9_]{2,48}$/.test(c.runId ?? '')) fail('runId must be a unique lowercase identifier');
  if (c.region !== 'ap-northeast-2' || typeof c.profile !== 'string' || !c.profile) fail('Explicit Seoul region and AWS profile required');
  if (!Array.isArray(c.schemas) || !c.schemas.length || c.schemas.some((s) => !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s) || s.startsWith('pg_') || [CONTROL, BARRIER, 'information_schema'].includes(s))) fail('Explicit application schema list required');
  if (!Array.isArray(c.applicationRoles) || !c.applicationRoles.length || c.applicationRoles.some((r) => typeof r !== 'string' || !r)) fail('applicationRoles must enumerate login and effective application roles');
  if (!Array.isArray(c.writers) || !c.writers.length || new Set(c.writers).size !== c.writers.length) fail('writers must enumerate every deployed writer/worker/webhook');
  if (!Number.isInteger(c.timeoutSeconds ?? 300) || (c.timeoutSeconds ?? 300) < 1 || (c.timeoutSeconds ?? 300) > 300) fail('Pre-write window must be 1..300 seconds');
  for (const side of ['source', 'target']) {
    const db = c[side];
    if (!plainObject(db) || !/^[A-Z][A-Z0-9_]*$/.test(db.connectionEnv ?? '') || !plainObject(db.identity)) fail(`${side} requires an environment variable name and expected identity`);
    if (!db.host || !db.migrationRole || !db.identity.database || db.identity.sessionUser !== db.migrationRole || !db.identity.serverAddress || !Number.isInteger(db.identity.serverPort)) fail(`${side} needs an exact database/server/session identity`);
    if(db.connectionAddress!==undefined&&(side!=='source'||c.localRehearsal||isIP(db.connectionAddress)!==4))fail('Separate connectionAddress is only an explicit direct Supabase TLS source IPv4');
    if (c.applicationRoles.includes(db.migrationRole)) fail('Migration login must never be an application role');
    if (c.localRehearsal) {
      if (c.environment === 'prod' || db.host !== '127.0.0.1' || db.identity.serverAddress !== '127.0.0.1') fail('Local rehearsal is dev/staging and loopback only');
    } else {
      if (db.identity.serverPort !== 5432 || !db.sslRootCert || /pooler/i.test(db.host)) fail('Only direct PostgreSQL IPv4 TLS endpoints on 5432 are allowed');
      if (side === 'source' && (!/^[a-z0-9]{20}$/.test(db.projectRef ?? '') || db.host !== `db.${db.projectRef}.supabase.co`)) fail('Source must be its explicit direct Supabase endpoint, not a pooler');
      if (side === 'target' && (!db.rdsIdentifier || !db.rdsResourceId || !/\.rds\.amazonaws\.com$/.test(db.host))) fail('Target must be an explicit RDS instance identity');
    }
  }
  if (c.source.connectionEnv === c.target.connectionEnv || JSON.stringify(c.source.identity) === JSON.stringify(c.target.identity)) fail('Source and target identities must differ');
  if (c.engine === 'dms') validateDmsConfig(c);
  return c;
}

export function connection(c, side, env = process.env) {
  const db = c[side];
  let url;
  try { url = new URL(env[db.connectionEnv]); } catch { fail(`${side} connection variable is missing or invalid`); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== db.host || Number(url.port || 5432) !== db.identity.serverPort || decodeURIComponent(url.pathname.slice(1)) !== db.identity.database || decodeURIComponent(url.username) !== db.migrationRole || url.hash) fail(`${side} connection does not match configured identity`);
  if ([...url.searchParams.keys()].some((key) => key !== 'sslmode')) fail('Unexpected connection URL options are forbidden');
  let password;
  try { password = decodeURIComponent(url.password); } catch { fail(`${side} password encoding is invalid`); }
  if (!password || /[\r\n\u0000]/.test(password)) fail(`${side} requires a nonempty single-line password`);
  return { host: db.host, port: db.identity.serverPort, database: db.identity.database, user: db.migrationRole, password };
}

export function verifyIdentity(expected, actual) {
  for (const key of ['database', 'sessionUser', 'serverAddress', 'serverPort', ...(expected.databaseOid ? ['databaseOid'] : [])]) if (actual[key] !== expected[key]) fail(`Database identity mismatch (${key}); source/target reversal is forbidden`);
  if (Math.floor(actual.version / 10000) !== 17 || actual.inRecovery) fail('Both endpoints must be writable PostgreSQL 17 primaries');
}

export function verifyConnectionAddress(c,side,address){
  if(address!==(c[side].connectionAddress??c[side].identity.serverAddress))fail(`${side} DNS IPv4 address differs from the approved identity; re-audit failover explicitly`);
}

export class Database {
  constructor(c, side, value, address, passfile) { Object.assign(this, { c, side, value, address, passfile }); }
  static async open(c, side) {
    const value = connection(c, side);
    if(c.engine==='dms'&&side==='target'&&c.target.sqlTunnel){
      const tunnel=c.target.sqlTunnel,text=await readFile(resolve(tunnel.evidenceFile),'utf8');
      if(hash(text)!==tunnel.evidenceSha256)fail('Target SSM tunnel evidence changed');
      const proof=JSON.parse(text);
      if(proof.instanceId!==tunnel.instanceId||proof.remoteHost!==c.target.host||proof.remotePort!==5432||proof.localPort!==tunnel.port||!proof.sessionId)fail('Target SSM forwarding endpoint evidence differs');
    }
    const address = (await lookup(value.host, { family: 4 })).address;
    verifyConnectionAddress(c,side,address);
    const directory = await mkdtemp(join(tmpdir(), 'byus-db-pass-'));
    await chmod(directory, 0o700);
    const passfile = join(directory, 'pgpass');
    const escape = (s) => String(s).replaceAll('\\', '\\\\').replaceAll(':', '\\:');
    await writeFile(passfile, [value.host, c.engine==='dms'&&side==='target'&&c.target.sqlTunnel?c.target.sqlTunnel.port:value.port, value.database, value.user, value.password].map(escape).join(':') + '\n', { mode: 0o600 });
    return new Database(c, side, value, address, passfile);
  }
  async close() { this.closed=true;this.session?.close();await unlink(this.passfile); await (await import('node:fs/promises')).rmdir(dirname(this.passfile)); }
  async reuseConnection(){const {PsqlSession}=await import('./aws-db-psql-session.mjs');this.Session=PsqlSession;this.run('select 1;',{json:false});}
  run(sql, { json = true, timeout = 30000 } = {}) {
    if(this.closed)fail(`${this.side} PostgreSQL connection is closed`);
    if(this.budget) timeout=Math.min(timeout,this.budget());
    const tunnel=this.c.engine==='dms'&&this.side==='target'?this.c.target.sqlTunnel:null;
    const env = { PATH: process.env.PATH, HOME: process.env.HOME, LANG: process.env.LANG ?? 'C', PGHOST: this.value.host, PGHOSTADDR: tunnel?.hostaddr??this.address, PGPORT: String(tunnel?.port??this.value.port), PGDATABASE: this.value.database, PGUSER: this.value.user, PGPASSFILE: this.passfile, PGSSLMODE: this.c.localRehearsal ? 'disable' : 'verify-full', PGSSLROOTCERT: this.c[this.side].sslRootCert ?? '', PGCONNECT_TIMEOUT: '10', PGAPPNAME: `byus-migration/${this.c.runId}`, PGOPTIONS: `-c row_security=off -c statement_timeout=${Math.max(1, timeout - 500)} -c lock_timeout=${Math.max(1, timeout - 1000)}` };
    delete env.PGPASSWORD;
    const args=['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate', '-v', `schemas={${this.c.schemas.join(',')}}`, '-v', `migration_role=${this.value.user}`, '-v', `application_roles_json=${JSON.stringify(this.c.applicationRoles)}`];
    if(this.Session){
      if(!this.session||this.session.closed)this.session=new this.Session(env,args);const text=this.session.run(sql,timeout);
      if(!json)return text;try{return JSON.parse(text);}catch{fail(`${this.side} returned an unexpected non-JSON result`);}
    }
    const result = spawnSync('psql', args, { input: sql, env, encoding: 'utf8', timeout, maxBuffer: 32 * 1024 * 1024 });
    if (result.error || result.status !== 0) {
      // Never include SQL, stderr, URL, conninfo or a credential in an exception.
      const state = result.stderr?.match(/(?:ERROR|FATAL):\s+([A-Z0-9]{5})/i)?.[1];
      fail(`${this.side} PostgreSQL operation failed${state ? ` (SQLSTATE ${state})` : ''}${result.error?.code === 'ETIMEDOUT' ? ' (timeout)' : ''}`);
    }
    const text = result.stdout.trim();
    if (!json) return text;
    try { return JSON.parse(text); } catch { fail(`${this.side} returned an unexpected non-JSON result`); }
  }
  identity() { return this.run("select jsonb_build_object('database',current_database(),'databaseOid',(select oid::text from pg_database where datname=current_database()),'sessionUser',session_user,'serverAddress',host(inet_server_addr()),'serverPort',inet_server_port(),'version',current_setting('server_version_num')::int,'inRecovery',pg_is_in_recovery());"); }
}

export async function runAtomicFence(db,sql,options){
 if(!/^begin;/i.test(sql.trim())||!/commit;$/i.test(sql.trim()))fail('Fence must be one atomic transaction');
 for(let attempt=0;;attempt++){try{return db.run(sql,options);}catch(error){if(attempt===2||!/SQLSTATE 40P01/.test(error.message))throw error;await new Promise(resolve=>setTimeout(resolve,200));}}
}

export async function migrationInventory(directory = join(ROOT, 'supabase/migrations')) {
  const files = (await readdir(directory)).filter((f) => /^\d+.*\.sql$/.test(f)).sort();
  const items = [];
  for (const file of files) {
    const text = await readFile(join(directory, file), 'utf8');
    const couplings = [];
    text.split('\n').forEach((line, index) => {
      const providers = ['auth', 'storage', 'net', 'vault', 'cron', 'realtime'].filter((s) => new RegExp(`\\b${s}\\s*\\.`, 'i').test(line));
      if (/create\s+extension/i.test(line)) providers.push('extension');
      if (providers.length) couplings.push({ line: index + 1, providers });
    });
    items.push({ file, version: file.split('_')[0], sha256: hash(text), couplings });
  }
  return { count: files.length, sha256: hash(items), files: items };
}

export async function auditDatabase(db) {
  const a = db.run(await readFile(join(SQL, 'catalog.sql'), 'utf8'));
  verifyIdentity(db.c[db.side].identity, a.identity);
  // Expressions remain internal: only fingerprints and object names are emitted.
  const counts = a.tables.length ? db.run(jsonSql(a.tables.map((t) => `select ${literal(t.schema)} as schema,${literal(t.name)} as name,count(*)::text as n from ${tableName(t)}`).join(' union all '))) : [];
  for (const t of a.tables) t.rowCount = counts.find((r) => r.schema === t.schema && r.name === t.name).n;
  const sequenceStates = a.sequences.length ? db.run(jsonSql(a.sequences.map((s) => `select ${literal(s.schema)} as schema,${literal(s.name)} as name,last_value::text as "lastValue",is_called as "isCalled" from ${tableName(s)}`).join(' union all '))) : [];
  for (const s of a.sequences) Object.assign(s, sequenceStates.find((r) => r.schema === s.schema && r.name === s.name));
  a.activeCronJobs = db.run("select to_regclass('cron.job') is not null;", { json: false }) === 't'
    ? Number(db.run('select count(*) from cron.job where active;', { json: false })) : 0;
  a.activeCronWorkers = Number(db.run("select count(*) from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and (backend_type ilike '%cron%worker%' or application_name='pg_cron') and state in('active','idle in transaction');", { json: false }));
  a.sourceMigrations = db.run("select to_regclass('supabase_migrations.schema_migrations') is not null;", { json: false }) === 't'
    ? db.run(jsonSql('select version from supabase_migrations.schema_migrations order by version')) : [];
  a.storageInventory = db.run("select to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null;", { json: false }) === 't' ? db.run(await readFile(join(SQL, 'storage-inventory.sql'), 'utf8')) : null;
  a.catalogHash = catalogHash(a);
  a.objectFingerprints = objectFingerprints(a);
  return a;
}

export function catalogHash(a) {
  return hash({ schemas: a.schemas.filter((s) => a.tables.some((t) => t.schema === s.name)), tables: a.tables.map(({ rowCount: _rows, ...t }) => t), routines: a.routines, views: a.views, types: a.types, sequences: a.sequences.map(({ lastValue: _last, isCalled: _called, ...s }) => s) });
}

export function objectFingerprints(a) {
  const result = {};
  for (const kind of ['schemas', 'tables', 'routines', 'views', 'types', 'sequences']) {
    const objects = kind === 'schemas' ? a.schemas.filter((s) => a.tables.some((t) => t.schema === s.name)) : a[kind];
    for (const object of objects) {
      const value = { ...object };
      delete value.rowCount; delete value.lastValue; delete value.isCalled;
      const key = kind === 'schemas' ? object.name : `${object.schema}.${object.name}${kind === 'routines' ? `(${object.arguments})` : ''}`;
      result[`${kind}:${key}`] = hash(value);
    }
  }
  return result;
}

export function reviewPorts(c, source, target, manifest) {
  if (manifest.format !== 1 || manifest.environment !== c.environment || manifest.accountId !== c.accountId || manifest.sourceIdentityHash !== hash(source.identity) || manifest.targetIdentityHash !== hash(target.identity) || !Array.isArray(manifest.objects) || !manifest.objects.length) fail('Port review must match exact environment/account/database identities');
  const s = objectFingerprints(source), t = objectFingerprints(target), approved = new Map();
  for (const item of manifest.objects) {
    const key = `${item.kind}:${item.key}`;
    if (!item.reason || approved.has(key) || !Object.hasOwn(item, 'sourceFingerprint') || !Object.hasOwn(item, 'targetFingerprint') || (s[key] ?? null) !== item.sourceFingerprint || (t[key] ?? null) !== item.targetFingerprint || !Array.isArray(item.evidenceSha256) || !item.evidenceSha256.length || item.evidenceSha256.some((h) => !manifest.evidence?.some((e) => e.sha256 === h))) fail('Port review fingerprint/evidence mismatch');
    if (item.sourceFingerprint === item.targetFingerprint || (!s[key] && !t[key])) fail('Port review must describe an actual, narrowly identified change');
    approved.set(key, item);
  }
  const storageReferences = new Set();
  if (manifest.legacyStorage) {
    const storage = manifest.legacyStorage, sourceInventory = source.storageInventory, targetInventory = target.storageInventory;
    if (!sourceInventory || !targetInventory || hash(sourceInventory.projection) !== storage.sourceProjectionFingerprint || hash(targetInventory.projection) !== storage.sourceProjectionFingerprint || hash(targetInventory) !== storage.targetInventoryFingerprint || !Array.isArray(storage.evidenceSha256) || storage.evidenceSha256.length < 2 || new Set(storage.evidenceSha256).size < 2 || storage.evidenceSha256.some((h) => !manifest.evidence?.some((e) => e.sha256 === h))) fail('Legacy storage requires matching real source/target counts/checksums and distinct import/enforcement evidence');
    if (targetInventory.unexpectedRelations !== 0 || targetInventory.unexpectedRoutines !== 0 || targetInventory.relations?.length !== 2 || targetInventory.relations.some((r) => r.guard?.enabled !== 'A' || (r.guard.type & 63) !== 62 || r.guard.function !== 'storage.byus_reject_metadata_mutation()' || r.guard.rejectsAllWrites !== true || !r.guard.functionHash) || targetInventory.writerPrivileges?.length !== c.applicationRoles.length || targetInventory.writerPrivileges.some((r) => r.unsafe)) fail('Legacy storage metadata must be sealed by ALWAYS triggers and read-only application ACLs');
    if (!Array.isArray(storage.references) || !storage.references.length) fail('Legacy storage requires exact referencing object fingerprints');
    for (const item of storage.references) {
      const key = `${item.kind}:${item.key}`;
      if (storageReferences.has(key) || !t[key] || (s[key] ?? null) !== item.sourceFingerprint || t[key] !== item.targetFingerprint || (!s[key] && !approved.has(key))) fail('Legacy storage reference fingerprint mismatch');
      storageReferences.add(key);
    }
  }
  return { approved, storageReferences, unreviewed: [...new Set([...Object.keys(s), ...Object.keys(t)])].filter((key) => s[key] !== t[key] && !approved.has(key)) };
}

async function loadPorts(c, source, target, {copy=false,state=null}={}) {
  if (!c.portReviewFile && !c.portReviewSha256) return null;
  if (!c.portReviewFile || !/^[a-f0-9]{64}$/.test(c.portReviewSha256 ?? '')) fail('Port review requires an exact file checksum');
  const path = resolve(c.portReviewFile), body = await readFile(path, 'utf8');
  if (hash(body) !== c.portReviewSha256) fail('Port review file changed');
  const manifest = JSON.parse(body);
  if (!Array.isArray(manifest.evidence) || !manifest.evidence.length) fail('Port review requires real validation evidence files');
  for (const e of manifest.evidence) if (!e.path || !/^[a-f0-9]{64}$/.test(e.sha256) || hash(await readFile(resolve(dirname(path), e.path), 'utf8')) !== e.sha256) fail('Port validation evidence checksum mismatch');
  if(c.engine==='dms'&&manifest.legacyStorage){
    if(copy){
      const initialSource={...source,storageInventory:{...source.storageInventory,projection:target.storageInventory?.projection}};
      const result=reviewPorts(c,initialSource,target,manifest);
      return {...result,storageSnapshotUnverified:true,sourceStorageDrift:hash(source.storageInventory?.projection)!==manifest.legacyStorage.sourceProjectionFingerprint};
    }
    if(!state?.dmsFinalStorageReceipt)fail('Fresh final storage review required for DMS cutover');
    const binding=state.dmsFinalStorageReceipt,text=await readFile(binding.path,'utf8');if(hash(text)!==binding.sha256)fail('Final storage review file changed');const receipt=JSON.parse(text);
    validateFinalStorageReceipt(receipt,{c,state,source,target,sourceFenceVerified:state.dmsStorageFenceVerified===true,admitting:false});
    manifest.evidence.push({path:binding.path,sha256:binding.sha256},{path:binding.blobPath,sha256:binding.blobSha256});
    manifest.legacyStorage={...manifest.legacyStorage,sourceProjectionFingerprint:receipt.sourceProjectionFingerprint,targetInventoryFingerprint:receipt.targetInventoryFingerprint,evidenceSha256:[binding.sha256,binding.blobSha256]};
    for(const data of receipt.targetOnlyS3){const entry=manifest.objects.find(e=>e.kind==='tables'&&e.key===data.table&&e.sourceFingerprint===null);if(!entry)fail('S3 supplemental table lacks original DDL approval');entry.targetRows=String(data.rows);}
  }
  if(c.engine==='dms'&&!copy&&IDENTITY_IMPORT_TABLES.every(name=>target.tables.some(t=>t.schema==='public'&&t.name===name))){
    const binding=state?.dmsFinalIdentityReceipt;if(!binding)fail('Sealed identity receipt required');
    const text=await readFile(binding.path,'utf8');if(hash(text)!==binding.sha256)fail('Identity receipt changed');
    const receipt=validateIdentityReceipt(JSON.parse(text),{c,state,source,target});
    for(const data of receipt.tables){const entry=manifest.objects.find(e=>e.kind==='tables'&&e.key===data.table&&e.sourceFingerprint===null);if(!entry)fail('Identity table lacks original DDL approval');entry.targetRows=String(data.rows);}
  }
  return reviewPorts(c, source, target, manifest);
}

export function readiness(c, source, target, { initial = false, ports = null } = {}) {
  const blockers = [];
  for (const [side, a] of Object.entries({ source, target })) {
    if (a.largeObjectCount !== 0) blockers.push(`${side}: large objects are not supported by native logical replication`);
    for (const name of a.extensionDependencies) {
      if (!['plpgsql', 'pgcrypto', 'btree_gist'].includes(name)) blockers.push(`${side}: unsupported application extension ${name}`);
      const sourceExtension = source.extensions.find((e) => e.name === name), targetExtension = target.extensions.find((e) => e.name === name);
      if (!sourceExtension || !targetExtension || sourceExtension.version !== targetExtension.version || sourceExtension.schema !== targetExtension.schema) blockers.push(`Extension version/schema mismatch: ${name}`);
    }
    if (a.settings.preparedTransactions !== 0) blockers.push(`${side}: prepared transactions must be resolved`);
    if (a.settings.walLevel !== 'logical' || a.settings.maxReplicationSlots < 1 || a.settings.maxWalSenders < 1) blockers.push(`${side}: logical replication settings are not ready`);
    for (const t of a.tables) {
      if (t.kind !== 'r' || t.partition || t.persistence !== 'p') blockers.push(`${side}: ${t.schema}.${t.name} partition/unlogged tables require a separate validated path`);
      if (!t.primaryKey.length) blockers.push(`${side}: ${t.schema}.${t.name} has no primary key`);
      const reviewedTable = side === 'source' && ports?.approved.has(`tables:${t.schema}.${t.name}`);
      const storageReference = ports?.storageReferences?.has(`tables:${t.schema}.${t.name}`);
      if (!reviewedTable && t.constraints.some((con) => con.referencedSchema && !c.schemas.includes(con.referencedSchema) && !(storageReference && con.referencedSchema === 'storage'))) blockers.push(`${side}: ${t.schema}.${t.name} references an excluded schema`);
      if (!reviewedTable && t.columns.some((col) => col.providers?.some((provider) => provider !== 'storage' || !storageReference))) blockers.push(`${side}: ${t.schema}.${t.name} default has a provider dependency`);
    }
    for (const kind of ['routines', 'views']) for (const routine of a[kind]) {
      const key = `${kind}:${routine.schema}.${routine.name}${kind === 'routines' ? `(${routine.arguments})` : ''}`;
      const reviewed = side === 'source' && ports?.approved.has(key);
      const unresolved = routine.providers.filter((provider) => provider !== 'storage' || !ports?.storageReferences?.has(key));
      if (unresolved.length && !reviewed) blockers.push(`${side}: ${routine.schema}.${routine.name} requires provider ${unresolved.join(',')}`);
    }
    for (const s of a.sequences) if (s.cycle || BigInt(s.increment) <= 0n || !s.binding) blockers.push(`${side}: ${s.schema}.${s.name} is cyclic, descending, or unowned; explicit validated sequence plan required`);
    for (const role of c.applicationRoles) {
      const r = a.roles.find((item) => item.name === role);
      if (r?.canReadSubscriptionConninfo) blockers.push(`${side}: application role ${role} can read replication credentials`);
      if (!r || r.superuser || r.setReplicationRole) blockers.push(`${side}: application role ${role} is missing or can bypass ALWAYS triggers`);
      if (r && (r.name === c[side].migrationRole || r.canAssumeMigration)) blockers.push(`${side}: application role can assume migration login`);
      if (r?.canCreateApplicationObjects) blockers.push(`${side}: application role ${role} can create unfenced application objects`);
      if (r && r.ownsApplicationTables) blockers.push(`${side}: application role owns application tables`);
    }
  }
  for (const name of c.applicationRoles) {
    const s = source.roles.find((r) => r.name === name), t = target.roles.find((r) => r.name === name);
    if (s && t && hash({ login: s.login, bypassRls: s.bypassRls, members: [...s.membersOf].sort() }) !== hash({ login: t.login, bypassRls: t.bypassRls, members: [...t.membersOf].sort() })) blockers.push(`Role attributes/memberships differ: ${name}`);
  }
  if (source.catalogHash !== target.catalogHash && (!ports || ports.unreviewed.length)) blockers.push(`Application DDL/ownership/RLS/SECURITY DEFINER/search_path/grants/indexes/types differ${ports ? `: ${ports.unreviewed.join(',')}` : ''}`);
  for (const table of source.tables) {
    const other = target.tables.find((t) => t.schema === table.schema && t.name === table.name);
    const columns = (t) => t.columns.map((col) => ({ name: col.name, type: col.type, generated: col.generated }));
    if (!other || hash(columns(table)) !== hash(columns(other))) blockers.push(`Logical replication column contract differs: ${table.schema}.${table.name}`);
  }
  for (const table of target.tables.filter((t) => !source.tables.some((s) => s.schema === t.schema && s.name === t.name))) {
    const entry = ports?.approved.get(`tables:${table.schema}.${table.name}`);
    if (!entry || entry.targetRows !== table.rowCount) blockers.push(`Supplemental imported table count is not reviewed: ${table.schema}.${table.name}`);
  }
  if (target.settings.logicalWorkers < 2) blockers.push('Target needs at least two logical replication workers for apply and initial sync');
  if (initial && source.settings.maxReplicationSlots - source.slots.length < 2) blockers.push('Source needs free slots for the main subscription and initial synchronization');
  if (!source.tables.length) blockers.push('No application tables selected');
  if (initial && target.tables.some((t) => source.tables.some((s) => s.schema === t.schema && s.name === t.name) && BigInt(t.rowCount) !== 0n)) blockers.push('Initial-copy target must be empty');
  return [...new Set(blockers)];
}

export function guardSql(c, side, audit) {
  const source = side === 'source';
  const role = c[side].migrationRole;
  const identityImport = !source && c.engine==='dms' && IDENTITY_IMPORT_TABLES.every(name=>audit.tables.some(t=>t.schema==='public'&&t.name===name));
  const storageImport = !source && c.engine==='dms' && STORAGE_IMPORT_TABLES.every(name=>audit.tables.some(t=>t.schema==='public'&&t.name===name));
  return `begin;
set local lock_timeout='5s';
create schema if not exists ${ident(CONTROL)} authorization ${ident(role)};
revoke all on schema ${ident(CONTROL)} from public;
create table if not exists ${ident(CONTROL)}.state(run_id text primary key,side text not null,fenced boolean not null,first_write_at timestamptz,enabled_at timestamptz,imports_open boolean not null default false,imports_closed_at timestamptz);
revoke all on ${ident(CONTROL)}.state from public;
insert into ${ident(CONTROL)}.state(run_id,side,fenced,imports_open) values(${literal(c.runId)},${literal(side)},true,${storageImport||identityImport?'true':'false'});
create function ${ident(CONTROL)}.guard() returns trigger language plpgsql security definer set search_path='' as $guard$
declare s record;
begin
  ${source ? `if session_user=${literal(role)} then return null; end if;` : ''}
  ${source ? "raise exception 'Source is fenced for database cutover' using errcode='55000';" : `${c.engine==='dms'?`if current_setting('session_replication_role')='replica' then if session_user=${literal(c.dms.targetRole)} then return null; end if; raise exception 'Unapproved replica writer' using errcode='55000'; end if;`:`if current_setting('session_replication_role')='replica' then return null; end if;`}
  select * into strict s from ${ident(CONTROL)}.state where run_id=${literal(c.runId)};
  ${storageImport?`if s.fenced and current_setting('session_replication_role')='origin' and session_user=${literal(STORAGE_IMPORT_ROLE)} and tg_table_schema='public' and tg_table_name in(${STORAGE_IMPORT_TABLES.map(literal).join(',')}) then
    select * into strict s from ${ident(CONTROL)}.state where run_id=${literal(c.runId)} for share;
    if s.fenced and s.imports_open then return null; end if;
    raise exception 'Target storage imports are closed' using errcode='55000';
  end if;`:''}
  ${identityImport?`if s.fenced and current_setting('session_replication_role')='origin' and session_user=${literal(IDENTITY_IMPORT_ROLE)} and tg_table_schema='public' and tg_table_name in(${IDENTITY_IMPORT_TABLES.map(literal).join(',')}) then
    select * into strict s from ${ident(CONTROL)}.state where run_id=${literal(c.runId)} for share;
    if s.fenced and s.imports_open and s.first_write_at is null then return null; end if;
    raise exception 'Target identity imports are closed' using errcode='55000';
  end if;`:''}
  if s.fenced then raise exception 'Target writes are not enabled' using errcode='55000'; end if;
  if s.first_write_at is null then
    select * into strict s from ${ident(CONTROL)}.state where run_id=${literal(c.runId)} for update;
    if s.fenced then raise exception 'Target writes are not enabled' using errcode='55000'; end if;
    update ${ident(CONTROL)}.state set first_write_at=coalesce(first_write_at,clock_timestamp()) where run_id=${literal(c.runId)};
  end if;`}
  return null;
end
$guard$;
revoke all on function ${ident(CONTROL)}.guard() from public;
${audit.tables.map((t) => `create trigger byus_migration_guard before insert or update or delete or truncate on ${tableName(t)} for each statement execute function ${ident(CONTROL)}.guard();\nalter table ${tableName(t)} enable always trigger byus_migration_guard;`).join('\n')}
${storageImport?`create function ${ident(CONTROL)}.begin_storage_import() returns void language plpgsql security definer set search_path='' as $lease$
declare s record;
begin
 if session_user<>${literal(STORAGE_IMPORT_ROLE)} or current_setting('session_replication_role')<>'origin' then raise exception 'Storage import session denied' using errcode='55000';end if;
 select * into strict s from ${ident(CONTROL)}.state where run_id=${literal(c.runId)} and side='target' for share;
 if not s.fenced or not s.imports_open or s.first_write_at is not null then raise exception 'Storage imports are closed' using errcode='55000';end if;
end $lease$;
revoke all on function ${ident(CONTROL)}.begin_storage_import() from public;
grant usage on schema ${ident(CONTROL)} to ${ident(STORAGE_IMPORT_ROLE)};
grant execute on function ${ident(CONTROL)}.begin_storage_import() to ${ident(STORAGE_IMPORT_ROLE)};`:''}
${identityImport?`create function ${ident(CONTROL)}.begin_identity_import() returns void language plpgsql security definer set search_path='' as $lease$
declare s record;
begin
 if session_user<>${literal(IDENTITY_IMPORT_ROLE)} or current_setting('session_replication_role')<>'origin' then raise exception 'Identity import session denied' using errcode='55000';end if;
 select * into strict s from ${ident(CONTROL)}.state where run_id=${literal(c.runId)} and side='target' for share;
 if not s.fenced or not s.imports_open or s.first_write_at is not null then raise exception 'Identity imports are closed' using errcode='55000';end if;
end $lease$;
revoke all on function ${ident(CONTROL)}.begin_identity_import() from public;
grant usage on schema ${ident(CONTROL)} to ${ident(IDENTITY_IMPORT_ROLE)};
grant execute on function ${ident(CONTROL)}.begin_identity_import() to ${ident(IDENTITY_IMPORT_ROLE)};`:''}
commit;`;
}

export function sequenceSql(sequence, targetMax) {
  if (sequence.cycle || BigInt(sequence.increment) <= 0n || !sequence.binding || !/^-?\d+$/.test(sequence.lastValue)) fail('Unsupported sequence semantics');
  const value = targetMax === null || BigInt(sequence.lastValue) >= BigInt(targetMax) ? sequence.lastValue : targetMax;
  const called = sequence.isCalled || targetMax !== null;
  if (BigInt(value) < BigInt(sequence.min) || BigInt(value) > BigInt(sequence.max)) fail('Sequence value is outside bounds');
  return `select pg_catalog.setval(${literal(tableName(sequence))}::regclass,${literal(value)}::bigint,${called ? 'true' : 'false'});`;
}

export function assertWindow(c, state, now = Date.now()) {
  if (!state.fencedAt || now < state.fencedAt || now - state.fencedAt > (c.timeoutSeconds ?? 300) * 1000) fail('Pre-write window expired; target remains closed. Use guarded abort, never assume five-minute completion');
}

export function assertAbortAllowed(state) {
  if (state.firstWriteAt || state.phase === 'post-write') fail('Target has committed application writes: source cannot be reopened; forward recovery/reconciliation required');
}

export function validateWritePausedAt(value,c,now=Date.now(),observedAt=new Date(now).toISOString()) {
  const paused=Date.parse(value),observed=Date.parse(observedAt);
  if(!Number.isFinite(paused)||paused>now||paused>observed||now-paused>=(c.timeoutSeconds??300)*1000)fail('Actual writePausedAt missing, future or expired');
  return paused;
}

export async function evidence(c, path, { enable = false, targetIdentityHash, sourceIdentityHash, targetRpcFingerprint, state = {}, freezeOnly = false } = {}) {
  if (!path) fail('Operator evidence file is required');
  const e = JSON.parse(await readFile(resolve(path), 'utf8'));
  if (e.runId !== c.runId || !e.operator || !e.ddlFreeze?.active || (!freezeOnly && (!e.workersStopped || !e.schedulesStopped || e.inflightWriters !== 0)) || !Array.isArray(e.files) || !e.files.length) fail('Evidence must attest DDL freeze, stopped schedules/workers and drained inflight writes');
  const age = Date.now() - Date.parse(e.observedAt);
  if (!Number.isFinite(age) || age < -5000 || age > 60000) fail('Operator evidence must be observed within the last 60 seconds');
  for (const file of e.files) {
    if (!file.path || !/^[a-f0-9]{64}$/.test(file.sha256) || hash(await readFile(resolve(dirname(path), file.path), 'utf8')) !== file.sha256) fail('Evidence file checksum does not match');
  }
  let webhookGateBindingsSha256;
  if (enable) {
    if(e.webhookGate?.schemaVersion===2)webhookGateBindingsSha256=await validateHeldWebhookEvidence({c,e,evidencePath:path,state,sourceIdentityHash,targetIdentityHash,targetRpcFingerprint});
    else if(state.webhookGateBindingsSha256||![undefined,1].includes(e.webhookGate?.schemaVersion)||!e.webhookGate?.durable||!e.webhookGate?.accepting||e.webhookGate.backlogCount!==0||!e.webhookGate.revision)fail('Durable webhook acceptance gate is required; pinned held-buffer proof cannot be downgraded');
    for (const writer of c.writers) if (!e.writerDeployments?.some((w) => w.name === writer && w.revision && w.ready === true && w.targetIdentityHash === targetIdentityHash)) fail(`Writer target revision not proven: ${writer}`);
  }
  const writePausedAt = c.engine==='dms'&&!freezeOnly&&!enable ? validateWritePausedAt(e.writePausedAt,c,Date.now(),e.observedAt) : null;
  return { writePausedAt, sha256: hash(e), inflightWriters: e.inflightWriters ?? null, operator: e.operator, observedAt: e.observedAt, fileHashes: e.files.map((f) => f.sha256),...(webhookGateBindingsSha256?{webhookGateBindingsSha256}:{}) };
}

function aws(c, args, timeout = 30000) {
  const r = spawnSync('aws', ['--no-cli-pager', '--profile', c.profile, '--region', c.region, ...args, '--output', 'json'], { encoding: 'utf8', timeout });
  if (r.error || r.status !== 0) fail('AWS identity/target metadata validation failed');
  return JSON.parse(r.stdout);
}
function verifyAws(c, timeout=30000) {
  if (c.localRehearsal) return;
  const budget=()=>typeof timeout==='function'?timeout():timeout;
  if (aws(c, ['sts', 'get-caller-identity'],budget()).Account !== c.accountId) fail('Actual AWS account differs from the approved target account');
  const r = aws(c, ['rds', 'describe-db-instances', '--db-instance-identifier', c.target.rdsIdentifier],budget()).DBInstances?.[0];
  if (!r || r.DbiResourceId !== c.target.rdsResourceId || r.Endpoint?.Address !== c.target.host || !r.StorageEncrypted || r.PubliclyAccessible || !r.EngineVersion.startsWith('17.') || !r.TagList?.some((tag) => tag.Key === 'Environment' && tag.Value === c.environment)) fail('RDS identity/encryption/private/PG17 checks failed');
}

export async function readState(path, c) {
  const s = JSON.parse(await readFile(path, 'utf8'));
  if ((s.engine??'native') !== (c.engine??'native')) fail('Ledger migration engine differs');
  if (s.configHash !== hash(c) || s.runId !== c.runId || !Array.isArray(s.events)) fail('Ledger identity/configuration differs');
  let previous = '';
  for (const event of s.events) {
    const { digest, ...data } = event;
    if (data.previous !== previous || digest !== hash(data)) fail('Ledger hash chain is invalid');
    previous = digest;
  }
  return s;
}
export async function persist(path, state, phase, detail = {}) {
  state.phase = phase;
  const previous = state.events.at(-1)?.digest ?? '';
  const data = { at: new Date().toISOString(), phase, previous, ...detail };
  state.events.push({ ...data, digest: hash(data) });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

export function guardStatus(c, db) {
  return db.run(`select jsonb_build_object('fenced',(select fenced from ${ident(CONTROL)}.state where run_id=${literal(c.runId)}),'firstWriteAt',(select first_write_at from ${ident(CONTROL)}.state where run_id=${literal(c.runId)}),'functionHash',md5(pg_get_functiondef('${CONTROL}.guard()'::regprocedure)),'tables',(select coalesce(jsonb_agg(n.nspname||'.'||cl.relname order by n.nspname,cl.relname),'[]') from pg_trigger tr join pg_class cl on cl.oid=tr.tgrelid join pg_namespace n on n.oid=cl.relnamespace where tr.tgname='byus_migration_guard' and tr.tgenabled='A' and n.nspname=any(${names(c.schemas)})));`);
}

function dmsAdapter(c,source,target,state,statePath) {
  const adapter=new DmsAdapter({c,source,target,state,aws:(args,timeout)=>aws(c,args,timeout),checkpoint:statePath?detail=>persist(statePath,state,state.phase,detail):async()=>{}});
  adapter.bind();return adapter;
}
async function verifyDmsBarrier(c,source,target,state,statePath) {
  const adapter=dmsAdapter(c,source,target,state,statePath);
  assertWindow(c,state);
  await adapter.storageImportSealed();
  const s=await auditDatabase(source),copy=await auditDatabase(target);
  await adapter.verifyIdentityReceipt(s,copy);
  if(s.catalogHash!==state.catalogHash)fail('Source DDL changed during freeze');
  if(state.dmsStorageShapeHash){
    const binding=state.dmsFinalStorageReceipt;if(!binding)fail('Final storage evidence not admitted');
    const text=await readFile(binding.path,'utf8');if(hash(text)!==binding.sha256)fail('Final storage review changed');const receipt=JSON.parse(text);
    const fenced=await adapter.storageTriggers(true);state.dmsStorageFenceVerified=fenced;
    validateFinalStorageReceipt(receipt,{c,state,source:s,target:copy,sourceFenceVerified:fenced,admitting:!binding.admittedAt});
    const blobText=await readFile(binding.blobPath,'utf8');if(hash(blobText)!==binding.blobSha256)fail('Blob evidence changed');
    const ids=source.run("select coalesce(jsonb_agg(encode(sha256(convert_to(id::text,'UTF8')),'hex') order by id),'[]') from storage.objects;");
    validateBlobEvidence(JSON.parse(blobText),receipt,ids);
    for(const data of receipt.targetOnlyS3){const name=data.table.split('.')[1],t=copy.tables.find(t=>t.schema==='public'&&t.name===name);if(!t||String(data.rows)!==t.rowCount||hash(target.run(checksumSql(t)))!==data.sha256)fail('Final S3 provenance data hash differs');}
    binding.admittedAt??=Date.now();await persist(statePath,state,state.phase,{finalStorageSnapshotSha256:binding.sha256,blobEvidenceSha256:binding.blobSha256});
  }
  const proof=await adapter.verify(s,copy);
  const webhookHistory=await adapter.webhookHistory();
  const t=await auditDatabase(target),guards={source:guardStatus(c,source),target:guardStatus(c,target)};
  if(guards.source.fenced!==true||guards.target.fenced!==true||guards.target.firstWriteAt||guards.source.functionHash!==state.sourceGuardHash||guards.target.functionHash!==state.targetGuardHash)fail('Durable DMS cutover guard changed or target accepted writes');
  for(const [side,a] of Object.entries({source:s,target:t}))if(hash([...guards[side].tables].sort())!==hash(a.tables.map(x=>`${x.schema}.${x.name}`).sort()))fail('DMS ALWAYS guard coverage changed');
  const blockers=readiness(c,s,t,{ports:await loadPorts(c,s,t,{state})});if(blockers.length)fail(`Database readiness blocked: ${blockers.join('; ')}`);
  if(t.catalogHash!==state.targetCatalogHash)fail('Final target catalog was not restored exactly');
  return {source:s,target:t,dmsProof:proof,webhookHistory,rowsChecked:s.tables.map(x=>({schema:x.schema,table:x.name,sourceRows:x.rowCount,targetRows:t.tables.find(y=>y.schema===x.schema&&y.name===x.name)?.rowCount}))};
}
async function verifyBarrier(c, source, target, state, statePath) {
  if(c.engine==='dms')return verifyDmsBarrier(c,source,target,state,statePath);
  assertWindow(c, state);
  if (!state.barrierId || !state.sourceCommitFenceLsn) fail('Committed source barrier is missing');
  const targetBarrier = target.run(`select coalesce((select jsonb_build_object('id',id,'lsn',source_commit_fence_lsn::text) from ${ident(BARRIER)}.barriers where id=${literal(state.barrierId)}::uuid),'{}');`);
  const rows = target.run(jsonSql(`select remote_lsn::text from pg_replication_origin_status where external_id=(select 'pg_'||oid::text from pg_subscription where subname=${literal(c.runId)})`));
  const remote = rows[0]?.remote_lsn;
  if (targetBarrier.lsn !== state.sourceCommitFenceLsn || !remote || compareLsn(remote, state.sourceCommitFenceLsn) < 0) fail('Source barrier is not committed/applied at the target replication origin');
  const workers = target.run(jsonSql(`select srrelid::regclass::text as table_name,srsubstate from pg_subscription_rel where srsubid=(select oid from pg_subscription where subname=${literal(c.runId)}) and srsubstate<>'r'`));
  if (workers.length) fail('Initial table synchronization is incomplete');
  const guards = { source: guardStatus(c, source), target: guardStatus(c, target) };
  if (guards.source.fenced !== true || guards.target.fenced !== true || guards.target.firstWriteAt || guards.source.functionHash !== state.sourceGuardHash || guards.target.functionHash !== state.targetGuardHash) fail('Durable database guards changed or target already accepted writes');
  const s = await auditDatabase(source), t = await auditDatabase(target);
  for (const [side, a] of Object.entries({ source: s, target: t })) if (hash([...guards[side].tables].sort()) !== hash(a.tables.map((table) => `${table.schema}.${table.name}`).sort())) fail(`${side} ALWAYS table guards are incomplete`);
  const ports = await loadPorts(c, s, t);
  const blockers = readiness(c, s, t, { ports });
  if (blockers.length) fail(`Database readiness blocked: ${blockers.join('; ')}`);
  if (s.catalogHash !== state.catalogHash || t.catalogHash !== state.targetCatalogHash) fail('Application DDL changed during freeze');
  const rowsChecked = [];
  for (const table of s.tables) {
    const other = t.tables.find((item) => item.schema === table.schema && item.name === table.name);
    if (other?.rowCount !== table.rowCount) fail(`Row count differs: ${table.schema}.${table.name}`);
    rowsChecked.push({ schema: table.schema, table: table.name, sourceRows: table.rowCount, targetRows: other.rowCount });
  }
  return { source: s, target: t, remoteLsn: remote, rowsChecked };
}

export async function applyAction(action, c, source, target, state, statePath, flags, dependencies={}) {
  const adapter=dependencies.adapter??(c.engine==='dms'?dmsAdapter(c,source,target,state,statePath):null);
  if(adapter&&state.dmsIdentityImport&&['verify','sequences','enable'].includes(action)&&!state.dmsFinalIdentityReceipt){
    await evidence(c,flags['--evidence']);
    const path=resolve(flags['--evidence']),operator=JSON.parse(await readFile(path,'utf8')),ref=operator.identityReview;
    if(!ref||!operator.files.some(f=>f.path===ref.path&&f.sha256===ref.sha256))fail('Identity review requires fresh operator evidence');
    const receiptPath=resolve(dirname(path),ref.path),text=await readFile(receiptPath,'utf8');if(hash(text)!==ref.sha256)fail('Identity review hash differs');
    state.dmsFinalIdentityReceipt={path:receiptPath,sha256:ref.sha256};
  }
  if(adapter&&state.dmsStorageShapeHash&&['verify','sequences','enable'].includes(action)&&!state.dmsFinalStorageReceipt){
    await evidence(c,flags['--evidence']);
    const path=resolve(flags['--evidence']),operator=JSON.parse(await readFile(path,'utf8')),ref=operator.storageReview;
    if(!ref||!operator.files.some(f=>f.path===ref.path&&f.sha256===ref.sha256))fail('Final storage review must be explicitly approved by fresh operator evidence');
    const receiptPath=resolve(dirname(path),ref.path),text=await readFile(receiptPath,'utf8');if(hash(text)!==ref.sha256)fail('Final storage review hash differs');const receipt=JSON.parse(text),blob=receipt.blobEvidence;
    if(!blob||!operator.files.some(f=>resolve(dirname(path),f.path)===resolve(dirname(receiptPath),blob.path)&&f.sha256===blob.sha256))fail('Actual blob evidence must be approved in operator files');
    state.dmsFinalStorageReceipt={path:receiptPath,sha256:ref.sha256,blobPath:resolve(dirname(receiptPath),blob.path),blobSha256:blob.sha256};
  }
  if (action === 'bootstrap') {
    if (state.phase !== 'new') fail('Bootstrap requires a new run');
    target.run(await readFile(join(SQL, 'bootstrap.sql'), 'utf8'), { json: false });
    await persist(statePath, state, 'bootstrapped'); return;
  }
  if (action === 'prepare') {
    if (!['new', 'bootstrapped'].includes(state.phase)) fail('Prepare has already started; inspect ledger instead of rerunning partial work');
    const proof = await evidence(c, flags['--evidence'], { freezeOnly: true });
    const s = await auditDatabase(source), t = await auditDatabase(target);
    const ports = await loadPorts(c, s, t, {copy:c.engine==='dms'});
    const blockers = readiness(c, s, t, { initial: true, ports });
    const repositoryVersions = (await migrationInventory()).files.map((f) => f.version);
    if (s.sourceMigrations.some((m) => !repositoryVersions.includes(m.version))) blockers.push('Live source migration is absent from the reviewed repository');
    if (blockers.length) fail(`Database readiness blocked: ${blockers.join('; ')}`);
    if (s.publications.some((p) => p.name === c.runId) || t.subscriptions.some((p) => p.name === c.runId) || s.slots.some((p) => p.name === c.runId)) fail('Replication names already exist; inspect previous attempt');
    if(adapter) await adapter.preflight(s,t);
    state.catalogHash = s.catalogHash;
    state.targetCatalogHash = t.catalogHash;
    await persist(statePath, state, 'preparing', { evidence: proof });
    target.run(guardSql(c, 'target', t), { json: false });
    state.targetGuardHash = guardStatus(c, target).functionHash;
    if(adapter) {
      await adapter.prepare(s,t);
    } else {
    const barrierSql = `create schema ${ident(BARRIER)}; create table ${ident(BARRIER)}.barriers(id uuid primary key,source_commit_fence_lsn pg_lsn); revoke all on schema ${ident(BARRIER)} from public;`;
    source.run(`begin; ${barrierSql} create publication ${ident(c.runId)} for table ${[...s.tables.map(tableName), `${ident(BARRIER)}.barriers`].join(',')} with(publish='insert,update,delete,truncate'); commit;`, { json: false });
    target.run(barrierSql, { json: false });
    source.run(`select slot_name from pg_create_logical_replication_slot(${literal(c.runId)},'pgoutput');`, { json: false });
    const v = source.value;
    const conn = Object.entries({ host: v.host, hostaddr: source.address, port: String(v.port), dbname: v.database, user: v.user, password: v.password, sslmode: c.localRehearsal ? 'disable' : 'verify-full', ...(c.localRehearsal ? {} : { sslrootcert: c.source.subscriptionSslRootCert ?? 'system' }), application_name: `byus-replication/${c.runId}` }).map(([k, v]) => `${k}='${String(v).replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`).join(' ');
    // Set logging before transmitting conninfo. Failure stops before the secret SQL.
    const logging = target.run("select jsonb_build_object('audit',current_setting('pgaudit.log',true),'statements',current_setting('pg_stat_statements.track',true));");
    if (logging.audit && logging.audit !== 'none') fail('Target pgAudit logging requires a reviewed credential-safe subscription setup');
    target.run(`${logging.statements ? "set pg_stat_statements.track='none'; " : ''}set log_statement='none'; set log_min_error_statement='panic'; set log_parameter_max_length_on_error=0; create subscription ${ident(c.runId)} connection ${literal(conn)} publication ${ident(c.runId)} with(create_slot=false,slot_name=${literal(c.runId)},copy_data=true,enabled=true,synchronous_commit='on');`, { json: false });
    }
    await persist(statePath, state, 'prepared', { sourceIdentityHash: hash(s.identity), targetIdentityHash: hash(t.identity) }); return;
  }
  if (action === 'fence') {
    if (state.phase !== 'prepared') fail('Fence requires completed replication preparation');
    const proof = await evidence(c, flags['--evidence']);
    const s = await auditDatabase(source);
    if (s.catalogHash !== state.catalogHash || s.activeCronJobs !== 0 || s.activeCronWorkers !== 0 || s.settings.preparedTransactions !== 0) fail('Source DDL, active cron jobs or prepared transactions prevent fencing');
    if(adapter) await adapter.initialReady();
    else {
    const sync = target.run(jsonSql(`select srsubstate from pg_subscription_rel where srsubid=(select oid from pg_subscription where subname=${literal(c.runId)})`));
    if (sync.length !== s.tables.length + 1 || sync.some((r) => r.srsubstate !== 'r')) fail('Initial table synchronization must finish before the cutover window starts');
    }
    state.outstandingWriters = proof.inflightWriters;
    state.fencedAt = adapter ? validateWritePausedAt(new Date(proof.writePausedAt).toISOString(),c) : Date.now();
    if(adapter) adapter.bind();
    await persist(statePath, state, 'fencing', { evidence: proof });
    const sourceFenceSql=guardSql(c,'source',s);
    await runAtomicFence(source,adapter?await adapter.fenceSql(sourceFenceSql):sourceFenceSql, { json: false, timeout: Math.min(30000, (c.timeoutSeconds ?? 300) * 1000) });
    state.sourceGuardHash = guardStatus(c, source).functionHash;
    await persist(statePath, state, 'fenced'); return;
  }
  if (action === 'barrier') {
    if (state.phase !== 'fenced') fail('Barrier requires source fencing');
    assertWindow(c, state);
    if(adapter){await adapter.sealStorageImport();await adapter.authTriggers(true);if(state.dmsIdentityImport)await adapter.verifyIdentityReceipt(await auditDatabase(source),await auditDatabase(target));await adapter.refreshStorageProjection();}
    state.barrierId = randomUUID();
    source.run(`begin; set local synchronous_commit=on; insert into ${ident(BARRIER)}.barriers(id) values(${literal(state.barrierId)}); commit;`, { json: false });
    state.sourceCommitFenceLsn = source.run('select pg_current_wal_lsn()::text;', { json: false });
    source.run(`begin; set local synchronous_commit=on; update ${ident(BARRIER)}.barriers set source_commit_fence_lsn=${literal(state.sourceCommitFenceLsn)}${adapter?'':'::pg_lsn'} where id=${literal(state.barrierId)}::uuid; commit;`, { json: false });
    await persist(statePath, state, 'barrier', { barrierId: state.barrierId, sourceCommitFenceLsn: state.sourceCommitFenceLsn, commitLsnKind: 'durable post-commit WAL upper bound followed by a published confirmation transaction' }); return;
  }
  if (action === 'verify') {
    if (!['barrier', 'verified', 'sequences'].includes(state.phase)) fail('Verify requires a committed barrier');
    const v = await verifyBarrier(c, source, target, state, statePath);
    await persist(statePath, state, state.phase === 'sequences' ? 'sequences' : 'verified', { ...(adapter?{dmsProofHash:hash(v.dmsProof)}:{remoteLsn:v.remoteLsn}), rowsChecked: v.rowsChecked, elapsedMs: Date.now() - state.fencedAt, outstandingWriters: state.outstandingWriters, writerEvidenceMode: 'operator-attested at source fence', checksumMode: adapter?'exact canonical row/chunk SHA256; stopped and sealed DMS; committed barrier':'exact-row-counts; logical origin barrier; no content checksum claim' }); return;
  }
  if (action === 'sequences') {
    if (state.phase !== 'verified') fail('Sequence alignment requires successful barrier/row verification');
    const v = await verifyBarrier(c, source, target, state, statePath);
    const sequences = v.source.sequences;
    const maxima = sequences.length ? target.run(jsonSql(sequences.map((s) => {
      const b = s.binding;
      return `select ${literal(s.schema)} as schema,${literal(s.name)} as name,max(${ident(b.column)})::text as value from ${ident(b.schema)}.${ident(b.table)}`;
    }).join(' union all '))) : [];
    const changes = sequences.map((s) => {
      const max = maxima.find((m) => m.schema === s.schema && m.name === s.name).value;
      return { schema: s.schema, name: s.name, value: max === null || BigInt(s.lastValue) >= BigInt(max) ? s.lastValue : max, isCalled: s.isCalled || max !== null, sql: sequenceSql(s, max) };
    });
    if (changes.length) {
      target.run(changes.map((s) => s.sql).join('\n'), { json: false });
      const actual = target.run(jsonSql(sequences.map((s) => `select ${literal(s.schema)} as schema,${literal(s.name)} as name,last_value::text as value,is_called as "isCalled" from ${tableName(s)}`).join(' union all ')));
      for (const expected of changes) {
        const got = actual.find((s) => s.schema === expected.schema && s.name === expected.name);
        if (got?.value !== expected.value || got.isCalled !== expected.isCalled) fail('Sequence postcondition differs');
      }
    }
    for (const change of changes) delete change.sql;
    await persist(statePath, state, 'sequences', { sequences: changes }); return;
  }
  if (action === 'enable') {
    if (state.phase !== 'sequences') fail('Target enable requires verified sequences');
    const v = await verifyBarrier(c, source, target, state, statePath);
    const replayRoutines=v.target.routines.filter(r=>r.schema==='public'&&r.name==='replay_buffered_webhook');
    const enableEvidencePath = dependencies.beforeEnableEvidence ? await dependencies.beforeEnableEvidence(v) : flags['--evidence'];
    const proof = await evidence(c, enableEvidencePath, { enable: true, targetIdentityHash: hash(v.target.identity),sourceIdentityHash:hash(v.source.identity),targetRpcFingerprint:replayRoutines.length===1?hash(replayRoutines[0]):undefined,state });
    for (const seq of v.source.sequences) {
      const targetSeq = v.target.sequences.find((s) => s.schema === seq.schema && s.name === seq.name);
      if (!targetSeq || BigInt(targetSeq.lastValue) < BigInt(seq.lastValue) || (seq.isCalled && !targetSeq.isCalled)) fail('Sequence state advanced after alignment; re-verify and align before enabling writes');
    }
    if(proof.webhookGateBindingsSha256&&!state.webhookGateBindingsSha256){state.webhookGateBindingsSha256=proof.webhookGateBindingsSha256;await persist(statePath,state,state.phase,{webhookGateBindingsSha256:proof.webhookGateBindingsSha256,evidenceSha256:proof.sha256});}
    assertWindow(c, state);
    const remaining = (c.timeoutSeconds ?? 300) * 1000 - (Date.now() - state.fencedAt);
    const enabled = target.run(`update ${ident(CONTROL)}.state set fenced=false,enabled_at=clock_timestamp() where run_id=${literal(c.runId)} and side='target' and fenced and first_write_at is null returning jsonb_build_object('fenced',fenced);`, { timeout: remaining });
    if (enabled.fenced !== false) fail('Target enable postcondition failed');
    await persist(statePath, state, 'enabled', { evidence: proof, elapsedMs: Date.now() - state.fencedAt, ...(adapter?{dmsProofHash:hash(v.dmsProof)}:{remoteLsn:v.remoteLsn}), rowsChecked: v.rowsChecked, outstandingWriters: state.outstandingWriters, writerEvidenceMode: 'operator-attested at source fence' }); return;
  }
  if (action === 'abort') {
    if (!['fencing', 'fenced', 'barrier', 'verified', 'sequences', 'enabled', 'post-write'].includes(state.phase)) fail('Abort requires a cutover attempt; partial preparation needs manual inspection');
    // Serialize against target application writes before examining the durable first-write marker.
    if(adapter) adapter.bind(true);
    const marker = target.run(`begin; update ${ident(CONTROL)}.state set fenced=true,imports_open=false,imports_closed_at=coalesce(imports_closed_at,clock_timestamp()) where run_id=${literal(c.runId)}; select jsonb_build_object('firstWriteAt',first_write_at) from ${ident(CONTROL)}.state where run_id=${literal(c.runId)}; commit;`);
    state.firstWriteAt = marker.firstWriteAt;
    if (marker.firstWriteAt) { await persist(statePath, state, 'post-write', { firstWriteAt: marker.firstWriteAt, sourceReopened: false }); assertAbortAllowed(state); }
    if(adapter)await adapter.sealStorageImport();
    if(adapter) await adapter.seal();
    else target.run(`alter subscription ${ident(c.runId)} disable;`, { json: false });
    const s = await auditDatabase(source);
    if(adapter) remainingBudget(c,state,{rollback:true,minimumMs:1000});
    if (source.run("select to_regclass('_byus_migration.state') is not null;", { json: false }) === 't') source.run(`begin; ${s.tables.map((t) => `drop trigger if exists byus_migration_guard on ${tableName(t)};`).join('\n')} update ${ident(CONTROL)}.state set fenced=false where run_id=${literal(c.runId)}; ${adapter?adapter.storageUnfenceSql():''} commit;`, { json: false });
    await persist(statePath, state, 'aborted', { elapsedMs: state.fencedAt ? Date.now() - state.fencedAt : null, sourceReopened: true }); return;
  }
  fail('Unknown action');
}

export async function main(argv = process.argv.slice(2)) {
  let action = argv[0]?.startsWith('--') || !argv[0] ? 'audit' : argv.shift();
  if (!['audit', 'plan', 'verify', 'status', ...MUTATIONS].includes(action)) fail('Unknown migration action');
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i];
    if (!['--config', '--out', '--ledger', '--evidence', '--apply'].includes(f) || Object.hasOwn(flags, f)) fail('Unknown or duplicate option');
    flags[f] = f === '--apply' ? true : argv[++i];
    if (flags[f] === undefined || String(flags[f]).startsWith('--')) fail('Missing option value');
  }
  if (!flags['--config']) fail('--config is required');
  const c = validateConfig(JSON.parse(await readFile(resolve(flags['--config']), 'utf8')));
  const out = resolve(flags['--out'] ?? join(ROOT, 'work/aws-db', c.runId));
  await mkdir(out, { recursive: true, mode: 0o700 });
  const mutation=MUTATIONS.includes(action)||(c.engine==='dms'&&action==='verify');
  if (action === 'plan' || (mutation && !flags['--apply'])) {
    console.log(JSON.stringify({ executed: false, action, engine:c.engine??'native',environment: c.environment, accountId: c.accountId, runId: c.runId, order: ['audit', 'bootstrap', 'reviewed-schema-restore', 'prepare', 'fence', 'barrier', 'verify', 'sequences', 'enable'], source: c.source.identity, target: c.target.identity, required: 'explicit --apply and fresh operator evidence; first target write permanently closes simple source rollback' }, null, 2)); return;
  }
  if (flags['--apply'] && !mutation) fail('--apply only applies to a mutation action');
  if (flags['--apply'] && ['source', 'target'].some((side) => !/^\d+$/.test(c[side].identity.databaseOid ?? ''))) fail('Apply requires databaseOid pinned from the reviewed read-only audit on both endpoints');
  let forcedAbort=false,setupTimeout=30000;
  if(c.engine==='dms'&&mutation){
    try{const prior=await readState(resolve(flags['--ledger']??join(out,'ledger.json')),c);if(prior.fencedAt){
      try{remainingBudget(c,prior,{rollback:action==='abort'});setupTimeout=()=>remainingBudget(c,prior,{rollback:action==='abort'});}
      catch(error){if(error instanceof DmsBudgetError&&action!=='abort'&&['fencing','fenced','barrier','verified','sequences'].includes(prior.phase)){action='abort';forcedAbort=true;remainingBudget(c,prior,{rollback:true});setupTimeout=()=>remainingBudget(c,prior,{rollback:true});}else throw error;}
    }}catch(error){if(error.code!=='ENOENT')throw error;}
  }
  verifyAws(c,setupTimeout);
  let source, target, lockPath;
  try {
    source = await Database.open(c, 'source'); target = await Database.open(c, 'target');
    if(c.engine==='dms'&&mutation){const prior=await readState(resolve(flags['--ledger']??join(out,'ledger.json')),c).catch(e=>{if(e.code==='ENOENT')return {};throw e;});source.budget=target.budget=()=>remainingBudget(c,prior,{rollback:action==='abort'});}
    verifyIdentity(c.source.identity, source.identity()); verifyIdentity(c.target.identity, target.identity());
    const statePath = resolve(flags['--ledger'] ?? join(out, 'ledger.json'));
    if (action === 'audit') {
      const s = await auditDatabase(source), t = await auditDatabase(target);
      const repo = await migrationInventory();
      const liveVersions = s.sourceMigrations.map((m) => m.version);
      const repositoryVersions = repo.files.map((f) => f.version);
      const migrationDrift = { sourceOnlyVersions: liveVersions.filter((v) => !repositoryVersions.includes(v)), repositoryOnlyVersions: repositoryVersions.filter((v) => !liveVersions.includes(v)) };
      const manifest = { format: 1, migrationDrift, at: new Date().toISOString(), runId: c.runId, environment: c.environment, accountId: c.accountId, repositoryMigrations: repo, source: s, target: t, readinessBlockers: readiness(c, s, t, { initial: true, ports: await loadPorts(c, s, t, {copy:c.engine==='dms'}) }) };
      if (migrationDrift.sourceOnlyVersions.length) manifest.readinessBlockers.push('Live source migrations are absent from the reviewed repository snapshot');
      if(c.engine==='dms') manifest.dmsDraft=await dmsAdapter(c,source,target,{events:[]}).draft(s,t);
      await writeFile(join(out, 'audit.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
      console.log(JSON.stringify({ auditPath: join(out, 'audit.json'), blockers: manifest.readinessBlockers, sourceCatalogHash: s.catalogHash, targetCatalogHash: t.catalogHash }, null, 2)); return;
    }
    if (action === 'status') {
      const state = await readState(statePath, c);
      const marker = target.run("select to_regclass('_byus_migration.state') is not null;", { json: false }) === 't' ? target.run(`select jsonb_build_object('firstWriteAt',first_write_at) from ${ident(CONTROL)}.state where run_id=${literal(c.runId)};`) : {};
      console.log(JSON.stringify({ runId: c.runId, phase: state.phase, durableTargetFirstWriteAt: marker.firstWriteAt ?? null, sourceCommitFenceLsn: state.sourceCommitFenceLsn, elapsedMs: state.fencedAt ? Date.now() - state.fencedAt : null, firstWriteAt: state.firstWriteAt ?? null })); return;
    }
    const requestedLock = `${statePath}.lock`;
    await writeFile(requestedLock, String(process.pid), { flag: 'wx', mode: 0o600 });
    lockPath = requestedLock;
    let state;
    try { state = await readState(statePath, c); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      state = { engine:c.engine??'native',runId: c.runId, configHash: hash(c), phase: 'new', events: [] };
    }
    try { await applyAction(action, c, source, target, state, statePath, flags); }
    catch(error) {
      if(c.engine==='dms'&&state.fencedAt&&action!=='abort'&&['fencing','fenced','barrier','verified','sequences'].includes(state.phase)) {
        try { await applyAction('abort',c,source,target,state,statePath,flags); }
        catch { throw new Error('DMS cutover failed and guarded abort did not finish; fences remain protected, inspect ledger'); }
      }
      throw error;
    }
    console.log(JSON.stringify({ runId: c.runId, phase: state.phase, ledgerPath: statePath, elapsedMs: state.fencedAt ? Date.now() - state.fencedAt : null }));
    if(forcedAbort)fail('DMS work budget exhausted; guarded abort completed before deadline');
  } finally {
    if (lockPath) await unlink(lockPath).catch(() => {});
    if (target) await target.close();
    if (source) await source.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error instanceof SyntaxError ? 'Invalid JSON input; no input values were logged' : error.code === 'ENOENT' ? 'Required local file or executable is missing' : error.message); process.exitCode = 1; });
