#!/usr/bin/env node
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {Database,hash,ident,literal,validateConfig,verifyIdentity,readState,guardStatus,auditDatabase,persist} from './aws-db-migrate.mjs';
import {DmsAdapter,remainingBudget,checksumSql} from './aws-db-dms-adapter.mjs';
import {normalizeLegacyInventory,normalizeUnownedInventory} from '../apps/web/server/auth/cognito/backfill.mjs';
export const IDENTITY_IMPORT_ROLE='byus_identity_migrator';
export const IDENTITY_IMPORT_TABLES=['legacy_email_credentials','legacy_auth_inventory_runs','legacy_auth_inventory_owners','legacy_auth_inventory_accounts','legacy_auth_inventory_unowned'];
const fail=m=>{throw new Error(m);};
export const ownerProjectionSql="select coalesce(jsonb_agg(jsonb_build_object('id',id,'privy_user_id',privy_user_id,'status',status,'verified_email',verified_email) order by id),'[]') from public.app_users;";
export function identityRoleCheck(c,target,sealed){
 const role=literal(IDENTITY_IMPORT_ROLE),tables=IDENTITY_IMPORT_TABLES.map(literal).join(',');
 const r=target.run(`with importer as(select * from pg_roles where rolname=${role}) select jsonb_build_object(
 'login',(select rolcanlogin from importer),'unsafe',exists(select from importer where rolsuper or rolcreaterole or rolcreatedb or rolreplication or not rolbypassrls or has_parameter_privilege(oid,'session_replication_role','SET')),
 'memberships',(select count(*) from pg_auth_members m join importer i on m.member=i.oid or (m.roleid=i.oid and (m.inherit_option or m.set_option or m.member<>(select oid from pg_roles where rolname=${literal(c.target.migrationRole)})))),
 'schemaCreate',exists(select from pg_namespace n where n.nspname !~ '^pg_' and n.nspname<>'information_schema' and has_schema_privilege(${role},n.oid,'CREATE')),
 'owns',exists(select from pg_class c join importer i on c.relowner=i.oid) or exists(select from pg_proc p join importer i on p.proowner=i.oid),
 'otherWrites',exists(select from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in('r','p','v','f') and n.nspname !~ '^pg_' and n.nspname<>'information_schema' and (n.nspname<>'public' or c.relname not in(${tables})) and has_table_privilege(${role},c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')),
 'dangerousPrivileges',exists(select from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in(${tables}) and has_table_privilege(${role},c.oid,'TRIGGER,TRUNCATE')),
 'exactAccess',(select count(*)=20 and bool_and(has_table_privilege(${role},c.oid,p.privilege)) from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join unnest(array['SELECT','INSERT','UPDATE','DELETE']) p(privilege) where n.nspname='public' and c.relname in(${tables}) and c.relkind='r'),
 'sessions',(select count(*) from pg_stat_activity where usename=${role} and datname=current_database()));`);
 if(r.login!==!sealed||r.unsafe||r.memberships!==0||r.schemaCreate||r.owns||r.otherWrites||r.dangerousPrivileges||r.exactAccess!==true||(sealed&&r.sessions!==0))fail('Identity import role isolation/seal invalid');
 return r;
}
export async function identityTableProof(target){
 const result=[];
 for(const name of IDENTITY_IMPORT_TABLES){const columns=target.run(`select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod)) order by a.attnum) from pg_attribute a where a.attrelid=${literal('public.'+name)}::regclass and a.attnum>0 and not a.attisdropped;`),pk=target.run(`select jsonb_agg(a.attname order by k.ord) from pg_index i cross join lateral unnest(i.indkey) with ordinality k(attnum,ord) join pg_attribute a on a.attrelid=i.indrelid and a.attnum=k.attnum where i.indrelid=${literal('public.'+name)}::regclass and i.indisprimary;`);
  const chunks=target.run(checksumSql({schema:'public',name,primaryKey:pk,columns}));result.push({table:'public.'+name,rows:chunks.reduce((sum,x)=>sum+Number(x.rows),0),sha256:hash(chunks)});
 }
 return result;
}
export function validateIdentityReceipt(r,{c,state,source,target,creating=false}){
 if(!creating){const proof=state.dmsIdentityImportCompleted;if(!proof||proof.sha256!==hash(JSON.stringify(r,null,2)+'\n')||!state.events?.some(e=>e.identityImportReceiptSha256===proof.sha256))fail('Identity receipt is not bound to the actual sealed import');}
 if(r.format!==1||r.engine!=='dms'||r.runId!==c.runId||r.accountId!==c.accountId||r.environment!==c.environment||r.fencedAt!==state.fencedAt||r.sourceIdentityHash!==hash(source.identity)||r.targetIdentityHash!==hash(target.identity)||r.sourceCatalogHash!==state.catalogHash||r.targetCatalogHash!==state.targetCatalogHash||r.sourceGuardHash!==state.sourceGuardHash||r.authGuardHash!==state.dmsAuthGuardHash||r.authSafetyHash!==state.dmsAuthSafetyHash||r.authTriggerHash!==state.dmsAuthTriggerHash||r.authReviewHash!==state.dmsAuthReviewHash||r.authSessionProofHash!==hash(state.dmsAuthSessionProof)||r.targetGuardHash!==state.targetGuardHash||r.basePortReviewSha256!==c.portReviewSha256||!state.dmsStorageImportClosedAt||r.importsClosedAt!==state.dmsStorageImportClosedAt||r.inflightImporters!==0||r.ownerCoverage!==true||r.explicitUuidBindings!==true||r.sourceSnapshotConsistent!==true)fail('Identity receipt identity/fence/snapshot binding differs');
 if(source.catalogHash!==state.catalogHash||![state.targetCatalogHash,state.dmsCopyCatalogHash].includes(target.catalogHash))fail('Identity source/target catalog changed');
 const observed=Date.parse(r.observedAt),closed=Date.parse(r.importsClosedAt);
 if(!Number.isFinite(observed)||observed<closed||closed<state.fencedAt||observed>Date.now()+5000||!['sourceSnapshotHash','sourceOwnersHash','credentialHash','bindingsHash','privyExportSha256','artifactSha256'].every(k=>/^[a-f0-9]{64}$/.test(r[k]??'')))fail('Identity receipt snapshot/hash/seal missing');
 if(!Array.isArray(r.tables)||r.tables.length!==5||new Set(r.tables.map(x=>x.table)).size!==5||r.tables.some(x=>!IDENTITY_IMPORT_TABLES.map(n=>'public.'+n).includes(x.table)||!Number.isSafeInteger(x.rows)||x.rows<0||!/^[a-f0-9]{64}$/.test(x.sha256)))fail('Identity receipt must prove exact five tables');
 for(const row of r.tables){const t=target.tables.find(t=>'public.'+t.name===row.table&&t.schema==='public');if(!t||String(t.rowCount)!==String(row.rows))fail('Identity receipt row count changed');}
 return r;
}
export function buildIdentityArtifact(snapshot,users,privyExportSha256){
 if(!snapshot.snapshot||!Array.isArray(snapshot.owners)||!Array.isArray(snapshot.bindings)||!Array.isArray(snapshot.credentials))fail('Consistent identity snapshot required');
 const owners=normalizeLegacyInventory(users,snapshot.owners),unownedUsers=normalizeUnownedInventory(users,snapshot.owners);
 const byOwner=new Map(snapshot.owners.map(x=>[x.id,x])),byCredential=new Map(snapshot.credentials.map(x=>[x.id,x])),seen=new Set();
 for(const b of snapshot.bindings){if(seen.has(b.supabase_user_id)||!byOwner.has(b.app_user_id)||!byCredential.has(b.supabase_user_id))fail('Explicit UUID binding owner/credential missing or duplicated');seen.add(b.supabase_user_id);}
 const byLegacy=new Map(snapshot.bindings.map(b=>[b.supabase_user_id,b]));
 const credentials=snapshot.credentials.filter(x=>x.email).map(x=>{const b=byLegacy.get(x.id),owner=byOwner.get(b?.app_user_id);if(b&&x.email.trim().toLowerCase()!==owner.verified_email)fail('Bound credential owner email differs');return {legacy_user_id:x.id,app_user_id:b?.app_user_id??null,email:x.email.trim().toLowerCase(),encrypted_password:x.encrypted_password??'',email_confirmed_at:x.email_confirmed_at,banned_until:x.banned_until,deleted_at:x.deleted_at,enabled:!!(b?.enabled&&owner?.status==='active')};});
 return {inventoryRunId:randomUUID(),privyExportSha256,sourceSnapshotHash:hash(snapshot),sourceOwnersHash:hash(snapshot.owners),credentialHash:hash(snapshot.credentials),bindingsHash:hash(snapshot.bindings),owners,unownedUsers,expectedPrivyUserCount:users.length,credentials};
}
export function identityImportSql(a){
 const artifactSha256=hash(a),id=literal(a.inventoryRunId),j=v=>literal(JSON.stringify(v))+'::jsonb';
 let sql="begin;select _byus_migration.begin_identity_import();";
 const batches=values=>Array.from({length:Math.max(1,Math.ceil(values.length/1000))},(_,i)=>values.slice(i*1000,i*1000+1000));
 for(const batch of batches(a.owners))sql+=`select public.import_cognito_legacy_inventory(${id}::uuid,${literal(artifactSha256)},${a.owners.length},${j(batch)});`;
 for(const batch of batches(a.unownedUsers))sql+=`select public.import_cognito_unowned_inventory(${id}::uuid,${a.expectedPrivyUserCount},${j(batch)});`;
 sql+=`insert into public.legacy_email_credentials(legacy_user_id,app_user_id,email,encrypted_password,email_confirmed_at,banned_until,deleted_at,enabled) select legacy_user_id,app_user_id,email,encrypted_password,email_confirmed_at,banned_until,deleted_at,enabled from jsonb_populate_recordset(null::public.legacy_email_credentials,${j(a.credentials)});select public.complete_cognito_legacy_inventory(${id}::uuid);commit;`;
 return sql;
}
export function readIdentitySnapshot(source){
 return source.run(`begin isolation level repeatable read read only;set local timezone='UTC';select jsonb_build_object('snapshot',pg_current_snapshot()::text,'owners',(${ownerProjectionSql.slice(0,-1)}),'bindings',(select coalesce(jsonb_agg(to_jsonb(b) order by supabase_user_id),'[]') from public.mobile_email_login_bindings b),'credentials',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'email',email,'encrypted_password',encrypted_password,'email_confirmed_at',email_confirmed_at,'banned_until',banned_until,'deleted_at',deleted_at) order by id),'[]') from auth.users));commit;`);
}
export function verifyIdentityData(target,a){
 const actual=target.run(`set timezone='UTC';select jsonb_build_object(
 'credentials',(select coalesce(jsonb_agg(to_jsonb(c)-'imported_at' order by legacy_user_id),'[]') from public.legacy_email_credentials c),
 'owners',(select coalesce(jsonb_agg(to_jsonb(o)-'run_id' order by app_user_id),'[]') from public.legacy_auth_inventory_owners o),
 'accounts',(select coalesce(jsonb_agg(to_jsonb(x)-'run_id' order by provider_issuer collate "C",provider_subject collate "C"),'[]') from public.legacy_auth_inventory_accounts x),
 'unowned',(select coalesce(jsonb_agg(to_jsonb(u)-'run_id' order by privy_user_id collate "C"),'[]') from public.legacy_auth_inventory_unowned u),
 'runs',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'artifact_sha256',artifact_sha256,'expected_owner_count',expected_owner_count,'expected_privy_user_count',expected_privy_user_count,'completed',completed_at is not null)),'[]') from public.legacy_auth_inventory_runs));`);
 const compare=(a,b)=>a<b?-1:a>b?1:0;
 const expected={credentials:a.credentials,owners:a.owners.map(o=>({app_user_id:o.appUserId,privy_user_id:o.privyUserId})),accounts:a.owners.flatMap(o=>o.accounts.map(x=>({app_user_id:o.appUserId,provider_issuer:x.issuer,provider_subject:x.subject}))).sort((a,b)=>compare(a.provider_issuer,b.provider_issuer)||compare(a.provider_subject,b.provider_subject)),unowned:a.unownedUsers.map(u=>({privy_user_id:u.privyUserId,accounts:u.accounts,emails:u.emails})).sort((a,b)=>compare(a.privy_user_id,b.privy_user_id)),runs:[{id:a.inventoryRunId,artifact_sha256:hash(a),expected_owner_count:a.owners.length,expected_privy_user_count:a.expectedPrivyUserCount,completed:true}]};
 if(!isDeepStrictEqual(actual,expected))fail('Imported identity data differs from source snapshot and explicit UUID inventory');
 return true;
}
export async function importIdentity({c,state,source,target,importer,users,privyExportSha256,artifactPath,receiptPath,adapter}){
 if(c.engine!=='dms'||state.phase!=='fenced'||!state.dmsIdentityImport)fail('Identity import requires fenced DMS preparation');
 if(state.dmsFinalIdentityReceipt||state.dmsStorageImportClosedAt)fail('Identity import is already sealed');
 identityRoleCheck(c,target,false);await adapter.authTriggers(true);
 for(const [side,db,expectedHash] of [['source',source,state.sourceGuardHash],['target',target,state.targetGuardHash]]){
  const audit=await auditDatabase(db),status=guardStatus(c,db);
  if(status.fenced!==true||status.firstWriteAt||status.functionHash!==expectedHash||hash([...status.tables].sort())!==hash(audit.tables.map(t=>t.schema+'.'+t.name).sort())||(side==='source'?audit.catalogHash!==state.catalogHash:![state.targetCatalogHash,state.dmsCopyCatalogHash].includes(audit.catalogHash)))fail('Identity source/target guard or catalog changed');
  const guards=db.run(`select count(*)::int from pg_trigger tr join pg_class cl on cl.oid=tr.tgrelid join pg_namespace n on n.oid=cl.relnamespace where n.nspname in(${c.schemas.map(literal).join(',')}) and tr.tgname='byus_migration_guard' and tr.tgfoid='_byus_migration.guard()'::regprocedure and tr.tgtype=62 and tr.tgenabled='A';`);
  if(guards!==audit.tables.length)fail('Identity source/target ALWAYS guard changed');
 }
 const snapshot=readIdentitySnapshot(source);
 const artifact=buildIdentityArtifact(snapshot,users,privyExportSha256);
 await writeFile(artifactPath,JSON.stringify(artifact),{mode:0o600,flag:'wx'});
 while(hash(target.run(ownerProjectionSql))!==artifact.sourceOwnersHash){remainingBudget(c,state);await new Promise(r=>setTimeout(r,100));}
 for(const name of IDENTITY_IMPORT_TABLES)if(target.run(`select count(*)::int from public.${ident(name)};`)!==0)fail('Identity target must be empty before dedicated final import');
 const logging=importer.run("select jsonb_build_object('audit',current_setting('pgaudit.log',true),'statements',current_setting('pg_stat_statements.track',true),'logStatement',current_setting('log_statement'),'logErrors',current_setting('log_min_error_statement'),'logParameters',current_setting('log_parameter_max_length_on_error'),'duration',current_setting('log_min_duration_statement'),'sample',current_setting('log_min_duration_sample'),'explain',current_setting('auto_explain.log_min_duration',true),'auditRole',current_setting('pgaudit.role',true));");
 if((logging.audit&&logging.audit!=='none')||(logging.statements&&logging.statements!=='none')||logging.logStatement!=='none'||logging.logErrors!=='panic'||logging.logParameters!=='0'||logging.duration!=='-1'||logging.sample!=='-1'||(logging.explain&&logging.explain!=='-1')||logging.auditRole)fail('Identity import requires credential-safe audit logging');
 importer.run(identityImportSql(artifact),{json:false});
 await adapter.sealStorageImport();await adapter.authTriggers(true);verifyIdentityData(target,artifact);
 if(hash(source.run(ownerProjectionSql))!==artifact.sourceOwnersHash)fail('Source identity owner projection changed');
 const repeat=readIdentitySnapshot(source);
 if(hash(repeat.bindings)!==artifact.bindingsHash||hash(repeat.credentials)!==artifact.credentialHash)fail('Fenced source credential/binding snapshot changed');
 const r={format:1,engine:'dms',runId:c.runId,accountId:c.accountId,environment:c.environment,fencedAt:state.fencedAt,importsClosedAt:state.dmsStorageImportClosedAt,observedAt:new Date().toISOString(),sourceIdentityHash:hash(source.identity()),targetIdentityHash:hash(target.identity()),sourceCatalogHash:state.catalogHash,targetCatalogHash:state.targetCatalogHash,sourceGuardHash:state.sourceGuardHash,authGuardHash:state.dmsAuthGuardHash,authSafetyHash:state.dmsAuthSafetyHash,authTriggerHash:state.dmsAuthTriggerHash,authReviewHash:state.dmsAuthReviewHash,authSessionProofHash:hash(state.dmsAuthSessionProof),targetGuardHash:state.targetGuardHash,basePortReviewSha256:c.portReviewSha256,sourceSnapshotHash:artifact.sourceSnapshotHash,sourceOwnersHash:artifact.sourceOwnersHash,credentialHash:artifact.credentialHash,bindingsHash:artifact.bindingsHash,privyExportSha256,artifactSha256:hash(artifact),ownerCoverage:true,explicitUuidBindings:true,sourceSnapshotConsistent:true,inflightImporters:0,tables:await identityTableProof(target)};
 validateIdentityReceipt(r,{c,state,source:await auditDatabase(source),target:await auditDatabase(target),creating:true});
 const body=JSON.stringify(r,null,2)+'\n';await writeFile(receiptPath,body,{mode:0o600,flag:'wx'});
 state.dmsIdentityImportCompleted={path:resolve(receiptPath),sha256:hash(body)};await adapter.checkpoint({identityImportReceiptSha256:hash(body)});return r;
}
async function main(){
 const args=process.argv.slice(2),f={};for(let i=0;i<args.length;i++){const k=args[i];if(!['--config','--ledger','--privy-export','--privy-sha256','--artifact','--receipt','--import-env','--apply'].includes(k)||Object.hasOwn(f,k))fail('Unknown/duplicate identity import option');f[k]=k==='--apply'?true:args[++i];}
 for(const k of ['--config','--ledger','--privy-export','--privy-sha256','--artifact','--receipt','--import-env'])if(!f[k])fail('Explicit identity import inputs required');
 if(!f['--apply'])fail('Identity import requires explicit --apply');
 const c=validateConfig(JSON.parse(await readFile(resolve(f['--config']),'utf8')));
 if(['source','target'].some(side=>!/^\d+$/.test(c[side].identity.databaseOid??'')))fail('Identity import requires pinned database OIDs');
 const state=await readState(resolve(f['--ledger']),c),file=resolve(f['--privy-export']);
 if((await stat(file)).mode&0o077)fail('Privy export must be private 0600');const raw=await readFile(file,'utf8');if(hash(raw)!==f['--privy-sha256'])fail('Privy export SHA256 differs');
 const users=JSON.parse(raw);if(!Array.isArray(users))fail('Privy export must be exact users array');
 let source,target,importer;
 try{
 source=await Database.open(c,'source');target=await Database.open(c,'target');for(const [side,db] of [['source',source],['target',target]])verifyIdentity(c[side].identity,db.identity());
 const ic=structuredClone(c);ic.target.migrationRole=IDENTITY_IMPORT_ROLE;ic.target.identity.sessionUser=IDENTITY_IMPORT_ROLE;ic.target.connectionEnv=f['--import-env'];importer=await Database.open(ic,'target');verifyIdentity(ic.target.identity,importer.identity());
 const adapter=new DmsAdapter({c,state,source,target,aws:()=>fail('Identity import performs no AWS calls'),checkpoint:detail=>persist(resolve(f['--ledger']),state,state.phase,detail)});adapter.bind();importer.budget=()=>remainingBudget(c,state);
 for(const k of ['--artifact','--receipt'])await mkdir(dirname(resolve(f[k])),{recursive:true,mode:0o700});
 const receipt=await importIdentity({c,state,source,target,importer,users,privyExportSha256:f['--privy-sha256'],artifactPath:resolve(f['--artifact']),receiptPath:resolve(f['--receipt']),adapter});
 console.log(JSON.stringify({imported:true,tables:receipt.tables,receiptSha256:hash(JSON.stringify(receipt,null,2)+'\n')}));
 }finally{for(const db of [source,target,importer])if(db)await db.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Identity import failed; private artifacts and database fences retained');process.exitCode=1;});
