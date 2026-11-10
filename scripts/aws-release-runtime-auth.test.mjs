import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { AUTH_CASES, probeProductionAuth } from '../apps/web/e2e/cs-local/production-auth.mjs';
import { RUNTIME_AUTH_ENV, verifyRuntimeImage, assertTagImage, publishedRuntimeAuth, authContext } from './aws-release-runtime-auth.mjs';
const imageId='sha256:'+'1'.repeat(64), containerId='2'.repeat(64), digest='sha256:'+'3'.repeat(64);
const context={sourceSha:'a'.repeat(40),sourceRunId:7,sourceRunAttempt:2};
const uri=`111111111111.dkr.ecr.ap-northeast-2.amazonaws.com/web@${digest}`;
const baseImage={Id:imageId,Config:{Env:['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','NODE_VERSION=24.22.2','YARN_VERSION=1.22.22','NODE_ENV=production','HOSTING_PROVIDER=aws'],User:'app',Cmd:['node','apps/web/server.js'],Entrypoint:['docker-entrypoint.sh']},RepoDigests:[uri]};
function fixture(change={}) {
 const calls=[],image=structuredClone(baseImage);
 const container={Image:imageId,Config:{...image.Config,Env:[...image.Config.Env,...Object.entries(RUNTIME_AUTH_ENV).filter(([key])=>!image.Config.Env.some(value=>value.startsWith(key+'='))).map(([key,value])=>`${key}=${value}`)]},State:{Running:true},HostConfig:{NetworkMode:'none',PortBindings:{}},Mounts:[]};
 Object.assign(image,change.image); Object.assign(container,change.container);
 const call=async args=>{
  calls.push(args);
  if(args[0]==='run'){if(change.runError)throw Error('RUN_FAILED');return containerId;}
  if(args[0]==='image')return JSON.stringify([image]);
  if(args[0]==='container')return JSON.stringify([container]);
  if(args[0]==='logs')return change.notReady?'Starting':'Ready in 100ms';
  if(args[0]==='exec'){if(change.execError)throw Error('DENIAL_FAILED');return change.exec?change.exec(args):JSON.stringify({checks:change.checks??6});}
  if(args[0]==='rm'){if(change.cleanupError)throw Error('CLEANUP_FAILED');return '';}
  throw Error('UNEXPECTED_DOCKER_CALL');
 };
 return {call,calls,image,container};
}
async function workspace(fn){const dir=await mkdtemp(join(tmpdir(),'runtime-auth-'));try{return await fn(join(dir,'proof.json'));}finally{await rm(dir,{recursive:true,force:true});}}

test('the exact Docker probe executes all six real loopback HTTP requests and records isolated image identity',async()=>workspace(async proofPath=>{
 const requests=[];
 const server=createServer((request,response)=>{requests.push({url:request.url,token:request.headers.authorization??null});response.writeHead(401,{'content-type':'application/json'});response.end(JSON.stringify({error:{code:request.url.startsWith('/api/admin/')&&!request.headers.authorization?'UNAUTHENTICATED':'AUTHENTICATION_REQUIRED'}}));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const target=`http://127.0.0.1:${server.address().port}`;
  const f=fixture({exec:async args=>{
   let output='',exitCode;
   const promise=runInNewContext(args.at(-1),{fetch:(url,options)=>fetch(url.replace('http://127.0.0.1:3000',target),options),AbortSignal,console:{log:value=>{output=value;},error:value=>{throw Error(value);}},process:{set exitCode(value){exitCode=value;}}});
   await promise;if(exitCode)throw Error('PROBE_EXIT');return output;
  }});
  const proof=await verifyRuntimeImage(imageId,{...f,context,proofPath});
  assert.equal(proof.checks,6);assert.equal(proof.imageId,imageId);
  assert.deepEqual(requests,AUTH_CASES.map(c=>({url:c.url,token:c.token?`Bearer ${c.token}`:null})));
  const run=f.calls.find(args=>args[0]==='run');assert.deepEqual(run.slice(0,4),['run','--detach','--network','none']);
  assert.equal(run.at(-1),imageId);for(const flag of ['--env-file','--publish','--mount','--volume','--entrypoint'])assert.ok(!run.includes(flag));
  assert.ok(!run.join(' ').includes('GITHUB_TOKEN'));assert.equal(RUNTIME_AUTH_ENV.PRIVY_TEST_ACCOUNT_LOGIN_ENABLED,'false');
  assert.deepEqual(JSON.parse(await readFile(proofPath,'utf8')),proof);assert.deepEqual(f.calls.at(-1),['rm','--force',containerId]);
 }finally{await new Promise(resolve=>server.close(resolve));}
}));

test('every denial case rejects wrong status, error code, invalid JSON and request failure',async()=>{
 for(let index=0;index<6;index++)for(const kind of ['status','code','json','timeout']){
  let seen=0;
  await assert.rejects(probeProductionAuth('http://invalid.test',AUTH_CASES,async(_url,options)=>{
   assert(options.signal instanceof AbortSignal);const i=seen++;if(i===index&&kind==='timeout')throw new Error('TIMEOUT');
   return {status:i===index&&kind==='status'?200:401,json:async()=>{if(i===index&&kind==='json')throw Error('INVALID_JSON');return {error:{code:i===index&&kind==='code'?'WRONG':AUTH_CASES[i].code}};}};
  }));assert.equal(seen,index+1);
 }
});

test('startup, image, isolation and partial-probe failures erase stale proof and clean only their container',async()=>{
 for(const change of [{runError:true},{container:{State:{Running:false}}},{container:{Image:'sha256:'+'9'.repeat(64)}},{container:{HostConfig:{NetworkMode:'bridge'}}},{notReady:true},{execError:true,cleanupError:true},{checks:5}])await workspace(async proofPath=>{
  await writeFile(proofPath,'{"status":"success"}');const f=fixture(change);let clock=0;
  await assert.rejects(verifyRuntimeImage(imageId,{...f,context,proofPath,now:()=>clock,wait:async()=>{clock+=20_000;}}),change.execError?/DENIAL_FAILED/:undefined);
  await assert.rejects(readFile(proofPath),{code:'ENOENT'});assert.ok(!f.calls.some(args=>args[0]==='push'));
  if(!change.runError)assert.deepEqual(f.calls.at(-1),['rm','--force',containerId]);
 });
});

test('environment whitelist and default CMD/USER cannot be replaced or enable synthetic auth',async()=>{
 for(const mutate of [f=>f.container.Config.Env.push('GITHUB_TOKEN=secret'),f=>f.container.Config.Env=f.container.Config.Env.map(v=>v==='PRIVY_TEST_ACCOUNT_LOGIN_ENABLED=false'?'PRIVY_TEST_ACCOUNT_LOGIN_ENABLED=true':v),f=>f.container.Config.Cmd=['node','fixture-server.js'],f=>f.container.Config.User='root',f=>f.container.Mounts.push({Destination:'/app'}),f=>f.image.Config.Env.push('AWS_SECRET_ACCESS_KEY=secret')])await workspace(async proofPath=>{
  const f=fixture();mutate(f);await assert.rejects(verifyRuntimeImage(imageId,{...f,context,proofPath}),/RUNTIME_AUTH_/);
  await assert.rejects(readFile(proofPath),{code:'ENOENT'});
 });
});

test('cleanup failure does not produce a success proof',async()=>workspace(async proofPath=>{
 const f=fixture({cleanupError:true});await assert.rejects(verifyRuntimeImage(imageId,{...f,context,proofPath}),/CLEANUP_FAILED/);await assert.rejects(readFile(proofPath),{code:'ENOENT'});
}));

test('tag continuity and manifest digest are bound independently from the config image ID',async()=>workspace(async proofPath=>{
 const f=fixture(),proof=await verifyRuntimeImage(imageId,{...f,context,proofPath});
 await assertTagImage('tag',proof,context,f.call);
 const published=await publishedRuntimeAuth(proof,{head_sha:context.sourceSha,id:context.sourceRunId,run_attempt:context.sourceRunAttempt},uri,{call:f.call});
 assert.equal(published.imageId,imageId);assert.equal(published.imageDigest,digest);assert.notEqual(imageId,digest);
 f.image.Id='sha256:'+'9'.repeat(64);await assert.rejects(assertTagImage('tag',proof,context,f.call),/TAG_IMAGE_MISMATCH/);
 f.image.Id=imageId;f.image.RepoDigests=[];await assert.rejects(publishedRuntimeAuth(proof,{head_sha:context.sourceSha,id:7,run_attempt:2},uri,{call:f.call}),/PUBLISHED_DIGEST_MISMATCH/);
 await assert.rejects(assertTagImage('tag',proof,{...context,sourceRunAttempt:3},f.call),/INVALID_RUNTIME_AUTH_PROOF/);
}));

test('proof context requires the exact repository and positive source run and attempt',()=>{
 const env={GITHUB_REPOSITORY:'kyaa-io/kyaa',GITHUB_SHA:context.sourceSha,GITHUB_RUN_ID:'7',GITHUB_RUN_ATTEMPT:'2'};
 assert.deepEqual(authContext(env),context);
 for(const patch of [{GITHUB_REPOSITORY:'fork/kyaa'},{GITHUB_SHA:'main'},{GITHUB_RUN_ID:'0'},{GITHUB_RUN_ATTEMPT:'0'}])assert.throws(()=>authContext({...env,...patch}),/CONTEXT_REQUIRED/);
});

test('build, smoke, authentication and tag-proof failures cannot reach push or deploy',async()=>{
 const {readFileSync}=await import('node:fs');const {load}=await import('js-yaml');const {chmod}=await import('node:fs/promises');const {spawnSync}=await import('node:child_process');
 const script=load(readFileSync('.github/workflows/aws-platform.yml','utf8')).jobs.release.steps.find(s=>s.id==='build').run.split('          media_tag=')[0].split('media_tag=')[0];
 for(const stage of ['build','smoke','auth','tag','success'])await workspace(async proofPath=>{
  const dir=join(proofPath,'..'),bin=join(dir,'bin');await (await import('node:fs/promises')).mkdir(bin);const log=join(dir,'calls');
  const stubs={
   jq:'#!/bin/sh\necho 111111111111.dkr.ecr.ap-northeast-2.amazonaws.com/web\n',
   aws:'#!/bin/sh\necho "aws $*" >> "$CALLS"\ncase "$*" in *get-login-password*) echo invalid;; *) echo sha256:3333333333333333333333333333333333333333333333333333333333333333;; esac\n',
   docker:'#!/bin/sh\necho "docker $*" >> "$CALLS"\ncase "$*" in "build "*) [ "$FAIL_STAGE" != build ] || exit 1;; "image inspect"*) echo sha256:1111111111111111111111111111111111111111111111111111111111111111;; "run "*) [ "$FAIL_STAGE" != smoke ] || exit 1;; esac\nexit 0\n',
   node:'#!/bin/sh\necho "node $*" >> "$CALLS"\ncase "$*" in *production-auth.mjs*) [ "$FAIL_STAGE" != auth ] || exit 1;; *before-push*) [ "$FAIL_STAGE" != tag ] || exit 1;; esac\nexit 0\n',
  };
  for(const [name,text]of Object.entries(stubs)){const f=join(bin,name);await writeFile(f,text);await chmod(f,0o755);}
  const result=spawnSync('bash',['-c',script+'\necho deployed >> "$CALLS"'],{cwd:dir,encoding:'utf8',env:{PATH:`${bin}:${process.env.PATH}`,CALLS:log,FAIL_STAGE:stage,AWS_PLATFORM_CONFIG_JSON:'{}',GITHUB_SHA:context.sourceSha,GITHUB_RUN_ID:'7',GITHUB_RUN_ATTEMPT:'2',NODE_BUILD_BASE:'invalid-base'}});
  const calls=await readFile(log,'utf8');
  if(stage==='success'){assert.equal(result.status,0,result.stderr);assert.match(calls,/docker push/);assert.match(calls,/deployed/);}
  else {assert.notEqual(result.status,0);assert.doesNotMatch(calls,/docker push|deployed/);}
 });
});
