import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { startHarness } from './server.mjs';

const out = process.env.WAVE_POLLING_EVIDENCE_DIR || 'test-results/wave-programs-local/polling';
await mkdir(out, { recursive: true });
const harness = await startHarness(4278), browser = await chromium.launch(), checks = [];
try {
 for (const width of [390, 1440]) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage(), errors = [], externalRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', route => {
   const url = new URL(route.request().url());
   if (url.origin === harness.baseURL || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
   externalRequests.push(url.origin); return route.abort();
  });
  await page.goto(`${harness.baseURL}/kyaa-wave-fanpage?locale=ko&polling=1`);
  await expect(page.getByRole('link', { name: '미션 진행', exact: true })).toBeVisible();
  await page.getByRole('link', { name: '미션 진행', exact: true }).click();
  await expect(page).toHaveURL(/\/kyaa-wave-fanpage\?locale=ko#wave-missions$/);
  const section = page.locator('#wave-missions');
  await expect(section.getByRole('heading', { name: '미션 진행', exact: true })).toBeVisible();
  const quiz = section.locator('li').filter({ has: page.getByText('퀴즈 정답 보너스', { exact: true }) });
  await expect(quiz.getByText('미완료', { exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await quiz.screenshot({ path: `${out}/pending-${width}.png` });

  const grant = await page.evaluate(async () => {
   const rows = await (await fetch('/api/admin/kyaa-wave-participants')).json();
   if (rows.participants.length !== 1 || rows.participants[0].name !== '김지민') throw new Error('wrong synthetic participant');
   const id = rows.participants[0].id;
   const result = await (await fetch(`/api/admin/kyaa-wave-participants/${id}/quiz-stamp`, { method: 'POST', headers: { authorization: 'Bearer synthetic-admin' } })).json();
   return { id, result, reads: window.waveMissionPolling.state.reads.length };
  });
  assert.equal(grant.result.id, grant.id); assert(grant.result.quizCorrectAt);
  // No activity event or manual retry: the real ten-second timer must fetch the new owner snapshot.
  await expect(quiz.getByText('미션 도장 · 발급 대기', { exact: true })).toBeVisible({ timeout: 18000 });
  const queued = await page.evaluate(() => structuredClone(window.waveMissionPolling.state));
  assert.equal(queued.grants, 1);
  assert(queued.reads.length > grant.reads);
  const queuedRead = queued.reads.find(read => read.status === 'queued');
  assert(queuedRead.at - queued.reads[0].at >= 9000, 'queued DOM must come from the normal ten-second poll');
  await quiz.screenshot({ path: `${out}/queued-${width}.png` });

  const receipt = await page.evaluate(async () => (await fetch('/api/fixture/wave-mission-receipt')).json());
  assert.equal(receipt.status, 'minted');
  await expect(quiz.getByText('미션 도장 · 발급 대기', { exact: true })).toBeVisible();
  await expect(quiz.getByText('미션 도장 · 발급 완료', { exact: true })).toBeVisible({ timeout: 18000 });
  await expect(quiz.getByText('미션 도장 · 발급 대기', { exact: true })).toHaveCount(0);
  const minted = await page.evaluate(() => structuredClone(window.waveMissionPolling.state));
  const mintedRead = minted.reads.find(read => read.status === 'minted');
  assert(mintedRead.at - queuedRead.at >= 9000, 'receipt status must reach the DOM through the next normal poll');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mission view must not overflow');
  await quiz.screenshot({ path: `${out}/minted-${width}.png` });

  await page.evaluate(() => window.waveMissionPolling.logout());
  await expect(section.getByRole('link', { name: '로그인', exact: true })).toBeVisible();
  await expect(section.getByText('미션 도장 · 발급 완료', { exact: true })).toHaveCount(0);
  assert.deepEqual(errors, []);
  checks.push({ width, participantName: '김지민', grants: minted.grants, queuedPollMs: queuedRead.at - queued.reads[0].at, mintedPollMs: mintedRead.at - queuedRead.at, reads: minted.reads, homeMissionDestination: '/kyaa-wave-fanpage?locale=ko#wave-missions', logoutClearsPreviousStamp: true, blockedExternalOrigins: [...new Set(externalRequests)] });
  console.log(`PASS ${width}px: one quiz grant → queued → minted via real 10s polling; home destination and logout isolation`);
  await context.close();
 }
 await writeFile(`${out}/evidence.json`, JSON.stringify({ boundary: 'Real WaveMissionProgress, useFanpageResource, CSS and browser timers; one synthetic auth owner and local API-shaped quiz grant/receipt responses. Database, chain execution and operator UI are validated separately; this is not an external end-to-end test.', imageCoverage: 'Existing wave-programs-local actions.mjs and image-framing.md evidence remains applicable; this check changes no photo or media layout.', checks }, null, 2));
} finally { await browser.close(); await harness.server.close(); }
