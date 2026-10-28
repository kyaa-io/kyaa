import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUIRED_WORKFLOWS, waitForRequiredCi } from './aws-release-ci.mjs';
import { REPOSITORY, REPOSITORY_ID } from './aws-release.mjs';

const sha = 'a'.repeat(40);
const run = (index = 0, changes = {}) => ({ id: index + 100, repository: { id: REPOSITORY_ID, full_name: REPOSITORY }, path: REQUIRED_WORKFLOWS[index], head_branch: 'main', head_sha: sha, event: 'push', run_attempt: 1, status: 'completed', conclusion: 'success', ...changes });
function api({ list = index => [run(index)], detail = id => run(id - 100) } = {}) {
  return async path => {
    if (path.startsWith('/actions/workflows/')) {
      const index = REQUIRED_WORKFLOWS.findIndex(workflow => path.includes(workflow.split('/').at(-1)));
      return { workflow_runs: list(index, new URL(`https://test${path}`).searchParams.get('page')) };
    }
    return detail(Number(path.split('/').at(-1)));
  };
}
const options = extra => ({ githubCall: api(), timeoutMs: 20, pollMs: 10, now: () => 0, ...extra });

test('requires all five workflow paths for the exact main push SHA', async () => {
  assert.deepEqual(REQUIRED_WORKFLOWS, ['backend-security', 'fan-design-system', 'dependency-audit', 'deployment-notices', 'cs-inquiries'].map(name => `.github/workflows/${name}.yml`));
  const proof = await waitForRequiredCi(sha, options());
  assert.equal(proof.status, 'success');
  assert.equal(proof.sourceSha, sha);
  assert.equal(proof.runs.length, 5);
});
test('rejects invalid input before requesting GitHub', async () => {
  await assert.rejects(waitForRequiredCi('main', options()), /INVALID_SOURCE_SHA/);
});
for (const changes of [
  { repository: { id: 1, full_name: REPOSITORY } }, { repository: { id: REPOSITORY_ID, full_name: 'evil/repo' } },
  { path: '.github/workflows/other.yml' }, { head_branch: 'dev' }, { head_sha: 'b'.repeat(40) },
  { event: 'deployment_status' }, { run_attempt: 0 }, { id: '100' },
]) test(`rejects untrusted run ${JSON.stringify(changes)}`, async () => {
  await assert.rejects(waitForRequiredCi(sha, options({ githubCall: api({ list: index => [run(index, changes)] }) })), /UNTRUSTED_CI_RUN/);
});
for (const conclusion of ['failure', 'cancelled', 'skipped', 'timed_out', null]) test(`fails closed on ${conclusion}`, async () => {
  await assert.rejects(waitForRequiredCi(sha, options({ githubCall: api({ detail: id => run(id - 100, { conclusion }) }) })), /REQUIRED_CI_FAILED/);
});
test('latest run ID wins over an earlier success', async () => {
  await assert.rejects(waitForRequiredCi(sha, options({ githubCall: api({ list: i => [run(i), run(i, { id: i + 200 })], detail: id => run(id - 200, { id, conclusion: 'failure' }) }) })), /REQUIRED_CI_FAILED/);
});
test('current attempt detail supersedes an older failed list result', async () => {
  const proof = await waitForRequiredCi(sha, options({ githubCall: api({ list: i => [run(i, { conclusion: 'failure' })], detail: id => run(id - 100, { run_attempt: 2 }) }) }));
  assert.ok(proof.runs.every(item => item.runAttempt === 2));
});
test('rejects stale detail attempts and changed detail identity', async () => {
  await assert.rejects(waitForRequiredCi(sha, options({ githubCall: api({ list: i => [run(i, { run_attempt: 2 })] }) })), /UNTRUSTED_CI_RUN/);
  await assert.rejects(waitForRequiredCi(sha, options({ githubCall: api({ detail: id => run(id - 100, { id: id + 1 }) }) })), /UNTRUSTED_CI_RUN/);
});
for (const missing of [true, false]) test(`bounded wait for ${missing ? 'missing' : 'pending'} runs`, async () => {
  let time = 0;
  await assert.rejects(waitForRequiredCi(sha, options({ now: () => time, sleep: async ms => { time += ms; }, githubCall: api({ list: i => missing ? [] : [run(i)], detail: id => run(id - 100, { status: 'in_progress', conclusion: null }) }) })), /REQUIRED_CI_TIMEOUT/);
  assert.equal(time, 20);
});
test('waits until a newer attempt completes', async () => {
  let time = 0;
  const proof = await waitForRequiredCi(sha, options({ now: () => time, sleep: async ms => { time += ms; }, githubCall: api({ detail: id => run(id - 100, { run_attempt: 2, status: time ? 'completed' : 'in_progress' }) }) }));
  assert.equal(proof.elapsedMs, 10);
});
test('missing workflows fail after startup grace while queued runs keep waiting', async () => {
  let time = 0;
  const timed = { now: () => time, sleep: async ms => { time += ms; }, missingGraceMs: 10 };
  await assert.rejects(waitForRequiredCi(sha, options({ ...timed, githubCall: api({ list: () => [] }) })), /REQUIRED_CI_MISSING/);
  assert.equal(time, 10);
  time = 0;
  await assert.rejects(waitForRequiredCi(sha, options({ ...timed, githubCall: api({ detail: id => run(id - 100, { status: 'queued', conclusion: null }) }) })), /REQUIRED_CI_TIMEOUT/);
  assert.equal(time, 20);
});
test('API failures and malformed responses fail closed', async () => {
  await assert.rejects(waitForRequiredCi(sha, options({ githubCall: async () => { throw Error('GITHUB_HTTP_403'); } })), /GITHUB_HTTP_403/);
  await assert.rejects(waitForRequiredCi(sha, options({ githubCall: async () => ({}) })), /INVALID_CI_RUN_LIST/);
});
test('paginates full pages and rejects an unbounded result set', async () => {
  let pages = [];
  const indices = new Map();
  const githubCall = api({ list: (i, page) => {
    pages.push(page);
    const id = 2000 + i; indices.set(id, i);
    return page === '1' ? Array.from({ length: 100 }, (_, n) => run(i, { id: 1000 + n })) : [run(i, { id })];
  }, detail: id => run(indices.get(id), { id }) });
  const proof = await waitForRequiredCi(sha, options({ githubCall }));
  assert.deepEqual(proof.runs.map(item => item.runId), [2000, 2001, 2002, 2003, 2004]);
  assert.ok(pages.includes('2'));
  await assert.rejects(waitForRequiredCi(sha, options({ maxPages: 1, githubCall: api({ list: i => Array.from({ length: 100 }, () => run(i)) }) })), /CI_PAGINATION_LIMIT/);
});
test('final reread uses a newly created failing run rather than old success', async () => {
  const counts = new Map();
  await assert.rejects(waitForRequiredCi(sha, options({ githubCall: api({ list: i => {
    const count = (counts.get(i) ?? 0) + 1; counts.set(i, count);
    return [run(i, count > 1 ? { id: i + 200 } : {})];
  }, detail: id => id >= 200 ? run(id - 200, { id, conclusion: 'failure' }) : run(id - 100) }) })), /REQUIRED_CI_FAILED/);
});
test('a timeout during an API response cannot return successful proof', async () => {
  let time = 0;
  const call = api();
  await assert.rejects(waitForRequiredCi(sha, options({ now: () => time, githubCall: async path => { const result = await call(path); time = 25; return result; } })), /REQUIRED_CI_TIMEOUT/);
});
test('final reread rejects a rerun started while other workflows were checked', async () => {
  const calls = new Map();
  await assert.rejects(waitForRequiredCi(sha, options({ githubCall: api({ detail: id => {
    const count = (calls.get(id) ?? 0) + 1; calls.set(id, count);
    return run(id - 100, count > 1 ? { run_attempt: 2, conclusion: 'failure' } : {});
  } }) })), /REQUIRED_CI_FAILED/);
});
test('CLI replaces stale success evidence on failure without logging credentials', () => {
  const directory = mkdtempSync(join(tmpdir(), 'aws-release-ci-'));
  try {
    mkdirSync(join(directory, 'work/aws-release'), { recursive: true });
    const proofPath = join(directory, 'work/aws-release/ci-proof.json');
    writeFileSync(proofPath, JSON.stringify({ status: 'success' }));
    const token = 'private-test-credential';
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./aws-release-ci.mjs', import.meta.url)), 'invalid'], { cwd: directory, encoding: 'utf8', env: { ...process.env, GITHUB_TOKEN: token, GITHUB_STEP_SUMMARY: join(directory, 'summary.md') } });
    assert.equal(result.status, 1);
    const proof = JSON.parse(readFileSync(proofPath, 'utf8'));
    assert.equal(proof.status, 'failure');
    assert.equal(proof.error, 'INVALID_SOURCE_SHA');
    assert.ok(!`${result.stdout}${result.stderr}${JSON.stringify(proof)}`.includes(token));
    assert.match(readFileSync(join(directory, 'summary.md'), 'utf8'), /failure/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
