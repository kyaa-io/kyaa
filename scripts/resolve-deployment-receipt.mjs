import { pathToFileURL } from 'node:url';
import { CHECK_NAME, createGithubClient } from './deployment-notices.mjs';

export async function resolveReceipt({ github, deploymentId, outcome, messageIds, evidence }) {
  if (!Number.isSafeInteger(deploymentId) || deploymentId <= 0 || !['sent', 'rejected'].includes(outcome) || typeof evidence !== 'string' || evidence.length < 40 || evidence.length > 2000 || !Array.isArray(messageIds) || !messageIds.length || messageIds.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new Error('INSPECTION_EVIDENCE_REQUIRED');
  const deployment = await github(`/deployments/${deploymentId}`);
  if (deployment.environment !== 'AWS production' || deployment.creator?.login !== 'github-actions[bot]' || deployment.payload?.publicLive !== true) throw new Error('UNTRUSTED_DEPLOYMENT');
  const matches = [];
  for (let page = 1; ; page++) {
    const result = await github(`/commits/${deployment.sha}/check-runs?check_name=${encodeURIComponent(CHECK_NAME)}&filter=all&per_page=100&page=${page}`);
    matches.push(...result.check_runs.filter(r => r.name === CHECK_NAME && r.app?.slug === 'github-actions' && r.external_id === String(deploymentId) && r.head_sha === deployment.sha));
    if (result.check_runs.length < 100) break;
  }
  if (matches.length !== 1) throw new Error('UNIQUE_RECEIPT_REQUIRED');
  const receipt = matches[0];
  if (receipt.status !== 'completed' || receipt.conclusion !== 'action_required') throw new Error('RECEIPT_NOT_UNCERTAIN');
  const prior = JSON.parse(receipt.output.summary);
  // A partial send cannot become a full baseline or a retryable rejection.
  if (prior.delivered?.length && (outcome === 'rejected' || prior.delivered.length < prior.batchCount)) throw new Error('PARTIAL_DELIVERY_REQUIRES_MESSAGE_RECONCILIATION');
  if (outcome === 'sent' && (prior.delivered ?? []).some(batch => (batch.messageIds ?? [batch.messageId]).some(id => !messageIds.includes(id)))) throw new Error('DELIVERED_MESSAGES_MISSING');
  await github(`/check-runs/${receipt.id}`, { method: 'PATCH', body: {
    status: 'completed', conclusion: outcome === 'sent' ? 'success' : 'failure',
    output: { title: `Room inspection resolved: ${outcome}`, summary: JSON.stringify({ deploymentId, chatId: -5187701508, outcome, messageId: messageIds[0], messageIds, evidence, inspectedAt: new Date().toISOString(), previousSummary: receipt.output.summary }) },
  } });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  resolveReceipt({ github: createGithubClient({ token: process.env.GITHUB_TOKEN }), deploymentId: Number(process.env.NOTICE_DEPLOYMENT_ID), outcome: process.env.NOTICE_OUTCOME, messageIds: (process.env.NOTICE_MESSAGE_IDS ?? '').split(',').map(Number), evidence: process.env.NOTICE_INSPECTION_EVIDENCE }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
