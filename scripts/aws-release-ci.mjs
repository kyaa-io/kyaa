import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { githubRead } from './aws-approved-promotion.mjs';
import { github, trustedRun, REPOSITORY, REPOSITORY_ID } from './aws-release.mjs';

export const REQUIRED_WORKFLOWS = ['backend-security', 'fan-design-system', 'dependency-audit', 'deployment-notices', 'cs-inquiries'].map(name => `.github/workflows/${name}.yml`);
const fail = message => { throw new Error(message); };
function trusted(run, workflow, sha, branch, id) {
  if (!Number.isSafeInteger(run?.id) || run.id < 1 || (id !== undefined && run.id !== id) || run.repository?.id !== REPOSITORY_ID || run.repository?.full_name !== REPOSITORY || run.path !== workflow || run.head_branch !== branch || run.head_sha !== sha || run.event !== 'push' || !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1) fail('UNTRUSTED_CI_RUN');
  return run;
}

export async function waitForRequiredCi(sha, { sourceRunId, githubCall = github, timeoutMs = 40 * 60_000, pollMs = 30_000, missingGraceMs = 120_000, maxPages = 10, failFastOnly = false, now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  if (!/^[a-f0-9]{40}$/.test(sha ?? '')) fail('INVALID_SOURCE_SHA');
  let started = now();
  let beforeDeadline = () => {};
  let deadlineActive = false;
  const read = path => githubRead(path, { read: githubCall, retryable: error => /^GITHUB_HTTP_5\d\d$/.test(error.message) || ['TypeError', 'AbortError', 'TimeoutError'].includes(error.name), wait: async ms => { beforeDeadline(); await sleep(deadlineActive ? Math.min(ms, Math.max(0, timeoutMs - (now() - started))) : ms); beforeDeadline(); } });
  let branch = 'main';
  if (sourceRunId !== undefined) {
    const source = trustedRun(await read(`/actions/runs/${sourceRunId}`), sourceRunId, false);
    if (source.head_sha !== sha) fail('SOURCE_RUN_SHA_MISMATCH');
    branch = source.head_branch;
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isFinite(pollMs) || pollMs <= 0 || !Number.isFinite(missingGraceMs) || missingGraceMs < 0 || !Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 10) fail('INVALID_CI_WAIT_OPTIONS');
  started = now();
  deadlineActive = true;
  beforeDeadline = () => { if (now() - started >= timeoutMs) fail('REQUIRED_CI_TIMEOUT'); };
  async function current(workflow) {
    let latest;
    for (let page = 1; page <= maxPages; page++) {
      beforeDeadline();
      const response = await read(`/actions/workflows/${workflow.split('/').at(-1)}/runs?branch=${encodeURIComponent(branch)}&event=push&head_sha=${sha}&per_page=100&page=${page}`);
      if (!Array.isArray(response?.workflow_runs) || response.workflow_runs.length > 100) fail('INVALID_CI_RUN_LIST');
      for (const candidate of response.workflow_runs) {
        trusted(candidate, workflow, sha, branch);
        if (!latest || candidate.id > latest.id || (candidate.id === latest.id && candidate.run_attempt > latest.run_attempt)) latest = candidate;
      }
      if (response.workflow_runs.length < 100) break;
      if (page === maxPages) fail('CI_PAGINATION_LIMIT');
    }
    if (!latest) {
      if (failFastOnly) return null;
      if (now() - started >= missingGraceMs) fail(`REQUIRED_CI_MISSING:${workflow}`);
      return null;
    }
    // The list may still describe a failed earlier attempt after a rerun starts.
    beforeDeadline();
    const run = trusted(await read(`/actions/runs/${latest.id}`), workflow, sha, branch, latest.id);
    if (run.run_attempt < latest.run_attempt) fail('UNTRUSTED_CI_RUN');
    if (run.status !== 'completed') return null;
    if (run.conclusion !== 'success') fail(`REQUIRED_CI_FAILED:${workflow}:${run.id}:${run.run_attempt}`);
    return { workflowPath: workflow, runId: run.id, runAttempt: run.run_attempt, status: run.status, conclusion: run.conclusion, createdAt: run.created_at ?? null, updatedAt: run.updated_at ?? null };
  }
  while (true) {
    beforeDeadline();
    const runs = await Promise.all(REQUIRED_WORKFLOWS.map(current));
    // Pre-build check: a completed failure already threw above; running or not-yet-listed workflows are left to the post-build wait.
    if (failFastOnly) return { schemaVersion: 1, sourceSha: sha, status: runs.every(Boolean) ? 'all-completed-success' : 'no-failure-yet' };
    if (runs.every(Boolean)) {
      // Re-list after the first pass so a new run/attempt cannot reuse old success.
      const confirmed = await Promise.all(REQUIRED_WORKFLOWS.map(current));
      beforeDeadline();
      if (confirmed.every(Boolean)) return { schemaVersion: 1, repositoryId: REPOSITORY_ID, sourceSha: sha, sourceBranch: branch, status: 'success', checkedAt: new Date().toISOString(), elapsedMs: now() - started, runs: confirmed };
    }
    beforeDeadline();
    await sleep(Math.min(pollMs, timeoutMs - (now() - started)));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let proof;
  const started = Date.now();
  const earlyOnly = process.argv[4] === '--fail-fast-only';
  if (earlyOnly) {
    // Pre-build gate: only an already-failed required workflow stops the build. API or trust errors never block it; the post-build check decides.
    try { const early = await waitForRequiredCi(process.argv[2], { sourceRunId: process.argv[3] ?? '', failFastOnly: true }); process.stdout.write(`Required CI pre-build check: ${early.status}\n`); }
    catch (error) {
      if (/^REQUIRED_CI_FAILED:/.test(error.message)) { process.stderr.write(`${error.message}\n`); process.exit(1); }
      process.stdout.write('::warning::Required CI pre-build check could not run; the post-build check will decide.\n');
    }
    process.exit(0);
  }
  try { proof = await waitForRequiredCi(process.argv[2], { sourceRunId: process.argv[3] ?? '' }); }
  catch (error) {
    // Only our error codes go into public evidence, never upstream response bodies.
    const code = /^(?:INVALID_|UNTRUSTED_|REQUIRED_|CI_|GITHUB_)[A-Z0-9_:./-]+$/i.test(error.message) ? error.message : 'CI_VERIFICATION_ERROR';
    proof = { schemaVersion: 1, sourceSha: process.argv[2], status: 'failure', error: code, elapsedMs: Date.now() - started };
    process.exitCode = 1;
  }
  await mkdir('work/aws-release', { recursive: true });
  await writeFile('work/aws-release/ci-proof.json', JSON.stringify(proof, null, 2) + '\n');
  const summary = `Required source-branch push CI: ${proof.status}; ${Math.round(proof.elapsedMs / 1000)}s\n${proof.runs?.map(run => `- ${run.workflowPath}: run ${run.runId}, attempt ${run.runAttempt}, success`).join('\n') ?? proof.error}\n`;
  process.stdout.write(summary);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
}
