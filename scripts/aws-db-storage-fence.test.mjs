import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import {DmsAdapter,storageShapeHash,validateFinalStorageReceipt,validateBlobEvidence} from './aws-db-dms-adapter.mjs';
import {guardSql,hash} from './aws-db-migrate.mjs';

test('final blob evidence rejects invalid and future observation timestamps',()=>{
 const fencedAt=Date.now()-1000,receipt={runId:'fixture',fencedAt,observedAt:new Date().toISOString(),sourceProjectionFingerprint:'projection'};
 const blob={format:1,...receipt,objects:[]};
 assert.doesNotThrow(()=>validateBlobEvidence(blob,receipt,[]));
 for(const observedAt of ['invalid',new Date(Date.now()+60000).toISOString()])assert.throws(()=>validateBlobEvidence({...blob,observedAt},receipt,[]),/binding/);
});

test('source fence cannot approve a missing storage writer role',async()=>{
 const source={run:()=>({actorCount:3,subscribers:0,unsafe:false,defaults:false,definers:false,triggerPrivilege:true})};
 const adapter=new DmsAdapter({c:{source:{migrationRole:'operator'}},source});
 await assert.rejects(adapter.storageSafety(),/Storage NORMAL fence unsupported/);
});

test('final storage receipt binds the closed import gate and all three exact S3 table digests',()=>{
 const now=Date.now(),c={runId:'fixture',accountId:'111111111111',environment:'dev',portReviewSha256:'base'};
 const storageInventory={projection:{objects:{rows:'1',sha256:'content'}},relations:[{owner:'operator',guard:'sealed'}]};
 const source={identity:{database:'source'},storageInventory},target={identity:{database:'target'},storageInventory};
 const state={fencedAt:now-2000,dmsStorageImportClosedAt:new Date(now-1000).toISOString(),catalogHash:'source-ddl',targetCatalogHash:'target-ddl',sourceGuardHash:'guard',dmsStorageShapeHash:storageShapeHash(storageInventory)};
 const receipt={format:1,engine:'dms',...c,fencedAt:state.fencedAt,importsClosedAt:state.dmsStorageImportClosedAt,basePortReviewSha256:c.portReviewSha256,sourceIdentityHash:hash(source.identity),targetIdentityHash:hash(target.identity),sourceCatalogHash:state.catalogHash,targetCatalogHash:state.targetCatalogHash,sourceGuardHash:state.sourceGuardHash,storageInflightWriters:0,observedAt:new Date(now).toISOString(),sourceProjectionFingerprint:hash(storageInventory.projection),targetInventoryFingerprint:hash(storageInventory),targetShapeHash:state.dmsStorageShapeHash,targetOnlyS3:['s3_storage_objects','s3_storage_delete_outbox','s3_storage_migration_objects'].map(name=>({table:'public.'+name,rows:'0',sha256:'a'.repeat(64)}))};
 const options={c,state,source,target,sourceFenceVerified:true,now};
 assert.doesNotThrow(()=>validateFinalStorageReceipt(receipt,options));
 for(const targetOnlyS3 of [receipt.targetOnlyS3.slice(0,2),[receipt.targetOnlyS3[0],receipt.targetOnlyS3[0],receipt.targetOnlyS3[1]]])assert.throws(()=>validateFinalStorageReceipt({...receipt,targetOnlyS3},options),/Exact supplemental/);
 assert.throws(()=>validateFinalStorageReceipt({...receipt,observedAt:new Date(now-1500).toISOString()},options),/imports must be closed/);
 assert.throws(()=>validateFinalStorageReceipt(receipt,{...options,sourceFenceVerified:false}),/binding/);
 assert.throws(()=>validateFinalStorageReceipt(receipt,{...options,target:{...target,storageInventory:{...storageInventory,relations:[]}}}),/shape differs/);
});

const available=['psql','initdb','pg_ctl','createdb'].every(cmd=>spawnSync('which',[cmd]).status===0);
test('non-owner NORMAL storage guard drains writes, blocks mutations and restores row operations on abort',{skip:!available,timeout:30000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'byus-storage-fence-')),listener=createServer();
 await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
 const env={...process.env};for(const k of Object.keys(env))if(k.startsWith('PG'))delete env[k];Object.assign(env,{PGHOST:'127.0.0.1',PGPORT:String(port),PGDATABASE:'storage_fixture'});
 const args=user=>['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U',user];
 const query=(user,sql)=>{const x=spawnSync('psql',args(user),{input:sql,env,encoding:'utf8',timeout:15000});assert.equal(x.status,0,x.stderr);return x.stdout.trim();};
 const denied=(user,sql)=>assert.notEqual(spawnSync('psql',args(user),{input:sql,env,encoding:'utf8',timeout:15000}).status,0);
 const run=(cmd,args)=>{const x=spawnSync(cmd,args,{env,encoding:'utf8',timeout:15000});assert.equal(x.status,0,x.stderr);};
 let started=false,passed=false;
 try{
  run('initdb',['-D',join(dir,'pg'),'-A','trust','--no-locale','-E','UTF8']);run('pg_ctl',['-D',join(dir,'pg'),'-l',join(dir,'pg.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start']);started=true;
  run('createdb',['storage_fixture']);
  query(process.env.USER,`create role storage_operator login;create role supabase_storage_admin login;create role authenticator login;create role service_role;
   grant create on database storage_fixture to storage_operator;
   create schema storage authorization supabase_storage_admin;grant usage on schema storage to storage_operator,authenticator,service_role;
   set role supabase_storage_admin;create table storage.buckets(id text primary key);create table storage.objects(id text primary key);reset role;
   grant select,trigger on all tables in schema storage to storage_operator;grant select,insert,update,delete,truncate on all tables in schema storage to authenticator,service_role;
   grant select on pg_subscription to storage_operator;`);
  const source={run:(sql,{json=true}={})=>{const text=query('storage_operator',sql);return json?JSON.parse(text):text;}};
  const c={runId:'storage_fixture',source:{migrationRole:'storage_operator'}},state={dmsStorageShapeHash:'fixture'};
  const adapter=new DmsAdapter({c,source,state});await adapter.prepareStorage();
  query('authenticator',"insert into storage.buckets values('original');insert into storage.objects values('original');update storage.objects set id='updated';");
  assert.equal(query('authenticator','select count(*) from storage.objects;'),'1');
  denied('storage_operator','drop trigger byus_storage_migration_rows_guard on storage.objects;');
  denied('authenticator',"set session_replication_role='replica';");
  const writer=spawn('psql',args('authenticator'),{env,stdio:['pipe','pipe','pipe']});let writerError='';writer.stderr.on('data',b=>{writerError+=b;});
  const completed=new Promise((resolve,reject)=>{writer.once('error',reject);writer.once('exit',code=>code===0?resolve():reject(new Error(writerError)));});
  const ready=new Promise((resolve,reject)=>{writer.stdout.on('data',b=>{if(String(b).includes('writer-ready'))resolve();});writer.once('error',reject);});
  writer.stdin.end("begin;insert into storage.objects values('inflight');select 'writer-ready';select pg_sleep(0.8);commit;");await ready;
  const sql=await adapter.fenceSql('begin;commit;'),start=Date.now();source.run(sql,{json:false});assert(Date.now()-start>=300);await completed;
  await adapter.storageTriggers(true);assert.equal(query('authenticator','select count(*) from storage.objects;'),'2');
  for(const name of ['buckets','objects'])for(const statement of [`insert into storage.${name} values('blocked');`,`update storage.${name} set id='blocked';`,`delete from storage.${name};`,`truncate storage.${name};`])denied('authenticator',statement);
  source.run(adapter.storageUnfenceSql(),{json:false});
  query('authenticator',"delete from storage.objects where id='updated';update storage.objects set id='restored';insert into storage.objects values('new');");
  assert.equal(query('authenticator',"select string_agg(id,',' order by id) from storage.objects;"),'new,restored');
  query(process.env.USER,'grant set on parameter session_replication_role to service_role;');await assert.rejects(adapter.storageSafety(),/Storage NORMAL fence unsupported/);
  const names=['items','s3_storage_objects','s3_storage_delete_outbox','s3_storage_migration_objects'];
  query(process.env.USER,`grant create on schema public to storage_operator;set role storage_operator;${names.map(n=>`create table public.${n}(id text primary key);grant select,insert,update,delete,truncate on public.${n} to authenticator;`).join('')}reset role;`);
  Object.assign(c,{engine:'dms',applicationRoles:['authenticator'],target:{migrationRole:process.env.USER},dms:{targetRole:'dms_apply_login'}});
  const target={run:(sql,{json=true}={})=>{const text=query(process.env.USER,sql);return json?JSON.parse(text):text;}};
  target.run(`create role byus_storage_migrator login bypassrls;grant usage on schema public to byus_storage_migrator;grant select,insert,update,delete on ${names.slice(1).map(n=>'public.'+n).join(',')} to byus_storage_migrator;`,{json:false});
  target.run(guardSql(c,'target',{tables:names.map(name=>({schema:'public',name}))}),{json:false});
  const targetAdapter=new DmsAdapter({c,source,target,state});await targetAdapter.storageImportRoleCheck(false);
  target.run('grant byus_storage_migrator to authenticator;',{json:false});await assert.rejects(targetAdapter.storageImportRoleCheck(false),/privilege/);target.run('revoke byus_storage_migrator from authenticator;',{json:false});
  target.run('grant insert on public.items to byus_storage_migrator;',{json:false});await assert.rejects(targetAdapter.storageImportRoleCheck(false),/privilege/);target.run('revoke insert on public.items from byus_storage_migrator;',{json:false});
  target.run('create role import_escalation;grant set on parameter session_replication_role to import_escalation;grant import_escalation to byus_storage_migrator;',{json:false});await assert.rejects(targetAdapter.storageImportRoleCheck(false),/privilege/);target.run('revoke import_escalation from byus_storage_migrator;',{json:false});
  denied('storage_operator',"insert into public.items values('blocked');");
  for(const name of names.slice(1)){denied('authenticator',`insert into public.${name} values('blocked');`);query('byus_storage_migrator',`insert into public.${name} values('imported');`);}
  const importing=spawn('psql',args('byus_storage_migrator'),{env,stdio:['pipe','pipe','pipe']});let importError='';importing.stderr.on('data',b=>{importError+=b;});
  const importDone=new Promise((resolve,reject)=>{importing.once('error',reject);importing.once('exit',code=>code===0?resolve():reject(new Error(importError)));});
  const importReady=new Promise((resolve,reject)=>{importing.stdout.on('data',b=>{if(String(b).includes('import-ready'))resolve();});importing.once('error',reject);});
  denied('authenticator','select _byus_migration.begin_storage_import();');
  importing.stdin.end("begin;select _byus_migration.begin_storage_import();select 'import-ready';select pg_sleep(0.8);insert into public.s3_storage_objects values('inflight');commit;");await importReady;
  const sealing=Date.now();await targetAdapter.sealStorageImport();assert(Date.now()-sealing>=300);await importDone;await targetAdapter.storageImportSealed();
  for(const name of names.slice(1))denied('byus_storage_migrator',`insert into public.${name} values('late');`);
  await targetAdapter.sealStorageImport();await targetAdapter.storageImportSealed();
  assert.equal(target.run('select to_json(first_write_at is null) from _byus_migration.state;'),true);
  target.run('update _byus_migration.state set fenced=false;',{json:false});
  query('authenticator',"insert into public.s3_storage_objects values('native');");
  assert.equal(target.run('select to_json(first_write_at is not null) from _byus_migration.state;'),true);
  await assert.rejects(targetAdapter.storageImportSealed(),/changed after barrier/);
  passed=true;
 }finally{if(started)spawnSync('pg_ctl',['-D',join(dir,'pg'),'-m','immediate','-w','stop'],{env,stdio:'ignore'});if(passed)await rm(dir,{recursive:true,force:true});else console.error('Storage fence fixture retained:',dir);}
});
