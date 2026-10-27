import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { approvedPromotion, assertFirstReservation, dispatchProduction, githubRead } from './aws-approved-promotion.mjs';
import { REPOSITORY, REPOSITORY_ID, WORKFLOW_PATH } from './aws-release.mjs';

const sha = 'a'.repeat(40);
const run = { id: 11, repository: { id: REPOSITORY_ID, full_name: REPOSITORY }, path: WORKFLOW_PATH, event: 'push', head_branch: 'main', head_sha: sha, status: 'completed', conclusion: 'success' };
const reservation = { ...run, id: 21, path: '.github/workflows/aws-approved-promotion.yml', event: 'workflow_dispatch', display_title: `Approved production promotion of dev 11 (${sha})` };
function fixture(runs = [run]) {
  let time = 0, index = 0;
  const calls = [], dispatched = [];
  return { calls, dispatched, options: {
    read: async path => {
      calls.push(path);
      if (path === '/actions/runs/21') return reservation;
      if (path.startsWith('/actions/workflows/')) return { workflow_runs: [reservation] };
      return path.startsWith('/actions/runs/') ? runs[Math.min(index++, runs.length - 1)] : { object: { sha } };
    },
    dispatch: async id => { dispatched.push(id); }, now: () => time,
    wait: async ms => { time += ms; }, timeoutMs: 100, pollMs: 30, log: () => {},
    reservationRunId: '21', reservationAttempt: '1',
  } };
}

test('only the explicitly approved main push dev run is promoted after success', async () => {
  const f = fixture([{ ...run, status: 'queued', conclusion: null }, { ...run, status: 'in_progress', conclusion: null }, run]);
  await approvedPromotion('11', sha, f.options);
  assert.deepEqual(f.dispatched, ['11']);
  assert.equal(f.calls.filter(path => path === '/actions/runs/11').length, 3);
  assert.equal(f.calls.at(-1), '/git/ref/heads/main');
});

test('same reservation reruns and duplicate reservation history cannot dispatch again', async () => {
  const f = fixture();
  await assert.rejects(approvedPromotion('11', sha, { ...f.options, reservationAttempt: '2' }), /RESERVATION_RETRY_REQUIRES_INSPECTION/);
  assert.deepEqual(f.dispatched, []);
  const duplicate = fixture();
  const originalRead = duplicate.options.read;
  duplicate.options.read = async path => path.startsWith('/actions/workflows/') ? { workflow_runs: [{ ...reservation, id: 20, conclusion: 'failure' }, reservation] } : originalRead(path);
  await assert.rejects(approvedPromotion('11', sha, duplicate.options), /DUPLICATE_RESERVATION_REQUIRES_INSPECTION/);
  assert.deepEqual(duplicate.dispatched, []);
  await assert.doesNotReject(assertFirstReservation('11', sha, '21', '1', async path => path === '/actions/runs/21' ? reservation : { workflow_runs: [reservation, { ...reservation, id: 22 }] }));
  let pages = 0;
  await assert.rejects(assertFirstReservation('11', sha, '21', '1', async path => {
    if (path === '/actions/runs/21') return reservation;
    pages += 1;
    return { workflow_runs: pages === 1 ? Array.from({ length: 100 }, (_, i) => ({ ...reservation, id: 100 + i, display_title: 'different reservation' })) : [{ ...reservation, id: 20 }] };
  }), /DUPLICATE_RESERVATION_REQUIRES_INSPECTION/);
  assert.equal(pages, 2);
});

test('invalid, failed, cancelled, foreign and changed source runs never dispatch', async () => {
  for (const patch of [
    { conclusion: 'failure' }, { conclusion: 'cancelled' }, { event: 'workflow_dispatch' },
    { head_sha: 'b'.repeat(40) }, { head_branch: 'feature' }, { path: '.github/workflows/other.yml' },
    { repository: { id: 1, full_name: REPOSITORY } }, { id: 12 },
  ]) {
    const f = fixture([{ ...run, ...patch }]);
    await assert.rejects(approvedPromotion('11', sha, f.options));
    assert.deepEqual(f.dispatched, []);
  }
  for (const id of ['0', '-1', '1; echo bad', '9007199254740993']) {
    const f = fixture();
    await assert.rejects(approvedPromotion(id, sha, f.options), /INVALID_SOURCE_RUN_ID/);
    assert.deepEqual(f.calls, []);
  }
  await assert.rejects(approvedPromotion('11', 'main', fixture().options), /INVALID_EXPECTED_SHA/);
});

test('timeout, API failure or a newer main fail closed without a production request', async () => {
  const waiting = fixture([{ ...run, status: 'in_progress', conclusion: null }]);
  await assert.rejects(approvedPromotion('11', sha, waiting.options), /DEV_RUN_WAIT_TIMEOUT/);
  assert.deepEqual(waiting.dispatched, []);
  const changed = fixture();
  const originalRead = changed.options.read;
  changed.options.read = async path => path.startsWith('/git/') ? { object: { sha: 'b'.repeat(40) } } : originalRead(path);
  await assert.rejects(approvedPromotion('11', sha, changed.options), /MAIN_CHANGED_AFTER_APPROVAL/);
  assert.deepEqual(changed.dispatched, []);
  const failedRead = fixture();
  failedRead.options.read = async () => { throw new Error('network unavailable'); };
  await assert.rejects(approvedPromotion('11', sha, failedRead.options), /network unavailable/);
  assert.deepEqual(failedRead.dispatched, []);
});

test('production dispatch uses fixed destination and never retries an uncertain response', async () => {
  const previousToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = 'test-token';
  try {
    const calls = [];
    await dispatchProduction('11', async (url, init) => { calls.push({ url, init }); return { status: 204 }; });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `https://api.github.com/repos/${REPOSITORY}/actions/workflows/aws-platform.yml/dispatches`);
    assert.deepEqual(JSON.parse(calls[0].init.body), { ref: 'main', inputs: { environment: 'prod', source_run_id: '11', require_forward_only: 'true' } });
    for (const response of [async () => { throw new Error('lost response'); }, async () => ({ status: 503 })]) {
      let attempts = 0;
      await assert.rejects(dispatchProduction('11', async () => { attempts += 1; return response(); }));
      assert.equal(attempts, 1);
    }
    const f = fixture();
    let attempts = 0;
    f.options.dispatch = async () => { attempts += 1; throw new Error('lost response'); };
    await assert.rejects(approvedPromotion('11', sha, f.options), /lost response/);
    assert.equal(attempts, 1);
  } finally {
    if (previousToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = previousToken;
  }
});

test('only transient GET failures receive a bounded retry', async () => {
  const waits = [];
  let attempts = 0;
  assert.deepEqual(await githubRead('/actions/runs/11', {
    read: async () => { attempts += 1; if (attempts < 3) throw new Error('GITHUB_HTTP_503'); return run; },
    wait: async ms => { waits.push(ms); },
  }), run);
  assert.deepEqual(waits, [1000, 2000]);
  attempts = 0;
  await assert.rejects(githubRead('/actions/runs/11', {
    read: async () => { attempts += 1; throw new Error('GITHUB_HTTP_503'); }, wait: async () => {},
  }), /GITHUB_HTTP_503/);
  assert.equal(attempts, 3);
  attempts = 0;
  await assert.rejects(githubRead('/actions/runs/11', {
    read: async () => { attempts += 1; throw new Error('GITHUB_HTTP_403'); }, wait: async () => {},
  }), /GITHUB_HTTP_403/);
  assert.equal(attempts, 1);
});

test('reservation is manual-only, has no AWS privileges and cannot interpolate inputs as code', async () => {
  const workflow = await readFile('.github/workflows/aws-approved-promotion.yml', 'utf8');
  assert(workflow.includes('workflow_dispatch:'));
  for (const forbidden of ['push:', 'workflow_run:', 'id-token:', 'aws-actions/', 'run: node scripts/aws-approved-promotion.mjs ${{']) assert(!workflow.includes(forbidden), forbidden);
  assert(workflow.includes('actions: write'));
  assert(workflow.includes('persist-credentials: false'));
  assert(workflow.includes('SOURCE_RUN_ID: ${{ inputs.source_run_id }}'));
  assert(workflow.includes('EXPECTED_SHA: ${{ inputs.expected_sha }}'));
});
