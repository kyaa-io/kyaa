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
  assert.match(job.if,/refs\/heads\/main/); assert.equal(job.environment,'prod');
  assert.equal(job.concurrency.group,'telegram-production-notices'); assert.equal(job.concurrency['cancel-in-progress'],false);
  assert.equal(job.permissions.checks,'write');
  const step = job.steps.at(-1);
  assert.equal(step.run,'node scripts/recover-deployment-notice.mjs');
  assert.equal(step.env.NOTICE_INSPECTION_EVIDENCE,'${{ inputs.inspection_evidence }}');
});
