// Consume privately captured read-only source artifacts; mutate only a fresh local PG17 cluster.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm,chmod} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:net';
import {renderGlobalFunctionDefaults} from './default-privileges.mjs';
import {hash,objectFingerprints,reviewPorts} from '../../../scripts/aws-db-migrate.mjs';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../../..');
assert.equal(process.argv.length,3,'Pass the private source artifact directory');
const out=resolve(process.argv[2]),source=JSON.parse(await readFile(join(out,'source-catalog.json'),'utf8'));
const versions=new Set(JSON.parse(await readFile(join(out,'source-migration-versions.json'),'utf8')));
const metadata=JSON.parse(await readFile(join(out,'private-storage-projection.json'),'utf8'));
const inventory=JSON.parse(await readFile(join(out,'source-inventory.json'),'utf8'));
const sourceSession=JSON.parse(await readFile(join(out,'source-session.json'),'utf8'));
assert.equal(sourceSession.transactionReadOnly,'on');assert(sourceSession.tls.ssl);
const defaultAcls=JSON.parse(await readFile(join(out,'source-default-acls.json'),'utf8'));
const roles=JSON.parse(await readFile(join(out,'source-roles.json'),'utf8'));
assert.equal(Math.floor(source.identity.version/10000),17);
const contract=JSON.parse(await readFile(join(here,'portability-contract.json'),'utf8'));
const pending=['20261130000100_cognito_identity_bridge.sql','20261130000200_cognito_email_compatibility.sql','20261130000300_celebrity_public_handle_auth_namespace.sql','20261130001000_aws_asset_storage.sql','20261130002000_webhook_intake.sql'].filter(f=>!versions.has(f.split('_')[0]));
const temp=await mkdtemp(join(tmpdir(),'byus-live-portability-'));await mkdir(join(temp,'socket'));
const listener=createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
const env={...process.env};for(const key of Object.keys(env))if(key.startsWith('PG'))delete env[key];
Object.assign(env,{PGHOST:join(temp,'socket'),PGPORT:String(port),PGDATABASE:'byus_live_portable',PGAPPNAME:'byus-live-portability-local-only'});
const privateWrite=(name,text)=>writeFile(join(out,name),text,{mode:0o600});
function command(program,args,options={}){const x=spawnSync(program,args,{env,encoding:'utf8',timeout:90000,maxBuffer:32*1024*1024,...options});if(x.status!==0||x.error){throw Object.assign(new Error(`Local ${program} failed; private diagnostics retained`),{diagnostic:x.stderr??x.error?.message});}return x.stdout.trim();}
const sql=(text,json=false)=>{const value=command('psql',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','schemas={public}','-v','migration_role=postgres','-v','application_roles_json=["anon","authenticated","service_role"]'],{input:text});return json?JSON.parse(value):value;};
const ident=v=>'"'+v.replaceAll('"','""')+'"',literal=v=>v===null?'null':"'"+String(v).replaceAll("'","''")+"'";
let started=false;
try{
 command('initdb',['-D',join(temp,'data'),'-A','trust','--no-instructions']);
 command('pg_ctl',['-D',join(temp,'data'),'-l',join(out,'private-local-postgres.log'),'-o',`-p ${port} -k ${join(temp,'socket')} -c listen_addresses=''`,'-w','start']);started=true;
 command('createdb',['byus_live_portable']);
 assert(sql("select inet_server_addr() is null and current_setting('server_version_num')::int/10000=17;" )==='t');
 const usedRoles=new Set(['postgres','anon','authenticated','service_role']);
 for(const acl of defaultAcls){usedRoles.add(acl.role);for(const grant of acl.grants){usedRoles.add(grant.grantor);usedRoles.add(grant.grantee);}}
 for(const object of [...source.tables,...source.routines,...source.views,...source.types,...source.sequences]){usedRoles.add(object.owner);for(const acl of object.acl??[]){usedRoles.add(acl.grantor);usedRoles.add(acl.grantee);}}
 for(const name of usedRoles){if(name==='public'||name.startsWith('pg_')||name===process.env.USER)continue;const role=roles.find(r=>r.name===name);assert(role,`Missing source role ${name}`);sql(`create role ${ident(name)} nologin ${role.bypassRls?'bypassrls':'nobypassrls'} ${role.inherit?'inherit':'noinherit'};`);}
 sql(`alter database ${ident(env.PGDATABASE)} owner to ${ident(sourceSession.databaseOwner)};`);
 sql(await readFile(join(here,'bootstrap.sql'),'utf8'));sql('grant usage on schema extensions to postgres;');
 sql(await readFile(join(here,'legacy-storage.sql'),'utf8'));
 const buckets=metadata.buckets.map(b=>`(${literal(b.id)},${literal(b.name)},${b.public===null?'null':Boolean(b.public)},${literal(b.file_size_limit)}::bigint,${b.allowed_mime_types===null?'null':`ARRAY[${b.allowed_mime_types.map(literal).join(',')}]::text[]`})`);
 const objects=metadata.objects.map(o=>`(${literal(o.id)}::uuid,${literal(o.bucket_id)},${literal(o.name)},${literal(JSON.stringify(o.metadata))}::jsonb,${literal(JSON.stringify(o.user_metadata))}::jsonb)`);
 if(buckets.length)sql(`insert into storage.buckets values ${buckets.join(',')};`);
 if(objects.length)sql(`insert into storage.objects values ${objects.join(',')};`);
 const globalDefaultSql=renderGlobalFunctionDefaults(defaultAcls);
 await privateWrite('reviewed-global-default-acls.sql',globalDefaultSql);sql(globalDefaultSql);
 const dump=join(out,'private-public-schema.dump'),toc=command('pg_restore',['--list',dump]);
 const omitted=toc.split('\n').filter(l=>l.includes(' FK CONSTRAINT ')&&l.includes(` ${contract.omittedArchiveConstraint} `));assert.equal(omitted.length,1);
 const publicSchema=toc.split('\n').filter(l=>/ SCHEMA - public /.test(l));assert.equal(publicSchema.length,1);
 await privateWrite('reviewed-toc.list',toc.split('\n').filter(l=>!omitted.includes(l)&&!publicSchema.includes(l)).join('\n'));
 command('pg_restore',['-d',env.PGDATABASE,'--exit-on-error','--use-list',join(out,'reviewed-toc.list'),dump]);
 const normalizeDefaultAcls=(rows)=>rows.map(row=>({...row,grants:row.grants.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 const restoredDefaultAcls=sql(await readFile(join(out,'default-acls.sql'),'utf8'),true);
 await privateWrite('restored-default-acls.json',JSON.stringify(restoredDefaultAcls,null,2)+'\n');
 assert.deepEqual(normalizeDefaultAcls(restoredDefaultAcls),normalizeDefaultAcls(defaultAcls),'Restored default privileges differ from actual source');
 const restored=sql(await readFile(join(here,'catalog.sql'),'utf8'),true);
 await privateWrite('restored-catalog.json',JSON.stringify(restored,null,2)+'\n');
 sql('create role legacy_auth_migrator nologin;create role webhook_replay_executor nologin;grant usage on schema storage to postgres;grant references on storage.buckets to postgres;');
 for(const file of pending)sql('set role postgres;'+await readFile(join(root,'supabase/migrations',file),'utf8'));
 sql('set role postgres;'+await readFile(join(root,'apps/web/server/auth/cognito/rds-legacy-overrides.sql'),'utf8'));
 sql(await readFile(join(here,'retire-supabase-operations.sql'),'utf8'));
 sql(await readFile(join(here,'seal-legacy-storage.sql'),'utf8'));
 const target=sql(await readFile(join(here,'catalog.sql'),'utf8'),true);
 const storage=sql(await readFile(join(here,'storage-inventory.sql'),'utf8'),true);
 await privateWrite('target-catalog.json',JSON.stringify(target,null,2)+'\n');await privateWrite('target-storage-inventory.json',JSON.stringify(storage,null,2)+'\n');
 assert.equal(hash(inventory.storageProjection),hash(storage.projection),'Live metadata projection changed or imported incorrectly');
 assert(target.routines.every(r=>r.providers.every(p=>p==='storage')),'Unported source provider reference remains');
 assert.deepEqual(target.extensions.map(e=>e.name).sort(),[...contract.requiredTargetExtensions].sort());
 assert.equal(sql("select count(*) from pg_namespace where nspname in('auth','cron','net','vault');"),'0');
 assert.equal(sql('select count(*) from public.app_users;'),'0','Customer rows must not be copied');
 assert.equal(sql("select has_schema_privilege('anon','public','USAGE') and not has_schema_privilege('anon','public','CREATE');"),'t');
 for(const statement of ['delete from storage.objects','truncate storage.buckets',"set session_replication_role=replica;update storage.objects set name='changed'"]){const x=spawnSync('psql',['-X','-q','-v','ON_ERROR_STOP=1'],{env,input:statement,encoding:'utf8'});assert.notEqual(x.status,0,'Sealed live metadata accepted mutation');}
 const tests=['cognito_identity_bridge','cognito_email_compatibility','aws_asset_storage','webhook_intake'];
 sql('alter role postgres login;');
 for(const name of tests)command('psql',['-X','-v','ON_ERROR_STOP=1','-U','postgres','-f',join(root,`supabase/tests/${name}.sql`)]);
 assert.equal(sql('select count(*) from public.app_users;'),'0','Fixture tests must roll back');
 const sourceFp=objectFingerprints(source),restoredFp=objectFingerprints(restored),targetFp=objectFingerprints(target);
 const differences=(a,b)=>[...new Set([...Object.keys(a),...Object.keys(b)])].filter(key=>a[key]!==b[key]).map(key=>({key,sourceFingerprint:a[key]??null,targetFingerprint:b[key]??null}));
 const sourceBinding=source.tables.find(t=>t.name==='mobile_email_login_bindings');
 const restoredBinding=restored.tables.find(t=>t.name==='mobile_email_login_bindings');
 assert.deepEqual(restoredBinding,{...sourceBinding,constraints:sourceBinding.constraints.filter(c=>c.name!==contract.omittedArchiveConstraint)},'Unreviewed binding-table restore change');
 const sourceView=JSON.parse(await readFile(join(out,'private-source-view.json'),'utf8'));
 const restoredView=sql("set search_path=pg_catalog;set timezone='UTC';select jsonb_build_object('definition',pg_get_viewdef('public.participation_current_sources'::regclass,true),'columns',(select jsonb_agg(jsonb_build_array(attname,format_type(atttypid,atttypmod)) order by attnum) from pg_attribute where attrelid='public.participation_current_sources'::regclass and attnum>0 and not attisdropped));",true);
 let expectedView=sourceView.definition;
 for(const literal of ['fan_passports','fan_reactions','fan_lounge_messages'])expectedView=expectedView.replace(`SELECT '${literal}'::text,`,`SELECT '${literal}'::text AS text,`);
 assert.deepEqual(restoredView,{...sourceView,definition:expectedView},'Unreviewed source view roundtrip change');
 const restoreDifferences=differences(sourceFp,restoredFp);
 assert(restoreDifferences.every(d=>['tables:public.mobile_email_login_bindings','views:public.participation_current_sources'].includes(d.key)),'Unreviewed restored source object drift');
 const evidence=[];
 const evidenceFiles={
  'metadata-import-evidence.json':{actualSource:true,source:inventory.storageProjection,target:storage.projection,exact:true},
  'metadata-seal-evidence.json':{targetInventoryFingerprint:hash(storage),ownerAndReplicaMutationRejected:true},
  'restore-evidence.json':{differences:restoreDifferences,globalAndSchemaDefaultPrivilegesPreserved:true,viewOnlyThreeUnionAliases:true,viewColumns:restoredView.columns},
  'pending-sql-evidence.json':{sourceVersionsHash:hash([...versions]),files:await Promise.all(pending.map(async file=>({file,sha256:hash(await readFile(join(root,'supabase/migrations',file),'utf8'))})))},
 };
 for(const [path,body] of Object.entries(evidenceFiles)){const text=JSON.stringify(body,null,2)+'\n';await privateWrite(path,text);evidence.push({path,sha256:hash(text)});}
 source.storageInventory={projection:inventory.storageProjection};target.storageInventory=storage;
 const manifest={format:1,localRehearsalOnly:true,environment:'prod',accountId:'996702758024',sourceIdentityHash:hash(source.identity),targetIdentityHash:hash(target.identity),evidence,objects:differences(sourceFp,targetFp).map(d=>{const colon=d.key.indexOf(':');return {kind:d.key.slice(0,colon),key:d.key.slice(colon+1),sourceFingerprint:d.sourceFingerprint,targetFingerprint:d.targetFingerprint,reason:'Measured actual-source dump restore plus five explicitly approved pending migrations and exact target-only provider replacement',evidenceSha256:evidence.map(e=>e.sha256)};}),legacyStorage:{sourceProjectionFingerprint:hash(inventory.storageProjection),targetInventoryFingerprint:hash(storage),evidenceSha256:evidence.slice(0,2).map(e=>e.sha256),references:[]}};
 for(const kind of ['tables','routines','views'])for(const object of target[kind]){
  const storageRef=kind==='tables'?object.constraints.some(c=>c.referencedSchema==='storage')||object.columns.some(c=>c.providers?.includes('storage')):object.providers.includes('storage');
  if(!storageRef)continue;
  const key=`${object.schema}.${object.name}${kind==='routines'?`(${object.arguments})`:''}`;
  manifest.legacyStorage.references.push({kind,key,sourceFingerprint:sourceFp[`${kind}:${key}`]??null,targetFingerprint:targetFp[`${kind}:${key}`]});
 }
 const reviewed=reviewPorts({environment:manifest.environment,accountId:manifest.accountId,applicationRoles:['anon','authenticated','service_role']},source,target,manifest);
 assert.equal(reviewed.unreviewed.length,0);
 // A new target-only metadata reader must also have its independently reviewed addition.
 const missingAddition=structuredClone(manifest);const newReference=missingAddition.legacyStorage.references.find(r=>r.sourceFingerprint===null);assert(newReference);
 missingAddition.objects=missingAddition.objects.filter(o=>!(o.kind===newReference.kind&&o.key===newReference.key));
 assert.throws(()=>reviewPorts({environment:'prod',accountId:'996702758024',applicationRoles:['anon','authenticated','service_role']},source,target,missingAddition),/reference fingerprint/);
 await privateWrite('local-port-manifest.json',JSON.stringify(manifest,null,2)+'\n');
 const report={sourceReadOnly:true,sourceVersion:source.identity.version,sourceMigrationVersions:versions.size,publicCustomerRowsCopied:false,sourceDdlFrozen:false,sourceTransactionsConsistentSnapshot:false,sourcePublicTables:source.tables.length,sourcePublicRoutines:source.routines.length,restoredTables:restored.tables.length,targetTables:target.tables.length,targetRoutines:target.routines.length,pendingApplied:pending,requiredLocalRoleNames:[...usedRoles].sort(),metadataProjection:storage.projection,metadataExact:true,metadataSealed:true,defaultPrivilegesPreserved:true,targetSqlTests:tests,targetExtensions:target.extensions,remainingProviderReferences:target.routines.filter(r=>r.providers.length).map(r=>({name:r.name,providers:r.providers})),restoreFingerprintDifferences:restoreDifferences,pendingAndPortFingerprintDifferences:differences(restoredFp,targetFp),rdsValidated:false,logicalReplicationTested:false};
 await privateWrite('report.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({liveSourceSchemaPortability:'passed',reportPath:join(out,'report.json'),tables:target.tables.length,routines:target.routines.length,pendingApplied:pending.length,metadataObjects:metadata.objects.length,restoreDriftObjects:report.restoreFingerprintDifferences.length}));
}catch(error){await privateWrite('private-local-errors.log',String(error.diagnostic??error.stack)+'\n');throw new Error('Live schema portability failed; inspect private-local-errors.log');}
finally{if(started)spawnSync('pg_ctl',['-D',join(temp,'data'),'-m','immediate','-w','stop'],{env,stdio:'ignore'});await rm(temp,{recursive:true,force:true});for(const name of ['private-local-postgres.log'])try{await chmod(join(out,name),0o600);}catch{/* pg_ctl may fail before creating log */}}
