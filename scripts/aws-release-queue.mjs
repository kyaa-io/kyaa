import { pathToFileURL } from 'node:url';
import { appendFile } from 'node:fs/promises';
import { github, trustedRun } from './aws-release.mjs';

// Keep the shared deployment lock: cancellation can interrupt CloudFormation.
export async function shouldBuild(env, read = github) {
  if (env.GITHUB_EVENT_NAME !== 'push' || env.GITHUB_REF !== 'refs/heads/main') return true;
  const tip = await read('/git/ref/heads/main');
  if (!/^[a-f0-9]{40}$/.test(tip.object?.sha ?? '')) throw Error('INVALID_MAIN_TIP');
  if (tip.object.sha === env.GITHUB_SHA) return true;
  for (let page = 1; ; page++) {
    const result = await read(`/actions/workflows/aws-approved-promotion.yml/runs?event=workflow_dispatch&branch=main&per_page=100&page=${page}`);
    if (!Array.isArray(result.workflow_runs)) throw Error('INVALID_RESERVATION_HISTORY');
    if (result.workflow_runs.some(run => run.display_title === `Approved production promotion of dev ${env.GITHUB_RUN_ID} (${env.GITHUB_SHA})`)) return true;
    if (result.workflow_runs.length < 100) return false;
  }
}

async function dispatchDev() {
  if (!process.env.GITHUB_TOKEN) throw Error('GITHUB_TOKEN_REQUIRED');
  const response = await fetch('https://api.github.com/repos/kyaa-io/kyaa/actions/workflows/aws-platform.yml/dispatches', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20_000),
    headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json', 'content-type': 'application/json' },
    body: JSON.stringify({ ref: 'main', inputs: { environment: 'dev' } }),
  });
  // Never retry: an uncertain response may already have queued the run.
  if (response.status !== 204) throw Error(`DEV_DISPATCH_NOT_CONFIRMED_${response.status}`);
}

export async function restoreMain(read = github, dispatch = dispatchDev) {
  const tip = await read('/git/ref/heads/main');
  if (!/^[a-f0-9]{40}$/.test(tip.object?.sha ?? '')) throw Error('INVALID_MAIN_TIP');
  const result = await read(`/actions/workflows/aws-platform.yml/runs?event=push&branch=main&head_sha=${tip.object.sha}&per_page=100`);
  const candidate = result.workflow_runs?.[0];
  if (!candidate) throw Error('LATEST_MAIN_RUN_MISSING');
  const run = trustedRun(await read(`/actions/runs/${candidate.id}`), candidate.id, false);
  if (run.head_branch !== 'main' || run.head_sha !== tip.object.sha || run.event !== 'push') throw Error('LATEST_MAIN_RUN_MISMATCH');
  // An existing queued run already follows this hotfix under the same lock.
  if (run.status !== 'completed') return;
  await dispatch();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv[2] === 'restore') await restoreMain();
    else await appendFile(process.env.GITHUB_OUTPUT, `build=${await shouldBuild(process.env)}\n`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
