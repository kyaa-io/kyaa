#!/usr/bin/env node
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve,join,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as migration from './aws-db-migrate.mjs';
import {DmsAdapter,remainingBudget,checksumSql,validateFinalStorageReceipt,validateBlobEvidence,STORAGE_IMPORT_TABLES,STORAGE_IMPORT_ROLE} from './aws-db-dms-adapter.mjs';
import {privateJson,validateConfig as validateStorageConfig} from './aws-storage-migrate.mjs';
const {Database,validateConfig,readState,auditDatabase,hash,literal}=migration;
const fail=()=>{throw Error('Final storage proof failed; private evidence required');};
const CLEANUP=3000;
export function proofDeadline(c,state,now=Date.now()){
 if(c.engine!=='dms'||!Number.isFinite(state.fencedAt)||state.fencedAt<=0||!state.dmsStorageShapeHash||!Number.isFinite(Date.parse(state.dmsStorageImportClosedAt)))fail();
 const startedAt=state.writePausedAt??state.fencedAt;
 if(!Number.isFinite(startedAt)||startedAt<=0||startedAt>state.fencedAt)fail();
 remainingBudget(c,state,{now});
 const deadlineAt=startedAt+(c.timeoutSeconds??300)*1000-c.dms.rollbackReserveSeconds*1000;
 timeLeft(deadlineAt,1000,now);
 return deadlineAt;
}
export function timeLeft(deadlineAt,reserve=CLEANUP,now=Date.now()){
 const left=deadlineAt-now-reserve;if(!Number.isFinite(left)||left<1)throw Error('Final storage proof deadline exhausted');return Math.floor(left);
}
// The parent bounds DNS, SDK retries, body reads and cleanup, including blocking I/O.
export function runBoundedProcess(program,args,{deadlineAt,reserve=CLEANUP,env=process.env}={}){
 const result=spawnSync(program,args,{env,encoding:'utf8',timeout:timeLeft(deadlineAt,reserve),killSignal:'SIGKILL',maxBuffer:1024*1024});
 if(result.error||result.status!==0)throw Error('Final storage verification subprocess failed or exceeded deadline');
 timeLeft(deadlineAt,reserve);return result.stdout;
}
export function bindStorageConfig(c,s){
 validateStorageConfig(s);
 if(typeof s.profile!=='string'||!s.profile.trim())fail();
 for(const key of ['accountId','environment','region'])if(s[key]!==c[key])fail();
 if(s.sourceProjectRef!==c.source.projectRef)fail();
 for(const side of ['source','target']){
  const a=c[side],b=s[side];
  if(b.host!==a.host||b.database!==a.identity.database||b.user!==a.migrationRole||b.connectionEnv!==a.connectionEnv||resolve(b.caFile)!==resolve(a.sslRootCert))fail();
 }
 if(s.source.forwardedPort!==undefined||s.target.forwardedPort!==c.target.sqlTunnel?.port||s.target.user===STORAGE_IMPORT_ROLE)fail();
 return s;
}
export function assembleProof({c,state,source,target,guards,sourceFenceVerified,storageInflightWriters,importSealed,objects,expectedObjectIds,targetOnlyS3,blobObservedAt,observedAt=new Date().toISOString()}){
 proofDeadline(c,state,Date.parse(observedAt));
 if(!importSealed||source.catalogHash!==state.catalogHash||target.catalogHash!==(state.dmsFinalized?state.targetCatalogHash:state.dmsCopyCatalogHash))fail();
 for(const [side,audit] of [['source',source],['target',target]]){
  const guard=guards[side];if(guard?.fenced!==true||guard.functionHash!==state[side+'GuardHash']||side==='target'&&guard.firstWriteAt||hash([...guard.tables].sort())!==hash(audit.tables.map(t=>t.schema+'.'+t.name).sort()))fail();
 }
 const receipt={format:1,engine:'dms',runId:c.runId,accountId:c.accountId,environment:c.environment,fencedAt:state.fencedAt,importsClosedAt:state.dmsStorageImportClosedAt,observedAt,basePortReviewSha256:c.portReviewSha256,sourceIdentityHash:hash(source.identity),targetIdentityHash:hash(target.identity),sourceCatalogHash:source.catalogHash,
  // The consumer binds the reviewed final catalog; preserve the observed copy stage separately.
  targetCatalogHash:state.targetCatalogHash,observedTargetCatalogHash:target.catalogHash,targetCatalogStage:state.dmsFinalized?'final':'copy',sourceGuardHash:guards.source.functionHash,targetGuardHash:guards.target.functionHash,sourceStorageGuardHash:state.dmsStorageGuardHash,storageInflightWriters,sourceProjectionFingerprint:hash(source.storageInventory.projection),targetInventoryFingerprint:hash(target.storageInventory),targetShapeHash:state.dmsStorageShapeHash,targetOnlyS3};
 const blob={format:1,runId:c.runId,fencedAt:state.fencedAt,sourceProjectionFingerprint:receipt.sourceProjectionFingerprint,observedAt:blobObservedAt,objects};
 validateFinalStorageReceipt(receipt,{c,state,source,target,sourceFenceVerified,now:Date.parse(observedAt)});
 validateBlobEvidence(blob,receipt,expectedObjectIds);
 if(Date.parse(blobObservedAt)<Date.parse(state.dmsStorageImportClosedAt))fail();
 for(const row of targetOnlyS3){const t=target.tables.find(t=>t.schema+'.'+t.name===row.table);if(!t||String(row.rows)!==t.rowCount)fail();}
 return {receipt,blob};
}
async function load(argv){
 const flags={};for(let i=0;i<argv.length;i+=2){if(!['--config','--ledger','--storage-config','--out','--worker'].includes(argv[i])||flags[argv[i]]||!argv[i+1]||argv[i+1].startsWith('--'))fail();flags[argv[i]]=argv[i+1];}
 if(['--config','--ledger','--storage-config','--out'].some(k=>!flags[k]))fail();
 const c=validateConfig(await privateJson(resolve(flags['--config']))),state=await readState(resolve(flags['--ledger']),c),deadlineAt=proofDeadline(c,state);
 const storage=bindStorageConfig(c,await privateJson(resolve(flags['--storage-config'])));
 if(flags['--worker']&&Number(flags['--worker'])!==deadlineAt)fail();
 return {flags,c,state,storage,deadlineAt,out:resolve(flags['--out'])};
}
export async function main(argv=process.argv.slice(2)){
 const inputs=await load(argv),{flags,c,state,storage,deadlineAt,out}=inputs;
 timeLeft(deadlineAt);
 if(!flags['--worker']){
  // Use a fresh directory: partial/private evidence is never overwritten on retry.
  await mkdir(out,{mode:0o700});
  const output=runBoundedProcess(process.execPath,[fileURLToPath(import.meta.url),...argv,'--worker',String(deadlineAt)],{deadlineAt});
  const result=JSON.parse(output);console.log(JSON.stringify(result));return result;
 }
 const budget=()=>{remainingBudget(c,state);return Math.min(15000,timeLeft(deadlineAt,2*CLEANUP));};
 let source,target,proof;
 try{
  source=await Database.open(c,'source');source.budget=budget;budget();
  target=await Database.open(c,'target');target.budget=budget;budget();
  const adapter=new DmsAdapter({c,state,source,target,aws:()=>fail()});
  if(typeof migration.guardStatus!=='function')throw Error('Readonly guardStatus export required');
  const check=async()=>{budget();await adapter.storageImportSealed();const fenced=await adapter.storageTriggers(true);const guards={source:migration.guardStatus(c,source),target:migration.guardStatus(c,target)};return{fenced,guards};};
  await check();
  const verifyConfig=join(out,'storage-verification-config.json'),inventoryPath=join(out,'storage-inventory.json');
  await writeFile(verifyConfig,JSON.stringify({...storage,outputFile:inventoryPath},null,2)+'\n',{mode:0o600,flag:'wx'});
  const program=`import {main} from ${JSON.stringify(new URL('./aws-storage-migrate.mjs',import.meta.url).href)};await main([process.argv[1],'--verify','--barrier'],{deadlineAt:Number(process.argv[2]),quiet:true});`;
  runBoundedProcess(process.execPath,['--input-type=module','-e',program,verifyConfig,String(deadlineAt-4*CLEANUP)],{deadlineAt,reserve:2*CLEANUP});
  const artifact=await privateJson(inventoryPath);if(artifact.verified!==true||!Array.isArray(artifact.blobObjects))fail();
  budget();const s=await auditDatabase(source),t=await auditDatabase(target),{fenced,guards}=await check();
  const expectedObjectIds=source.run("select coalesce(jsonb_agg(encode(sha256(convert_to(id::text,'UTF8')),'hex') order by id),'[]') from storage.objects;");
  const sourceInflight=source.run("select count(*)::int from pg_locks where relation='_byus_migration.storage_fence'::regclass and granted and mode='RowShareLock' and pid<>pg_backend_pid();");
  const targetInflight=target.run(`select count(*)::int from pg_stat_activity where datname=current_database() and usename=${literal(STORAGE_IMPORT_ROLE)} and pid<>pg_backend_pid();`);
  const targetOnlyS3=STORAGE_IMPORT_TABLES.map(name=>{budget();const table=t.tables.find(table=>table.schema==='public'&&table.name===name);if(!table)fail();return{table:'public.'+name,rows:table.rowCount,sha256:hash(target.run(checksumSql(table)))};});
  proof=assembleProof({c,state,source:s,target:t,guards,sourceFenceVerified:fenced,storageInflightWriters:sourceInflight+targetInflight,importSealed:true,objects:artifact.blobObjects,expectedObjectIds,targetOnlyS3,blobObservedAt:artifact.verifiedAt});
 }finally{
  const closed=await Promise.allSettled([source,target].filter(Boolean).map(db=>db.close()));
  if(closed.some(r=>r.status==='rejected'))fail();
 }
 const inventoryPath=join(out,'storage-inventory.json');
 const blobPath=join(out,'blob-evidence.json'),receiptPath=join(out,'storage-receipt.json'),blobText=JSON.stringify(proof.blob,null,2)+'\n';
  budget();await writeFile(blobPath,blobText,{mode:0o600,flag:'wx'});
  proof.receipt.blobEvidence={path:relative(out,blobPath),sha256:hash(blobText)};
  proof.receipt.inventoryEvidence={path:relative(out,inventoryPath),sha256:hash(await readFile(inventoryPath,'utf8'))};
  const receiptText=JSON.stringify(proof.receipt,null,2)+'\n';budget();await writeFile(receiptPath,receiptText,{mode:0o600,flag:'wx'});budget();
  const result={storageReview:{path:receiptPath,sha256:hash(receiptText)},files:[{path:receiptPath,sha256:hash(receiptText)},{path:blobPath,sha256:hash(blobText)}],objects:proof.blob.objects.length,verified:true};
  console.log(JSON.stringify(result));return result;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{console.error('Final storage proof failed; no credentials, object paths or source IDs are logged. Preserve private artifacts and use guarded abort when required.');process.exitCode=1;});
