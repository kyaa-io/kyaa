import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { prepareWorkers, applyWorkers, updateWorkers, workers } from './aws-release-workers.mjs';
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
     if (args.includes('--dry-run')) return {};
     hashes.set(name,hash(readFileSync(args.at(-1).slice(8)))); return {};
    }
    if(args[1]==='wait') return {};
    return config;
   };
   const run=()=>updateWorkers('a'.repeat(40),root,aws,'dev',async()=>scenario==='backup'?Buffer.from('bad'):backup);
   if(['denied','revision','runtime','backup','environment'].includes(scenario)) await assert.rejects(run);
   else {await run(); assert.equal(hashes.size,scenario==='match'?0:4);}
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
   const emptyRoot = await mkdtemp(join(tmpdir(), 'worker-empty-'));
   t.after(() => rm(emptyRoot, { recursive: true, force: true }));
   const run = () => updateWorkers('a'.repeat(40), emptyRoot, aws, environment);
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
for (const scenario of ['third dry run denied', 'revision drift', 'code drift', 'environment drift', 'zip drift', 'normal', 'dev absent']) {
 test(`two phase: ${scenario}`, async () => {
  const root = await mkdtemp(join(tmpdir(), 'worker-phases-'));
  const backup = Buffer.from('backup');
  const states = new Map(); const updates = []; let dryRuns = 0; let web = 0; let schedules = 0;
  try {
   await mkdir(join(root, 'apps/worker/dist-lambda'), { recursive: true });
   for (const bundle of Object.values(workers)) await writeFile(join(root, 'apps/worker/dist-lambda', bundle), 'exports.handler=()=>{};');
   const aws = args => {
    const name = args[args.indexOf('--function-name') + 1];
    if (scenario === 'dev absent' && name.includes('benefit-maintenance')) throw Object.assign(Error('missing'), { stderr: 'An error occurred (ResourceNotFoundException) when calling the GetFunctionConfiguration operation:' });
    if (!states.has(name)) states.set(name, { FunctionArn: `arn:aws:lambda:ap-northeast-2:996702758024:function:${name}`, PackageType: 'Zip', Handler: 'index.handler', Runtime: 'nodejs24.x', Architectures: ['arm64'], RevisionId: 'r1', CodeSha256: hash(backup), Environment: { Variables: {} }, State: 'Active', LastUpdateStatus: 'Successful' });
    const config = states.get(name);
    if (args[1] === 'get-function') return { Configuration: config, Code: { Location: 'fake' } };
    if (args[1] === 'update-function-code') {
     assert.equal(args[args.indexOf('--revision-id') + 1], config.RevisionId);
     if (args.includes('--dry-run')) { if (++dryRuns === 3 && scenario === 'third dry run denied') throw Error('AccessDenied'); }
     else { updates.push(name); config.CodeSha256 = hash(readFileSync(args.at(-1).slice(8))); }
    }
    return config;
   };
   const run = async () => {
    const prepared = await prepareWorkers('a'.repeat(40), root, aws, 'dev', async () => backup);
    assert.equal(updates.length, 0);
    await writeFile(join(root, 'prepared.json'), JSON.stringify(prepared));
    web++; schedules++;
    const third = states.get(prepared.functions[2].function);
    if (scenario === 'revision drift') third.RevisionId = 'r2';
    if (scenario === 'code drift') third.CodeSha256 = 'changed';
    if (scenario === 'environment drift') third.Environment.Variables.CHANGED = 'true';
    if (scenario === 'zip drift') await writeFile(join(root, prepared.functions[2].worker, 'code.zip'), 'changed');
    await applyWorkers(JSON.parse(await readFile(join(root, 'prepared.json'), 'utf8')), root, aws);
   };
   if (scenario === 'third dry run denied') { await assert.rejects(run, /AccessDenied/); assert.deepEqual([web, schedules, updates.length], [0, 0, 0]); }
   else if (scenario.endsWith('drift')) { await assert.rejects(run, /PREPARED_/); assert.equal(updates.length, 0); }
   else { await run(); assert.equal(updates.length, scenario === 'dev absent' ? 3 : 4); }
  } finally { await rm(root, { recursive: true, force: true }); }
 });
}
test('prepare gates web and schedules, apply follows health', async () => {
 const workflow = await readFile('.github/workflows/aws-platform.yml', 'utf8');
 const prepare = workflow.indexOf('run: node scripts/aws-release-workers.mjs prepare');
 const web = workflow.indexOf('- name: Validate and deploy CloudFormation');
 const health = workflow.indexOf('- name: Require healthy ECS');
 const schedules = workflow.indexOf('- name: Deploy ownership-verified');
 const apply = workflow.indexOf('run: node scripts/aws-release-workers.mjs apply');
 assert(prepare > 0 && prepare < web && web < health && health < schedules && schedules < apply);
 assert(!workflow.slice(prepare, web).includes('continue-on-error'));
});
for (const scenario of ['partial', 'lost response', 'external']) {
 test(`resume: ${scenario}`, async () => {
  const root = await mkdtemp(join(tmpdir(), 'worker-resume-'));
  try {
   const entries = [];
   const states = [];
   const updates = [];
   for (let i = 0; i < 3; i++) {
    await mkdir(join(root, String(i)));
    await writeFile(join(root, String(i), 'code.zip'), 'target');
    entries.push({ worker: String(i), function: String(i), preparedZipHash: hash('target'), codeSha256: 'old', revisionId: 'r1', environmentHash: hash('[]') });
    states.push({ CodeSha256: 'old', RevisionId: 'r1', State: 'Active', LastUpdateStatus: 'Successful' });
   }
   let fail = true;
   const aws = args => {
    const i = Number(args[args.indexOf('--function-name') + 1]);
    if (args[1] === 'update-function-code') {
     updates.push(i);
     if (i === 1 && fail && scenario !== 'lost response') throw Error('failed');
     states[i].CodeSha256 = hash('target'); states[i].RevisionId = 'r2';
     if (i === 1 && fail) throw Error('response lost');
    }
    return states[i];
   };
   const prepared = { sourceSha: 'a'.repeat(40), functions: entries };
   if (scenario === 'lost response') await applyWorkers(prepared, root, aws);
   else {
    await assert.rejects(applyWorkers(prepared, root, aws), /failed/);
    fail = false;
    const count = updates.length;
    if (scenario === 'external') {
     states[2].CodeSha256 = 'third-party';
     await assert.rejects(applyWorkers(prepared, root, aws), /PREPARED_WORKER_CHANGED/);
     assert.equal(updates.length, count);
    } else await applyWorkers(prepared, root, aws);
   }
   assert.equal(updates.filter(i => i === 0).length, 1);
   const receipt = JSON.parse(await readFile(join(root, 'applied.json')));
   assert(receipt.functions.every(entry => entry.targetZipHash === hash('target')));
   if (scenario !== 'external') assert(receipt.functions.every(entry => entry.result === 'complete'));
  } finally { await rm(root, { recursive: true, force: true }); }
 });
}
