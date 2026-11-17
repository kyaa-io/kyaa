import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { updateWorkers, workers } from './aws-release-workers.mjs';
const hash = b => createHash('sha256').update(b).digest('base64');
for (const scenario of ['match','difference','denied','revision','disabled','runtime','backup','environment']) {
 test(scenario, async () => {
  const root=await mkdtemp(join(tmpdir(),'worker-test-'));
  const calls=[]; const hashes=new Map(); let backup=Buffer.from('old zip');
  try {
   await mkdir(join(root,'apps/worker/dist-lambda'),{recursive:true});
   for(const file of Object.values(workers)) await writeFile(join(root,'apps/worker/dist-lambda',file),'exports.handler=()=>{};');
   if(scenario==='match') {
    await mkdir(join(root,'mint-worker'));
    await writeFile(join(root,'mint-worker/index.cjs'),'exports.handler=()=>{};');
    execFileSync('zip',['-X','-q','code.zip','index.cjs'],{cwd:join(root,'mint-worker')});
    backup=await readFile(join(root,'mint-worker/code.zip'));
   }
   const aws=args=>{
    calls.push(args);
    const name=args[args.indexOf('--function-name')+1];
    const config={FunctionArn:`arn:aws:lambda:ap-northeast-2:996702758024:function:${name}`,PackageType:'Zip',Runtime:scenario==='runtime'?'nodejs22.x':'nodejs24.x',Architectures:['arm64'],Handler:'index.handler',RevisionId:'revision',State:'Active',LastUpdateStatus:'Successful',CodeSha256:hashes.get(name)??hash(backup),Environment:{Variables:{WORKER_ENABLED:scenario==='disabled'?'false':'true'}}};
    if(scenario==='environment' && hashes.has(name)) config.Environment.Variables.WORKER_ENABLED='changed';
    if(args[1]==='get-function') {
     if(scenario==='denied') throw Error('AccessDenied');
     return {Configuration:config,Code:{Location:'fake'}};
    }
    if(args[1]==='update-function-code') {
     assert.equal(args[args.indexOf('--revision-id')+1],'revision');
     if(scenario==='revision') throw Error('PreconditionFailed');
     hashes.set(name,hash(readFileSync(args.at(-1).slice(8)))); return {};
    }
    if(args[1]==='wait') return {};
    return config;
   };
   const run=()=>updateWorkers('a'.repeat(40),root,aws,'dev',async()=>scenario==='backup'?Buffer.from('bad'):backup);
   if(['denied','revision','runtime','backup','environment'].includes(scenario)) await assert.rejects(run);
   else {await run(); assert.equal(hashes.size,4);}
   if(['denied','runtime','backup'].includes(scenario)) assert.equal(hashes.size,0);
   assert(calls.every(a=>['get-function','get-function-configuration','update-function-code','wait'].includes(a[1])));
  } finally {await rm(root,{recursive:true,force:true});}
 });
}
test('worker failure gates deployment record for both environments',async()=>{
 const workflow=await readFile('.github/workflows/aws-platform.yml','utf8');
 const start=workflow.indexOf('      - name: Update worker code');
 const end=workflow.indexOf('      - name: Record the verified GitHub deployment');
 assert(start>0 && end>start);
 assert(!workflow.slice(start,end).includes('continue-on-error'));
 assert(!workflow.slice(start,end).includes("RELEASE_ENV == 'prod'"));
 assert(workflow.slice(end).startsWith('      - name: Record the verified GitHub deployment\n        run:'));
});
for (const environment of ['dev', 'prod']) {
 for (const code of ['ResourceNotFoundException', 'AccessDeniedException', 'ThrottlingException']) {
  test(`${environment} missing worker handling: ${code}`, async t => {
   const calls = [];
   const output = [];
   t.mock.method(console, 'log', value => output.push(JSON.parse(value)));
   const error = Object.assign(new Error('AWS CLI failed'), { stderr: Buffer.from(`An error occurred (${code}) when calling the GetFunctionConfiguration operation: missing`) });
   const aws = args => { calls.push(args); throw error; };
   const run = () => updateWorkers('a'.repeat(40), '/unused', aws, environment);
   if (environment === 'dev' && code === 'ResourceNotFoundException') {
    await run();
    assert.deepEqual(output, Object.keys(workers).map(worker => ({ function: `byus-${worker}-dev`, skipped: 'absent' })));
    assert.equal(calls.length, 4);
   } else {
    await assert.rejects(run, e => e === error);
    assert.equal(calls.length, 1);
    assert.deepEqual(output, []);
   }
   assert(calls.every(args => args[1] === 'get-function-configuration'));
  });
 }
}
test('release bundle mapping', () => {
 assert.deepEqual(workers, {
  'mint-worker': 'index.cjs',
  'notification-worker': 'notification-index.cjs',
  'benefit-maintenance': 'notification-index.cjs',
  'creator-registration-worker': 'creator-registration-index.cjs',
 });
});
