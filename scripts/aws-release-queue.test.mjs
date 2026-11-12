import test from 'node:test';
import assert from 'node:assert/strict';
import { REQUIRED_WORKFLOWS } from './aws-release-ci.mjs';
import { shouldBuild, restoreMain } from './aws-release-queue.mjs';
import { REPOSITORY, REPOSITORY_ID, WORKFLOW_PATH } from './aws-release.mjs';
const sha = 'a'.repeat(40), newer = 'b'.repeat(40);
const env = { GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: sha, GITHUB_RUN_ID: '11' };
test('latest main and every non-main-push are preserved without cancellation', async () => {
  assert.equal(await shouldBuild(env, async () => ({ object: { sha } })), true);
  assert.equal(await shouldBuild({ ...env, GITHUB_REF: 'refs/heads/release/production' }, () => { throw Error(); }), true);
  assert.equal(await shouldBuild({ ...env, GITHUB_EVENT_NAME: 'workflow_dispatch' }, () => { throw Error(); }), true);
});
function candidateApi({ reserved = false, comparison = 'ahead', missing = false, status = 'completed', conclusion = 'success', failedPath } = {}) {
  const runs = REQUIRED_WORKFLOWS.map((path, index) => ({ id: 100 + index, run_attempt: 1, repository: { id: REPOSITORY_ID, full_name: REPOSITORY }, path, head_branch: 'main', head_sha: newer, event: 'push', status, conclusion }));
  return async path => {
    if (failedPath && path.includes(failedPath)) throw Error('GITHUB_HTTP_503');
    if (path === '/git/ref/heads/main') return { object: { sha: newer } };
    if (path.includes('aws-approved-promotion.yml')) return { workflow_runs: reserved ? [{ display_title: `Approved production promotion of dev 11 (${sha})` }] : [] };
    if (path.startsWith('/compare/')) {
      assert.equal(path, `/compare/${sha}...${newer}`);
      return { status: comparison, merge_base_commit: { sha: comparison === 'ahead' ? sha : newer } };
    }
    if (path.includes('/workflows/')) {
      assert.ok(path.includes(`head_sha=${newer}`));
      return { workflow_runs: missing ? [] : runs.filter(run => path.includes(run.path.split('/').at(-1))) };
    }
    return runs.find(run => path === `/actions/runs/${run.id}`);
  };
}
test('only an unreserved ancestor with present, non-failed candidate CI is superseded', async () => {
  for (const [options, expected] of [
    [{}, false],
    [{ conclusion: 'failure' }, true],
    [{ status: 'in_progress', conclusion: null }, false],
    [{ status: 'queued', conclusion: null }, false],
    [{ comparison: 'diverged' }, true],
    [{ missing: true }, true],
    [{ reserved: true }, true],
    [{ conclusion: 'cancelled' }, true],
    [{ conclusion: null }, true],
    [{ status: 'unknown', conclusion: null }, true],
  ]) assert.equal(await shouldBuild(env, candidateApi(options)), expected, JSON.stringify(options));
});
test('failure at any candidate or reservation lookup preserves this build', async () => {
  for (const failedPath of ['/git/', 'aws-approved-promotion.yml', '/compare/', 'backend-security.yml', '/actions/runs/']) {
    assert.equal(await shouldBuild(env, candidateApi({ failedPath })), true, failedPath);
  }
});
test('restore dispatches dev for completed main and leaves queued runs', async () => {
  for (const status of ['completed', 'queued']) {
    const calls = [];
    await restoreMain(async (path, init) => {
      if (init) { calls.push([path, init]); return; }
      if (path.includes('/git/')) return { object: { sha } };
      if (path.includes('/workflows/')) return { workflow_runs: [{ id: 11 }] };
      return { id: 11, repository: { id: REPOSITORY_ID, full_name: REPOSITORY }, path: WORKFLOW_PATH, head_branch: 'main', head_sha: sha, event: 'push', status };
    }, async () => calls.push('dev'));
    assert.equal(calls.length, status === 'completed' ? 1 : 0);
    if (calls.length) assert.equal(calls[0], 'dev');
  }
});
test('reservation on a later page is preserved', async () => {
  assert.equal(await shouldBuild(env, async path => {
    if (path.includes('/git/')) return { object: { sha: newer } };
    return { workflow_runs: path.endsWith('page=1') ? Array.from({ length: 100 }, () => ({ display_title: 'other' })) : [{ display_title: `Approved production promotion of dev 11 (${sha})` }] };
  }), true);
});
test('restoration rejects a source unrelated to the latest main SHA', async () => {
  await assert.rejects(restoreMain(async path => {
    if (path.includes('/git/')) return { object: { sha } };
    if (path.includes('/workflows/')) return { workflow_runs: [{ id: 11 }] };
    return { id: 11, repository: { id: REPOSITORY_ID, full_name: REPOSITORY }, path: WORKFLOW_PATH, head_branch: 'main', head_sha: newer, event: 'push', status: 'completed' };
  }, () => { throw Error('MUST_NOT_DISPATCH'); }), /LATEST_MAIN_RUN_MISMATCH/);
});
test('default shouldBuild retries transient failures on both main and reservation reads', async t => {
  const token = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = 'local-test-token';
  t.after(() => { if (token === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = token; });
  const calls = new Map();
  t.mock.method(globalThis, 'fetch', async url => {
    const count = (calls.get(url) ?? 0) + 1;
    calls.set(url, count);
    if (count === 1) return { ok: false, status: 503 };
    return { ok: true, json: async () => url.includes('/git/') ? { object: { sha: newer } } : { workflow_runs: [{ display_title: `Approved production promotion of dev 11 (${sha})` }] } };
  });
  assert.equal(await shouldBuild(env), true);
  assert.deepEqual([...calls.values()], [2, 2]);
});
