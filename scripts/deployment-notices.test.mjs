import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { BOOTSTRAP, CHECK_NAME, WAVE_BOOTSTRAP, WAVE_CHECK_NAME, isWaveDeployment, eligibleDeployment, REPOSITORY, REPOSITORY_ID, createGithubClient, formatNotice, readNotes, checkNotes, validateNote, notifyDeployment, noticeImages } from './deployment-notices.mjs';

const note = { changes: ['알림 목록의 점을 굵은 제목과 같은 높이에 맞췄어요.'], path: '/notifications' };
const sha = 'c'.repeat(40), priorSha = 'b'.repeat(40);
const deployment = { id: BOOTSTRAP.id + 3, sha, environment: 'Production', creator: { login: 'vercel[bot]' } };
const status = { state: 'success', environment: 'Production', creator: { login: 'vercel[bot]' }, created_at: '2026-09-28T14:40:00Z' };
const receipt = (candidate, conclusion = 'success') => ({ id: candidate.id + 100, head_sha: candidate.sha, external_id: String(candidate.id), name: CHECK_NAME, app: { slug: 'github-actions' }, status: 'completed', conclusion });
function harness({ existing, prior, sendError, saveError } = {}) {
  const receipts = new Map();
  if (existing) receipts.set(sha, [existing]);
  if (prior) receipts.set(prior.sha, [prior.receipt]);
  const records = { sent: [], notes: [], writes: [] };
  const options = { event: { repository: { id: REPOSITORY_ID, full_name: REPOSITORY }, deployment, deployment_status: status }, assertOnMain: () => {}, runUrl: 'https://github.com/ByUs-FanPassport/ByUs/actions/runs/1',
    notes: (base, head) => { records.notes.push({ base, head }); return [note]; },
    send: async body => { records.sent.push(body); if (sendError) throw sendError; return { messageId: 77, chatId: -5187701508 }; },
    github: async (path, init) => {
      if (init) {
        records.writes.push(init.body);
        if (saveError && init.body.conclusion === 'success') throw new Error('lost receipt write');
        return { id: 99 };
      }
      if (path === `/deployments/${deployment.id}`) return deployment;
      if (path.includes('/statuses?')) return [status];
      if (path.startsWith('/commits/')) return { check_runs: receipts.get(path.split('/')[2]) ?? [] };
      if (path.startsWith('/deployments?')) return [deployment, ...(prior ? [{environment:"Production",...prior}] : []), BOOTSTRAP].sort((a, b) => b.id - a.id);
      throw new Error(`unexpected path ${path}`);
    } };
  return { options, records };
}

test('plain Korean message includes exact change, approved link and Korean completion time', () => {
  const message = formatNotice([note, note], status.created_at);
  assert.match(message, /9월 28일 23:40/);
  assert.equal(message.split(note.changes[0]).length - 1, 1);
  assert.match(message, /https:\/\/kyaa.io\/notifications/);
  for (const invalid of [{ ...note, path: '//evil.test' }, { ...note, changes: ['Use CSS subgrid'] }, { ...note, changes: ['안내 https://evil.test'] }, { ...note, path: '/\\evil.test' }]) assert.throws(() => validateNote(invalid));
  assert.throws(() => formatNotice([], status.created_at), /RELEASE_NOTE_REQUIRED/);
});

test('real git range requires newly added immutable note files', () => {
  const cwd = process.cwd(), dir = mkdtempSync(join(tmpdir(), 'byus-notice-check-'));
  const git = (...args) => execFileSync(process.env.GIT_EXECUTABLE || 'git', args, { cwd: dir, encoding: 'utf8' }).trim();
  try {
    git('init', '-q'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
    git('commit', '--allow-empty', '-qm', 'base'); const base = git('rev-parse', 'HEAD');
    git('branch', 'feature'); writeFileSync(join(dir, 'README.md'), 'doc'); git('add', '.'); git('commit', '-qm', 'main advance'); const main = git('rev-parse', 'HEAD');
    process.chdir(dir); assert.deepEqual(readNotes(base, main), []);
    git('checkout', '-q', 'feature');
    mkdirSync(join(dir, 'release-notes')); writeFileSync(join(dir, 'release-notes/fix.json'), JSON.stringify(note));
    git('add', '.'); git('commit', '-qm', 'note'); const head = git('rev-parse', 'HEAD'); process.chdir(dir);
    assert.deepEqual(readNotes(base, head), [note]);
    assert.deepEqual(checkNotes(main, head, true), [note]);
    assert.throws(() => checkNotes(main, head, false));
    writeFileSync(join(dir, 'release-notes/fix.json'), JSON.stringify({ ...note, path: '/' })); git('add', '.'); git('commit', '-qm', 'edit');
    assert.throws(() => readNotes(head, git('rev-parse', 'HEAD')), /IMMUTABLE/);
    const beforeCode = git('rev-parse', 'HEAD'); mkdirSync(join(dir, 'apps/web'), { recursive: true }); writeFileSync(join(dir, 'apps/web/change.ts'), 'export const changed = true;'); git('add', '.'); git('commit', '-qm', 'code without note');
    assert.throws(() => readNotes(beforeCode, git('rev-parse', 'HEAD')), /RELEASE_NOTE_REQUIRED/);
  } finally { process.chdir(cwd); rmSync(dir, { recursive: true, force: true }); }
});

test('reserves before sending and records returned message id', async () => {
  const { options, records } = harness();
  assert.equal((await notifyDeployment(options)).messageId, 77);
  assert.equal(records.writes[0].status, 'in_progress');
  assert.equal(records.writes.at(-1).conclusion, 'success');
  assert.equal(records.sent.length, 1);
  assert.equal(records.notes[0].base, BOOTSTRAP.sha);
});

test('screenshots travel with the notice in one send and obey caption and path limits', async () => {
  const illustrated = { ...note, images: ['release-notes/images/notification-after.png'] };
  const { options, records } = harness(); options.notes = () => [illustrated, illustrated];
  await notifyDeployment(options);
  assert.deepEqual(records.sent[0].images, illustrated.images);
  assert.equal(records.sent.length, 1);
  for (const images of [[], ['https://evil.test/a.png'], ['release-notes/images/../a.png'], ['release-notes/images/a.svg'], Array(11).fill(illustrated.images[0])]) {
    assert.throws(() => validateNote({ ...note, images }));
  }
  assert.throws(() => noticeImages(Array.from({ length: 11 }, (_, i) => ({ ...note, images: [`release-notes/images/${i}.png`] }))), /TOO_MANY/);
  const long = { ...illustrated, changes: Array.from({ length: 5 }, (_, i) => `${i}${'가'.repeat(239)}`) };
  assert.throws(() => formatNotice([long], status.created_at), /TOO_LONG/);
  assert.ok(formatNotice([{ ...long, images: undefined }], status.created_at));
});

test('screenshots must exist as PNGs with Telegram-compatible dimensions at the deployed revision', () => {
  const cwd = process.cwd(), dir = mkdtempSync(join(tmpdir(), 'byus-notice-image-'));
  const git = (...args) => execFileSync(process.env.GIT_EXECUTABLE || 'git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    git('init', '-q'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
    git('commit', '--allow-empty', '-qm', 'base'); const base = git('rev-parse', 'HEAD');
    mkdirSync(join(dir, 'release-notes/images'), { recursive: true });
    const illustrated = { ...note, images: ['release-notes/images/after.png'] };
    writeFileSync(join(dir, 'release-notes/fix.json'), JSON.stringify(illustrated));
    git('add', '.'); git('commit', '-qm', 'missing image'); process.chdir(dir);
    assert.throws(() => readNotes(base, git('rev-parse', 'HEAD')));
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64');
    const path = join(dir, illustrated.images[0]); writeFileSync(path, png); git('add', '.'); git('commit', '-qm', 'image');
    assert.deepEqual(readNotes(base, git('rev-parse', 'HEAD')), [illustrated]);
    png.writeUInt32BE(10000, 16); writeFileSync(path, png); git('add', '.'); git('commit', '-qm', 'oversized dimensions');
    assert.throws(() => readNotes(base, git('rev-parse', 'HEAD')), /DIMENSIONS/);
    writeFileSync(path, 'not a screenshot'); git('add', '.'); git('commit', '-qm', 'bad png');
    assert.throws(() => readNotes(base, git('rev-parse', 'HEAD')), /INVALID_RELEASE_IMAGE/);
  } finally { process.chdir(cwd); rmSync(dir, { recursive: true, force: true }); }
});

test('ignores preview, failure and other repositories without API or send', async () => {
  for (const event of [
    { deployment: { ...deployment, environment: 'Preview' }, deployment_status: status },
    { deployment, deployment_status: { ...status, state: 'failure' } },
    { deployment, deployment_status: status, repository: { full_name: 'other/repo' } },
    { deployment, deployment_status: status, repository: { id: REPOSITORY_ID + 1, full_name: REPOSITORY } },
    { deployment, deployment_status: status, repository: { full_name: REPOSITORY } },
  ]) {
    const { options, records } = harness(); options.event = { repository: { id: REPOSITORY_ID, full_name: REPOSITORY }, ...event };
    options.github = () => { throw new Error('must not call'); };
    assert.ok((await notifyDeployment(options)).skipped); assert.equal(records.sent.length, 0);
  }
});

test('accepts the same repository through each organization and repository rename phase', async () => {
  for (const full_name of ['ByUs-FanPassport/ByUs', 'ByUs-FanPassport/kyaa', 'kyaa-io/ByUs', 'kyaa-io/kyaa']) {
    const { options, records } = harness(); options.event.repository.full_name = full_name;
    assert.equal((await notifyDeployment(options)).sent, true);
    assert.equal(records.sent.length, 1);
  }
});

test('resolves the trusted numeric repository again after GET 301 without following Location', async () => {
  const calls = []; let renamed = false;
  const github = createGithubClient({ token: 'test-token', fetcher: async (url, init) => {
    calls.push({ url, init });
    if (url === `https://api.github.com/repositories/${REPOSITORY_ID}`) return Response.json({ id: REPOSITORY_ID, full_name: REPOSITORY });
    if (!renamed && url === 'https://api.github.com/repos/kyaa-io/kyaa/deployments/1') {
      renamed = true;
      return new Response(null, { status: 301, headers: { location: 'https://evil.test/steal-token' } });
    }
    assert.equal(url, 'https://api.github.com/repos/kyaa-io/kyaa/deployments/1');
    return Response.json({ id: 1 });
  } });
  assert.deepEqual(await github('/deployments/1'), { id: 1 });
  assert.equal(calls.length, 4);
  assert.ok(calls.every(call => call.url.startsWith('https://api.github.com/') && call.init.redirect !== 'follow'));
});

test('rejects reused names and unknown canonical repositories before authenticated mutation', async () => {
  for (const repository of [{ id: REPOSITORY_ID + 1, full_name: REPOSITORY }, { id: REPOSITORY_ID, full_name: 'other/repo' }, ...['ByUs-FanPassport/ByUs', 'ByUs-FanPassport/kyaa', 'kyaa-io/ByUs'].map(full_name => ({ id: REPOSITORY_ID, full_name }))]) {
    const calls = [];
    const github = createGithubClient({ token: 'test-token', fetcher: async (url) => { calls.push(url); return Response.json(repository); } });
    await assert.rejects(github('/check-runs', { method: 'POST', body: {} }), /UNTRUSTED_REPOSITORY/);
    assert.deepEqual(calls, [`https://api.github.com/repositories/${REPOSITORY_ID}`]);
  }
});

test('never retries a GitHub mutation with an uncertain result', async () => {
  for (const timeout of [false, true]) {
    let mutations = 0;
    const github = createGithubClient({ token: 'test-token', fetcher: async (url) => {
      if (url.endsWith(`/repositories/${REPOSITORY_ID}`)) return Response.json({ id: REPOSITORY_ID, full_name: REPOSITORY });
      mutations++;
      if (timeout) throw new Error('timeout');
      return new Response(null, { status: 301 });
    } });
    await assert.rejects(github('/check-runs', { method: 'POST', body: {} }));
    assert.equal(mutations, 1);
  }
});

test('success receipt prevents repeated deployment events from sending again', async () => {
  const { options, records } = harness({ existing: receipt(deployment) });
  assert.equal((await notifyDeployment(options)).skipped, 'already_sent'); assert.equal(records.sent.length, 0);
});

test('current and prior uncertain receipts block automatic attempts', async () => {
  for (const config of [{ existing: receipt(deployment, 'action_required') }, { prior: { id: deployment.id - 1, sha: priorSha, creator: deployment.creator, receipt: receipt({ id: deployment.id - 1, sha: priorSha }, 'action_required') } }]) {
    const { options, records } = harness(config);
    await assert.rejects(notifyDeployment(options), /UNCERTAIN/); assert.equal(records.sent.length, 0);
  }
});

test('last sent notice is baseline; rejected prior notice stays in accumulated changes', async () => {
  for (const conclusion of ['success', 'failure']) {
    const prior = { id: deployment.id - 1, sha: priorSha, creator: deployment.creator }; prior.receipt = receipt(prior, conclusion);
    const { options, records } = harness({ prior }); await notifyDeployment(options);
    assert.equal(records.notes[0].base, conclusion === 'success' ? priorSha : BOOTSTRAP.sha);
  }
});

test('late event after a newer sent notice is skipped', async () => {
  const prior = { id: deployment.id + 1, sha: priorSha, creator: deployment.creator }; prior.receipt = receipt(prior);
  const { options, records } = harness({ prior });
  assert.equal((await notifyDeployment(options)).skipped, 'superseded_by_newer_notice'); assert.equal(records.sent.length, 0);
});

test('send timeout and receipt-write failure are uncertain; definitive rejection is retryable', async () => {
  for (const config of [{ sendError: new Error('timeout') }, { saveError: true }, { sendError: Object.assign(new Error('rejected'), { definitelyNotSent: true }) }]) {
    const { options, records } = harness(config);
    await assert.rejects(notifyDeployment(options));
    assert.equal(records.sent.length, 1);
    assert.equal(records.writes.at(-1).conclusion, config.sendError?.definitelyNotSent ? 'failure' : 'action_required');
  }
});


test('a definitive rejection can reuse its receipt without creation-only PATCH fields', async () => {
  const { options, records } = harness({ existing: receipt(deployment, 'failure') });
  await notifyDeployment(options);
  assert.deepEqual(Object.keys(records.writes[0]).sort(), ['details_url', 'output', 'status']);
  assert.equal(records.sent.length, 1);
});

test('a pre-send rejection preserves its specific cause instead of blaming Telegram', async () => {
  const { options, records } = harness({ sendError: Object.assign(new Error('rejected'), { definitelyNotSent: true, noticeCode: 'RECEIPT_NOT_RESERVED' }) });
  await assert.rejects(notifyDeployment(options), /RECEIPT_NOT_RESERVED/);
  assert.match(records.writes.at(-1).output.summary, /RECEIPT_NOT_RESERVED/);
});

test('redeploying an already announced revision makes no new claim or message', async () => {
  const { options, records } = harness(); options.notes = () => [];
  assert.equal((await notifyDeployment(options)).skipped, 'no_new_changes_to_announce');
  assert.equal(records.sent.length, 0); assert.equal(records.writes.length, 0);
});


test('receipt lookup reads later pages instead of sending a duplicate', async () => {
  const { options, records } = harness(); const original = options.github;
  options.github = async (path, init) => {
    if (path.startsWith(`/commits/${sha}/`)) return { check_runs: path.endsWith('page=1') ? Array.from({length:100}, (_, id) => ({id, name: CHECK_NAME, external_id: String(id), app: {slug:'github-actions'}})) : [receipt(deployment)] };
    return original(path, init);
  };
  assert.equal((await notifyDeployment(options)).skipped, 'already_sent');
  assert.equal(records.sent.length, 0);
});

test('identical completed delivery receipts never resend and remain a valid baseline', async () => {
  for (const current of [true, false]) {
    const candidate = current ? deployment : { id: deployment.id - 1, sha: priorSha, creator: deployment.creator };
    const summary = JSON.stringify({ messageId: 448, messageIds: [448, 449], chatId: -5187701508, deploymentId: candidate.id });
    const checks = [1, 2].map(id => ({ ...receipt(candidate), id, output: { summary } }));
    const { options, records } = harness(current ? {} : { prior: candidate }); const original = options.github;
    options.github = (path, init) => path.startsWith(`/commits/${candidate.sha}/`) ? { check_runs: checks } : original(path, init);
    const result = await notifyDeployment(options);
    assert.equal(records.sent.length, current ? 0 : 1);
    if (current) assert.equal(result.skipped, 'already_sent');
    else assert.equal(records.notes[0].base, priorSha);
  }
});

test('conflicting, uncertain or malformed duplicate receipts still block every send', async () => {
  const delivery = { messageId: 448, messageIds: [448, 449], chatId: -5187701508, deploymentId: deployment.id };
  for (const change of [
    { conclusion: 'action_required' }, { conclusion: 'failure' }, { status: 'in_progress' },
    { output: { summary: JSON.stringify({ ...delivery, messageId: 450 }) } },
  ]) {
    const checks = [receipt(deployment), { ...receipt(deployment), ...change }].map(check => ({ output: { summary: JSON.stringify(delivery) }, ...check }));
    const { options, records } = harness(); const original = options.github;
    options.github = (path, init) => path.startsWith(`/commits/${sha}/`) ? { check_runs: checks } : original(path, init);
    await assert.rejects(notifyDeployment(options), /MULTIPLE_NOTICE_RECEIPTS_REQUIRE_REVIEW/);
    assert.equal(records.sent.length, 0); assert.equal(records.writes.length, 0);
  }
  for (const summary of [undefined, 'not json', '{}', JSON.stringify({ ...delivery, chatId: 1 }), JSON.stringify({ ...delivery, messageId: 0 }), JSON.stringify({ ...delivery, deploymentId: 1 }), JSON.stringify({ ...delivery, messageIds: [449] })]) {
    const checks = [1, 2].map(id => ({ ...receipt(deployment), id, output: { summary } }));
    const { options, records } = harness(); const original = options.github;
    options.github = (path, init) => path.startsWith(`/commits/${sha}/`) ? { check_runs: checks } : original(path, init);
    await assert.rejects(notifyDeployment(options), /MULTIPLE_NOTICE_RECEIPTS_REQUIRE_REVIEW/);
    assert.equal(records.sent.length, 0); assert.equal(records.writes.length, 0);
  }
});


function waveHarness(config = {}) {
 const {options, records} = harness(config);
 const waveDeployment = {...deployment, id: WAVE_BOOTSTRAP.id + 3};
 const waveStatus = {...status, environment_url: 'https://kyaawave-release-sallylab.vercel.app'};
 options.event = {...options.event, deployment: waveDeployment, deployment_status: waveStatus};
 options.assertOnMain = () => { throw new Error('wave must not use main ancestry'); };
 options.assertOnWave = value => { assert.equal(value, sha); records.waveAncestry = true; };
 const original = options.github;
 options.github = (path, init) => {
  if (!init && path === `/deployments/${waveDeployment.id}`) return waveDeployment;
  if (!init && path.includes('/statuses?')) return [waveStatus];
  if (!init && path.startsWith('/deployments?')) return [waveDeployment, ...(config.prior ? [{environment:"Production",...config.prior}] : []), WAVE_BOOTSTRAP];
  return original(path, init);
 };
 return {options, records, waveDeployment};
}

test('wave uses its source branch, separate receipt and bootstrap, and the real wave link', async () => {
 const {options, records} = waveHarness();
 assert.equal((await notifyDeployment(options)).sent, true);
 assert.equal(records.waveAncestry, true);
 assert.equal(records.writes[0].name, WAVE_CHECK_NAME);
 assert.equal(records.notes[0].base, WAVE_BOOTSTRAP.sha);
 assert.equal(records.sent[0].site, 'wave');
 assert.match(records.sent[0].text, /^✅ kyaa wave 수정사항/);
 assert.match(records.sent[0].text, /https:\/\/kyaawave.com\/notifications/);
 assert.doesNotMatch(records.sent[0].text, /https:\/\/kyaa.io/);
 for(const url of ['http://kyaawave-release-sallylab.vercel.app','https://kyaawave-release-sallylab.vercel.app.evil.test','https://kyaa-release-sallylab.vercel.app','https://evil.test/kyaawave-release-sallylab.vercel.app']) assert.equal(isWaveDeployment({environment_url:url}),false);
});

test('wave duplicate and uncertain receipts retain the same no-resend protections', async () => {
 const candidate = {...deployment, id: WAVE_BOOTSTRAP.id + 3};
 for(const conclusion of ['success','action_required']) {
  const existing = {...receipt(candidate,conclusion),name:WAVE_CHECK_NAME};
  const {options,records} = waveHarness({existing});
  if(conclusion === 'success') assert.equal((await notifyDeployment(options)).skipped,'already_sent');
  else await assert.rejects(notifyDeployment(options),/UNCERTAIN/);
  assert.equal(records.sent.length,0);
 }
});

test('each site ignores the other site receipt when choosing its last sent baseline', async () => {
 const prior = {id:WAVE_BOOTSTRAP.id+1,sha:priorSha,creator:deployment.creator};
 for(const name of [CHECK_NAME,WAVE_CHECK_NAME]) {
  prior.receipt = {...receipt(prior),name};
  const {options,records} = waveHarness({prior});
  await notifyDeployment(options);
  assert.equal(records.notes[0].base,name===WAVE_CHECK_NAME?priorSha:WAVE_BOOTSTRAP.sha);
 }
 const corePrior = {id:deployment.id-1,sha:priorSha,creator:deployment.creator};
 corePrior.receipt = {...receipt(corePrior,'action_required'),name:WAVE_CHECK_NAME};
 const {options,records} = harness({prior:corePrior});
 await notifyDeployment(options);
 assert.equal(records.notes[0].base,BOOTSTRAP.sha);
});


test('legacy and named production environments require the same trusted success environment', () => {
 for(const environment of ['Production','Production – kyaa','Production – kyaawave']) {
  assert.equal(eligibleDeployment({...deployment,environment},{...status,environment}),true);
  assert.equal(eligibleDeployment({...deployment,environment},{...status,environment:'Preview'}),false);
 }
 for(const environment of ['Preview','Production – other','Production - kyaawave']) assert.equal(eligibleDeployment({...deployment,environment},{...status,environment}),false);
});
