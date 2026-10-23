import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { Database, auditDatabase, hash, objectFingerprints, reviewPorts, readiness } from '../../../scripts/aws-db-migrate.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(HERE, '../../..');
if (process.env.BYUS_PORTABILITY_REHEARSAL !== 'local-only' || process.env.PGDATABASE !== 'byus_clean' || !/^\/.*\/byus-clean-db\.[^/]+\/socket$/.test(process.env.PGHOST ?? '')) throw new Error('Portability rehearsal requires the disposable local clean-replay harness');
const out = resolve(process.env.BYUS_PORTABILITY_OUTPUT ?? join(ROOT, 'work/aws-db-portability'));
await mkdir(out, { recursive: true, mode: 0o700 });
const baseEnv = { ...process.env, PGHOSTADDR: '', PGAPPNAME: 'byus-portability-local-test' }; delete baseEnv.PGPASSWORD;
function command(program, args, options = {}) {
  const result = spawnSync(program, args, { env: baseEnv, encoding: 'utf8', timeout: 90000, maxBuffer: 64 * 1024 * 1024, ...options });
  if (result.error || result.status !== 0) {
    // Diagnostics stay in a private artifact; the console never receives SQL or row values.
    appendFileSync(join(out, 'private-step-errors.log'), `${program}:\n${result.stderr ?? result.error?.message ?? ''}\n`, { mode: 0o600 });
    throw new Error(`${program} portability step failed; inspect the private local report directory`);
  }
  return result.stdout.trim();
}
function sql(database, body, json = false) {
  const text = command('psql', ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-d', database], { input: body });
  return json ? JSON.parse(text) : text;
}
const contract = JSON.parse(await readFile(join(HERE, 'portability-contract.json'), 'utf8'));
const sourceDatabase = 'byus_clean', targetDatabase = `byus_portable_${randomBytes(4).toString('hex')}`;
const initial = sql(sourceDatabase, "select jsonb_build_object('local',inet_server_addr() is null,'version',current_setting('server_version_num')::int,'role',session_user);", true);
assert(initial.local && Math.floor(initial.version / 10000) === 17);
const role = initial.role, port = Number(process.env.PGPORT);
let source, target, created = false;
try {
  // Synthetic source-only fixture, never installed on the portable target as a platform API.
  sql(sourceDatabase, `alter table storage.objects add column if not exists user_metadata jsonb;
    insert into storage.objects(id,bucket_id,name,metadata,user_metadata) values
    ('00000000-0000-0000-0000-000000000001','cms-assets','portability/one.webp','{"mimetype":"image/webp","size":4}','{"sha256":"${'a'.repeat(64)}"}'),
    ('00000000-0000-0000-0000-000000000002','certification-proofs','owner/private.webp','{"mimetype":"image/webp","size":8}','{"sha256":"${'b'.repeat(64)}"}');`);
  const inventory = sql(sourceDatabase, await readFile(join(HERE, 'source-portability-inventory.sql'), 'utf8'), true);
  for (const operation of inventory.retirement) {
    assert(operation.exists, 'Expected source operation missing');
    assert.equal(operation.incomingCatalogDependencies.length, 0);
    assert.equal(operation.incomingRoutineReferences.length, 0);
    assert.equal(operation.incomingCronJobs.length, 0);
  }
  await writeFile(join(out, 'source-inventory.json'), JSON.stringify({ localSyntheticFixture: true, ...inventory }, null, 2) + '\n', { mode: 0o600 });
  const metadata = sql(sourceDatabase, await readFile(join(HERE, 'storage-export.sql'), 'utf8'), true);
  const metadataPath = join(out, 'private-storage-projection.json');
  await writeFile(metadataPath, JSON.stringify(metadata), { mode: 0o600 });
  const schemaPath = join(out, 'private-public-schema.dump'), dataPath = join(out, 'private-public-data.sql');
  command('pg_dump', ['-d', sourceDatabase, '--schema=public', '--schema-only', '--format=custom', '-f', schemaPath]);
  command('pg_dump', ['-d', sourceDatabase, '--schema=public', '--data-only', '-f', dataPath]);
  await chmod(schemaPath, 0o600); await chmod(dataPath, 0o600);
  const toc = command('pg_restore', ['--list', schemaPath]);
  const omitted = toc.split('\n').filter((line) => line.includes(' FK CONSTRAINT ') && line.includes(` ${contract.omittedArchiveConstraint} `));
  assert.equal(omitted.length, 1, 'Must omit only the reviewed legacy auth FK');
  const publicSchemaEntry = toc.split('\n').filter((line) => / SCHEMA - public /.test(line));
  assert.equal(publicSchemaEntry.length, 1, 'Preserve the pre-existing PG17 public schema and its default usage');
  const tocPath = join(out, 'reviewed-toc.list');
  await writeFile(tocPath, toc.split('\n').filter((line) => !omitted.includes(line) && !publicSchemaEntry.includes(line)).join('\n'), { mode: 0o600 });
  command('createdb', [targetDatabase]); created = true;
  sql(targetDatabase, await readFile(join(HERE, 'bootstrap.sql'), 'utf8'));
  sql(targetDatabase, await readFile(join(HERE, 'legacy-storage.sql'), 'utf8'));
  const literal = (value) => value === null ? 'null' : `'${String(value).replaceAll("'", "''")}'`;
  const buckets = metadata.buckets.map((b) => `(${literal(b.id)},${literal(b.name)},${b.public === null ? 'null' : Boolean(b.public)},${b.file_size_limit === null ? 'null' : literal(b.file_size_limit)}::bigint,${b.allowed_mime_types === null ? 'null' : `ARRAY[${b.allowed_mime_types.map(literal).join(',')}]::text[]`})`);
  const objects = metadata.objects.map((o) => `(${literal(o.id)}::uuid,${literal(o.bucket_id)},${literal(o.name)},${literal(JSON.stringify(o.metadata))}::jsonb,${literal(JSON.stringify(o.user_metadata))}::jsonb)`);
  if (buckets.length) sql(targetDatabase, `insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ${buckets.join(',')};`);
  if (objects.length) sql(targetDatabase, `insert into storage.objects(id,bucket_id,name,metadata,user_metadata) values ${objects.join(',')};`);
  command('pg_restore', ['-d', targetDatabase, '--exit-on-error', '--clean', '--if-exists', '--use-list', tocPath, schemaPath]);
  assert.equal(sql(targetDatabase, "select has_schema_privilege('anon','public','USAGE') and not has_schema_privilege('anon','public','CREATE');"), 't');
  sql(targetDatabase, await readFile(join(ROOT, 'apps/web/server/auth/cognito/rds-legacy-overrides.sql'), 'utf8'));
  sql(targetDatabase, await readFile(join(HERE, 'retire-supabase-operations.sql'), 'utf8'));
  command('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-d', targetDatabase, '-f', dataPath], { env: { ...baseEnv, PGOPTIONS: '-c session_replication_role=replica' } });
  sql(targetDatabase, await readFile(join(HERE, 'seal-legacy-storage.sql'), 'utf8'));
  const tests = ['cognito_identity_bridge', 'cognito_email_compatibility', 'aws_asset_storage'];
  for (const name of tests) command('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-d', targetDatabase, '-f', join(ROOT, `supabase/tests/${name}.sql`)]);
  // Real DML attempts must fail even for the import owner and replica trigger mode.
  for (const statement of ['delete from storage.objects', 'truncate storage.buckets', "set session_replication_role=replica;update storage.objects set name='changed'"]) {
    const r = spawnSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', targetDatabase], { env: baseEnv, input: statement, encoding: 'utf8' });
    assert.notEqual(r.status, 0, 'Sealed metadata accepted a mutation');
  }
  const configuration = { environment: 'dev', accountId: '111111111111', profile: 'local-only', region: 'ap-northeast-2', localRehearsal: true, runId: 'portable_rehearsal', schemas: ['public'], applicationRoles: ['anon', 'authenticated', 'service_role'], writers: ['local-test'], source: {}, target: {} };
  for (const [side, database] of [['source', sourceDatabase], ['target', targetDatabase]]) {
    const identity = sql(database, "select jsonb_build_object('database',current_database(),'databaseOid',(select oid::text from pg_database where datname=current_database()),'sessionUser',session_user,'serverAddress','127.0.0.1','serverPort',current_setting('port')::int,'version',current_setting('server_version_num')::int,'inRecovery',false);", true);
    configuration[side] = { host: '127.0.0.1', migrationRole: role, connectionEnv: `PORTABILITY_${side.toUpperCase()}_URL`, identity };
    process.env[configuration[side].connectionEnv] = `postgresql://${encodeURIComponent(role)}:local-only@127.0.0.1:${port}/${database}`;
  }
  source = await Database.open(configuration, 'source'); target = await Database.open(configuration, 'target');
  // Canonical ACLs must equate explicit owner defaults without hiding changed grants.
  for (const name of [sourceDatabase,targetDatabase]) sql(name, 'create schema _acl_portability_probe;create table _acl_portability_probe.items(id integer primary key);');
  sql(sourceDatabase, `grant all on _acl_portability_probe.items to "${role.replaceAll('"','""')}";`);
  configuration.schemas = ['_acl_portability_probe'];
  const probe = (a) => a.tables.find((r) => r.name==='items').acl;
  assert.equal(hash(probe(await auditDatabase(source))),hash(probe(await auditDatabase(target))),'Explicit owner ACL differs from default owner rights');
  sql(targetDatabase, 'grant select on _acl_portability_probe.items to anon;');
  const granted = hash(probe(await auditDatabase(target)));
  assert.notEqual(hash(probe(await auditDatabase(source))),granted,'Changed grantee privileges were ignored');
  sql(targetDatabase, 'grant select on _acl_portability_probe.items to anon with grant option;');
  assert.notEqual(granted,hash(probe(await auditDatabase(target))),'Grant option was ignored');
  const delegate = `acl_delegate_${randomBytes(4).toString('hex')}`;
  sql(sourceDatabase, `create role ${delegate} nologin;grant usage on schema _acl_portability_probe to ${delegate};grant select on _acl_portability_probe.items to ${delegate} with grant option;grant select on _acl_portability_probe.items to anon;`);
  sql(targetDatabase, `revoke all on _acl_portability_probe.items from anon;grant usage on schema _acl_portability_probe to ${delegate};grant select on _acl_portability_probe.items to ${delegate} with grant option;set role ${delegate};grant select on _acl_portability_probe.items to anon;reset role;`);
  assert.notEqual(hash(probe(await auditDatabase(source))),hash(probe(await auditDatabase(target))),'Grantor was ignored');
  for (const name of [sourceDatabase,targetDatabase]) sql(name, 'drop schema _acl_portability_probe cascade;');
  sql(sourceDatabase, `drop role ${delegate};`);
  configuration.schemas = ['public'];
  const s = await auditDatabase(source), t = await auditDatabase(target), sourceFingerprints = objectFingerprints(s), targetFingerprints = objectFingerprints(t);
  await writeFile(join(out, 'source-audit.json'), JSON.stringify(s, null, 2)+'\n', { mode: 0o600 });
  await writeFile(join(out, 'target-audit.json'), JSON.stringify(t, null, 2)+'\n', { mode: 0o600 });
  for (const [side,name] of [['source',sourceDatabase],['target',targetDatabase]]) await writeFile(join(out, `private-${side}-expressions.json`), sql(name, "select jsonb_build_object('searchPath',current_setting('search_path'),'constraints',(select jsonb_agg(jsonb_build_object('table',c.relname,'name',co.conname,'definition',pg_get_constraintdef(co.oid,true)) order by c.relname,co.conname) from pg_constraint co join pg_class c on c.oid=co.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and co.contype='c'),'view',pg_get_viewdef('public.participation_current_sources'::regclass,true));"), { mode: 0o600 });
  const importEvidence = { localSyntheticFixture: true, sourceProjection: s.storageInventory.projection, targetProjection: t.storageInventory.projection, exactMatch: hash(s.storageInventory.projection) === hash(t.storageInventory.projection) };
  assert(importEvidence.exactMatch); await writeFile(join(out, 'metadata-import.json'), JSON.stringify(importEvidence, null, 2) + '\n', { mode: 0o600 });
  const enforcementEvidence = { localSyntheticFixture: true, targetInventoryFingerprint: hash(t.storageInventory), sqlTests: tests, ownerAndReplicaDmlRejected: true };
  await writeFile(join(out, 'metadata-enforcement.json'), JSON.stringify(enforcementEvidence, null, 2) + '\n', { mode: 0o600 });
  const evidence = [];
  for (const file of ['metadata-import.json', 'metadata-enforcement.json']) evidence.push({ path: file, sha256: hash(await readFile(join(out, file), 'utf8')) });
  // pg_dump reparse names otherwise unnamed constants in later UNION arms.
  // Accept only this measured view and these three exact aliases; retain both fingerprints.
  const viewName = 'public.participation_current_sources';
  const sourceView = sql(sourceDatabase, `select pg_get_viewdef('${viewName}'::regclass,true);`);
  const targetView = sql(targetDatabase, `select pg_get_viewdef('${viewName}'::regclass,true);`);
  let expectedView = sourceView;
  for (const literal of ['fan_passports','fan_reactions','fan_lounge_messages']) expectedView = expectedView.replace(`SELECT '${literal}'::text,`, `SELECT '${literal}'::text AS text,`);
  assert.equal(targetView, expectedView, 'Unexpected view rewrite beyond known UNION output aliases');
  const viewShape = (database) => sql(database, `select jsonb_agg(jsonb_build_array(attname,format_type(atttypid,atttypmod)) order by attnum) from pg_attribute where attrelid='${viewName}'::regclass and attnum>0 and not attisdropped;`, true);
  assert.deepEqual(viewShape(sourceDatabase),viewShape(targetDatabase));
  await writeFile(join(out,'view-roundtrip.json'),JSON.stringify({view:viewName,sourceDefinitionSha256:hash(sourceView),targetDefinitionSha256:hash(targetView),columns:viewShape(targetDatabase),onlyThreeUnionConstantAliases:true})+'\n',{mode:0o600});
  evidence.push({path:'view-roundtrip.json',sha256:hash(await readFile(join(out,'view-roundtrip.json'),'utf8'))});
  const approvedKeys = new Set([`tables:${contract.authOverrideTable}`]);
  approvedKeys.add(`views:${viewName}`);
  for (const signature of [...contract.retiredRoutines, ...contract.authOverrideRoutines]) {
    const signatureName = signature.slice(7, signature.indexOf('('));
    const routine = s.routines.find((r) => r.schema === 'public' && r.name === signatureName);
    assert(routine); approvedKeys.add(`routines:public.${routine.name}(${routine.arguments})`);
  }
  const changed = [...new Set([...Object.keys(sourceFingerprints), ...Object.keys(targetFingerprints)])].filter((key) => sourceFingerprints[key] !== targetFingerprints[key]);
  assert(changed.every((key) => approvedKeys.has(key)), `Unexpected app object drift: ${changed.filter((key) => !approvedKeys.has(key)).join(',')}`);
  const manifest = { format: 1, environment: configuration.environment, accountId: configuration.accountId, sourceIdentityHash: hash(s.identity), targetIdentityHash: hash(t.identity), evidence, objects: changed.map((fullKey) => {
    const split = fullKey.indexOf(':'); return { kind: fullKey.slice(0, split), key: fullKey.slice(split + 1), sourceFingerprint: sourceFingerprints[fullKey] ?? null, targetFingerprint: targetFingerprints[fullKey] ?? null, reason: 'Exact target-only retirement, Cognito legacy binding replacement, or measured UNION alias roundtrip with attached object evidence', evidenceSha256: evidence.map((e) => e.sha256) };
  }), legacyStorage: { sourceProjectionFingerprint: hash(s.storageInventory.projection), targetInventoryFingerprint: hash(t.storageInventory), evidenceSha256: evidence.map((e) => e.sha256), references: [] } };
  for (const kind of ['routines', 'views', 'tables']) for (const object of s[kind]) {
    const storageRef = kind === 'tables' ? object.constraints.some((c) => c.referencedSchema === 'storage') || object.columns.some((c) => c.providers?.includes('storage')) : object.providers.includes('storage');
    if (!storageRef) continue;
    const key = `${object.schema}.${object.name}${kind === 'routines' ? `(${object.arguments})` : ''}`;
    if (!targetFingerprints[`${kind}:${key}`]) continue;
    manifest.legacyStorage.references.push({ kind, key, sourceFingerprint: sourceFingerprints[`${kind}:${key}`], targetFingerprint: targetFingerprints[`${kind}:${key}`] });
  }
  const ports = reviewPorts(configuration, s, t, manifest), blockers = readiness(configuration, s, t, { ports });
  assert(!blockers.some((b) => /provider|excluded schema|Application DDL/.test(b)), `Unresolved portability: ${blockers.join('; ')}`);
  await writeFile(join(out, 'reviewed-port-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
  // Negative proof: an empty metadata shim or a disabled trigger cannot authorize the exception.
  const empty = structuredClone(t); empty.storageInventory.projection.objects.rows = '0';
  assert.throws(() => reviewPorts(configuration, s, empty, manifest));
  const disabled = structuredClone(t); disabled.storageInventory.relations[0].guard.enabled = 'D';
  const badManifest = structuredClone(manifest); badManifest.legacyStorage.targetInventoryFingerprint = hash(disabled.storageInventory);
  assert.throws(() => reviewPorts(configuration, s, disabled, badManifest), /sealed/);
  for (const tamper of [
    (a) => { a.storageInventory.relations[0].guard.rejectsAllWrites = false; },
    (a) => { a.storageInventory.unexpectedRoutines = 1; },
  ]) {
    const altered=structuredClone(t); tamper(altered);
    const alteredManifest=structuredClone(manifest); alteredManifest.legacyStorage.targetInventoryFingerprint=hash(altered.storageInventory);
    assert.throws(()=>reviewPorts(configuration,s,altered,alteredManifest));
  }
  const schemas = sql(targetDatabase, "select coalesce(jsonb_agg(nspname),'[]') from pg_namespace where nspname in('auth','cron','net','vault');", true);
  assert.deepEqual(schemas, []);
  const extensions = sql(targetDatabase, "select jsonb_agg(extname order by extname) from pg_extension;", true);
  assert.deepEqual(extensions, [...contract.requiredTargetExtensions].sort());
  const report = { localSyntheticFixture: true, PostgreSQLMajor: 17, migrationCount: (await (await import('node:fs/promises')).readdir(join(ROOT, 'supabase/migrations'))).filter((f) => f.endsWith('.sql')).length, restoredPublicTables: t.tables.length, restoredRoutines: t.routines.length, restoredExtensions: extensions, forbiddenTargetSchemas: schemas, exactMetadataCopy: importEvidence, sealedMetadataDmlRejected: true, publicUsagePreserved: true, aclDefaultEquivalentAndGrantChangesDetected: true, retiredRoutines: contract.retiredRoutines, changedObjects: changed, targetSqlTests: tests, nativeReplicationReadinessBlockers: blockers, liveSupabaseOrRdsConnection: false };
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ portability: 'passed', reportPath: join(out, 'report.json'), publicTables: t.tables.length, routines: t.routines.length, nativeReplicationReadinessBlockers: blockers }));
} finally {
  if (target) await target.close(); if (source) await source.close();
  if (created) command('dropdb', [targetDatabase]);
}
