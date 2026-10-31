import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { CHECK_NAME, REPOSITORY, REPOSITORY_ID, createGithubClient, verifyAwsNotice, notifyDeployment, sendNoticeRequest } from './deployment-notices.mjs';

export async function reconcileUnsentReceipt({ github, receiptId, evidence, head, assertAncestor = (base, head) => execFileSync('git', ['merge-base', '--is-ancestor', base, head]) }) {
  if (!Number.isSafeInteger(receiptId) || receiptId <= 0 || typeof evidence !== 'string' || evidence.length < 40 || evidence.length > 2000) throw new Error('ROOM_INSPECTION_EVIDENCE_REQUIRED');
  const receipt = await github(`/check-runs/${receiptId}`);
  const deploymentId = Number(receipt.external_id);
  if (!Number.isSafeInteger(deploymentId) || deploymentId <= 0) throw new Error('INVALID_RECEIPT');
  const deployment = await github(`/deployments/${deploymentId}`);
  if (receipt.app?.slug !== 'github-actions' || receipt.name !== CHECK_NAME || receipt.head_sha !== deployment.sha ||
      deployment.environment !== 'AWS production' || deployment.creator?.login !== 'github-actions[bot]' || !/^[a-f0-9]{40}$/.test(deployment.sha)) throw new Error('INVALID_RECEIPT');
  assertAncestor(deployment.sha, head);
  if (receipt.status === 'completed' && receipt.conclusion === 'failure') return;
  if (receipt.status !== 'completed' || receipt.conclusion !== 'action_required') throw new Error('RECEIPT_NOT_UNCERTAIN');
  let prior;
  try { prior = JSON.parse(receipt.output?.summary); } catch { prior = {}; }
  if (prior?.delivered?.length) throw new Error('PARTIAL_DELIVERY_REQUIRES_MESSAGE_RECONCILIATION');
  await github(`/check-runs/${receiptId}`, { method: 'PATCH', body: { status: 'completed', conclusion: 'failure',
    output: { title: 'Room inspected: notice was not delivered', summary: JSON.stringify({ inspectedAt: new Date().toISOString(), evidence, previousSummary: receipt.output?.summary }) } } });
}

async function main() {
  const id = Number(process.env.NOTICE_DEPLOYMENT_ID);
  if (!Number.isSafeInteger(id) || id <= 0 || !process.env.GITHUB_TOKEN || !process.env.TELEGRAM_BUG_REPORT_OPERATOR_SECRET) throw new Error('RECOVERY_INPUTS_REQUIRED');
  const github = createGithubClient({ token: process.env.GITHUB_TOKEN });
  const deployment = await github(`/deployments/${id}`);
  const [status] = await github(`/deployments/${id}/statuses?per_page=100`);
  await verifyAwsNotice(deployment, status, github);
  if (process.env.NOTICE_UNSENT_RECEIPT_ID) await reconcileUnsentReceipt({ github, receiptId: Number(process.env.NOTICE_UNSENT_RECEIPT_ID), evidence: process.env.NOTICE_INSPECTION_EVIDENCE, head: deployment.sha });
  console.log(JSON.stringify(await notifyDeployment({
    event: { repository: { id: REPOSITORY_ID, full_name: REPOSITORY }, deployment, deployment_status: status }, github,
    runUrl: `https://github.com/${REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
    send: body => sendNoticeRequest(body, process.env.TELEGRAM_BUG_REPORT_OPERATOR_SECRET),
  })));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
