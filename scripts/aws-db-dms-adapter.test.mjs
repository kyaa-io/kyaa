import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawnSync} from 'node:child_process';import {createServer} from 'node:net';
import {validateConfig,hash,guardSql,Database,auditDatabase,catalogHash,applyAction,assertAbortAllowed,readState} from './aws-db-migrate.mjs';
import {DmsAdapter,DmsBudgetError,remainingBudget,assertRoleIsolation,checksumSql,dmsTableMappings,identityChanges,stageCatalog} from './aws-db-dms-adapter.mjs';
function configuration(port=54321){const accountId='111111111111',arn=type=>`arn:aws:dms:ap-northeast-2:${accountId}:${type}:EXACT`;
 return {engine:'dms',localRehearsal:true,environment:'dev',accountId,profile:'local-only',region:'ap-northeast-2',runId:'dms_test',schemas:['public'],applicationRoles:['app_login'],writers:['web'],timeoutSeconds:30,
 source:{host:'127.0.0.1',migrationRole:'byus_operator',connectionEnv:'DMS_LOCAL_SOURCE',identity:{database:'dms_source_db',sessionUser:'byus_operator',serverAddress:'127.0.0.1',serverPort:port}},
 target:{host:'127.0.0.1',migrationRole:'byus_operator',connectionEnv:'DMS_LOCAL_TARGET',identity:{database:'dms_target_db',sessionUser:'byus_operator',serverAddress:'127.0.0.1',serverPort:port}},
 dms:{sourceRole:'dms_source_login',targetRole:'dms_apply_login',replicationInstanceArn:arn('rep'),sourceEndpointArn:arn('endpoint')+'S',targetEndpointArn:arn('endpoint')+'T',sourceCertificateArn:arn('cert')+'S',targetCertificateArn:arn('cert')+'T',rollbackReserveSeconds:3}};
}
test('engine selection cannot weaken native, pins DMS identities and enforces rollback reserve',()=>{
 const c=configuration();assert.doesNotThrow(()=>validateConfig(c));
 assert.throws(()=>validateConfig({...c,engine:'other'}),/engine/);
 assert.throws(()=>validateConfig({...c,engine:'native'}),/native path/);
 assert.throws(()=>validateConfig({...c,dms:{...c.dms,targetRole:'app_login'}}),/dedicated/);
 assert.throws(()=>validateConfig({...c,dms:{...c.dms,rollbackReserveSeconds:30}}),/reserve/);
 const s={fencedAt:1000};assert.equal(remainingBudget(c,s,{now:26000}),1900);
 assert.throws(()=>remainingBudget(c,s,{now:28500}),DmsBudgetError);
 assert(remainingBudget(c,s,{rollback:true,now:28500})>0);
 assert.throws(()=>remainingBudget(c,s,{rollback:true,now:30500}),/abort budget/);
 const sql=guardSql(c,'target',{tables:[{schema:'public',name:'items'}]});assert.match(sql,/session_user='dms_apply_login'/);assert.match(sql,/Unapproved replica writer/);
});
test('actual DMS endpoint casing and plugin spelling normalize while wrong direction/plugin fail',async()=>{
 const c=configuration(),variant={type:s=>s.toUpperCase(),plugin:'test-decoding'};
 const aws=args=>{
  if(args[1]==='describe-replication-instances')return {ReplicationInstances:[{ReplicationInstanceArn:c.dms.replicationInstanceArn,PubliclyAccessible:false,EngineVersion:'3.6.1',ReplicationInstanceStatus:'available'}]};
  if(args[1]==='describe-endpoints'){const side=args.at(-1).endsWith('S')?'source':'target';return {Endpoints:[{EndpointArn:c.dms[side+'EndpointArn'],EndpointType:variant.type(side),EngineName:'postgres',DatabaseName:c[side].identity.database,SslMode:'verify-full',CertificateArn:c.dms[side+'CertificateArn'],ExtraConnectionAttributes:side==='target'?'loadUsingCSV=false':'',PostgreSQLSettings:{SecretsManagerSecretId:side,SecretsManagerAccessRoleArn:'role',...(side==='source'?{CaptureDdls:false,PluginName:variant.plugin,FailTasksOnLobTruncation:true}:{AfterConnectScript:'SET session_replication_role=replica'})}}]};}
  if(args[1]==='get-secret-value'){const side=args.at(-1);return {SecretString:JSON.stringify({host:c[side].host,port:c[side].identity.serverPort,username:c.dms[side+'Role'],password:'synthetic-only'})};}
  throw new Error('No unexpected AWS calls');
 };
 const adapter=new DmsAdapter({c,source:{},target:{},state:{},aws});await assert.doesNotReject(adapter.transport());
 variant.type=s=>s;variant.plugin='test_decoding';await assert.doesNotReject(adapter.transport());
 variant.type=s=>s==='source'?'TARGET':'SOURCE';await assert.rejects(adapter.transport(),/identity/);
 variant.type=s=>s.toUpperCase();variant.plugin='pgoutput';await assert.rejects(adapter.transport(),/capture/);
});

test('NOLOGIN cannot conceal application SET ROLE or inherited DMS privileges',()=>{
 const rows=[{name:'dms_apply_login',login:false,setReplica:false,memberships:0},{name:'app_login'}];
 assert.doesNotThrow(()=>assertRoleIsolation(rows,'dms_apply_login',['app_login'],{sealed:true}));
 for(const key of ['memberApply','inheritsApply','canSetApply','setReplica','createrole']){const altered=structuredClone(rows);altered[1][key]=true;assert.throws(()=>assertRoleIsolation(altered,'dms_apply_login',['app_login'],{sealed:true}),/Application/);}
});
test('explicit mappings and chunk hashes preserve generated values without payload output',()=>{
 const t={schema:'public',name:'odd_table',primaryKey:['id'],columns:[{name:'id',type:'text',identity:''},{name:'derived',type:'text',generated:'s'}]};
 const a={schemas:[],tables:[t],routines:[],views:[],types:[],sequences:[]};
 const mappings=dmsTableMappings(a);assert.equal(mappings.rules[0]['rule-action'],'explicit');assert.equal(mappings.rules[1]['object-locator']['schema-name'],'_byus_barrier');assert.equal(mappings.rules[2]['rule-action'],'remove-column');
 assert.match(checksumSql(t),/collate "C"/);assert.match(checksumSql(t),/sha256/);assert.match(checksumSql(t),/1000/);
 const ids=[{schema:'public',table:'odd_table',column:'id'}];assert.equal(stageCatalog(a,ids,'d').tables[0].columns[0].identity,'d');assert.equal(a.tables[0].columns[0].identity,'');
});
const available=['psql','initdb','pg_ctl','createdb'].every(cmd=>spawnSync('which',[cmd]).status===0);
test('fake DMS + disposable PG17 seals apply, hashes commits, restores identity and bounds guarded abort',{skip:!available,timeout:60000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'byus-dms-adapter-')),listener=createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
 const env={...process.env};for(const k of Object.keys(env))if(k.startsWith('PG'))delete env[k];Object.assign(env,{PGHOST:'127.0.0.1',PGPORT:String(port)});
 const run=(cmd,args,extra={})=>{const x=spawnSync(cmd,args,{env,encoding:'utf8',timeout:15000,...extra});assert.equal(x.status,0,x.stderr);return x.stdout.trim();};
 const psql=(db,user,text)=>run('psql',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-d',db,'-U',user],{input:text});
 let started=false,source,target;
 try{
  run('initdb',['-D',join(dir,'pg'),'-A','trust','--no-locale','-E','UTF8']);run('pg_ctl',['-D',join(dir,'pg'),'-l',join(dir,'pg.log'),'-o',`-h 127.0.0.1 -p ${port} -c wal_level=logical`,'-w','start']);started=true;
  psql('postgres',process.env.USER,'create role byus_operator login superuser;create role app_login login;create role dms_source_login login replication;create role dms_apply_login login noinherit;grant set on parameter session_replication_role to dms_apply_login;');
  const c=configuration(port);
  for(const side of ['source','target']){
   run('createdb',['-O','byus_operator',c[side].identity.database]);
   psql(c[side].identity.database,'byus_operator',`create table public.items(id bigint generated always as identity primary key,value text not null,derived text generated always as(md5(value)) stored);grant usage on schema public to app_login,dms_source_login,dms_apply_login;grant select,insert,update,delete on public.items to app_login,dms_apply_login;grant select on public.items to dms_source_login;create schema _byus_barrier;create table _byus_barrier.barriers(id uuid primary key,source_commit_fence_lsn text);`);
   c[side].identity.databaseOid=psql(c[side].identity.database,'byus_operator','select oid::text from pg_database where datname=current_database();');
   process.env[c[side].connectionEnv]=`postgresql://byus_operator:local-only@127.0.0.1:${port}/${c[side].identity.database}`;
  }
  source=await Database.open(c,'source');target=await Database.open(c,'target');
  source.run("insert into public.items(value) values('초기😀'),('CDC😀');",{json:false});
  const s=await auditDatabase(source),baseline=await auditDatabase(target),changes=identityChanges(baseline);
  const state={engine:'dms',runId:c.runId,configHash:hash(c),phase:'barrier',events:[],fencedAt:Date.now(),dmsTaskArn:`arn:aws:dms:${c.region}:${c.accountId}:task:TEST`,dmsIdentities:changes,dmsMappings:dmsTableMappings(s),dmsCopyCatalogHash:catalogHash(stageCatalog(baseline,changes,'d')),targetCatalogHash:baseline.catalogHash};
  source.run(guardSql(c,'source',s),{json:false});target.run(guardSql(c,'target',baseline),{json:false});target.run('create table _byus_migration.dms_proofs(run_id text primary key,proof_hash text not null,verified_at timestamptz not null);alter table public.items alter column id set generated by default;',{json:false});
  psql(c.target.identity.database,'dms_apply_login',"set session_replication_role=replica;insert into public.items(id,value) values(1,'초기😀'),(2,'CDC😀');");
  const id='11111111-1111-4111-8111-111111111111';source.run(`begin;set local synchronous_commit=on;insert into _byus_barrier.barriers(id) values('${id}');commit;`,{json:false});
  state.barrierId=id;state.sourceCommitFenceLsn=source.run('select pg_current_wal_lsn()::text;',{json:false});source.run(`update _byus_barrier.barriers set source_commit_fence_lsn='${state.sourceCommitFenceLsn}' where id='${id}';`,{json:false});target.run(`insert into _byus_barrier.barriers values('${id}','${state.sourceCommitFenceLsn}');`,{json:false});
  const manifest=join(dir,'manifest.json');await writeFile(manifest,'{"synthetic":true}');c.dms.manifestFile=manifest;c.dms.manifestSha256=hash(await readFile(manifest,'utf8'));state.dmsManifestHash=c.dms.manifestSha256;
  const settings=JSON.parse(await readFile(new URL('../infrastructure/aws/database/dms-copy/task-settings.json',import.meta.url)));
  let taskStatus='running',stopRequests=0;
  const call=(args)=>{
   const command=args[1];
   if(command==='describe-replication-instances')return {ReplicationInstances:[{ReplicationInstanceArn:c.dms.replicationInstanceArn,PubliclyAccessible:false,EngineVersion:'3.6.1',ReplicationInstanceStatus:'available'}]};
   if(command==='describe-endpoints'){const side=args.at(-1).endsWith('S')?'source':'target';return {Endpoints:[{EndpointArn:c.dms[side+'EndpointArn'],EndpointType:side,EngineName:'postgres',DatabaseName:c[side].identity.database,SslMode:'verify-full',CertificateArn:c.dms[side+'CertificateArn'],ExtraConnectionAttributes:side==='target'?'loadUsingCSV=false':'',PostgreSQLSettings:{SecretsManagerSecretId:side,SecretsManagerAccessRoleArn:'role',...(side==='source'?{CaptureDdls:false,PluginName:'test_decoding',FailTasksOnLobTruncation:true}:{AfterConnectScript:'SET session_replication_role=replica'})}}]};}
   if(command==='get-secret-value'){const side=args.at(-1);return {SecretString:JSON.stringify({host:c[side].host,port,username:c.dms[side+'Role'],password:'synthetic-only'})};}
   if(command==='describe-replication-tasks')return {ReplicationTasks:[{ReplicationTaskIdentifier:'byus-copy-dms-test',ReplicationTaskArn:state.dmsTaskArn,ReplicationInstanceArn:c.dms.replicationInstanceArn,SourceEndpointArn:c.dms.sourceEndpointArn,TargetEndpointArn:c.dms.targetEndpointArn,MigrationType:'full-load-and-cdc',TableMappings:JSON.stringify(state.dmsMappings),ReplicationTaskSettings:JSON.stringify(settings),Status:taskStatus,ReplicationTaskStats:{FullLoadProgressPercent:100,TablesErrored:0,TablesLoading:0,TablesQueued:0}}]};
   if(command==='describe-table-statistics')return {TableStatistics:[{SchemaName:'public',TableName:'items',TableState:'Table completed'},{SchemaName:'_byus_barrier',TableName:'barriers',TableState:'Table completed'}]};
   if(command==='stop-replication-task'){stopRequests++;taskStatus='stopped';return {};}
   throw new Error('Unexpected fake AWS operation');
  };
  const adapter=new DmsAdapter({c,source,target,state,aws:call});adapter.bind();state.dmsTransportHash=hash(await adapter.transport());
  const draft=await adapter.draft(s,baseline),fixture={syntheticOnly:true,customerDataReadOrReplicated:false,initialExactValues:true,cdcExactValues:true,oversize2097152BytesRejectedAt1048576Limit:true,targetUnchangedAfterRejectedOversize:true,identityRestoredToAlways:true,deletePreserved:true};
  const fixtureText=JSON.stringify(fixture);await writeFile(join(dir,'fixture.json'),fixtureText);
  const reviewed={...draft,fixtureEvidenceSha256:hash(fixtureText),evidence:[{path:'fixture.json',sha256:hash(fixtureText)}]};
  const manifestText=JSON.stringify(reviewed);await writeFile(manifest,manifestText);c.dms.manifestSha256=hash(manifestText);state.dmsManifestHash=c.dms.manifestSha256;state.configHash=hash(c);
  await adapter.preflight(s,baseline);

  // NOLOGIN still permits SET ROLE: reject membership independently of login state.
  target.run('alter role dms_apply_login nologin;revoke set on parameter session_replication_role from dms_apply_login;grant dms_apply_login to app_login with inherit false,set true;',{json:false});
  await assert.rejects(adapter.roleCheck(true),/Application role/);
  target.run('revoke dms_apply_login from app_login;alter role dms_apply_login login;grant set on parameter session_replication_role to dms_apply_login;',{json:false});
  psql(c.target.identity.database,'dms_apply_login',"set session_replication_role=replica;update public.items set value='corrupt-copy' where id=1;");
  await assert.rejects(adapter.verify(s,await auditDatabase(target)),/checksum differs/);assert(state.dmsSealed);
  target.run('alter role dms_apply_login login;grant set on parameter session_replication_role to dms_apply_login;',{json:false});
  psql(c.target.identity.database,'dms_apply_login',"set session_replication_role=replica;update public.items set value='초기😀' where id=1;");
  state.dmsSealed=false;taskStatus='running';
  const proof=await adapter.verify(s,await auditDatabase(target));assert.equal(proof.kind,'dms-committed-barrier-quiescent-checksum');assert.equal(Object.hasOwn(proof,'remoteLsn'),false);assert.equal(stopRequests,2);assert(state.dmsFinalized&&state.dmsSealed);
  assert.equal(target.run("select attidentity from pg_attribute where attrelid='public.items'::regclass and attname='id';",{json:false}),'a');assert.equal(target.run('select proof_hash from _byus_migration.dms_proofs;',{json:false}),hash(proof));
  // Force the reserve boundary; guarded abort still has time to close target then unfence source.
  c.timeoutSeconds=10;c.dms.rollbackReserveSeconds=3;state.fencedAt=Date.now()-6500;assert.throws(()=>remainingBudget(c,state),DmsBudgetError);
  const ledger=join(dir,'ledger.json');await applyAction('abort',c,source,target,state,ledger,{}, {adapter});
  assert.equal(state.phase,'aborted');assert(Date.now()-state.fencedAt<10000);assert.equal(source.run("select to_json(fenced) from _byus_migration.state where side='source';"),false);assert.equal(target.run("select to_json(fenced) from _byus_migration.state where side='target';"),true);
  // After deadline no source-unfence SQL may start; after first application write abort is forbidden.
  state.phase='fenced';state.fencedAt=Date.now()-10000;await assert.rejects(applyAction('abort',c,source,target,state,ledger,{}, {adapter}),/abort budget/);
  assert.throws(()=>assertAbortAllowed({firstWriteAt:new Date().toISOString()}),/cannot be reopened/);
 }finally{if(source)await source.close();if(target)await target.close();if(started)spawnSync('pg_ctl',['-D',join(dir,'pg'),'-m','immediate','-w','stop'],{env,stdio:'ignore'});await rm(dir,{recursive:true,force:true});}
});


test('ledger engine remains pinned even if a different config hash is supplied',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'byus-dms-ledger-'));
 try{const c=configuration(),file=join(dir,'ledger.json');await writeFile(file,JSON.stringify({runId:c.runId,engine:'native',configHash:hash(c),events:[]}));await assert.rejects(readState(file,c),/engine differs/);}finally{await rm(dir,{recursive:true,force:true});}
});
test('DMS verify is a mutation requiring --apply, and default plan invokes no AWS',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'byus-dms-verify-plan-'));
 try{const c=configuration(),file=join(dir,'config.json');await writeFile(file,JSON.stringify(c));const x=spawnSync(process.execPath,[new URL('./aws-db-migrate.mjs',import.meta.url).pathname,'verify','--config',file,'--out',dir],{encoding:'utf8',env:{...process.env,PATH:'/does-not-exist'}});assert.equal(x.status,0,x.stderr);assert.equal(JSON.parse(x.stdout).executed,false);assert.equal(JSON.parse(x.stdout).engine,'dms');}finally{await rm(dir,{recursive:true,force:true});}
});


test('review manifest is exact, evidence hashes are checked, and real-data receipts cannot masquerade as synthetic',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'byus-dms-manifest-'));
 try{
  const c=configuration();c.dms.manifestFile=join(dir,'manifest.json');
  const draft={format:1,engine:'dms',runId:c.runId,sourceIdentityHash:'source',targetIdentityHash:'target',sourceCatalogHash:'sourceDDL',targetCatalogHash:'targetDDL',transportHash:'transport',tables:[],identities:[],generated:[],findings:{textPk:[],compositePk:[]}};
  const fixture={syntheticOnly:true,customerDataReadOrReplicated:false,initialExactValues:true,cdcExactValues:true,oversize2097152BytesRejectedAt1048576Limit:true,targetUnchangedAfterRejectedOversize:true,identityRestoredToAlways:true,deletePreserved:true};
  const fixtureFile=join(dir,'fixture.json'),m={...draft,evidence:[]};
  const save=async()=>{const f=JSON.stringify(fixture);await writeFile(fixtureFile,f);m.fixtureEvidenceSha256=hash(f);m.evidence=[{path:'fixture.json',sha256:hash(f)}];const text=JSON.stringify(m);await writeFile(c.dms.manifestFile,text);c.dms.manifestSha256=hash(text);};
  await save();const adapter=new DmsAdapter({c,source:{},target:{},state:{},aws:()=>{throw new Error('No AWS permitted');}});adapter._draft=draft;
  assert.equal((await adapter.load({},{})).runId,c.runId);
  m.sourceCatalogHash='wrong';await save();await assert.rejects(adapter.load({},{}),/manifest differs/);m.sourceCatalogHash=draft.sourceCatalogHash;
  fixture.customerDataReadOrReplicated=true;await save();await assert.rejects(adapter.load({},{}),/synthetic fixture/);
  fixture.customerDataReadOrReplicated=false;fixture.deletePreserved=false;await save();await assert.rejects(adapter.load({},{}),/DELETE/);
  fixture.deletePreserved=true;await save();await writeFile(fixtureFile,'tampered');await assert.rejects(adapter.load({},{}),/evidence hash/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
