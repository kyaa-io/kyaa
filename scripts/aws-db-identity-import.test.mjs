import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync,spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {Database,hash,guardSql,guardStatus,auditDatabase,validateWritePausedAt,assertAbortAllowed,readState,persist,runAtomicFence} from './aws-db-migrate.mjs';
import {DmsAdapter,remainingBudget,authSafetyInventory} from './aws-db-dms-adapter.mjs';
import {IDENTITY_IMPORT_TABLES,IDENTITY_IMPORT_ROLE,buildIdentityArtifact,identityRoleCheck,identityTableProof,validateIdentityReceipt,importIdentity} from './aws-db-identity-import.mjs';
const root=new URL('../',import.meta.url);
test('actual first write pause bounds include pre-audit time and reject missing, future, exact 300-second expiry',()=>{
 const c={timeoutSeconds:300},now=Date.parse('2026-10-24T01:00:00Z');
 assert.equal(validateWritePausedAt(new Date(now-299999).toISOString(),c,now),now-299999);
 for(const v of [undefined,'invalid',new Date(now+1).toISOString(),new Date(now-300000).toISOString()])assert.throws(()=>validateWritePausedAt(v,c,now),/writePausedAt/);
 assert.throws(()=>validateWritePausedAt(new Date(now-1000).toISOString(),c,now,new Date(now-2000).toISOString()),/writePausedAt/);
 assert.throws(()=>remainingBudget({timeoutSeconds:300,dms:{rollbackReserveSeconds:30}},{fencedAt:now-300000},{now,rollback:true}));
});
test('UUID binding never inferred from matching email and malformed explicit bindings fail',()=>{
 const id='11111111-1111-4111-8111-111111111111',legacy='22222222-2222-4222-8222-222222222222';
 const snapshot={snapshot:'1:1:',owners:[{id,privy_user_id:'did:privy:one',status:'active',verified_email:'synthetic@example.test'}],bindings:[],credentials:[{id:legacy,email:'synthetic@example.test'}]},users=[{id:'did:privy:one',linked_accounts:[]}];
 assert.equal(buildIdentityArtifact(snapshot,users,'a'.repeat(64)).credentials[0].app_user_id,null);
 snapshot.bindings=[{app_user_id:'missing',supabase_user_id:legacy}];assert.throws(()=>buildIdentityArtifact(snapshot,users,'a'.repeat(64)),/binding/);
});
test('PostgreSQL 17: exact identity import, reviewed source ORIGIN fence, dual-role seal/drain and tamper rechecks',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'byus-identity-')),env={...process.env,PATH:'/opt/homebrew/opt/postgresql@17/bin:'+process.env.PATH};
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
 Object.assign(env,{PGHOST:'127.0.0.1',PGPORT:String(port),PGUSER:process.env.USER});
 const run=(cmd,args,options={})=>{const r=spawnSync(cmd,args,{env,encoding:'utf8',...options});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
 const psql=(db,user,sql)=>run('psql',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-d',db,'-U',user],{input:sql});
 const id='11111111-1111-4111-8111-111111111111',legacy='22222222-2222-4222-8222-222222222222';
 let started=false,source,target,importer;
 try{
 run('initdb',['-D',join(dir,'pg'),'-A','trust','--no-locale','-E','UTF8']);run('pg_ctl',['-D',join(dir,'pg'),'-l',join(dir,'pg.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start']);started=true;
 psql('postgres',process.env.USER,'create role identity_operator login createrole;create role source_operator login createrole;grant pg_signal_backend,pg_read_all_stats to source_operator;create role app_login login;create role service_role;create role dms_apply_login login;create role supabase_auth_admin createrole;create role authenticator;');
 const c={region:'ap-northeast-2',profile:'local-only',writers:['web'],engine:'dms',localRehearsal:true,runId:'identity_test',accountId:'111111111111',environment:'dev',schemas:['public'],applicationRoles:['app_login'],timeoutSeconds:300,portReviewSha256:'a'.repeat(64),dms:{sourceRole:'dms_source_login',targetRole:'dms_apply_login',replicationInstanceArn:'arn:aws:dms:ap-northeast-2:111111111111:rep:TEST',sourceEndpointArn:'arn:aws:dms:ap-northeast-2:111111111111:endpoint:SOURCE',targetEndpointArn:'arn:aws:dms:ap-northeast-2:111111111111:endpoint:TARGET',sourceCertificateArn:'arn:aws:dms:ap-northeast-2:111111111111:cert:SOURCE',targetCertificateArn:'arn:aws:dms:ap-northeast-2:111111111111:cert:TARGET',rollbackReserveSeconds:3}};
 const owners=`create table public.app_users(id uuid primary key,privy_user_id text not null,status text,verified_email text);create table public.mobile_email_login_bindings(supabase_user_id uuid primary key,app_user_id uuid references public.app_users(id),enabled boolean);insert into public.app_users values('${id}','did:privy:one','active','synthetic@example.test');insert into public.mobile_email_login_bindings values('${legacy}','${id}',true);grant select,insert,update,delete on public.app_users,public.mobile_email_login_bindings to app_login;`;
 const bridge=await readFile(new URL('supabase/migrations/20261130000100_cognito_identity_bridge.sql',root),'utf8'),email=await readFile(new URL('supabase/migrations/20261130000200_cognito_email_compatibility.sql',root),'utf8');
 const tableSql=bridge.slice(bridge.indexOf('create table public.legacy_auth_inventory_runs'),bridge.indexOf('alter table public.legacy_auth_inventory_unowned'));
 const fn=name=>{const start=bridge.indexOf('create function public.'+name+'(');return bridge.slice(start,bridge.indexOf('$$;',start)+3);};
 for(const side of ['source','target']){
  const db='identity_'+side,role=side==='source'?'source_operator':'identity_operator';run('createdb',['-O',role,db]);c[side]={host:'127.0.0.1',migrationRole:role,connectionEnv:'IDENTITY_TEST_'+side.toUpperCase(),identity:{database:db,sessionUser:role,serverAddress:'127.0.0.1',serverPort:port}};
  process.env[c[side].connectionEnv]=`postgresql://${role}:synthetic@127.0.0.1:${port}/${db}`;
  psql(db,role,owners);
 }
 psql(c.source.identity.database,'source_operator',`create schema auth;create table auth.users(id uuid primary key,email text,encrypted_password text,email_confirmed_at timestamptz,banned_until timestamptz,deleted_at timestamptz);insert into auth.users values('${legacy}','synthetic@example.test','$2b$synthetic',now(),null,null);grant usage on schema auth to app_login;grant select,update on auth.users to app_login;`);
 const targetSchema=tableSql+email.slice(email.indexOf('create table public.legacy_email_credentials'),email.indexOf('alter table public.legacy_email_credentials'))+fn('import_cognito_legacy_inventory')+fn('import_cognito_unowned_inventory')+fn('complete_cognito_legacy_inventory')+"create table public.s3_storage_objects(id text primary key);create table public.s3_storage_delete_outbox(id text primary key);create table public.s3_storage_migration_objects(id text primary key);";
 psql(c.source.identity.database,process.env.USER,'alter table auth.users owner to supabase_auth_admin;grant select,update,trigger on auth.users to source_operator;');
 psql(c.target.identity.database,'identity_operator',targetSchema);
 psql(c.target.identity.database,process.env.USER,await readFile(new URL('infrastructure/aws/database/dms-copy/identity-import-role.sql',root),'utf8')+"grant byus_identity_migrator to identity_operator with admin true,inherit false,set false;create role byus_storage_migrator login bypassrls;grant byus_storage_migrator to identity_operator with admin true,inherit false,set false;grant usage on schema public to byus_storage_migrator;grant select,insert,update,delete on public.s3_storage_objects,public.s3_storage_delete_outbox,public.s3_storage_migration_objects to byus_storage_migrator;");
 // Model a managed privileged operator without giving runtime actors its capabilities.
 psql(c.source.identity.database,process.env.USER,`create role managed_privileged;grant managed_privileged to source_operator;grant set on parameter session_replication_role to source_operator;alter database identity_source set "supautils.privileged_role"='managed_privileged';alter database identity_source set "supautils.privileged_role_allowed_configs"='session_replication_role';`);
 psql(c.source.identity.database,'source_operator',"create function public.reviewed_operator_function() returns int language sql security definer set search_path=pg_catalog as $$ select 1 $$;revoke execute on function public.reviewed_operator_function() from public;grant execute on function public.reviewed_operator_function() to app_login;");
 source=await Database.open(c,'source');target=await Database.open(c,'target');await source.reuseConnection();await target.reuseConnection();
 const s=await auditDatabase(source),t=await auditDatabase(target),state={phase:'fenced',events:[],runId:c.runId,fencedAt:Date.now(),catalogHash:s.catalogHash,targetCatalogHash:t.catalogHash,dmsIdentityImport:true};
 source.run(guardSql(c,'source',s),{json:false});target.run(guardSql(c,'target',t),{json:false});state.sourceGuardHash=guardStatus(c,source).functionHash;state.targetGuardHash=guardStatus(c,target).functionHash;
 const authReview={format:1,runId:c.runId,sourceIdentityHash:hash(source.identity()),operatorDdlFreezeRole:c.source.migrationRole,operatorAliases:[],ddlFreezeRoles:[process.env.USER],authOwner:'supabase_auth_admin',inventorySha256:hash(await authSafetyInventory(c,source,[process.env.USER])),reason:'Reviewed disposable synthetic roles, defaults and routine/trigger metadata'};
 c.dms.authFenceReviewFile=join(dir,'auth-review.json');const reviewText=JSON.stringify(authReview);await writeFile(c.dms.authFenceReviewFile,reviewText,{mode:0o600});c.dms.authFenceReviewSha256=hash(reviewText);
 const adapter=new DmsAdapter({c,source,target,state,checkpoint:detail=>persist(join(dir,'direct-ledger.json'),state,state.phase,detail),aws:()=>{throw new Error('No cloud');}});adapter.bind();await adapter.prepareAuth();
 // A connection that previously acquired replica mode stays dangerous after ACL revocation; drain its original PID.
 psql(c.source.identity.database,process.env.USER,'grant set on parameter session_replication_role to app_login;');
 const stale=spawn('psql',['-X','-q','-v','ON_ERROR_STOP=1','-d',c.source.identity.database,'-U','app_login'],{env,stdio:['pipe','ignore','ignore']}),staleExit=new Promise(r=>stale.on('exit',r));stale.stdin.end('set session_replication_role=replica;select pg_sleep(30);');
 const staleDeadline=Date.now()+10000;while(psql(c.source.identity.database,process.env.USER,"select count(*) from pg_stat_activity where usename='app_login' and wait_event='PgSleep';")!=='1'){assert(Date.now()<staleDeadline);await new Promise(r=>setTimeout(r,20));}
 psql(c.source.identity.database,process.env.USER,'revoke set on parameter session_replication_role from app_login;');
 source.run(await adapter.fenceSql('begin;commit;'),{json:false});assert.notEqual(await staleExit,0);assert.equal(state.dmsAuthSessionProof.oldSessionCount,1);assert.equal(state.dmsAuthSessionProof.operatorOrigin,true);assert.equal(state.dmsAuthSessionProof.runtimeReplicaCapabilitySafe,true);assert.equal(state.dmsAuthSessionProof.runtimeSafetyHash,state.dmsAuthSessionProof.safetyHash);assert.equal(state.dmsAuthSessionProof.operatorReplicaSetDenied,undefined);state.dmsStorageShapeHash='synthetic';source.run("create table _byus_migration.storage_fence(singleton boolean,run_id text,fenced boolean);insert into _byus_migration.storage_fence values(true,'identity_test',true);",{json:false});
 const currentProof=structuredClone(state.dmsAuthSessionProof);state.dmsAuthSessionProof={...currentProof,runtimeReplicaCapabilitySafe:undefined,operatorReplicaSetDenied:true};await assert.rejects(adapter.authTriggers(true),/drain/);state.dmsAuthSessionProof=currentProof;
 for(const membership of ['inherit false,set true','admin true,inherit false,set false']){psql(c.source.identity.database,process.env.USER,`grant managed_privileged to app_login with ${membership};`);await assert.rejects(adapter.authTriggers(true),/privilege/);psql(c.source.identity.database,process.env.USER,'revoke managed_privileged from app_login;');}
 psql(c.source.identity.database,'source_operator',"create or replace function public.reviewed_operator_function() returns int language sql security definer set search_path=pg_catalog as $$ select 2 $$;");await assert.rejects(adapter.authTriggers(true),/privilege/);psql(c.source.identity.database,'source_operator',"create or replace function public.reviewed_operator_function() returns int language sql security definer set search_path=pg_catalog as $$ select 1 $$;");
 psql(c.source.identity.database,'source_operator','revoke execute on function public.reviewed_operator_function() from app_login;');await assert.rejects(adapter.authTriggers(true),/privilege/);psql(c.source.identity.database,'source_operator','grant execute on function public.reviewed_operator_function() to app_login;');
 psql(c.source.identity.database,'source_operator','alter function public.reviewed_operator_function() set search_path=public;');await assert.rejects(adapter.authTriggers(true),/privilege/);psql(c.source.identity.database,'source_operator','alter function public.reviewed_operator_function() set search_path=pg_catalog;');
 await adapter.authTriggers(true);
 // The operator cannot enable ALWAYS; the reviewed origin guard and role ACL reject ordinary writers.
 const deny=(db,user,sql)=>{const r=spawnSync('psql',['-X','-q','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-d',db,'-U',user],{env,input:sql,encoding:'utf8'});assert.notEqual(r.status,0);return r;};
 assert.match(deny(c.source.identity.database,'app_login',`update auth.users set encrypted_password='changed' where id='${legacy}';`).stderr,/55000/);assert.match(deny(c.source.identity.database,'source_operator',`update auth.users set encrypted_password='changed' where id='${legacy}';`).stderr,/55000/);
 deny(c.source.identity.database,'app_login','set session_replication_role=replica;');deny(c.source.identity.database,'source_operator','alter table auth.users enable always trigger byus_auth_migration_guard;');
 psql(c.source.identity.database,process.env.USER,'grant set on parameter session_replication_role to app_login;');await assert.rejects(adapter.authTriggers(true),/privilege/);psql(c.source.identity.database,process.env.USER,'revoke set on parameter session_replication_role from app_login;');
 psql(c.source.identity.database,process.env.USER,"alter role app_login set session_replication_role='replica';");await assert.rejects(adapter.authTriggers(true),/privilege/);psql(c.source.identity.database,process.env.USER,'alter role app_login reset session_replication_role;');
 psql(c.source.identity.database,process.env.USER,'grant source_operator to app_login with admin true,inherit false,set false;');await assert.rejects(adapter.authTriggers(true),/alias graph/);psql(c.source.identity.database,process.env.USER,'revoke source_operator from app_login;');
 psql(c.source.identity.database,process.env.USER,"create function public.unsafe_auth_replica() returns void language plpgsql security definer as $$ begin perform set_config('session_replication_role','replica',false);end $$;");await assert.rejects(adapter.authTriggers(true),/privilege/);psql(c.source.identity.database,process.env.USER,'drop function public.unsafe_auth_replica();');
 psql(c.source.identity.database,process.env.USER,"create function public.ordinary_auth_writer() returns void language sql security definer as $$ update auth.users set encrypted_password=encrypted_password $$;alter function public.ordinary_auth_writer() owner to supabase_auth_admin;");await assert.rejects(adapter.authTriggers(true),/privilege/);psql(c.source.identity.database,process.env.USER,'drop function public.ordinary_auth_writer();');
 psql(c.source.identity.database,process.env.USER,'grant update on _byus_migration.auth_fence to app_login;');await assert.rejects(adapter.authTriggers(true),/control/);psql(c.source.identity.database,process.env.USER,'revoke update on _byus_migration.auth_fence from app_login;');
 psql(c.source.identity.database,process.env.USER,'create table auth.users_child() inherits(auth.users);');await assert.rejects(adapter.authTriggers(true),/privilege/);psql(c.source.identity.database,process.env.USER,'drop table auth.users_child;');
 await adapter.authTriggers(true);
 identityRoleCheck(c,target,false);
 psql(c.target.identity.database,process.env.USER,'grant byus_identity_migrator to app_login;');assert.throws(()=>identityRoleCheck(c,target,false),/isolation/);psql(c.target.identity.database,process.env.USER,'revoke byus_identity_migrator from app_login;');
 deny(c.target.identity.database,IDENTITY_IMPORT_ROLE,'set session_replication_role=replica;');deny(c.target.identity.database,IDENTITY_IMPORT_ROLE,"insert into public.app_users values(gen_random_uuid(),'x','active','x');");deny(c.target.identity.database,IDENTITY_IMPORT_ROLE,'create table public.forbidden(id int);');deny(c.target.identity.database,'app_login',"select public.import_cognito_legacy_inventory(gen_random_uuid(),repeat('a',64),0,'[]'::jsonb);");
 const ic=structuredClone(c);ic.target.migrationRole=IDENTITY_IMPORT_ROLE;ic.target.connectionEnv='IDENTITY_IMPORT_TEST';process.env.IDENTITY_IMPORT_TEST=`postgresql://${IDENTITY_IMPORT_ROLE}:synthetic@127.0.0.1:${port}/${c.target.identity.database}`;importer=await Database.open(ic,'target');
 const originalSeal=adapter.sealStorageImport.bind(adapter);let waitedForImports=false;
 adapter.sealStorageImport=async()=>{
  const children=[['byus_identity_migrator','begin_identity_import'],['byus_storage_migrator','begin_storage_import']].map(([role,lease])=>{
   const child=spawn('psql',['-X','-q','-v','ON_ERROR_STOP=1','-d',c.target.identity.database,'-U',role],{env,stdio:['pipe','ignore','pipe']});let errors='';child.stderr.on('data',x=>errors+=x);const done=new Promise((ok,bad)=>child.on('exit',code=>code===0?ok():bad(new Error(errors))));child.stdin.end(`begin;select _byus_migration.${lease}();select pg_sleep(2);commit;`);return done;
  });
  const deadline=Date.now()+10000;while(psql(c.target.identity.database,process.env.USER,"select count(*)::int from pg_stat_activity where usename in('byus_identity_migrator','byus_storage_migrator') and wait_event='PgSleep';")!=='2'){assert(Date.now()<deadline,'Import lease acquisition timed out');await new Promise(r=>setTimeout(r,20));}
  const begin=Date.now();await originalSeal();waitedForImports=Date.now()-begin>1000;await Promise.all(children);
 };
 const receipt=await importIdentity({c,state,source,target,importer,users:[{id:'did:privy:one',linked_accounts:[{type:'google_oauth',subject:'synthetic-subject',verified_at:1}]}],privyExportSha256:'b'.repeat(64),artifactPath:join(dir,'private.json'),receiptPath:join(dir,'receipt.json'),adapter});
 assert.equal(waitedForImports,true);assert.equal((await stat(join(dir,'private.json'))).mode&0o777,0o600);assert.equal(receipt.tables.length,5);assert.equal(receipt.tables.find(x=>x.table==='public.legacy_email_credentials').rows,1);assert.equal(guardStatus(c,target).firstWriteAt,null);
 assert.equal(target.run("select count(*)::int from pg_roles where rolname in('byus_identity_migrator','byus_storage_migrator') and rolcanlogin;"),0);
 state.dmsFinalIdentityReceipt={path:join(dir,'receipt.json'),sha256:hash(await readFile(join(dir,'receipt.json'),'utf8'))};await adapter.verifyIdentityReceipt(await auditDatabase(source),await auditDatabase(target));
 for(const key of ['credentialHash','bindingsHash','sourceSnapshotHash'])assert.throws(()=>validateIdentityReceipt({...receipt,[key]:'c'.repeat(64)},{c,state,source:s,target:t}),/actual sealed import/);
 const changed=structuredClone(receipt);changed.tables.pop();assert.throws(()=>validateIdentityReceipt(changed,{c,state,source:s,target:t}));
 const missing=state.dmsFinalIdentityReceipt,completed=state.dmsIdentityImportCompleted;delete state.dmsFinalIdentityReceipt;delete state.dmsIdentityImportCompleted;await assert.rejects(adapter.verifyIdentityReceipt(await auditDatabase(source),await auditDatabase(target)),/receipt required/);state.dmsFinalIdentityReceipt=missing;state.dmsIdentityImportCompleted=completed;
 source.run('update public.mobile_email_login_bindings set enabled=false;',{json:false});await assert.rejects(adapter.verifyIdentityReceipt(await auditDatabase(source),await auditDatabase(target)),/snapshot changed/);source.run('update public.mobile_email_login_bindings set enabled=true;',{json:false});
 psql(c.source.identity.database,process.env.USER,"set session_replication_role=replica;update auth.users set encrypted_password='tampered';");await assert.rejects(adapter.verifyIdentityReceipt(await auditDatabase(source),await auditDatabase(target)),/snapshot changed/);psql(c.source.identity.database,process.env.USER,"set session_replication_role=replica;update auth.users set encrypted_password='$2b$synthetic';");
 await writeFile(join(dir,'receipt.json'),JSON.stringify({...receipt,credentialHash:'c'.repeat(64)}));await assert.rejects(adapter.verifyIdentityReceipt(await auditDatabase(source),await auditDatabase(target)),/receipt changed/);await writeFile(join(dir,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
 // Exercise the operator CLI itself against another empty synthetic target.
 const cliConfig=structuredClone(c),cliDb='identity_cli_target';run('createdb',['-O','identity_operator',cliDb]);
 psql(cliDb,'identity_operator',owners+targetSchema);
 psql(cliDb,process.env.USER,(await readFile(new URL('infrastructure/aws/database/dms-copy/identity-import-role.sql',root),'utf8')).replace(/^create role byus_identity_migrator.*$/m,'')+"grant usage on schema public to byus_storage_migrator;grant select,insert,update,delete on public.s3_storage_objects,public.s3_storage_delete_outbox,public.s3_storage_migration_objects to byus_storage_migrator;");
 cliConfig.target.identity.database=cliDb;cliConfig.source.identity.databaseOid=source.identity().databaseOid;cliConfig.target.identity.databaseOid=psql(cliDb,'identity_operator','select oid::text from pg_database where datname=current_database();');cliConfig.target.connectionEnv='IDENTITY_CLI_TARGET';
 process.env.IDENTITY_CLI_TARGET=`postgresql://identity_operator:synthetic@127.0.0.1:${port}/${cliDb}`;process.env.IDENTITY_CLI_IMPORT=`postgresql://${IDENTITY_IMPORT_ROLE}:synthetic@127.0.0.1:${port}/${cliDb}`;
 const cliTarget=await Database.open(cliConfig,'target');let cliAudit;try{cliAudit=await auditDatabase(cliTarget);cliTarget.run(guardSql(cliConfig,'target',cliAudit),{json:false});}finally{await cliTarget.close();}
 const cliState={...state,dmsFinalIdentityReceipt:undefined,dmsIdentityImportCompleted:undefined,dmsStorageImportClosedAt:undefined,engine:'dms',events:[],configHash:hash(cliConfig),targetCatalogHash:cliAudit.catalogHash};
 const configPath=join(dir,'cli-config.json'),ledgerPath=join(dir,'cli-ledger.json'),privyPath=join(dir,'cli-privy.json'),users=JSON.stringify([{id:'did:privy:one',linked_accounts:[]}]);
 await writeFile(configPath,JSON.stringify(cliConfig),{mode:0o600});await writeFile(ledgerPath,JSON.stringify(cliState),{mode:0o600});await writeFile(privyPath,users,{mode:0o600});
 // Roles were sealed by the preceding import; only this separate synthetic target is reopened for its own run.
 psql(cliDb,process.env.USER,'alter role byus_identity_migrator login;alter role byus_storage_migrator login;');
 const cli=spawnSync(process.execPath,[new URL('./aws-db-identity-import.mjs',import.meta.url).pathname,'--config',configPath,'--ledger',ledgerPath,'--privy-export',privyPath,'--privy-sha256',hash(users),'--artifact',join(dir,'cli-private.json'),'--receipt',join(dir,'cli-receipt.json'),'--import-env','IDENTITY_CLI_IMPORT','--apply'],{env:{...process.env,PATH:env.PATH},encoding:'utf8'});
 assert.equal(cli.status,0,cli.stderr);assert.equal(JSON.parse(cli.stdout).imported,true);assert.equal((await readState(ledgerPath,cliConfig)).events.length,2);
 // Exercise abort restoration before the irreversible first-write marker.
 source.run('begin;'+adapter.storageUnfenceSql()+'commit;',{json:false});psql(c.source.identity.database,'app_login',`update auth.users set encrypted_password='restored' where id='${legacy}';`);await adapter.authTriggers(false);
 target.run(`begin;update _byus_migration.state set fenced=false where run_id='${c.runId}';insert into public.app_users values('33333333-3333-4333-8333-333333333333','did:privy:two','active','two@example.test');commit;`,{json:false});assert.throws(()=>assertAbortAllowed({firstWriteAt:guardStatus(c,target).firstWriteAt}),/cannot be reopened/);

 }finally{for(const db of [source,target,importer])if(db)await db.close();if(started)spawnSync('pg_ctl',['-D',join(dir,'pg'),'-m','immediate','-w','stop'],{env,stdio:'ignore'});await rm(dir,{recursive:true,force:true});}
});

test('atomic source fence retries only rolled-back deadlocks within the existing database budget',async()=>{
 let calls=0;const sql='begin;select 1;commit;',db={run(text){assert.equal(text,sql);if(++calls<3)throw Error('source PostgreSQL operation failed (SQLSTATE 40P01)');return 'ok';}};
 assert.equal(await runAtomicFence(db,sql,{}),'ok');assert.equal(calls,3);
 calls=0;await assert.rejects(runAtomicFence({run(){calls++;throw Error('SQLSTATE 40P01');}},sql,{}),/40P01/);assert.equal(calls,3);
 for(const code of ['57014','42501','23505']){calls=0;await assert.rejects(runAtomicFence({run(){calls++;throw Error('SQLSTATE '+code);}},sql,{}),new RegExp(code));assert.equal(calls,1);}
 await assert.rejects(runAtomicFence(db,'select 1;',{}),/atomic/);
});
