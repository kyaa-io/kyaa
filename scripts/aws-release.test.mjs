import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { trustedRun, validateRelease, assertPromotion, verifyDeployment, WORKFLOW_PATH, REPOSITORY, REPOSITORY_ID } from './aws-release.mjs';
const sha='a'.repeat(40),digest=`sha256:${'b'.repeat(64)}`,mediaDigest=`sha256:${'c'.repeat(64)}`;
const run={id:11,path:WORKFLOW_PATH,head_branch:'main',head_sha:sha,status:'completed',conclusion:'success',event:'push',repository:{id:REPOSITORY_ID,full_name:REPOSITORY}};
const release={schemaVersion:1,sourceSha:sha,sourceRunId:11,imageDigest:digest,imageUri:`111111111111.dkr.ecr.ap-northeast-2.amazonaws.com/byus/web@${digest}`,mediaImageDigest:mediaDigest,mediaImageUri:`111111111111.dkr.ecr.ap-northeast-2.amazonaws.com/byus/web@${mediaDigest}`,cronCodeSha256:'d'.repeat(64),repositoryId:REPOSITORY_ID,workflowPath:WORKFLOW_PATH};
test('only completed successful main runs from this exact workflow can supply a release',()=>{
 assert.equal(trustedRun(run,11),run);
 for(const patch of [{path:'.github/workflows/other.yml'},{head_branch:'feature'},{conclusion:'failure'},{repository:{id:1,full_name:REPOSITORY}},{event:'pull_request'}])assert.throws(()=>trustedRun({...run,...patch},11));
 assert.equal(validateRelease(release,run),release);
 for(const patch of [{sourceSha:'f'.repeat(40)},{imageDigest:'latest'},{sourceRunId:12},{mediaImageDigest:'latest'},{cronCodeSha256:'bad'},{imageUri:'https://example.test/image'}])assert.throws(()=>validateRelease({...release,...patch},run));
});
test('production requires a successful staging proof of the exact web, native media and cron artifacts',()=>{
 const stage={...release,environment:'staging',status:'success',workflowRunId:12};
 assert.doesNotThrow(()=>assertPromotion('prod',release,stage,{id:12}));
 for(const patch of [{environment:'dev'},{status:'failure'},{imageDigest:mediaDigest},{mediaImageDigest:digest},{cronCodeSha256:'e'.repeat(64)},{workflowRunId:13}])assert.throws(()=>assertPromotion('prod',release,{...stage,...patch},{id:12}));
 assert.throws(()=>assertPromotion('prod',release));
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
test('workflow uses environment OIDC, a single dev build and promoted artifacts without PR execution',async()=>{
 const workflow=await readFile('.github/workflows/aws-platform.yml','utf8');
 for(const required of ['id-token: write','AWS_ROLE_ARN','AWS_PLATFORM_CONFIG_JSON','allowed-account-ids:','refs/heads/main','Dockerfile.aws','Dockerfile.media.aws','aws-release-source','aws-result-staging','test "$actual" = "$RELEASE_DIGEST"','scripts/deployment-notices.mjs send'])assert(workflow.includes(required),required);
 assert(!workflow.includes('pull_request_target'));
 assert(workflow.includes("steps.verify.outputs.public_live == 'true'"));
 assert(workflow.indexOf('Require healthy ECS')<workflow.indexOf('Record the verified'));
});
