import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldBuild, restoreMain } from './aws-release-queue.mjs';
import { REPOSITORY, REPOSITORY_ID, WORKFLOW_PATH } from './aws-release.mjs';
const sha = 'a'.repeat(40), newer = 'b'.repeat(40);
const env = { GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: sha, GITHUB_RUN_ID: '11' };
test('latest main and every non-main-push are preserved without cancellation', async () => {
  assert.equal(await shouldBuild(env, async () => ({ object: { sha } })), true);
  assert.equal(await shouldBuild({ ...env, GITHUB_REF: 'refs/heads/release/production' }, () => { throw Error(); }), true);
  assert.equal(await shouldBuild({ ...env, GITHUB_EVENT_NAME: 'workflow_dispatch' }, () => { throw Error(); }), true);
});
test('stale main skips only after complete reservation history; API failure fails closed', async () => {
  for (const reserved of [false, true]) assert.equal(await shouldBuild(env, async path => path.includes('/git/') ? { object: { sha: newer } } : { workflow_runs: reserved ? [{ display_title: `Approved production promotion of dev 11 (${sha})` }] : [] }), reserved);
  await assert.rejects(shouldBuild(env, async () => { throw Error('unavailable'); }), /unavailable/);
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
