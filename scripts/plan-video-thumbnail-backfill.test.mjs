import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { planBackfill } from './plan-video-thumbnail-backfill.mjs';
const row = { noticeId: '10000000-0000-4000-8000-000000000001', platform: 'tiktok', sourceUrl: 'https://www.tiktok.com/@elina_karimovaa/video/7696850953064189185' };
test('dry-run retains missing source covers without inventing one', () => assert.equal(planBackfill([row])[0].status, 'needs-source-cover'));
test('uses the ingest CDN boundary', () => {
  assert.equal(planBackfill([{ ...row, thumbnailUrl: 'https://p16.tiktokcdn.com/cover.jpeg' }])[0].status, 'ready-for-supervised-copy');
  for (const thumbnailUrl of ['https://169.254.169.254/a', 'https://evil.test/a', 'http://p16.tiktokcdn.com/a']) assert.throws(() => planBackfill([{ ...row, thumbnailUrl }]), /IMAGE_HOST_NOT_ALLOWED/);
});
test('rejects invalid IDs, non-post URLs and duplicates', () => {
  assert.throws(() => planBackfill([{ ...row, noticeId: "'; drop table x" }]));
  assert.throws(() => planBackfill([{ ...row, sourceUrl: 'https://www.tiktok.com/@elina_karimovaa' }]));
  assert.throws(() => planBackfill([row, row]), /Duplicate/);
});
