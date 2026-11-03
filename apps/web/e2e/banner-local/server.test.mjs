import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startHarness } from './server.mjs';

test('home polish fixtures serve synthetic empty reservations and reaction counts', async () => {
  const harness = await startHarness({ port: 4299 });
  try {
    const headers = { referer: `${harness.baseURL}/?scenario=home-polish` };
    const summary = await (await fetch(`${harness.baseURL}/api/me/summary`, { headers })).json();
    assert.deepEqual(summary.summary.live.upcoming, []);
    const feed = await (await fetch(`${harness.baseURL}/api/public/home-feed`, { headers })).json();
    assert.deepEqual(feed.items.map(({ item }) => item.likeCount), [0, 12, 1234, 7]);
    assert.equal(feed.items[2].item.commentCount, 56);
    const guest = await (await fetch(`${harness.baseURL}/api/public/home-feed`)).json();
    assert.deepEqual(guest, { states: {} });
  } finally { await harness.close(); }
});
