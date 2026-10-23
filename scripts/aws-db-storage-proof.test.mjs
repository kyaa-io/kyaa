import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,stat} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {assembleProof,proofDeadline,timeLeft,runBoundedProcess,bindStorageConfig} from './aws-db-storage-proof.mjs';
import {hash} from './aws-db-migrate.mjs';import {storageShapeHash,STORAGE_IMPORT_TABLES,validateFinalStorageReceipt,validateBlobEvidence} from './aws-db-dms-adapter.mjs';
import {migrateObject,fingerprint,sha} from './aws-storage-migrate.mjs';
function fixture(){
 const now=Date.now(),inventory={shape:'readonly',projection:{objects:{rows:'1',sha256:hash('objects')},buckets:{rows:'1',sha256:hash('buckets')}}};
 const tables=STORAGE_IMPORT_TABLES.map(name=>({schema:'public',name,rowCount:'1'}));
 const c={engine:'dms',runId:'storage_proof_test',accountId:'996702758024',environment:'dev',portReviewSha256:hash('review'),timeoutSeconds:300,dms:{rollbackReserveSeconds:30}};
 const state={writePausedAt:now-2000,fencedAt:now-1000,dmsStorageImportClosedAt:new Date(now-500).toISOString(),dmsStorageShapeHash:storageShapeHash(inventory),catalogHash:hash('source catalog'),targetCatalogHash:hash('reviewed final catalog'),dmsCopyCatalogHash:hash('observed copy catalog'),sourceGuardHash:hash('source guard'),targetGuardHash:hash('target guard')};
 const source={identity:{test:'source'},catalogHash:state.catalogHash,storageInventory:inventory,tables},target={identity:{test:'target'},catalogHash:state.dmsCopyCatalogHash,storageInventory:structuredClone(inventory),tables};
 const guards=Object.fromEntries(['source','target'].map(side=>[side,{fenced:true,firstWriteAt:null,functionHash:state[side+'GuardHash'],tables:tables.map(t=>t.schema+'.'+t.name)}]));
 const objects=[{sourceObjectIdSha256:hash('object-id'),sourceSha256:hash('body'),targetSha256:hash('body'),sourceBytes:4,targetBytes:4}];
 return{c,state,source,target,guards,sourceFenceVerified:true,storageInflightWriters:0,importSealed:true,objects,expectedObjectIds:[hash('object-id')],targetOnlyS3:tables.map(t=>({table:t.schema+'.'+t.name,rows:t.rowCount,sha256:hash('canonical '+t.name)})),blobObservedAt:new Date(now).toISOString(),observedAt:new Date(now).toISOString()};
}
test('actual byte verifier output produces receipts accepted by both existing strict consumers',async()=>{
 const f=fixture(),row={id:'synthetic-raw-id',bucket_id:'cms-assets',name:'synthetic-path',metadata:{size:4,mimetype:'image/webp'},user_metadata:{}};
 const prior={source_hash:fingerprint(row),sha256:sha('body'),etag:'etag'};
 const result=await migrateObject({row,prior,apply:false,verify:true,io:{sourceBody:async()=>Buffer.from('body'),targetBody:async()=>Buffer.from('body'),sourceRow:async()=>row,targetRow:async()=>({...row,state:'ready'}),head:async()=>({ETag:'etag',Metadata:{'byus-source':prior.source_hash}})}});
 f.objects=[result.blobEvidence];f.expectedObjectIds=[sha(row.id)];const {receipt,blob}=assembleProof(f);
 assert.doesNotThrow(()=>validateFinalStorageReceipt(receipt,{...f,now:Date.parse(f.observedAt)}));assert.doesNotThrow(()=>validateBlobEvidence(blob,receipt,f.expectedObjectIds));
 assert.equal(receipt.targetCatalogHash,f.state.targetCatalogHash);assert.equal(receipt.observedTargetCatalogHash,f.state.dmsCopyCatalogHash);assert.equal(receipt.targetCatalogStage,'copy');assert.notEqual(receipt.targetCatalogHash,receipt.observedTargetCatalogHash);
 assert(!JSON.stringify(blob).includes(row.id));assert(!JSON.stringify(blob).includes(row.name));
 f.state.dmsFinalized=true;assert.throws(()=>assembleProof(f));f.target.catalogHash=f.state.targetCatalogHash;assert.equal(assembleProof(f).receipt.targetCatalogStage,'final');
});
test('missing or duplicate blobs, other bytes, stale binding, open import and partial S3 tables fail closed',()=>{
 for(const mutate of [f=>f.objects=[],f=>f.objects.push(f.objects[0]),f=>f.objects[0].targetSha256=hash('other'),f=>f.objects[0].targetBytes++,f=>f.blobObservedAt=new Date(f.state.fencedAt-1).toISOString(),f=>f.state.catalogHash=hash('stale'),f=>f.target.catalogHash=f.state.targetCatalogHash,f=>f.importSealed=false,f=>f.storageInflightWriters=1,f=>f.sourceFenceVerified=false,f=>f.guards.source.functionHash=hash('changed'),f=>f.guards.target.fenced=false,f=>f.guards.target.firstWriteAt=new Date().toISOString(),f=>f.guards.source.tables=[],f=>f.targetOnlyS3.pop(),f=>f.targetOnlyS3[1]=f.targetOnlyS3[0],f=>f.targetOnlyS3[0].rows='2',f=>f.target.storageInventory.projection.objects.rows='2']){
  const f=fixture();mutate(f);assert.throws(()=>assembleProof(f));
 }
 const binding=fixture(),{receipt,blob}=assembleProof(binding);
 for(const patch of [{runId:'another_run'},{sourceIdentityHash:hash('previous identity')},{targetCatalogHash:hash('stale catalog')},{basePortReviewSha256:hash('old review')}])assert.throws(()=>validateFinalStorageReceipt({...receipt,...patch},{...binding,now:Date.parse(binding.observedAt)}));
 assert.throws(()=>validateBlobEvidence({...blob,runId:'another_run'},receipt,binding.expectedObjectIds));
 const stale=fixture();stale.observedAt=new Date(stale.state.fencedAt-1).toISOString();assert.throws(()=>assembleProof(stale));
 const expired=fixture();expired.state.writePausedAt=expired.state.fencedAt=Date.now()-271000;assert.throws(()=>assembleProof(expired),/reserve|deadline/);
});
test('deadline is absolute from writePausedAt and preserves the configured rollback reserve',()=>{
 const f=fixture(),deadline=proofDeadline(f.c,f.state);assert.equal(deadline,f.state.writePausedAt+270000);
 assert.equal(timeLeft(deadline,3000,deadline-10000),7000);assert.throws(()=>timeLeft(deadline,3000,deadline-3000));assert.throws(()=>proofDeadline(f.c,{...f.state,writePausedAt:Date.now()-270000,fencedAt:Date.now()-270000}));assert.throws(()=>proofDeadline(f.c,{...f.state,fencedAt:String(f.state.fencedAt)}));
});
test('a later fresh fence cannot reset the original 300-second pause budget for parent or child',()=>{
 const f=fixture(),now=Date.now();f.state.writePausedAt=now-268800;f.state.fencedAt=now-1000;
 const deadline=proofDeadline(f.c,f.state,now);
 assert.equal(deadline,f.state.writePausedAt+300000-30000);
 assert.equal(timeLeft(deadline,1000,now),200);
 assert(deadline<f.state.fencedAt+270000);
 const started=Date.now();assert.throws(()=>runBoundedProcess(process.execPath,['-e',"setTimeout(()=>process.stdout.write('too late'),2000)"],{deadlineAt:deadline,reserve:1000}),/deadline/);
 assert(Date.now()-started<1000);
 assert.throws(()=>proofDeadline(f.c,f.state,deadline+1),/deadline|reserve/);
 const legacy={...f.state};delete legacy.writePausedAt;assert.equal(proofDeadline(f.c,legacy,now),legacy.fencedAt+270000);
 for(const writePausedAt of [String(now-1000),NaN,now])assert.throws(()=>proofDeadline(f.c,{...f.state,writePausedAt},now));
});
test('slow subprocess I/O is terminated inside the same absolute deadline and no success file appears',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'byus-proof-deadline-')),file=join(dir,'must-not-exist');
 try{
  const started=Date.now();assert.throws(()=>runBoundedProcess(process.execPath,['-e',"setTimeout(()=>require('fs').writeFileSync(process.argv[1],'late'),2000)",file],{deadlineAt:Date.now()+150,reserve:25}),/deadline/);
  assert(Date.now()-started<1000);await assert.rejects(stat(file),{code:'ENOENT'});
  assert.throws(()=>runBoundedProcess(process.execPath,['-e',"require('fs').writeFileSync(process.argv[1],'early')",file],{deadlineAt:Date.now()-1,reserve:0}),/deadline/);await assert.rejects(stat(file),{code:'ENOENT'});
  assert.equal(runBoundedProcess(process.execPath,['-e',"process.stdout.write('ok')"],{deadlineAt:Date.now()+2000,reserve:100}),'ok');
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('verification config requires the same operator, identity endpoints, TLS and tunnel',()=>{
 const c={accountId:'996702758024',environment:'dev',region:'ap-northeast-2',profile:'test',source:{projectRef:'abcdefghijklmnopqrst',host:'db.abcdefghijklmnopqrst.supabase.co',identity:{database:'postgres'},migrationRole:'postgres',connectionEnv:'SOURCE_DB_URL',sslRootCert:'/source-ca'},target:{host:'target.rds.amazonaws.com',identity:{database:'byus'},migrationRole:'operator',connectionEnv:'TARGET_DB_URL',sslRootCert:'/target-ca',sqlTunnel:{port:15433}}};
 const storage={accountId:c.accountId,environment:c.environment,region:c.region,profile:c.profile,sourceProjectRef:c.source.projectRef,publicBucket:'byus-public-dev-996702758024',privateBucket:'byus-private-dev-996702758024',publicBaseUrl:'https://test.example',source:{host:c.source.host,database:'postgres',user:'postgres',connectionEnv:'SOURCE_DB_URL',caFile:'/source-ca'},target:{host:c.target.host,database:'byus',user:'operator',connectionEnv:'TARGET_DB_URL',caFile:'/target-ca',forwardedPort:15433}};
 assert.equal(bindStorageConfig(c,storage),storage);
 const dedicatedS3Role={...storage,profile:'byus-prod-storage-migration-20261023'};assert.equal(bindStorageConfig(c,dedicatedS3Role),dedicatedS3Role);
 for(const mutate of [s=>s.target.user='byus_storage_migrator',s=>s.target.connectionEnv='OTHER_URL',s=>s.target.database='other',s=>s.source.caFile='/other-ca',s=>s.target.forwardedPort=15434,s=>s.profile='',s=>s.profile=123]){const s=structuredClone(storage);mutate(s);assert.throws(()=>bindStorageConfig(c,s));}
});
