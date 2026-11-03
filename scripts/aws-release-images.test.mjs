import test from 'node:test';
import assert from 'node:assert/strict';
import { promoteImages } from './aws-release-images.mjs';

const digest = `sha256:${'a'.repeat(64)}`, sha = 'b'.repeat(40);
const source = `111111111111.dkr.ecr.ap-northeast-2.amazonaws.com/byus/dev/web@${digest}`;
const target = `111111111111.dkr.ecr.ap-northeast-2.amazonaws.com/byus/prod/web@${digest}`;
const entry = { kind: 'web', source, target, digest, sha };

test('an exact target digest needs no registry login or image transfer', async () => {
  const result = await promoteImages([entry], { find: async () => digest, login: () => assert.fail(), transfer: () => assert.fail() });
  assert.equal(result[0].reused, true);
});
test('missing images copy concurrently and each target digest is verified', async () => {
  let inFlight = 0, peak = 0;
  const copied = new Set(), logins = [];
  const entries = [entry, { ...entry, kind: 'media', source: source.replace('web@', 'media@'), target: target.replace('web@', 'media@') }];
  const result = await promoteImages(entries, {
    find: async item => copied.has(item.target) ? digest : null,
    login: async registry => logins.push(registry),
    transfer: async item => { peak = Math.max(peak, ++inFlight); await new Promise(resolve => setTimeout(resolve, 10)); copied.add(item.target); --inFlight; },
  });
  assert.equal(peak, 2);
  assert.equal(logins.length, 1);
  assert.ok(result.every(item => !item.reused));
});
test('lookup errors, unexpected digests and partial transfer failures cannot succeed', async () => {
  const noCopy = { login: () => assert.fail(), transfer: () => assert.fail() };
  await assert.rejects(promoteImages([entry], { ...noCopy, find: async () => { throw new Error('AccessDenied'); } }), /AccessDenied/);
  await assert.rejects(promoteImages([entry], { ...noCopy, find: async () => 'sha256:wrong' }), /IMAGE_DIGEST_MISMATCH/);
  let finished = false;
  await assert.rejects(promoteImages([entry, { ...entry, kind: 'media' }], {
    find: async () => null, login: async () => {}, transfer: async item => {
      if (item.kind === 'web') throw new Error('copy failed');
      await new Promise(resolve => setTimeout(resolve, 10)); finished = true;
    },
  }), /copy failed/);
  assert.equal(finished, true, 'both transfers settle before failure is reported');
  await assert.rejects(promoteImages([entry], { find: async () => null, login: async () => {}, transfer: async () => {} }), /IMAGE_DIGEST_MISMATCH/);
});
test('invalid image references and digest disagreements fail before network operations', async () => {
  for (const patch of [{ source: 'https://evil.invalid/x' }, { target: target.replace('ap-northeast-2', 'us-east-1') }, { digest: 'latest' }, { sha: 'short' }, { kind: 'unknown' }]) {
    await assert.rejects(promoteImages([{ ...entry, ...patch }], { find: () => assert.fail() }), /INVALID_IMAGE_PROMOTION/);
  }
});
