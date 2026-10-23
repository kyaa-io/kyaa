import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const fail = message => { throw new Error(message); };
export function validateOwnership(manifest, vercel, environment) {
  if (manifest.schemaVersion !== 1 || !['dev','staging','prod'].includes(environment) || !manifest.environments?.[environment] || !['vercel','aws','disabled'].includes(manifest.environments[environment].owner) || typeof manifest.environments[environment].awsSchedulesEnabled !== 'boolean') fail('INVALID_CRON_OWNERSHIP');
  const selected = manifest.environments[environment];
  if (selected.awsSchedulesEnabled && selected.owner !== 'aws') fail('DUAL_CRON_OWNERSHIP_FORBIDDEN');
  const actual = manifest.tasks.map(({ path, vercelCron }) => `${path} ${vercelCron}`).sort();
  const expected = vercel.crons.map(({ path, schedule }) => `${path} ${schedule}`).sort();
  if (new Set(actual).size !== 7 || JSON.stringify(actual) !== JSON.stringify(expected)) fail('VERCEL_CRON_MAPPING_INCOMPLETE');
  return selected;
}
export function assertOwnershipProof(selected, environment, revision, current, legacy) {
  if (!selected.awsSchedulesEnabled) return;
  if (selected.owner !== 'aws' || current?.owner !== 'aws' || current.provider !== 'aws' || current.revision !== revision || current.manifestVersion !== 1) fail('AWS_CRON_GATE_NOT_VERIFIED');
  if (environment === 'prod' && (!['aws','disabled'].includes(legacy?.owner) || legacy.provider !== 'vercel' || legacy.revision !== (selected.legacyGateRevision ?? revision) || legacy.manifestVersion !== 1)) fail('LEGACY_VERCEL_CRON_NOT_RETIRED');
}
export function assertLegacyPgRetired(proof, config, now = Date.now(), alreadyEnabled = false) {
  const hash = createHash('sha256').update(JSON.stringify(proof)).digest('hex');
  if (!proof || hash !== config.legacyPgCronProofSha256 || proof.schemaVersion !== 1 || proof.environment !== config.environment || proof.accountId !== config.accountId || proof.phase !== 'enabled' || proof.activeCronJobs !== 0 || proof.activeCronWorkers !== 0 || proof.outstandingWriters !== 0 || proof.legacyEdgeDisabled !== true || !/^[a-f0-9]{64}$/.test(proof.sourceIdentityHash ?? '') || !/^[a-f0-9]{32}$/.test(proof.sourceGuardHash ?? '') || proof.verifiedSourceGuardHash !== proof.sourceGuardHash || !Number.isFinite(Date.parse(proof.observedAt)) || now - Date.parse(proof.observedAt) < 0 || (!alreadyEnabled && now - Date.parse(proof.observedAt) > 3600000)) fail('LEGACY_PG_CRON_NOT_RETIRED');
}
export function assertScheduleResourceScope(config,webConfig,p,deployed){
 if(webConfig?.environment!==config.environment||webConfig.accountId!==config.accountId||webConfig.stackName!==config.environmentStackName||deployed?.Parameters?.find(item=>item.ParameterKey==='Environment')?.ParameterValue!==config.environment)fail('SCHEDULE_ENVIRONMENT_STACK_MISMATCH');
 const outputs=Object.fromEntries((deployed?.Outputs??[]).map(({OutputKey,OutputValue})=>[OutputKey,OutputValue]));
 for(const key of ['PrivateProofsBucketName','PublicAssetsBucketName','AppSubnet1','AppSubnet2','TaskSecurityGroupId','WebUrl'])if(typeof outputs[key]!=='string'||!outputs[key])fail('SCHEDULE_ENVIRONMENT_OUTPUT_MISSING');
 const split=value=>String(value).split(',').map(item=>item.trim()).sort().join(',');
 if(p.PrivateBucketArn!==`arn:aws:s3:::${outputs.PrivateProofsBucketName}`||p.PublicBucketArn!==`arn:aws:s3:::${outputs.PublicAssetsBucketName}`||split(p.MediaSubnetIds)!==split([outputs.AppSubnet1,outputs.AppSubnet2].join(','))||split(p.MediaSecurityGroupIds)!==outputs.TaskSecurityGroupId||String(p.ApiOrigin).replace(/\/$/,'')!==outputs.WebUrl)fail('SCHEDULE_RESOURCE_ENVIRONMENT_MISMATCH');
 for(const key of ['CronSecretArn','MediaRuntimeSecretArn'])if(!new RegExp(`^arn:aws:secretsmanager:ap-northeast-2:${config.accountId}:secret:byus/${config.environment}/[A-Za-z0-9/_+=.@-]+$`).test(p[key]))fail('SCHEDULE_SECRET_ENVIRONMENT_MISMATCH');
 if(p.CronSecretArn===p.MediaRuntimeSecretArn)fail('DEDICATED_CRON_SECRET_REQUIRED');
}
const execute = (file,args) => execFileSync(file,args,{ encoding:'utf8', stdio:['ignore','pipe','inherit'] }).trim();
const aws = args => { const result=execute('aws',['--no-cli-pager','--region','ap-northeast-2',...args,'--output','json']); return result?JSON.parse(result):{}; };
export async function main(action = process.argv[2], { fetcher = fetch } = {}) {
  if (!['plan','deploy'].includes(action)) fail('Use plan or deploy');
  const config = JSON.parse(process.env.AWS_SCHEDULE_CONFIG_JSON);
  const release = JSON.parse(await readFile('work/aws-release/aws-release.json','utf8'));
  const manifest = JSON.parse(await readFile(new URL('../infrastructure/aws/platform/cron-ownership.json',import.meta.url),'utf8'));
  const vercel = JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
  const selected = validateOwnership(manifest,vercel,config.environment);
  if (!/^[a-f0-9]{40}$/.test(release.sourceSha??'') || !/^[a-f0-9]{64}$/.test(release.cronCodeSha256??'') || !/^sha256:[a-f0-9]{64}$/.test(release.mediaImageDigest??'')) fail('SCHEDULE_RELEASE_ARTIFACT_REQUIRED');
  const p = { ...config.parameters, Environment:config.environment,ReleaseSha:release.sourceSha, CronOwner:selected.owner,EnableSchedules:String(selected.awsSchedulesEnabled),GateValidatedRevision:'',LegacyPgCronProofHash:config.legacyPgCronProofSha256??'',CronCodeKey:`releases/${config.environment}/${release.sourceSha}/${release.cronCodeSha256}.zip` };
  if (!/^\d{12}$/.test(config.accountId??'') || config.region!=='ap-northeast-2' || !/^[A-Za-z][A-Za-z0-9-]{0,100}$/.test(config.stackName??'') || !new RegExp(`^arn:aws:iam::${config.accountId}:role/[A-Za-z0-9/+=,.@_-]+$`).test(config.cloudFormationRoleArn??'')) fail('INVALID_SCHEDULE_ACCOUNT_CONFIG');
  p.MediaImageUri = String(p.MediaImageUri).split('@')[0] + '@' + release.mediaImageDigest;
  if (!String(p.MediaImageUri).startsWith(`${config.accountId}.dkr.ecr.ap-northeast-2.amazonaws.com/`) || !String(p.MediaImageUri).endsWith(`@${release.mediaImageDigest}`)) fail('MEDIA_IMAGE_PROMOTION_REQUIRED');
  const template = JSON.parse(await readFile(new URL('../infrastructure/aws/platform/scheduled-workers.json',import.meta.url),'utf8'));
  for (const [key,spec] of Object.entries(template.Parameters)) { if (p[key]===undefined && spec.Default!==undefined)p[key]=spec.Default; if(p[key]===undefined)fail(`Missing schedule parameter ${key}`); }
  if (Object.keys(p).some(key=>!Object.hasOwn(template.Parameters,key)))fail('UNKNOWN_SCHEDULE_PARAMETER');
  if (action==='deploy') {
    if (config.environment !== process.env.RELEASE_ENV) fail('SCHEDULE_ENVIRONMENT_MISMATCH');
    const webConfig=JSON.parse(process.env.AWS_PLATFORM_CONFIG_JSON??'null');
    const deployed=aws(['cloudformation','describe-stacks','--stack-name',config.environmentStackName]).Stacks?.[0];
    assertScheduleResourceScope(config,webConfig,p,deployed);
    const zip=await readFile('work/aws-release/aws-cron.zip'); if(createHash('sha256').update(zip).digest('hex')!==release.cronCodeSha256)fail('CRON_BUNDLE_DIGEST_MISMATCH');
    if (!String(p.MintWorkerFunctionArn).startsWith(`arn:aws:lambda:ap-northeast-2:${config.accountId}:function:byus-mint-worker-`) || !p.MintWorkerFunctionArn.endsWith(`-${config.environment}`)) fail('MINT_TARGET_ENVIRONMENT_MISMATCH');
    if (selected.awsSchedulesEnabled) {
      const concurrency=aws(['lambda','get-function-concurrency','--function-name',p.MintWorkerFunctionArn]);
      const runtime=aws(['lambda','get-function-configuration','--function-name',p.MintWorkerFunctionArn,'--query','{Timeout:Timeout,Runtime:Runtime,Architectures:Architectures,Enabled:Environment.Variables.WORKER_ENABLED,Environment:Environment.Variables.WORKER_ENVIRONMENT,SecretId:Environment.Variables.WORKER_SECRET_ID}']);
      if(runtime.Enabled!=='true'||runtime.Environment!==config.environment||runtime.SecretId!==`byus/worker/${config.environment}`||concurrency.ReservedConcurrentExecutions!==1||runtime.Timeout>240||runtime.Runtime!=='nodejs24.x'||runtime.Architectures?.[0]!=='arm64')fail('MINT_SINGLE_WRITER_RUNTIME_REQUIRED');
      const existing=aws(['cloudformation','list-stacks','--query',`StackSummaries[?StackName=='${config.stackName}' && StackStatus!='DELETE_COMPLETE']`]);
      const prior=existing.length?aws(['cloudformation','describe-stacks','--stack-name',config.stackName]).Stacks?.[0]:null;
      const previous=Object.fromEntries((prior?.Parameters??[]).map(({ParameterKey,ParameterValue})=>[ParameterKey,ParameterValue]));
      const alreadyEnabled=previous.EnableSchedules==='true'&&previous.CronOwner==='aws'&&previous.LegacyPgCronProofHash===config.legacyPgCronProofSha256;
      assertLegacyPgRetired(JSON.parse(process.env.LEGACY_PG_CRON_PROOF_JSON ?? 'null'), config,Date.now(),alreadyEnabled);
      if (config.legacyGateRevision) execute('git',['merge-base','--is-ancestor',config.legacyGateRevision,release.sourceSha]);
      const secret=JSON.parse(aws(['secretsmanager','get-secret-value','--secret-id',p.CronSecretArn]).SecretString??'{}').CRON_SECRET;
      if(typeof secret!=='string'||secret.length<32)fail('CRON_SECRET_INVALID');
      async function proof(origin,legacy=false) {
        const url=new URL(origin);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||(legacy&&!url.hostname.endsWith('.vercel.app')))fail('INVALID_OWNERSHIP_ORIGIN');
        const response=await fetcher(new URL('/api/internal/cron/ownership',url),{headers:{authorization:`Bearer ${secret}`},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok)fail('CRON_OWNERSHIP_UNAVAILABLE');return response.json();
      }
      assertOwnershipProof({...selected,legacyGateRevision:config.legacyGateRevision},config.environment,release.sourceSha,await proof(p.ApiOrigin),config.environment==='prod'?await proof(config.legacyApiOrigin,true):undefined);
      p.GateValidatedRevision=release.sourceSha;
    }
    aws(['s3api','put-object','--bucket',p.CodeBucket,'--key',p.CronCodeKey,'--body','work/aws-release/aws-cron.zip','--expected-bucket-owner',config.accountId]);
  }
  await mkdir('work/aws-schedules',{recursive:true});
  await writeFile('work/aws-schedules/parameters.json',JSON.stringify(Object.entries(p).map(([ParameterKey,ParameterValue])=>({ParameterKey,ParameterValue:String(ParameterValue)}))));
  if(action==='deploy')execute('aws',['--no-cli-pager','--region','ap-northeast-2','cloudformation','deploy','--stack-name',config.stackName,'--template-file','infrastructure/aws/platform/scheduled-workers.json','--parameter-overrides',...Object.entries(p).map(([key,value])=>`${key}=${value}`),'--capabilities','CAPABILITY_IAM','--role-arn',config.cloudFormationRoleArn,'--no-fail-on-empty-changeset']);
  console.log(JSON.stringify({environment:config.environment,owner:selected.owner,schedulesEnabled:selected.awsSchedulesEnabled,deployed:action==='deploy'}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
