import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { recordedDeploymentEvent, trustedRun, validateRelease, assertPromotion, assertProductionAdvance, verifyDeployment, WORKFLOW_PATH, REPOSITORY, REPOSITORY_ID } from './aws-release.mjs';
const sha='a'.repeat(40),digest=`sha256:${'b'.repeat(64)}`,mediaDigest=`sha256:${'c'.repeat(64)}`;
const run={id:11,path:WORKFLOW_PATH,head_branch:'main',head_sha:sha,status:'completed',conclusion:'success',event:'push',repository:{id:REPOSITORY_ID,full_name:REPOSITORY}};
const release={schemaVersion:1,sourceSha:sha,sourceRunId:11,imageDigest:digest,imageUri:`111111111111.dkr.ecr.ap-northeast-2.amazonaws.com/byus/web@${digest}`,mediaImageDigest:mediaDigest,mediaImageUri:`111111111111.dkr.ecr.ap-northeast-2.amazonaws.com/byus/web@${mediaDigest}`,cronCodeSha256:'d'.repeat(64),repositoryId:REPOSITORY_ID,workflowPath:WORKFLOW_PATH};
test('only completed successful main runs from this exact workflow can supply a release',()=>{
 assert.equal(trustedRun(run,11),run);
 for(const patch of [{path:'.github/workflows/other.yml'},{head_branch:'feature'},{conclusion:'failure'},{status:'in_progress'},{conclusion:'cancelled'},{repository:{id:1,full_name:REPOSITORY}},{event:'pull_request'}])assert.throws(()=>trustedRun({...run,...patch},11));
 assert.equal(validateRelease(release,run),release);
 for(const patch of [{sourceSha:'f'.repeat(40)},{imageDigest:'latest'},{sourceRunId:12},{mediaImageDigest:'latest'},{cronCodeSha256:'bad'},{imageUri:'https://example.test/image'}])assert.throws(()=>validateRelease({...release,...patch},run));
});
test('production promotes directly from successful dev proof of the exact web, media and cron artifacts',()=>{
 const dev={...release,environment:'dev',status:'success',workflowRunId:run.id};
 assert.doesNotThrow(()=>assertPromotion('prod',release,dev,run));
 assert.doesNotThrow(()=>assertPromotion('dev',release));
 for(const patch of [{schemaVersion:2},{environment:'staging'},{status:'failure'},{sourceSha:'f'.repeat(40)},{sourceRunId:12},{imageDigest:mediaDigest},{mediaImageDigest:digest},{cronCodeSha256:'e'.repeat(64)},{workflowRunId:12},{workflowPath:'other.yml'},{repositoryId:1}])assert.throws(()=>assertPromotion('prod',release,{...dev,...patch},run),/SUCCESSFUL_MATCHING_DEV_REQUIRED/);
 assert.throws(()=>assertPromotion('prod',release),/SUCCESSFUL_MATCHING_DEV_REQUIRED/);
 assert.throws(()=>assertPromotion('staging',release),/INVALID_ENVIRONMENT/);
});
function fixture({desired=1,running=1,revision=sha,ready=true,publicRevision=sha,image=release.imageUri}={}){
 const config={accountId:'111111111111',stackName:'byus-prod',environment:'prod',parameters:{WebImageUri:release.imageUri,WebDomainName:'kyaa.io'}};
 const awsCall=args=>({sts:{Account:config.accountId},cloudformation:{Stacks:[{StackStatus:'UPDATE_COMPLETE',Outputs:[{OutputKey:'ClusterName',OutputValue:'cluster'},{OutputKey:'ServiceName',OutputValue:'service'},{OutputKey:'CloudFrontDomainName',OutputValue:'candidate.cloudfront.net'}]}]},ecs:args[1]==='wait'?{}:args[1]==='describe-services'?{services:[{desiredCount:desired,runningCount:running,taskDefinition:'task:1',deployments:[{rolloutState:'COMPLETED'}]}]}:{taskDefinition:{containerDefinitions:[{name:'web',image,environment:[{name:'RELEASE_SHA',value:sha}]}]}}})[args[0]];
 const fetcher=async url=>Response.json(url.endsWith('/ready')?{status:ready?'ready':'unavailable'}:{status:'ok',revision:url.includes('kyaa.io')?publicRevision:revision});
 return {config,options:{awsCall,fetcher}};
}
test('success requires the exact ECS task and healthy ready/live endpoints, preview prod cannot notify',async()=>{
 const good=fixture();assert.equal((await verifyDeployment(good.config,release,good.options)).publicLive,true);
 for(const options of [{running:0},{revision:'e'.repeat(40)},{ready:false},{image:'other@'+digest}]){const bad=fixture(options);await assert.rejects(verifyDeployment(bad.config,release,bad.options));}
 const preview=fixture({publicRevision:'e'.repeat(40)});assert.equal((await verifyDeployment(preview.config,release,preview.options)).publicLive,false);
});
test('production advancement reads the actual stable ECS revision and allows same or newer descendants only',()=>{
 const current=fixture(),pairs=[];
 const options={...current.options,requireForwardOnly:true,assertAncestor:(previous,candidate)=>pairs.push([previous,candidate])};
 assert.equal(assertProductionAdvance(current.config,release,options),sha);
 const newer={...release,sourceSha:'f'.repeat(40)};
 assert.equal(assertProductionAdvance(current.config,newer,options),sha);
 assert.deepEqual(pairs,[[sha,sha],[sha,newer.sourceSha]]);
 assert.throws(()=>assertProductionAdvance(current.config,release,{...options,assertAncestor:()=>{throw new Error('not an ancestor');}}),/PRODUCTION_ROLLBACK_REQUIRES_EXPLICIT_RECOVERY/);
});
test('unknown, changing, or untrusted actual production cannot be overwritten even without a GitHub deployment record',()=>{
 const current=fixture();
 const reject=mutate=>assert.throws(()=>assertProductionAdvance(current.config,release,{
  requireForwardOnly:true,
  awsCall:args=>mutate(structuredClone(current.options.awsCall(args)),args),
  assertAncestor:()=>assert.fail('must validate current production before ancestry')
 }));
 reject((value,args)=>args[0]==='sts'?{Account:'222222222222'}:value);
 reject((value,args)=>args[0]==='cloudformation'?{Stacks:[]}:value);
 reject((value,args)=>{if(args[0]==='cloudformation')value.Stacks[0].StackStatus='UPDATE_IN_PROGRESS';return value;});
 reject((value,args)=>args[1]==='describe-services'?{services:[],failures:[{reason:'MISSING'}]}:value);
 reject((value,args)=>{if(args[1]==='describe-services')value.services[0].deployments.push({rolloutState:'IN_PROGRESS'});return value;});
 reject((value,args)=>{if(args[1]==='describe-services')value.services[0].runningCount=0;return value;});
 reject((value,args)=>{if(args[1]==='describe-task-definition')value.taskDefinition.containerDefinitions[0].environment[0].value='unknown';return value;});
 reject((value,args)=>{if(args[1]==='describe-task-definition')value.taskDefinition.containerDefinitions[0].environment.push({name:'RELEASE_SHA',value:sha});return value;});
 reject((value,args)=>{if(args[1]==='describe-task-definition')value.taskDefinition.containerDefinitions[0].image=`222222222222.dkr.ecr.ap-northeast-2.amazonaws.com/other@${digest}`;return value;});
 reject(()=>{throw new Error('AWS unavailable');});
});
test('ordinary manual promotion keeps its existing bootstrap and recovery behavior',()=>{
 assert.doesNotThrow(()=>assertProductionAdvance({},release,{requireForwardOnly:false,awsCall:()=>assert.fail('manual promotion must not use the reservation guard')}));
});
test('workflow uses environment OIDC, a single dev build and promoted artifacts without PR execution',async()=>{
 const workflow=await readFile('.github/workflows/aws-platform.yml','utf8');
 for(const required of ['id-token: write','AWS_ROLE_ARN','AWS_PLATFORM_CONFIG_JSON','allowed-account-ids:','refs/heads/main','Dockerfile.aws','Dockerfile.media.aws','aws-release-source','aws-result-dev','test "$actual" = "$RELEASE_DIGEST"','scripts/deployment-notices.mjs send'])assert(workflow.includes(required),required);
 assert(!workflow.includes('pull_request_target'));
 assert(workflow.includes('options: [dev, prod]'));
 assert(workflow.includes('require_forward_only:'));
 assert(workflow.includes('REQUIRE_FORWARD_ONLY: ${{ inputs.require_forward_only }}'));
 assert(!workflow.includes('staging_run_id'));
 assert(!workflow.includes('aws-result-staging'));
 assert(workflow.includes("steps.verify.outputs.public_live == 'true'"));
 assert(workflow.indexOf('Require healthy ECS')<workflow.indexOf('Record the verified'));
});

test('web and media Docker builds can reuse the same dependency installation layer', async () => {
 const [web, media] = await Promise.all(['Dockerfile.aws','Dockerfile.media.aws'].map(file => readFile(file, 'utf8')));
 const dependencyStage = dockerfile => { assert(dockerfile.includes('RUN npm ci --include=dev')); return dockerfile.split('\n').filter(line => !line.startsWith('#')).join('\n').split('RUN npm ci --include=dev')[0]; };
 assert.equal(dependencyStage(web), dependencyStage(media));
});

test('notice events use persisted deployment and status records instead of incomplete creation responses', async () => {
 const {eligibleAwsDeployment}=await import('./deployment-notices.mjs');
 const deployment={id:8000000000,sha,environment:'AWS production',creator:{login:'github-actions[bot]'},payload:{provider:'aws',schemaVersion:1,environment:'prod',sourceSha:sha,imageDigest:digest,sourceRunId:11,workflowRunId:12,workflowPath:WORKFLOW_PATH,publicLive:true}};
 const status={state:'success',environment:deployment.environment,creator:deployment.creator,log_url:`https://github.com/${REPOSITORY}/actions/runs/12`};
 const calls=[];
 const githubCall=async path=>{calls.push(path);return path.endsWith('per_page=1')?[status]:deployment;};
 const event=await recordedDeploymentEvent(deployment.id,githubCall);
 assert.deepEqual(calls,[`/deployments/${deployment.id}`,`/deployments/${deployment.id}/statuses?per_page=1`]);
 assert(eligibleAwsDeployment(event.deployment,event.deployment_status));
 for(const id of [undefined,0,-1,'8000000000'])await assert.rejects(recordedDeploymentEvent(id,githubCall),/INVALID_DEPLOYMENT_ID/);
 await assert.rejects(recordedDeploymentEvent(deployment.id,async path=>path.endsWith('per_page=1')?[{...status,state:'failure'}]:deployment),/VERIFIED_DEPLOYMENT_REQUIRED/);
 await assert.rejects(recordedDeploymentEvent(deployment.id,async path=>path.endsWith('per_page=1')?[status]:{...deployment,id:1}),/VERIFIED_DEPLOYMENT_REQUIRED/);
});
