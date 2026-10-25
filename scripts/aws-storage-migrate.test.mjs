import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,chmod,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tombstoneObject,location,validateConfig,plan,sha,fingerprint,migrateObject,privateJson,connectionOptions,acquireImportLease,verifyObjects,objectTransaction } from './aws-storage-migrate.mjs';
test('guarded import acquires a transaction lease before any S3 operation and fails closed',async()=>{
 const calls=[],target={query:async sql=>{calls.push(sql);return{rows:[{guarded:true}]};}};
 await acquireImportLease(target);assert.equal(calls[1],'select _byus_migration.begin_storage_import()');
 await assert.rejects(acquireImportLease({query:async sql=>{if(sql.includes('begin_storage_import'))throw new Error('closed');return{rows:[{guarded:true}]};}}),/closed/);
 const initial=[];await acquireImportLease({query:async sql=>{initial.push(sql);return{rows:[{guarded:false}]};}});assert.equal(initial.length,1);
});
const config = () => ({environment:'dev',accountId:'996702758024',region:'ap-northeast-2',sourceProjectRef:'abcdefghijklmnopqrst',profile:'Sallylab996',publicBucket:'byus-public-dev-996702758024',privateBucket:'byus-private-dev-996702758024',publicBaseUrl:'https://assets.example.test',source:{host:'db.abcdefghijklmnopqrst.supabase.co',database:'postgres',user:'postgres',connectionEnv:'SOURCE_DB_URL',caFile:'/ca'},target:{host:'test.rds.amazonaws.com',database:'postgres',user:'migration',connectionEnv:'TARGET_DB_URL',caFile:'/ca'}});
const row = {id:'00000000-0000-0000-0000-000000000001',bucket_id:'cms-assets',name:'folder/file.webp',owner:'original-owner',metadata:{size:3,mimetype:'image/webp'},user_metadata:{original:'value'}};
function fixture(overrides={}) {
  const body = Buffer.from('abc'); const calls=[];
  return {calls,sourceBody:async()=>body,sourceRow:async()=>row,targetRow:async()=>null,head:async()=>null,targetBody:async()=>body,put:async()=>calls.push('put'),record:async()=>calls.push('record'),...overrides};
}
test('explicit account, environment, source identity and distinct buckets',()=>{
  assert.equal(validateConfig(config()).accountId,'996702758024');
  for(const change of [{accountId:'000000000000'},{environment:'production'},{region:'us-east-1'},{sourceProjectRef:'wrong'},{privateBucket:config().publicBucket},{publicBaseUrl:'http://assets.test'}]) assert.throws(()=>validateConfig({...config(),...change}));
});
test('only cms-assets is public, logical paths unchanged',()=>{
 assert.deepEqual(location(config(),row),{Bucket:config().publicBucket,Key:'public-assets/cms-assets/folder/file.webp'});
 assert.equal(location(config(),{...row,bucket_id:'fan-avatars'}).Key,'fan-avatars/folder/file.webp');
 for(const name of ['../x','a//x','a/./x','a\\x','a/\nx']) assert.throws(()=>location(config(),{...row,name}));
 assert.throws(()=>location(config(),{...row,bucket_id:'unknown'}));
});
test('platform bucket names retain environment and public/private guards',()=>{
 const c={...config(),publicBucket:'byus-dev-platform-publicassetsbucket-abc123',privateBucket:'byus-dev-platform-privateproofsbucket-xyz456'};
 assert.equal(validateConfig(c),c);
 for(const change of [{environment:'prod'},{publicBucket:c.privateBucket,privateBucket:c.publicBucket},{publicBucket:'unrelated-bucket'}]) assert.throws(()=>validateConfig({...c,...change}));
});
test('SSM transport keeps RDS certificate and URL identity verification',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'byus-storage-tls-'));
 try {
  const ca=join(dir,'ca.pem');await writeFile(ca,'test-ca');
  const c=config();c.target={...c.target,forwardedPort:15433,caFile:ca};validateConfig(c);
  const options=await connectionOptions(c,'target',{TARGET_DB_URL:'postgresql://migration:secret@test.rds.amazonaws.com:5432/postgres'});
  assert.equal(options.host,'127.0.0.1');assert.equal(options.port,15433);assert.equal(options.ssl.servername,c.target.host);assert.equal(options.ssl.rejectUnauthorized,true);assert.equal(options.ssl.ca,'test-ca');
  await assert.rejects(()=>connectionOptions(c,'target',{TARGET_DB_URL:'postgresql://migration:secret@127.0.0.1:15433/postgres'}));
  for(const forwardedPort of [0,543.2,65536,'15433']) assert.throws(()=>validateConfig({...c,target:{...c.target,forwardedPort}}));
  assert.throws(()=>validateConfig({...c,source:{...c.source,forwardedPort:15432}}));
 } finally {await rm(dir,{recursive:true,force:true});}
});
test('delta preserves replacements and identifies deleted paths, duplicate fail closed',()=>{
 assert.deepEqual(plan([row],[{...row,name:'gone'}]).removed.map(r=>r.name),['gone']);
 assert.throws(()=>plan([row,row],[]));
});
test('dry-run hashes actual source and performs no writes',async()=>{
 const io=fixture();const result=await migrateObject({row,io,apply:false});assert.equal(result.checksum,sha('abc'));assert.deepEqual(io.calls,[]);
});
test('apply checks bytes before confirming metadata',async()=>{
 const io=fixture({head:async()=>({ETag:'etag'})});await assert.rejects(()=>migrateObject({row,io,apply:true}));
 const ok=fixture();let count=0;ok.head=async()=>++count===1?null:{ETag:'etag'};
 await migrateObject({row,io:ok,apply:true});assert.deepEqual(ok.calls,['put','record']);
});
test('copy-time source replacement fails before or after upload',async()=>{
 const changed=fixture({sourceRow:async()=>({...row,updated_at:'new'})});await assert.rejects(()=>migrateObject({row,io:changed,apply:true}));assert.deepEqual(changed.calls,[]);
 let n=0;const io=fixture({sourceRow:async()=>++n===1?row:{...row,updated_at:'new'},head:async()=>null});await assert.rejects(()=>migrateObject({row,io,apply:true}));assert.deepEqual(io.calls,['put']);
});
test('native data, tombstones and checksum mismatch never overwrite',async()=>{
 for(const overrides of [{targetRow:async()=>({state:'deleted'})},{head:async()=>({ETag:'native',Metadata:{}})},{sourceBody:async()=>Buffer.from('badsize')},{targetBody:async()=>Buffer.from('bad')}]) {
 const io=fixture(overrides);await assert.rejects(()=>migrateObject({row,io,apply:true}));assert.ok(!io.calls.includes('record'));
 }
});
test('idempotent pass checks full body and original metadata without Put',async()=>{
 const prior={source_hash:fingerprint(row),sha256:sha('abc'),etag:'etag'};
 const io=fixture({targetRow:async()=>({...row,state:'ready'}),head:async()=>({ETag:'etag',Metadata:{'byus-source':prior.source_hash}})});
 await migrateObject({row,prior,io,apply:true});assert.deepEqual(io.calls,[]);
 const broken=fixture({...io,targetBody:async()=>Buffer.from('bad')});await assert.rejects(()=>migrateObject({row,prior,io:broken,apply:false,verify:true}));
});
test('interrupted exact-generation copy is adopted only after byte verification',async()=>{
 const io=fixture({head:async()=>({ETag:'etag',Metadata:{'byus-source':fingerprint(row)}})});
 await migrateObject({row,io,apply:true});assert.deepEqual(io.calls,['put','record']);
});
test('private config artifacts reject readable files',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'byus-storage-test-'));
 try{const path=join(dir,'config.json');await writeFile(path,'{}',{mode:0o600});assert.deepEqual(await privateJson(path),{});await chmod(path,0o644);await assert.rejects(()=>privateJson(path));}finally{await rm(dir,{recursive:true,force:true});}
});

test('deletion delta uses CAS, never deletes source, rejects native races and queued tombstones',async()=>{
 const old={etag:'etag',source_hash:'source'};const calls=[];
 const io={sourceExists:async()=>false,targetRow:async()=>({state:'ready'}),head:async()=>({ETag:'etag',Metadata:{'byus-source':'source'}}),remove:async(r,etag)=>calls.push(etag),recordDeletion:async()=>calls.push('tombstone')};
 await tombstoneObject(old,io);assert.deepEqual(calls,['etag','tombstone']);
 for(const overrides of [{sourceExists:async()=>true},{head:async()=>({ETag:'changed',Metadata:{}})},{targetRow:async()=>({state:'deleted'})},{targetRow:async()=>({state:'ready',delete_queued:true})}]) {
 const changes=[];await assert.rejects(()=>tombstoneObject(old,{...io,...overrides,remove:async()=>changes.push('delete'),recordDeletion:async()=>changes.push('metadata')}));assert.deepEqual(changes,[]);
 }
});

function leasedConnections({ rollbackFails=false, stalledQuery }={}) {
 const calls=[];let lease=false,transaction=false,ended=false;
 const target={connection:{stream:{destroy(){calls.push('disconnect');lease=false;transaction=false;}}},
  async query(config){const sql=typeof config==='string'?config:config.text;calls.push(sql);
   if(sql==='begin')transaction=true;
   if(sql.includes('to_regnamespace'))return{rows:[{guarded:true}]};
   if(sql.includes('begin_storage_import'))lease=true;
   if(sql===stalledQuery)return new Promise(()=>{});
   if(sql==='rollback'){if(rollbackFails)throw Error('rollback transport failure');lease=false;transaction=false;}
   if(sql==='commit'){lease=false;transaction=false;}
   return{rows:[]};},async end(){ended=true;lease=false;transaction=false;calls.push('end');}};
 const source={...target,connection:{stream:{destroy(){calls.push('source-disconnect');}}}};
 return{target,source,calls,status:()=>({lease,transaction,ended})};
}

test('object deadline aborts stalled SDK send and releases lease with no commit/receipt',async()=>{
 const {objectTransaction}=await import('./aws-storage-migrate.mjs');
 const f=leasedConnections();let sdkAborted=false,receipt=false;
 const sdk={send(command,{abortSignal}){return new Promise((resolve,reject)=>{
  abortSignal.addEventListener('abort',()=>{sdkAborted=true;reject(Error('SDK aborted'));},{once:true});
 });}};
 const started=Date.now();
 await assert.rejects(async()=>{await objectTransaction(f.source,f.target,async({target,deadline})=>{
  await acquireImportLease(target);assert.equal(f.status().lease,true);
  await deadline.send(sdk,{});
 },30);receipt=true;},/deadline|aborted/i);
 assert.equal(sdkAborted,true);assert.equal(receipt,false);assert.equal(f.status().lease,false);
 assert.equal(f.status().transaction,false);assert.equal(f.calls.includes('commit'),false);
 assert(f.calls.includes('disconnect'));assert(Date.now()-started<1000);
});

test('headers then stalled S3 body is destroyed on the same transaction deadline',async()=>{
 const {objectTransaction}=await import('./aws-storage-migrate.mjs');
 const {PassThrough}=await import('node:stream');
 const stream=new PassThrough();let bodyReading=false,receipt=false;
 stream.transformToByteArray=async()=>{bodyReading=true;const chunks=[];for await(const chunk of stream)chunks.push(chunk);return Buffer.concat(chunks);};
 const f=leasedConnections();
 await assert.rejects(async()=>{await objectTransaction(f.source,f.target,async({target,deadline})=>{
  await acquireImportLease(target);
  const response=await deadline.send({send:async()=>({Body:stream})},{});
  await deadline.body(response.Body);
 },30);receipt=true;},/deadline|premature|aborted/i);
 assert.equal(bodyReading,true);assert.equal(stream.destroyed,true);assert.equal(receipt,false);
 assert.equal(f.status().lease,false);assert.equal(f.calls.includes('commit'),false);
});

test('deleted-object stalled CAS uses the same deadline and cannot record a tombstone',async()=>{
 const {objectTransaction}=await import('./aws-storage-migrate.mjs');
 const f=leasedConnections();let recorded=false,aborted=false;
 await assert.rejects(objectTransaction(f.source,f.target,async({target,deadline})=>{
  await acquireImportLease(target);
  await tombstoneObject({etag:'exact',source_hash:'source'}, {
   sourceExists:async()=>false,targetRow:async()=>({state:'ready'}),head:async()=>({ETag:'exact',Metadata:{'byus-source':'source'}}),
   remove:()=>deadline.send({send:(command,{abortSignal})=>new Promise((resolve,reject)=>{abortSignal.addEventListener('abort',()=>{aborted=true;reject(Error('SDK aborted'));},{once:true});})},{}),
   recordDeletion:async()=>{recorded=true;},
  });
 },30),/deadline|aborted/i);
 assert.equal(aborted,true);assert.equal(recorded,false);assert.equal(f.status().lease,false);
 assert.equal(f.calls.includes('commit'),false);
});

test('deadline includes BEGIN and COMMIT and destroys an unresponsive database transport',async()=>{
 const {objectTransaction}=await import('./aws-storage-migrate.mjs');
 for(const stalledQuery of ['begin','commit']){
  const f=leasedConnections({stalledQuery});let receipt=false;
  await assert.rejects(async()=>{await objectTransaction(f.source,f.target,async({target})=>{await acquireImportLease(target);},25);receipt=true;},/deadline/);
  assert.equal(receipt,false);assert.equal(f.status().transaction,false);assert.equal(f.status().lease,false);
  assert(f.calls.includes('disconnect'));
 }
});

test('failed rollback forces connection end; successful transaction commits before returning',async()=>{
 const {objectTransaction}=await import('./aws-storage-migrate.mjs');
 const f=leasedConnections({rollbackFails:true});
 await assert.rejects(objectTransaction(f.source,f.target,async({target})=>{await acquireImportLease(target);throw Error('stop');}),/stop/);
 assert.equal(f.status().ended,true);assert.equal(f.status().lease,false);assert(f.calls.includes('disconnect'));
 const ok=leasedConnections();assert.equal(await objectTransaction(ok.source,ok.target,async({target})=>{await acquireImportLease(target);return 'verified';}),'verified');
 assert(ok.calls[1].includes("transaction_timeout"));assert(ok.calls[1].includes("idle_in_transaction_session_timeout"));assert.equal(ok.calls.at(-1),'commit');assert.equal(ok.status().lease,false);assert.equal(ok.calls.includes('disconnect'),false);
});

test('stalled rollback is bounded and forcibly closes the actual target connection', {timeout:8000}, async()=>{
 const {objectTransaction}=await import('./aws-storage-migrate.mjs');
 const f=leasedConnections({stalledQuery:'rollback'});const started=Date.now();
 await assert.rejects(objectTransaction(f.source,f.target,async({target})=>{
  await acquireImportLease(target);throw Error('stop importer');
 }),/stop importer/);
 assert.equal(f.status().lease,false);assert.equal(f.status().ended,true);
 assert(f.calls.includes('disconnect'));assert(Date.now()-started<6500);
 assert.equal(f.calls.includes('commit'),false);
});

test('PG17 transaction timeout terminates real lease backends and unblocks seal UPDATE', {timeout:20000}, async t=>{
 const {spawnSync}=await import('node:child_process');
 const {createServer}=await import('node:net');
 const {createRequire}=await import('node:module');
 const {configureObjectTimeout}=await import('./aws-storage-migrate.mjs');
 const pgRequire=createRequire(new URL('../apps/web/package.json',import.meta.url));
 const {Client}=pgRequire('pg');
 for(const command of ['initdb','pg_ctl']) {
  if(spawnSync('which',[command]).status!==0)throw Error('PG17 binaries required on PATH for real lease regression');
 }
 const version=spawnSync('pg_ctl',['--version'],{encoding:'utf8'});
 assert.match(version.stdout,/PostgreSQL\) 17\./,'this regression requires actual PostgreSQL 17');
 const dir=await mkdtemp(join(tmpdir(),'byus-import-server-timeout-'));
 const listener=createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));
 const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
 const env={...process.env};for(const key of Object.keys(env))if(key.startsWith('PG'))delete env[key];
 const command=(name,args)=>{const result=spawnSync(name,args,{env,encoding:'utf8',timeout:10000});assert.equal(result.status,0,'disposable PG setup failed');};
 const clients=[];let started=false,passed=false;
 const client=async()=>{
  const db=new Client({host:'127.0.0.1',port,database:'postgres',user:process.env.USER,connectionTimeoutMillis:2000,query_timeout:5000});
  const errors=[];db.on('error',error=>errors.push(error.code));
  await db.connect();clients.push(db);return{db,errors};
 };
 try {
  command('initdb',['-D',join(dir,'pg'),'-A','trust','--no-locale','-E','UTF8']);
  command('pg_ctl',['-D',join(dir,'pg'),'-l',join(dir,'server.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start']);started=true;
  const {db:observer}=await client();
  await observer.query('create table import_lease(singleton boolean primary key,imports_open boolean not null);insert into import_lease values(true,true);');
  await t.test('source JSON numeric roundtrip must remain exact before Put',async()=>{
   const {readSourceRow}=await import('./aws-storage-migrate.mjs');
   await observer.query(`create schema storage;create table storage.objects(
    id uuid,bucket_id text,name text,owner uuid,owner_id text,created_at timestamptz,updated_at timestamptz,last_accessed_at timestamptz,metadata jsonb,user_metadata jsonb);
    insert into storage.objects(id,bucket_id,name,metadata,user_metadata) values
    ('00000000-0000-0000-0000-000000000001','cms-assets','safe','{"size":3,"mimetype":"image/webp","nested":{"n":42}}','{"n":123}'),
    ('00000000-0000-0000-0000-000000000002','cms-assets','null-user','{"size":3,"mimetype":"image/webp"}',null),
    ('00000000-0000-0000-0000-000000000003','cms-assets','unsafe','{"size":3,"mimetype":"image/webp","unsafe":9007199254740993}','{}'),
    ('00000000-0000-0000-0000-000000000004','cms-assets','unsafe-user','{"size":3,"mimetype":"image/webp"}','{"unsafe":9007199254740993}');`);
   const rows=(await observer.query('select * from storage.objects order by name')).rows;
   for(const name of ['safe','null-user']){
    const initial=rows.find(r=>r.name===name),checked=await readSourceRow(observer,initial);
    assert.deepEqual(checked.metadata,initial.metadata);assert.deepEqual(checked.user_metadata,initial.user_metadata);
   }
   for(const name of ['unsafe','unsafe-user']){
    const initial=rows.find(r=>r.name===name);let puts=0;
    assert.equal((name==='unsafe'?initial.metadata:initial.user_metadata).unsafe,9007199254740992,'driver rounds the unsafe number');
    await assert.rejects(migrateObject({row:initial,apply:true,io:fixture({sourceRow:r=>readSourceRow(observer,r),put:async()=>{puts++;}})}),/Storage migration check failed/);
    assert.equal(puts,0,'database JSON comparison rejects before Put');
   }
   const safe=rows.find(r=>r.name==='safe');
   await observer.query("update storage.objects set metadata=jsonb_set(metadata,'{nested,n}','43') where name='safe'");
   await assert.rejects(readSourceRow(observer,safe),/Storage migration check failed/);
  });
  for(const mode of ['active SQL','idle transaction'])await t.test(mode,async()=>{
   await observer.query('update import_lease set imports_open=true');
   const {db:importer,errors}=await client(),{db:sealer}=await client();
   const pid=(await importer.query('select pg_backend_pid() as pid')).rows[0].pid;
   await importer.query('begin');await configureObjectTimeout(importer,350);
   await importer.query('select * from import_lease where singleton for share');
   let sealed=false,queryError;
   const update=sealer.query('update import_lease set imports_open=false where singleton').then(()=>{sealed=true;});
   // Handler attached immediately: FATAL timeout must reject active query safely.
   const active=mode==='active SQL'?importer.query('select pg_sleep(5)').catch(error=>{queryError=error.code;}):Promise.resolve();
   await new Promise(resolve=>setTimeout(resolve,75));assert.equal(sealed,false,'seal must initially block behind actual shared lease');
   const startedWaiting=Date.now();await update;await active;
   assert(Date.now()-startedWaiting<1500,'server termination releases lease promptly');
   const alive=await observer.query('select count(*)::int as count from pg_stat_activity where pid=$1',[pid]);
   assert.equal(alive.rows[0].count,0,'server backend actually terminated');
   assert.equal((await observer.query('select imports_open from import_lease')).rows[0].imports_open,false);
   assert(queryError==='25P04'||errors.includes('25P04'),'termination must be transaction_timeout, not statement/idle cancellation');
  });
  passed=true;
 } finally {
  await Promise.all(clients.map(db=>db.end().catch(()=>{})));
  if(started)spawnSync('pg_ctl',['-D',join(dir,'pg'),'-m','immediate','-w','stop'],{env,stdio:'ignore'});
  if(passed)await rm(dir,{recursive:true,force:true});
  else console.error('Disposable PG17 timeout fixture retained:',dir);
 }
});

test('final verify evidence is derived from the two actual bodies without paths or raw IDs',async()=>{
 const prior={source_hash:fingerprint(row),sha256:sha('abc'),etag:'etag'};
 const io=fixture({targetRow:async()=>({...row,state:'ready'}),head:async()=>({ETag:'etag',Metadata:{'byus-source':prior.source_hash}})});
 const result=await migrateObject({row,prior,io,apply:false,verify:true});
 assert.deepEqual(result.blobEvidence,{sourceObjectIdSha256:sha(row.id),sourceSha256:sha('abc'),targetSha256:sha('abc'),sourceBytes:3,targetBytes:3});
 assert(!JSON.stringify(result.blobEvidence).includes(row.id));assert(!JSON.stringify(result.blobEvidence).includes(row.name));
 await assert.rejects(migrateObject({row,prior,io:{...io,targetBody:async()=>Buffer.from('abd')},apply:false,verify:true}));
 await assert.rejects(migrateObject({row,io:fixture(),apply:false,verify:true}));
});
test('injected absolute deadline rejects before config, STS, or any network work',async()=>{
 const {main}=await import('./aws-storage-migrate.mjs');
 await assert.rejects(main(['/not-read'],{deadlineAt:Date.now()-1,quiet:true}),/deadline/);
});

function deferred() {
 let resolve,reject;
 const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
 return {promise,resolve,reject};
}
function verificationConnections() {
 const connections=[];
 return {connections,connect:async side=>{
  const db={side,active:false,ended:false,destroyed:false,
   connection:{stream:{destroy(){db.destroyed=true;db.active=false;}}},
   async query(config){
    const sql=typeof config==='string'?config:config.text;
    if(sql==='begin'){assert.equal(db.active,false,'no interleaved transactions');db.active=true;}
    if(sql==='commit'||sql==='rollback'){db.active=false;}
    return {rows:[]};
   },
   async end(){assert.equal(db.active,false,'transaction settled before closing');db.ended=true;},
  };
  connections.push(db);return db;
 }};
}
test('verify workers bound progress to four distinct pairs and preserve input evidence order',async()=>{
 const f=verificationConnections(),gates=Array.from({length:8},deferred),firstFour=deferred();
 const started=[],owners=new Map();let active=0,maximum=0;
 const pending=verifyObjects(gates.map((_,i)=>i),f.connect,async(index,source,target)=>{
  assert.notEqual(source,target);
  for(const db of [source,target]){assert(!owners.has(db)||owners.get(db)===source,'connection belongs to one worker pair');owners.set(db,source);}
  started.push(index);maximum=Math.max(maximum,++active);
  if(started.length===4)firstFour.resolve();
  return objectTransaction(source,target,async({source:src})=>{
   await src.query('select 1');await gates[index].promise;active--;return {blobEvidence:index};
  });
 });
 await firstFour.promise;
 assert.deepEqual(started,[0,1,2,3]);assert.equal(f.connections.length,8);
 gates[3].resolve();
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(started,[0,1,2,3,4]);
 for(const gate of gates)gate.resolve();
 assert.deepEqual(await pending,gates.map((_,i)=>({blobEvidence:i})));
 assert.equal(maximum,4);assert(f.connections.every(db=>db.ended));
});
test('first verify failure stops assignment and drains every in-flight transaction before rejection',async()=>{
 const f=verificationConnections(),gates=Array.from({length:9},deferred),firstFour=deferred();
 const started=[];let settled=false;
 const pending=verifyObjects(gates.map((_,i)=>i),f.connect,(index,source,target)=>objectTransaction(source,target,async()=>{
  started.push(index);if(started.length===4)firstFour.resolve();
  await gates[index].promise;return index;
 }));
 const rejection=assert.rejects(pending,/first failure/).then(()=>{settled=true;});
 await firstFour.promise;gates[0].reject(Error('first failure'));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(settled,false,'must wait for other active work');
 for(const gate of gates.slice(1,4))gate.resolve();
 await rejection;assert.deepEqual(started,[0,1,2,3]);
 assert(f.connections.every(db=>db.ended&&!db.active));
});
test('verify deadline aborts each owned transaction and bounds stalled connection cleanup', {timeout:3000},async()=>{
 const f=verificationConnections();let blockedEnd=false;
 const connect=async side=>{
  const db=await f.connect(side);
  if(!blockedEnd){blockedEnd=true;db.end=async()=>new Promise(()=>{});}
  return db;
 };
 const started=Date.now();
 await assert.rejects(verifyObjects([0,1,2,3,4],connect,(index,source,target)=>objectTransaction(source,target,
  ()=>new Promise(()=>{}),25)),/deadline/);
 assert.equal(f.connections.length,8);assert(f.connections.every(db=>db.destroyed));
 assert(f.connections.slice(1).every(db=>db.ended));assert(Date.now()-started<2000);
});
test('verify connection failure closes partial pairs and creates no later work',async()=>{
 const f=verificationConnections();let targetCount=0,processed=0;
 await assert.rejects(verifyObjects([0,1,2,3,4,5],async side=>{
  if(side==='target'&&++targetCount===1)throw Error('connect failure');
  return f.connect(side);
 },async()=>{processed++;await new Promise(resolve=>setImmediate(resolve));}),/connect failure/);
 assert(processed<=3);assert(f.connections.every(db=>db.ended));
 assert.deepEqual(await verifyObjects([],()=>assert.fail('empty inventory needs no workers'),()=>assert.fail()),[]);
});

test('large verification bodies run alone before small workers and preserve evidence order',async()=>{
 const f=verificationConnections(),largeGate=deferred(),largeStarted=deferred(),started=[];
 const rows=[{id:0,metadata:{size:1024}},{id:1,metadata:{size:40590806}},{id:2,metadata:{size:2048}}];
 const pending=verifyObjects(rows,f.connect,async row=>{started.push(row.id);if(row.id===1){largeStarted.resolve();await largeGate.promise;}return row.id;});
 await largeStarted.promise;assert.deepEqual(started,[1]);assert.equal(f.connections.length,2);
 largeGate.resolve();assert.deepEqual(await pending,[0,1,2]);assert.deepEqual(started,[1,0,2]);assert(f.connections.every(db=>db.ended));
 const failed=verificationConnections(),attempts=[];
 await assert.rejects(verifyObjects(rows,failed.connect,async row=>{attempts.push(row.id);throw Error('large failed');}),/large failed/);
 assert.deepEqual(attempts,[1]);assert(failed.connections.every(db=>db.ended));
});
