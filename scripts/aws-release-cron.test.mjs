import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateOwnership, assertOwnershipProof, verifyReleaseOwnership, assertLegacyPgRetired, assertScheduleResourceScope, ownershipHeaders } from './aws-release-cron.mjs';
const manifest=JSON.parse(await readFile('infrastructure/aws/platform/cron-ownership.json','utf8')),vercel=JSON.parse(await readFile('vercel.json','utf8'));
test('cron artifact writes are isolated by environment before any deployment',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'byus-cron-plan-'));
 try{
  await mkdir(join(dir,'work/aws-release'),{recursive:true});
  const release={sourceSha:'a'.repeat(40),cronCodeSha256:'b'.repeat(64),mediaImageDigest:'sha256:'+'c'.repeat(64)};
  await writeFile(join(dir,'work/aws-release/aws-release.json'),JSON.stringify(release));
  const template=JSON.parse(await readFile('infrastructure/aws/platform/scheduled-workers.json','utf8'));
  const role=JSON.parse(await readFile('infrastructure/aws/platform/ci-role.json','utf8'));
  const put=role.Resources.ReleaseRole.Properties.Policies.flatMap(p=>p.PolicyDocument.Statement).find(s=>[].concat(s.Action).includes('s3:PutObject'));
  assert(JSON.stringify(put.Resource).includes('${CodeBucketArn}/releases/${Environment}/*'));
  for(const environment of ['dev','staging','prod']){
   const parameters=Object.fromEntries(Object.entries(template.Parameters).filter(([,p])=>p.Default===undefined).map(([key])=>[key,'fixture']));
   parameters.MediaImageUri=`996702758024.dkr.ecr.ap-northeast-2.amazonaws.com/byus/${environment}/web@${release.mediaImageDigest}`;
   parameters.LegacyGateRevision='f'.repeat(40);
   const config={environment,accountId:'996702758024',region:'ap-northeast-2',stackName:`byus-${environment}-scheduled-workers`,cloudFormationRoleArn:`arn:aws:iam::996702758024:role/byus-${environment}-cfn-execution`,parameters};
   execFileSync(process.execPath,[fileURLToPath(new URL('./aws-release-cron.mjs',import.meta.url)),'plan'],{cwd:dir,env:{...process.env,AWS_SCHEDULE_CONFIG_JSON:JSON.stringify(config)},stdio:'pipe'});
   const result=JSON.parse(await readFile(join(dir,'work/aws-schedules/parameters.json'),'utf8'));
   assert.equal(result.find(p=>p.ParameterKey==='CronCodeKey').ParameterValue,`releases/${environment}/${release.sourceSha}/${release.cronCodeSha256}.zip`);
   assert.equal(result.find(p=>p.ParameterKey==='EnableMediaProcessing').ParameterValue,'true');
   assert.equal(result.find(p=>p.ParameterKey==='EnableSchedules').ParameterValue,String(environment==='prod'));
   assert.equal(result.find(p=>p.ParameterKey==='LegacyGateRevision').ParameterValue,'');
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('every existing Vercel cron is mapped and only production enables AWS schedules',()=>{
 for(const environment of ['dev','staging','prod'])assert.equal(validateOwnership(manifest,vercel,environment).awsSchedulesEnabled,environment==='prod');
 assert.throws(()=>validateOwnership({...manifest,tasks:manifest.tasks.slice(1)},vercel,'prod'));
 const dual=structuredClone(manifest);dual.environments.prod={owner:'vercel',awsSchedulesEnabled:true};assert.throws(()=>validateOwnership(dual,vercel,'prod'));
});
test('protected legacy ownership requires a valid bypass and never forwards it to AWS',()=>{
 const secret='cron-secret',bypass='existing-automation-bypass';
 assert.deepEqual(ownershipHeaders(secret,true,bypass),{authorization:`Bearer ${secret}`,'x-vercel-protection-bypass':bypass});
 for(const invalid of [undefined,'','bad\rheader','bad\nheader',42])assert.throws(()=>ownershipHeaders(secret,true,invalid),/PRIVATE_VERCEL_BYPASS_REQUIRED/);
 for(const value of [undefined,bypass,'bad\nheader'])assert.deepEqual(ownershipHeaders(secret,false,value),{authorization:`Bearer ${secret}`});
});
test('all seven HTTP schedules match Vercel cadence, exact task and common owner gate',async()=>{
 const template=JSON.parse(await readFile('infrastructure/aws/platform/scheduled-workers.json','utf8'));
 const schedules=Object.values(template.Resources).filter(r=>r.Type==='AWS::Scheduler::Schedule'&&r.Properties.Target.Arn?.['Fn::GetAtt']?.[0]==='CronFunction');
 assert.equal(schedules.length,7);assert.equal(manifest.tasks.length,7);
 for(const task of manifest.tasks){
  const scheduled=schedules.filter(s=>JSON.parse(s.Properties.Target.Input['Fn::Sub']).task===task.name);
  assert.equal(scheduled.length,1);
  const p=scheduled[0].Properties;
  assert.equal(p.ScheduleExpression,task.awsSchedule);
  assert.deepEqual(p.State,{'Fn::If':['SchedulesEnabled','ENABLED','DISABLED']});
  assert.equal(p.Target.RetryPolicy.MaximumRetryAttempts,0);
  const route=await readFile(`apps/web/app${task.path}/route.ts`,'utf8');
  assert.match(route,/const ownership = cronOwnerResponse\(request\)/);
 }
 const duplicate=structuredClone(manifest);duplicate.tasks.push({...duplicate.tasks[0]});
 assert.throws(()=>validateOwnership(duplicate,vercel,'prod'),/VERCEL_CRON_MAPPING_INCOMPLETE/);
 assert.equal(manifest.tasks.find(t=>t.name==='runmusic-telegram').awsSchedule,'rate(1 minute)');
});
test('enabling production requires both exact-revision AWS and retired Vercel owner gates',()=>{
 const sha='a'.repeat(40),current={owner:'aws',provider:'aws',revision:sha,manifestVersion:1},legacy={owner:'disabled',provider:'vercel',revision:sha,manifestVersion:1},selected={owner:'aws',awsSchedulesEnabled:true};
 assert.doesNotThrow(()=>assertOwnershipProof(selected,'prod',sha,current,legacy));
 for(const [aws,old] of [[undefined,legacy],[{...current,revision:'b'.repeat(40)},legacy],[current,undefined],[current,{...legacy,owner:'vercel'}]])assert.throws(()=>assertOwnershipProof(selected,'prod',sha,aws,old));
});
test('native media has its own 180-second, 2-GiB, 2-GiB-tmp concurrency boundary',async()=>{
 const template=JSON.parse(await readFile('infrastructure/aws/platform/scheduled-workers.json','utf8'));
 const media=template.Resources.MediaFunction.Properties;
 assert.equal(media.Timeout,180);assert.equal(media.MemorySize,2048);assert.equal(media.EphemeralStorage.Size,2048);assert.equal(media.ReservedConcurrentExecutions,1);assert.equal(media.PackageType,'Image');
 assert.equal(template.Parameters.EnableSchedules.Default,'false');
 assert.deepEqual(media.Environment.Variables.WORKER_ENABLED,{Ref:'EnableMediaProcessing'});
 assert.equal(template.Parameters.EnableMediaProcessing.Default,'true');
 for(const resource of Object.values(template.Resources).filter(r=>r.Type==='AWS::Scheduler::Schedule')){
  assert.deepEqual(resource.Properties.State,{'Fn::If':['SchedulesEnabled','ENABLED','DISABLED']});
 }
 assert.equal(Object.values(template.Resources).filter(r=>r.Type==='AWS::Scheduler::Schedule').length,17);
 assert(template.Rules.RequireOwnershipProof);
});

test('legacy hosting proof is adopted once and reused only from the matching successful stack',async()=>{
 const revision='a'.repeat(40),oldRevision='b'.repeat(40),legacyRevision='c'.repeat(40),proofHash='d'.repeat(64);
 const selected={owner:'aws',awsSchedulesEnabled:true,legacyGateRevision:legacyRevision};
 const current={owner:'aws',provider:'aws',revision,manifestVersion:1};
 const params={Environment:'prod',EnableSchedules:'true',CronOwner:'aws',ReleaseSha:oldRevision,GateValidatedRevision:oldRevision,LegacyGateRevision:legacyRevision,LegacyPgCronProofHash:proofHash};
 const stack=(patch={},status='UPDATE_COMPLETE')=>({StackStatus:status,Parameters:Object.entries({...params,...patch}).map(([ParameterKey,ParameterValue])=>({ParameterKey,ParameterValue}))});
 let calls=0;
 const readLegacy=async()=>{calls++;return{owner:'disabled',provider:'vercel',revision:legacyRevision,manifestVersion:1};};
 const input={selected,environment:'prod',revision,current,proofHash,readLegacy};
 assert.deepEqual(await verifyReleaseOwnership({...input,prior:stack({LegacyGateRevision:''})}),{GateValidatedRevision:revision,LegacyGateRevision:legacyRevision});
 assert.equal(calls,1);
 const unavailable=async()=>{throw Error('legacy offline');};
 assert.deepEqual(await verifyReleaseOwnership({...input,prior:stack(),readLegacy:unavailable}),{GateValidatedRevision:revision,LegacyGateRevision:legacyRevision});
 for(const prior of [null,stack({},'UPDATE_IN_PROGRESS'),stack({},'UPDATE_ROLLBACK_COMPLETE'),...Object.entries({Environment:'staging',EnableSchedules:'false',CronOwner:'vercel',LegacyPgCronProofHash:'e'.repeat(64),ReleaseSha:'bad',GateValidatedRevision:'f'.repeat(40),LegacyGateRevision:'f'.repeat(40)}).map(([k,v])=>stack({[k]:v}))]){
  await assert.rejects(verifyReleaseOwnership({...input,prior,readLegacy:unavailable}),/legacy offline/);
 }
 await assert.rejects(verifyReleaseOwnership({...input,prior:stack({LegacyGateRevision:''}),readLegacy:async()=>({...await readLegacy(),revision:oldRevision})}),/LEGACY_VERCEL_CRON_NOT_RETIRED/);
 for(const patch of [{owner:'vercel'},{provider:'vercel'},{revision:oldRevision}]){
  await assert.rejects(verifyReleaseOwnership({...input,current:{...current,...patch},prior:stack(),readLegacy:unavailable}),/AWS_CRON_GATE_NOT_VERIFIED/);
 }
});

test('legacy pg_cron and Edge replacement cannot enable without fresh pinned source-fence evidence',()=>{
 const proof={schemaVersion:1,environment:'prod',accountId:'111111111111',phase:'enabled',sourceIdentityHash:'a'.repeat(64),sourceGuardHash:'b'.repeat(32),verifiedSourceGuardHash:'b'.repeat(32),outstandingWriters:0,activeCronJobs:0,activeCronWorkers:0,legacyEdgeDisabled:true,observedAt:new Date().toISOString()};
 const config={environment:'prod',accountId:proof.accountId,legacyPgCronProofSha256:createHash('sha256').update(JSON.stringify(proof)).digest('hex')};
 assert.doesNotThrow(()=>assertLegacyPgRetired(proof,config));
 for(const patch of [{activeCronJobs:1},{activeCronWorkers:1},{outstandingWriters:1},{legacyEdgeDisabled:false},{verifiedSourceGuardHash:'c'.repeat(32)},{observedAt:'2000-01-01T00:00:00Z'}])assert.throws(()=>assertLegacyPgRetired({...proof,...patch},config));
 for(const patch of [{activeCronJobs:1},{activeCronWorkers:1},{outstandingWriters:1},{legacyEdgeDisabled:false},{verifiedSourceGuardHash:'c'.repeat(32)}]){
  const changed={...proof,...patch},changedConfig={...config,legacyPgCronProofSha256:createHash('sha256').update(JSON.stringify(changed)).digest('hex')};
  assert.throws(()=>assertLegacyPgRetired(changed,changedConfig,Date.now(),true));
 }
 assert.equal(manifest.legacyPgJobs.length,10);assert.equal(manifest.maintenanceTasks.length,8);
});

test('the original synchronous five-second mint cadence keeps its target single writer',async()=>{
 const template=JSON.parse(await readFile('infrastructure/aws/platform/scheduled-workers.json','utf8'));
 const cadence=template.Resources.MintCadenceFunction.Properties;
 assert.equal(cadence.Timeout,400);assert.equal(cadence.ReservedConcurrentExecutions,8);assert.equal(cadence.MemorySize,128);
 assert.equal(template.Resources.ScheduleMintWorker.Properties.ScheduleExpression,'rate(1 minute)');
 assert(template.Resources.ScheduleMintWorker.Properties.Target.Input['Fn::Sub'].includes('<aws.scheduler.scheduled-time>'));
 const source=await readFile('apps/worker/src/aws-mint-cadence-entry.ts','utf8');assert(source.includes('InvocationType:"RequestResponse"'));assert(source.includes('maxAttempts:1'));
});

test('scheduler secrets, buckets and network must belong to the actual selected environment stack',()=>{
 const config={environment:'staging',accountId:'111111111111',environmentStackName:'web-staging'},web={...config,stackName:'web-staging'};
 const p={PrivateBucketArn:'arn:aws:s3:::private',PublicBucketArn:'arn:aws:s3:::public',MediaSubnetIds:'subnet-1,subnet-2',MediaSecurityGroupIds:'sg-1',ApiOrigin:'https://staging.example.test',CronSecretArn:'arn:aws:secretsmanager:ap-northeast-2:111111111111:secret:byus/staging/cron-x',MediaRuntimeSecretArn:'arn:aws:secretsmanager:ap-northeast-2:111111111111:secret:byus/staging/media-x'};
 const deployed={Parameters:[{ParameterKey:'Environment',ParameterValue:'staging'}],Outputs:Object.entries({PrivateProofsBucketName:'private',PublicAssetsBucketName:'public',AppSubnet1:'subnet-1',AppSubnet2:'subnet-2',TaskSecurityGroupId:'sg-1',WebUrl:p.ApiOrigin,CloudFrontDomainName:'dstaging.cloudfront.net'}).map(([OutputKey,OutputValue])=>({OutputKey,OutputValue}))};
 assert.doesNotThrow(()=>assertScheduleResourceScope(config,web,p,deployed));
 assert.doesNotThrow(()=>assertScheduleResourceScope(config,web,{...p,ApiOrigin:'https://dstaging.cloudfront.net'},deployed));
 for(const ApiOrigin of ['https://dprod.cloudfront.net','http://dstaging.cloudfront.net','https://dstaging.cloudfront.net/other'])assert.throws(()=>assertScheduleResourceScope(config,web,{...p,ApiOrigin},deployed));
 for(const patch of [{PrivateBucketArn:'arn:aws:s3:::other'},{MediaSecurityGroupIds:'sg-other'},{CronSecretArn:p.CronSecretArn.replace('/staging/','/prod/')}])assert.throws(()=>assertScheduleResourceScope(config,web,{...p,...patch},deployed));
 assert.throws(()=>assertScheduleResourceScope(config,web,p,{...deployed,Parameters:[{ParameterKey:'Environment',ParameterValue:'prod'}]}));
});
