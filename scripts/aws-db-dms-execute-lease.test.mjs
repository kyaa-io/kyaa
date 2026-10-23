import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir,userInfo} from 'node:os';
import {spawnSync,spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {Database,auditDatabase,hash} from './aws-db-migrate.mjs';
import {restoreDmsExecuteLease} from './aws-db-dms-execute-lease.mjs';

const output=process.env.BYUS_TEST_EVIDENCE_DIR;
test('PG17 exact EXECUTE lease: real replica login, sealed restore, crash reentry and refusal cases',{timeout:90000},async t=>{
 const dir=await mkdtemp(join(tmpdir(),'byus-execute-lease-'));const listener=createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
 const env={...process.env,PATH:`/opt/homebrew/opt/postgresql@17/bin:${process.env.PATH}`};for(const k of Object.keys(env))if(k.startsWith('PG'))delete env[k];Object.assign(env,{PGHOST:'127.0.0.1',PGPORT:String(port)});
 const command=(cmd,args,options={})=>{const p=spawnSync(cmd,args,{env,encoding:'utf8',timeout:15000,...options});assert.equal(p.status,0,p.stderr);return p.stdout.trim();};
 const sql=(text,user='lease_operator')=>command('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-d','postgres','-U',user],{input:text});
 let started=false,target,session;
 try{
  command('initdb',['-D',join(dir,'pg'),'-A','trust','--no-locale','-E','UTF8']);command('pg_ctl',['-D',join(dir,'pg'),'-l',join(dir,'pg.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start']);started=true;
  sql('create role lease_operator login superuser;create role lease_apply login;create role unrelated nologin;',userInfo().username);
  sql(`create function public.allowed(value integer) returns boolean language sql immutable as 'select value>0';revoke all on function public.allowed(integer) from public;
   create type public.fixture_kind as enum ('ok');
   create function public.allowed_other(public.fixture_kind) returns boolean language sql immutable as 'select true';revoke all on function public.allowed_other(public.fixture_kind) from public;
   create function public.untouched() returns boolean language sql immutable as 'select true';revoke all on function public.untouched() from public;
   create table public.items(id integer check(public.allowed(id) and public.allowed_other('ok'::public.fixture_kind)));grant insert on public.items to lease_apply;
   create schema _byus_migration;create table _byus_migration.state(run_id text primary key,side text,fenced boolean,first_write_at timestamptz);insert into _byus_migration.state values('lease_run','target',true,null);
   create function _byus_migration.guard() returns trigger language plpgsql as $$begin if session_user='lease_apply' and current_setting('session_replication_role')='replica' then return new;end if;raise exception 'not exact replica actor';end$$;
   create trigger lease_guard before insert on public.items for each row execute function _byus_migration.guard();alter table public.items enable always trigger lease_guard;
   grant set on parameter session_replication_role to lease_apply;`);
  const c={engine:'dms',localRehearsal:true,runId:'lease_run',schemas:['public'],applicationRoles:[],dms:{targetRole:'lease_apply'},source:{identity:{database:'source'}},target:{host:'127.0.0.1',migrationRole:'lease_operator',connectionEnv:'LEASE_TEST_DB',identity:{database:'postgres',serverAddress:'127.0.0.1',serverPort:port,sessionUser:'lease_operator'}}};
  process.env.LEASE_TEST_DB=`postgresql://lease_operator:local@127.0.0.1:${port}/postgres`;target=await Database.open(c,'target');c.target.identity=target.identity();
  sql('create role lease_function_owner nologin;alter function public.allowed(integer) owner to lease_function_owner;alter function public.allowed_other(public.fixture_kind) owner to lease_function_owner;');
  const baseline=await auditDatabase(target),routine=baseline.routines.filter(r=>['allowed','allowed_other'].includes(r.name));
  const lease={format:1,runId:c.runId,taskArn:'fixture-task',sourceIdentityHash:hash(c.source.identity),targetIdentityHash:hash(c.target.identity),transportHash:hash('fixture-transport'),role:c.dms.targetRole,baseCopyCatalogHash:baseline.catalogHash,copyCatalogHash:null,functions:routine.map(r=>({schema:r.schema,name:r.name,arguments:r.arguments,regprocedure:r.name==='allowed'?'public.allowed(pg_catalog.int4)':'public.allowed_other(public.fixture_kind)',definitionHash:r.definitionHash,owner:r.owner,securityDefiner:false,searchPath:r.searchPath,settingsHash:r.settingsHash,originalAcl:r.acl,addedAcl:{grantor:r.owner,grantee:c.dms.targetRole,privilege:'EXECUTE',grantable:false}})),evidence:[{path:'evidence.json',sha256:hash('{}\n')}]};
  const state={runId:c.runId,dmsTaskArn:lease.taskArn,dmsTransportHash:lease.transportHash,dmsCopyCatalogHash:null,targetCatalogHash:baseline.catalogHash,events:[{phase:'prepared',sourceIdentityHash:lease.sourceIdentityHash,targetIdentityHash:lease.targetIdentityHash}]};
  await writeFile(join(dir,'evidence.json'),'{}\n');
  const pin=async()=>{const raw=JSON.stringify(lease);await writeFile(join(dir,'lease.json'),raw,{mode:0o600});state.dmsExecuteGrantLease={path:join(dir,'lease.json'),sha256:hash(raw)};};
  const restore=()=>restoreDmsExecuteLease({c,target,state});
  const grant=()=>sql('grant execute on function public.allowed(integer),public.allowed_other(public.fixture_kind) to lease_apply;');
  const seal=()=>sql('alter role lease_apply nologin;revoke set on parameter session_replication_role from lease_apply;');
  await t.test('exact session_user replica CHECK fails without EXECUTE and succeeds with grant',async()=>{
   const p=spawnSync('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-U','lease_apply','-d','postgres'],{env,input:'set session_replication_role=replica;insert into public.items values(1);',encoding:'utf8'});assert.notEqual(p.status,0);assert.match(p.stderr,/42501/);
   grant();assert.equal(sql("set session_replication_role=replica;select session_user;insert into public.items values(1);",'lease_apply'),'lease_apply');
   assert.equal(sql('select count(*) from public.items;'),'1');
  });
  lease.copyCatalogHash=(await auditDatabase(target)).catalogHash;state.dmsCopyCatalogHash=lease.copyCatalogHash;await pin();
  await t.test('refuses LOGIN and SET replica permission independently',async()=>{
   await assert.rejects(restore(),/not sealed/);sql('alter role lease_apply nologin;');await assert.rejects(restore(),/not sealed/);seal();
  });
  await t.test('refuses active apply session even after NOLOGIN',async()=>{
   sql('alter role lease_apply login;');session=spawn('psql',['-X','-qAt','-U','lease_apply','-d','postgres','-c','select pg_sleep(30);'],{env,stdio:['ignore','ignore','ignore']});
   for(let i=0;i<100&&sql("select count(*) from pg_stat_activity where usename='lease_apply';")==='0';i++)await new Promise(r=>setTimeout(r,20));
   assert.equal(sql("select count(*) from pg_stat_activity where usename='lease_apply';"),'1');seal();await assert.rejects(restore(),/not sealed/);const exited=once(session,'exit');sql("select pg_terminate_backend(pid) from pg_stat_activity where usename='lease_apply';");await exited;session=null;
  });
  await t.test('refuses modified file, evidence, binding, marker, extra ACL and definition',async()=>{
   state.dmsExecuteGrantLease.sha256=hash('wrong');await assert.rejects(restore(),/checksum/);await pin();
   await writeFile(join(dir,'evidence.json'),'bad');await assert.rejects(restore(),/checksum/);await writeFile(join(dir,'evidence.json'),'{}\n');
   state.dmsTaskArn='other';await assert.rejects(restore(),/binding/);state.dmsTaskArn=lease.taskArn;
   sql("update _byus_migration.state set first_write_at=now();");await assert.rejects(restore(),/not sealed/);sql('update _byus_migration.state set first_write_at=null;');
   sql('grant execute on function public.allowed(integer) to unrelated;');await assert.rejects(restore(),/catalog differs/);sql('revoke execute on function public.allowed(integer) from unrelated;');
   sql('grant execute on function public.untouched() to unrelated;');const reviewedCopy=lease.copyCatalogHash;lease.copyCatalogHash=(await auditDatabase(target)).catalogHash;state.dmsCopyCatalogHash=lease.copyCatalogHash;await pin();await assert.rejects(restore(),/unrelated changes/);sql('revoke execute on function public.untouched() from unrelated;');lease.copyCatalogHash=reviewedCopy;state.dmsCopyCatalogHash=reviewedCopy;await pin();
   const originalGrantee=lease.functions[0].addedAcl.grantee;lease.functions[0].addedAcl.grantee='public';await pin();await assert.rejects(restore(),/invalid exact function grant/);lease.functions[0].addedAcl.grantee=originalGrantee;await pin();
   sql("create or replace function public.allowed(value integer) returns boolean language sql immutable as 'select value>=0';");await assert.rejects(restore(),/catalog differs/);sql("create or replace function public.allowed(value integer) returns boolean language sql immutable as 'select value>0';");
   const old=lease.functions[0].regprocedure;lease.functions[0].regprocedure='public.untouched()';await pin();await assert.rejects(restore(),/regprocedure/);lease.functions[0].regprocedure=old;await pin();
  });
  await t.test('all function revokes roll back if later function changes before transaction',async()=>{
   const run=target.run.bind(target);target.run=(text,options)=>{if(text.startsWith('begin;set local search_path'))sql("create or replace function public.allowed_other(public.fixture_kind) returns boolean language sql immutable as 'select false';");return run(text,options);};
   try{await assert.rejects(restore(),/PostgreSQL operation failed/);}finally{target.run=run;}
   assert.equal(sql("select has_function_privilege('lease_apply','public.allowed(integer)','EXECUTE');"),'t');
   sql("create or replace function public.allowed_other(public.fixture_kind) returns boolean language sql immutable as 'select true';");
  });
  await t.test('restores exact ACL only and safely reenters after SQL commit before state persistence',async()=>{
   const result=await restore();assert.equal(result.restored,true);assert.equal(result.alreadyRestored,false);assert.equal(state.dmsCopyCatalogHash,baseline.catalogHash);assert.deepEqual((await auditDatabase(target)).routines,baseline.routines);
   assert.equal(sql("select has_function_privilege('lease_apply','public.allowed(integer)','EXECUTE'),has_function_privilege('lease_apply','public.untouched()','EXECUTE');"),'f|f');
   state.dmsCopyCatalogHash=lease.copyCatalogHash;assert.equal((await restore()).alreadyRestored,true);assert.equal(state.dmsCopyCatalogHash,baseline.catalogHash);
   sql('alter table public.items add column finalized_fixture boolean;');state.targetCatalogHash=(await auditDatabase(target)).catalogHash;
   state.dmsFinalized=true;const preserved=state.dmsCopyCatalogHash;assert.equal((await restore()).alreadyRestored,true);assert.equal(state.dmsCopyCatalogHash,preserved);
   assert.equal(await restoreDmsExecuteLease({c,target,state:{}}),null);
  });
  if(output){await mkdir(output,{recursive:true});await writeFile(join(output,'fixture-receipt.json'),JSON.stringify({format:1,observedAt:new Date().toISOString(),engine:sql('show server_version_num;'),fixture:'local disposable PG17, synthetic CHECK and ALWAYS guard with real replica actor login; not full DMS copy proof',result:'passed',cases:['42501 before grant','real replica insert after exact grant','LOGIN denied','replica SET denied','active sessions denied','file and evidence hash denied','task binding denied','first-write denied','extra ACL denied','forged catalog delta denied','PUBLIC grant denied','changed definition denied','unrelated regprocedure denied','all-function transaction rollback','original ACL restored','commit-before-ledger reentry','finalized reentry','no lease no-op']},null,2)+'\n');}
 }finally{
  if(session){session.kill('SIGTERM');}if(target)await target.close();if(started)spawnSync('pg_ctl',['-D',join(dir,'pg'),'-m','immediate','-w','stop'],{env,stdio:'ignore'});
  if(output){await mkdir(output,{recursive:true});try{await writeFile(join(output,'postgres.log'),await readFile(join(dir,'pg.log')));}catch{}}await rm(dir,{recursive:true,force:true});delete process.env.LEASE_TEST_DB;
 }
});
