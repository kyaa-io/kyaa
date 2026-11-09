import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileUnsentReceipt } from './recover-deployment-notice.mjs';
const sha = 'a'.repeat(40);
const check = { app: {slug:'github-actions'}, name:'Telegram deployment notice', head_sha:sha, external_id:'123', status:'completed', conclusion:'action_required', output:{summary:'Inspect the room'} };
function harness(receipt = check) {
  const writes = [];
  return { writes, options: { receiptId:456, head:sha, evidence:'Inspected room -5187701508. Last message 701; no later notice was delivered.', assertAncestor:() => {}, github:async (path, init) => {
    if (init) { writes.push(init.body); return {}; }
    return path.includes('check-runs') ? receipt : {sha, environment:'AWS production',creator:{login:'github-actions[bot]'}};
  } } };
}
test('room inspection reconciles only a matching uncertain AWS receipt and retains evidence', async () => {
  const { options, writes } = harness(); await reconcileUnsentReceipt(options);
  assert.equal(writes[0].conclusion,'failure');
  const audit = JSON.parse(writes[0].output.summary);
  assert.equal(audit.evidence,options.evidence); assert.equal(audit.previousSummary,'Inspect the room');
});
test('missing evidence, wrong receipt, delivered and partial delivery never reset', async () => {
  for (const change of [{name:'Other'}, {conclusion:'success'}, {app:{slug:'other'}}, {output:{summary:JSON.stringify({delivered:[{messageId:701}]})}}]) {
    const { options, writes } = harness({...check,...change});
    await assert.rejects(reconcileUnsentReceipt(options)); assert.equal(writes.length,0);
  }
  const {options,writes}=harness();
  await assert.rejects(reconcileUnsentReceipt({...options,evidence:''})); assert.equal(writes.length,0);
});

test('manual recovery shares the production lock and keeps inputs out of shell code', async () => {
  const {readFileSync} = await import('node:fs'); const {load} = await import('js-yaml');
  const workflow = load(readFileSync('.github/workflows/deployment-notices.yml','utf8'));
  const job = workflow.jobs.recover;
  assert.match(job.if,/refs\/heads\/main/);
  assert.equal(job.environment,"${{ inputs.environment == 'dev' && 'dev' || 'prod' }}");
  assert.equal(job.concurrency.group,"${{ inputs.environment == 'dev' && 'aws-release-dev' || 'telegram-production-notices' }}"); assert.equal(job.concurrency['cancel-in-progress'],false);
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.environment.options,['prod','dev']); assert.equal(workflow.on.workflow_dispatch.inputs.environment.default,'prod');
  assert.equal(job.permissions.checks,'write');
  const step = job.steps.at(-1);
  assert.equal(step.run,'node scripts/recover-deployment-notice.mjs');
  assert.equal(step.env.NOTICE_ENVIRONMENT,'${{ inputs.environment }}');
  assert.equal(step.env.NOTICE_INSPECTION_EVIDENCE,'${{ inputs.inspection_evidence }}');
});

test('Wave recovery accepts only its matching receipt name and environment', async () => {
 for(const name of ['Telegram deployment notice · kyaa wave','Telegram deployment notice']) {
  const {options,writes}=harness({...check,name}); const original=options.github;
  options.github=async(path,init)=>!init&&path.startsWith('/deployments/')?{sha,environment:'AWS wave production',creator:{login:'github-actions[bot]'}}:original(path,init);
  if(name.endsWith('kyaa wave')){await reconcileUnsentReceipt(options);assert.equal(writes.length,1);}
  else {await assert.rejects(reconcileUnsentReceipt(options),/INVALID_RECEIPT/);assert.equal(writes.length,0);}
 }
});

const devReceipt={...check,name:'Telegram deployment notice · DEV'};
function devHarness(receipt=devReceipt,deployment={}){
 const {options,writes}=harness(receipt),original=options.github;
 options.github=async(path,init)=>!init&&path.startsWith('/deployments/')?{sha,environment:'AWS dev',creator:{login:'github-actions[bot]'},...deployment}:original(path,init);
 return {options,writes};
}
test('DEV recovery accepts only the DEV receipt of the same commit created by github-actions',async()=>{
 const ok=devHarness(); await reconcileUnsentReceipt(ok.options); assert.equal(ok.writes.length,1); assert.equal(ok.writes[0].conclusion,'failure');
 for(const [receipt,deployment] of [
  [{...devReceipt,name:'Telegram deployment notice'},{}],
  [{...devReceipt,name:'Telegram deployment notice · kyaa wave'},{}],
  [devReceipt,{environment:'AWS staging'}],
  [{...devReceipt,head_sha:'b'.repeat(40)},{}],
  [{...devReceipt,app:{slug:'other'}},{}],
  [devReceipt,{creator:{login:'someone'}}],
 ]) { const {options,writes}=devHarness(receipt,deployment); await assert.rejects(reconcileUnsentReceipt(options),/INVALID_RECEIPT/); assert.equal(writes.length,0); }
});
test('production receipt name is rejected for a DEV-named receipt and unknown environments stay refused',async()=>{
 const {options,writes}=harness({...check,name:'Telegram deployment notice · DEV'}); await assert.rejects(reconcileUnsentReceipt(options),/INVALID_RECEIPT/); assert.equal(writes.length,0);
});
