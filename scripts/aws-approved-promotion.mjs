import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { github, trustedRun, REPOSITORY, REPOSITORY_ID, WORKFLOW_PATH } from './aws-release.mjs';

const fail = message => { throw new Error(message); };
const RESERVATION_PATH = '.github/workflows/aws-approved-promotion.yml';
const reservationTitle = (id, sha) => `Approved production promotion of dev ${id} (${sha})`;

export async function githubRead(path, { read = github, wait = sleep } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try { return await read(path); }
    catch (error) {
      if (attempt >= 2 || !(/GITHUB_HTTP_(429|5\d\d)/.test(error.message) || ['TypeError', 'AbortError', 'TimeoutError'].includes(error.name))) throw error;
      await wait(1000 * (attempt + 1));
    }
  }
}

export async function assertFirstReservation(sourceRunId, expectedSha, reservationRunId, reservationAttempt, read = githubRead) {
  if (!/^[1-9]\d*$/.test(String(reservationRunId)) || !Number.isSafeInteger(Number(reservationRunId)) || String(reservationAttempt) !== '1') fail('RESERVATION_RETRY_REQUIRES_INSPECTION');
  const current = await read(`/actions/runs/${reservationRunId}`);
  if (current.id !== Number(reservationRunId) || current.repository?.id !== REPOSITORY_ID || current.repository?.full_name !== REPOSITORY || current.path !== RESERVATION_PATH || current.event !== 'workflow_dispatch' || current.head_branch !== 'main' || current.display_title !== reservationTitle(sourceRunId, expectedSha)) fail('UNTRUSTED_RESERVATION_RUN');
  for (let page = 1; ; page += 1) {
    const result = await read(`/actions/workflows/aws-approved-promotion.yml/runs?event=workflow_dispatch&branch=main&per_page=100&page=${page}`);
    if (!Array.isArray(result.workflow_runs)) fail('INVALID_RESERVATION_HISTORY');
    for (const prior of result.workflow_runs) {
      if (prior.id < current.id && prior.repository?.id === REPOSITORY_ID && prior.repository?.full_name === REPOSITORY && prior.path === RESERVATION_PATH && prior.event === 'workflow_dispatch' && prior.head_branch === 'main' && prior.display_title === current.display_title) fail('DUPLICATE_RESERVATION_REQUIRES_INSPECTION');
    }
    if (result.workflow_runs.length < 100) break;
  }
}

export async function dispatchProduction(sourceRunId, fetcher = fetch) {
  if (!process.env.GITHUB_TOKEN) fail('GITHUB_TOKEN_REQUIRED');
  // Never retry this POST: a lost response can still have created a production run.
  const response = await fetcher(`https://api.github.com/repos/${REPOSITORY}/actions/workflows/aws-platform.yml/dispatches`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20_000),
    headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json', 'content-type': 'application/json' },
    body: JSON.stringify({ ref: 'main', inputs: { environment: 'prod', source_run_id: String(sourceRunId), require_forward_only: 'true' } }),
  });
  if (response.status !== 204) fail(`PRODUCTION_DISPATCH_NOT_CONFIRMED_${response.status}`);
}

export async function approvedPromotion(sourceRunId, expectedSha, {
  read = githubRead, dispatch = dispatchProduction, wait = sleep, now = Date.now,
  timeoutMs = 65 * 60_000, pollMs = 30_000, log = console.log,
  reservationRunId = process.env.GITHUB_RUN_ID, reservationAttempt = process.env.GITHUB_RUN_ATTEMPT,
} = {}) {
  if (!/^[1-9]\d*$/.test(String(sourceRunId)) || !Number.isSafeInteger(Number(sourceRunId))) fail('INVALID_SOURCE_RUN_ID');
  if (!/^[a-f0-9]{40}$/.test(expectedSha ?? '')) fail('INVALID_EXPECTED_SHA');
  await assertFirstReservation(sourceRunId, expectedSha, reservationRunId, reservationAttempt, read);
  const deadline = now() + timeoutMs;
  let run;
  do {
    if (now() >= deadline) fail('DEV_RUN_WAIT_TIMEOUT');
    run = trustedRun(await read(`/actions/runs/${sourceRunId}`), sourceRunId, false);
    if (run.event !== 'push' || run.head_sha !== expectedSha || run.path !== WORKFLOW_PATH) fail('APPROVED_DEV_RUN_MISMATCH');
    if (run.status === 'completed') break;
    log(`Waiting for approved dev run ${sourceRunId}: ${run.status}`);
    await wait(Math.min(pollMs, Math.max(0, deadline - now())));
  } while (true);
  trustedRun(run, sourceRunId);
  if (now() >= deadline) fail('DEV_RUN_WAIT_TIMEOUT');
  const main = await read('/git/ref/heads/main');
  if (main.object?.sha !== expectedSha) fail('MAIN_CHANGED_AFTER_APPROVAL');
  await dispatch(sourceRunId);
  log(`Production promotion requested for approved dev run ${sourceRunId} (${expectedSha}).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || process.env.GITHUB_REF !== 'refs/heads/main' || process.env.GITHUB_REPOSITORY !== REPOSITORY) {
    console.error('MAIN_MANUAL_GITHUB_ACTIONS_ONLY'); process.exitCode = 1;
  } else {
    approvedPromotion(process.env.SOURCE_RUN_ID, process.env.EXPECTED_SHA).catch(error => { console.error(error.message); process.exitCode = 1; });
  }
}
