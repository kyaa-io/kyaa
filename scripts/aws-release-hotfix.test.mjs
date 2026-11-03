import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as release from './aws-release.mjs';
import { waitForRequiredCi, REQUIRED_WORKFLOWS } from './aws-release-ci.mjs';
import { approvedPromotion } from './aws-approved-promotion.mjs';
import { reusableProof } from './aws-release-media-reuse.mjs';

const sha = 'a'.repeat(40), branch = 'release/production';
const run = { id: 11, repository: { id: release.REPOSITORY_ID, full_name: release.REPOSITORY }, path: release.WORKFLOW_PATH, head_branch: branch, head_sha: sha, event: 'push', status: 'completed', conclusion: 'success' };

test('only exact hotfix push sources are trusted, never arbitrary release branches or hotfix dispatches', () => {
  assert.equal(release.trustedRun(run, 11), run);
  for (const change of [{ head_branch: 'release/other' }, { event: 'workflow_dispatch' }, { conclusion: 'failure' }, { repository: { id: 1 } }, { head_sha: 'main' }, { path: 'other.yml' }]) {
    assert.throws(() => release.trustedRun({ ...run, ...change }, 11), /UNTRUSTED/);
  }
});

test('hotfix Actions context allows push dev only; production execution remains main-only', () => {
  const env = { GITHUB_ACTIONS: 'true', GITHUB_REF: `refs/heads/${branch}`, GITHUB_EVENT_NAME: 'push', GITHUB_REPOSITORY: release.REPOSITORY };
  assert.doesNotThrow(() => release.assertReleaseContext('dev', env));
  assert.throws(() => release.assertReleaseContext('prod', env));
  for (const change of [{ GITHUB_REF: 'refs/heads/release/other' }, { GITHUB_EVENT_NAME: 'workflow_dispatch' }, { GITHUB_REPOSITORY: 'other/repo' }]) assert.throws(() => release.assertReleaseContext('dev', { ...env, ...change }));
  assert.doesNotThrow(() => release.assertReleaseContext('prod', { ...env, GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch' }));
});

test('hotfix cannot opt out of live production ancestry', () => {
  assert.throws(() => release.assertProductionAdvance({}, {}, { sourceRun: run, requireForwardOnly: false, awsCall: () => { throw Error('LIVE_CHECK_REQUIRED'); } }), /LIVE_CHECK_REQUIRED/);
});

test('hotfix dev still requires source ancestry to main before using its config', async () => {
  const values = { GITHUB_ACTIONS: 'true', GITHUB_REF: `refs/heads/${branch}`, GITHUB_EVENT_NAME: 'push', GITHUB_REPOSITORY: release.REPOSITORY };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  try {
    await assert.rejects(release.releaseConfig('dev', { sourceSha: sha }, {}, { assertOnMain: candidate => { assert.equal(candidate, sha); throw Error('NOT_ON_MAIN'); } }), /NOT_ON_MAIN/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('hotfix promotion still requires identical tested web, media and cron artifacts', () => {
  const digest = `sha256:${'b'.repeat(64)}`;
  const artifact = { schemaVersion: 1, repositoryId: release.REPOSITORY_ID, workflowPath: release.WORKFLOW_PATH, sourceSha: sha, sourceRunId: 11, imageDigest: digest, imageUri: `111111111111.dkr.ecr.ap-northeast-2.amazonaws.com/web@${digest}`, mediaImageDigest: digest, mediaImageUri: `111111111111.dkr.ecr.ap-northeast-2.amazonaws.com/media@${digest}`, cronCodeSha256: 'c'.repeat(64) };
  const dev = { ...artifact, environment: 'dev', status: 'success', workflowRunId: 11 };
  assert.equal(release.validateRelease(artifact, run), artifact);
  assert.doesNotThrow(() => release.assertPromotion('prod', artifact, dev, run));
  for (const change of [{ imageDigest: 'other' }, { mediaImageDigest: 'other' }, { cronCodeSha256: 'other' }, { sourceSha: 'b'.repeat(40) }, { workflowRunId: 12 }]) assert.throws(() => release.assertPromotion('prod', artifact, { ...dev, ...change }, run), /SUCCESSFUL_MATCHING_DEV_REQUIRED/);
  assert.throws(() => reusableProof({ run, release: artifact, dev, currentSha: sha }), /UNTRUSTED_MEDIA_SOURCE/);
});

test('required CI binds branch to the trusted source run and rejects branch/SHA/failure mismatches', async () => {
  for (const change of [null, { head_branch: 'main' }, { head_sha: 'b'.repeat(40) }, { conclusion: 'failure' }, { run_attempt: 0 }]) {
    const paths = [];
    const api = async path => {
      paths.push(path);
      if (path === '/actions/runs/11') return run;
      const index = path.startsWith('/actions/workflows/') ? REQUIRED_WORKFLOWS.findIndex(p => path.includes(p.split('/').at(-1))) : Number(path.split('/').at(-1)) - 100;
      const ci = { ...run, id: index + 100, path: REQUIRED_WORKFLOWS[index], run_attempt: 2, ...change };
      return path.startsWith('/actions/workflows/') ? { workflow_runs: [ci] } : ci;
    };
    const check = waitForRequiredCi(sha, { sourceRunId: 11, githubCall: api });
    if (change) await assert.rejects(check, /UNTRUSTED_CI_RUN|REQUIRED_CI_FAILED/);
    else {
      const proof = await check;
      assert.equal(proof.sourceBranch, branch);
      assert.equal(proof.runs.length, 5);
      assert(paths.filter(p => p.startsWith('/actions/workflows/')).every(p => p.includes('branch=release%2Fproduction')));
    }
  }
  await assert.rejects(waitForRequiredCi('b'.repeat(40), { sourceRunId: 11, githubCall: async () => run }), /SOURCE_RUN_SHA_MISMATCH/);
});

test('reservation requires current hotfix tip and ancestry to main, not main tip equality', async () => {
  for (const scenario of ['ok', 'stale', 'diverged', 'wrong-base']) {
    const dispatched = [], mainSha = 'c'.repeat(40);
    const reservation = { ...run, id: 21, head_branch: 'main', event: 'workflow_dispatch', path: '.github/workflows/aws-approved-promotion.yml', display_title: `Approved production promotion of dev 11 (${sha})` };
    const read = async path => {
      if (path === '/actions/runs/21') return reservation;
      if (path.startsWith('/actions/workflows/')) return { workflow_runs: [reservation] };
      if (path === '/actions/runs/11') return run;
      if (path === '/git/ref/heads/release/production') return { object: { sha: scenario === 'stale' ? mainSha : sha } };
      if (path === '/git/ref/heads/main') return { object: { sha: mainSha } };
      assert.equal(path, `/compare/${sha}...${mainSha}`);
      return { status: scenario === 'diverged' ? 'diverged' : 'ahead', merge_base_commit: { sha: scenario === 'wrong-base' ? mainSha : sha } };
    };
    const result = approvedPromotion('11', sha, { read, dispatch: async id => dispatched.push(id), reservationRunId: 21, reservationAttempt: 1 });
    if (scenario === 'ok') { await result; assert.deepEqual(dispatched, ['11']); }
    else { await assert.rejects(result, /HOTFIX_CHANGED_AFTER_APPROVAL|SOURCE_NOT_ON_MAIN/); assert.deepEqual(dispatched, []); }
  }
});

test('all required push workflows run on exact hotfix branch; prod and DEV notice guards remain narrow', async () => {
  for (const path of [release.WORKFLOW_PATH, ...REQUIRED_WORKFLOWS]) {
    const text = await readFile(path, 'utf8');
    assert.match(text, /branches: \[main, release\/production\]/, path);
  }
  const workflow = await readFile(release.WORKFLOW_PATH, 'utf8');
  assert.match(workflow, /github\.ref == 'refs\/heads\/release\/production' && github\.event_name == 'push'/);
  const devNotice = workflow.split('  dev-notice:')[1];
  // Production-baseline backports intentionally omit the unrelated DEV notice job.
  if (devNotice) assert.match(devNotice, /if: github\.ref == 'refs\/heads\/main'/);
  else assert(!workflow.includes('scripts/dev-deployment-notices'));
  assert.match(workflow, /scripts\/aws-release-ci.mjs .*SOURCE_RUN_ID:-\$GITHUB_RUN_ID/);
});
