// Real Next app on the existing RANK port; browser-only fixtures never write the DB.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';

const output = process.argv[2];
const onlyBoundaries = process.argv.includes("--boundaries-only");
assert(output, 'pass an evidence output directory');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', locale: 'ko-KR' });
const page = await context.newPage();
page.setDefaultTimeout(30000);
const results = [];
const base = 'http://localhost:3003';
const head = () => ({ day: new Date().toISOString().slice(0, 10), computedAt: new Date().toISOString(), comparable: true, weekGainDays: null, metric: 'hearts', state: 'ready', me: null });
const reference = rank => ({ kind: 'home_ranking', day: head().day, computedAt: head().computedAt, metric: 'hearts', rank, signature: 'a'.repeat(64) });
const fans = () => ({ ...head(), rows: Array.from({ length: 10 }, (_, i) => ({ rank: i + 1, nickname: i === 9 ? '매일같이응원하는열번째팬의긴이름' : `응원팬${i + 1}`, score: 12300 - i, hearts: 12300 - i, characterId: 'star-pink', tier: 'Gold', isMe: false, delta: i === 0 ? 99 : i === 1 ? -1 : i === 2 ? 0 : null, isNew: i === 3, favorite: null, dayGain: i === 1 ? -3 : i === 2 ? null : 0, profileRef: reference(i + 1) })) });
const creators = () => ({ ...head(), rows: Array.from({ length: 10 }, (_, i) => ({ rank: i + 1, slug: `fixture-creator-${i + 1}`, name: i === 9 ? '열번째크리에이터의아주긴이름' : `크리에이터${i + 1}`, imageUrl: '/images/guest-home/elina-card.jpg', score: 12300 - i, hearts: 12300 - i, fans: 9999 - i, delta: i === 0 ? 99 : i === 1 ? -1 : 0, isNew: false, liveNow: i === 0, challenge: false, weekGain: null, dayGain: i === 2 ? null : 9999 })) });
const profile = {
  profile: { id: '10000000-0000-4000-8000-000000000001', nickname: '응원팬 프로필', avatarUrl: '/images/avatars/star-pink.webp', accountLevel: { tier: 'Gold' } },
  relationship: { friendshipId: null, status: 'none' }, dm: { conversationId: null, status: 'none', canSend: false }, capabilities: { canRequestFriend: false, canRequestDm: false, canBlock: false }, isSelf: false, reach: { dmState: 'available', artist: false },
  card: { favorite: { slug: 'elina', name: '엘리나' }, bio: '응원활동'.repeat(10), links: [], stats: { creator: { slug: 'elina', name: '엘리나' }, tier: 'Gold', hearts: 12300, points: 1234, stamps: 7 } },
};
const card = () => page.locator('[data-home-ranking]');
async function measure(label) {
  const values = await card().evaluate(el => {
    const rows = [...el.querySelectorAll('[data-row="fan-rank"], [data-row="creator-rank"]')].map(li => {
      const name = li.querySelector('[title]');
      const delta = li.querySelector('[data-delta-cell]');
      const control = li.querySelector('button,a');
      const nr = name.getBoundingClientRect(), dr = delta.getBoundingClientRect();
      const hearts = li.querySelector('[data-metric="hearts"]');
      return { rank: Number(li.id.split('-').at(-1)), kind: li.getAttribute('data-row'), height: control.getBoundingClientRect().height, nameWidth: nr.width, gap: dr.left - nr.right, heartsRight: hearts.getBoundingClientRect().right, truncated: name.scrollWidth > name.clientWidth };
    });
    return { width: el.getBoundingClientRect().width, rows };
  });
  assert(values.rows.length > 0);
  for (const row of values.rows) { assert.equal(row.height, 34); assert(Math.abs(row.gap - 8) < .1, JSON.stringify(row)); }
  for (const kind of ['fan-rank', 'creator-rank']) {
    const rows = values.rows.filter(row => row.kind === kind);
    assert(rows.every(row => Math.abs(row.heartsRight - rows[0].heartsRight) < .1));
  }
  results.push({ label, ...values });
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: viewport.width, height: viewport.width === 390 ? 1200 : 1040 });
  await card().evaluate(el => el.scrollIntoView({ block: 'center' }));
  await card().locator('img').evaluateAll(imgs => Promise.all(imgs.map(img => img.decode().catch(() => {}))));
  await page.screenshot({ path: path.join(output, `${label}.png`) });
  await card().screenshot({ path: path.join(output, `${label}-card.png`) });
  await page.setViewportSize(viewport);
}
try {
  results.push({ label: 'actual-guest-390', reused: 'sol-app-guest-390.png; parent acceptance of corrected gaps and conditional login text' });
  results.push({ label: 'actual-guest-1440', reused: 'sol-next/actual-guest-1440.png and results.json; measured 34px rows and 8px gaps' });
  await page.goto(`${base}/?locale=ko`);
  await expect(card().locator('[data-row="fan-rank"]')).not.toHaveCount(0);

  // Sign in through the normal development Test Account UI, without exporting auth storage.
  await card().locator('[data-row="fan-rank"] a').first().click();
  await page.getByRole('button', { name: 'Test Account 이메일로 계속하기' }).click();
  const accounts = JSON.parse(await fs.readFile(path.join(os.homedir(), '.kyaa-dev-test-accounts/accounts.json'), 'utf8'));
  await page.getByRole('textbox', { name: 'Submit', exact: true }).fill(accounts['dev-fan-3'].email);
  await page.getByRole('textbox', { name: 'Submit', exact: true }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Enter confirmation code' })).toBeVisible();
  const code = String(accounts['dev-fan-3'].code);
  for (let i = 0; i < code.length; i++) await page.getByRole('textbox').nth(i).fill(code[i]);
  await expect(card().locator('[data-row="fan-rank"] button')).not.toHaveCount(0, { timeout: 90000 });
  results.push({ label: 'actual-profile', reused: 'logs/sol-actual-profile-ui.json and sol-actual-next-get.json; no duplicate profile verification' });

  let submittedReference;
  await page.route('**/api/rankings/home?**', route => route.fulfill({ json: new URL(route.request().url()).searchParams.get('kind') === 'fans' ? fans() : creators() }));
  await page.route('**/api/profiles/by-ref?**', route => { submittedReference = JSON.parse(Buffer.from(new URL(route.request().url()).searchParams.get('ref'), 'base64url').toString()); return route.fulfill({ json: profile }); });
  await page.reload();
  await expect(card().locator('[data-row="fan-rank"]')).toHaveCount(10);
  await expect(card().locator('[data-row="creator-rank"]')).toHaveCount(10);
  await page.setViewportSize({ width: 390, height: 844 });
  if (!onlyBoundaries) await measure('next-fixture-member-390');
  results.push({ label: 'fixture-profile-390-10', reused: 'sol-next-fixture-final/results.json; Space, trap and focus return passed, not repeated' });
  for (const width of onlyBoundaries ? [390, 1440] : [1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    if (!onlyBoundaries) await measure(`next-fixture-member-${width}`);
    if (!onlyBoundaries && width === 390) {
      const last = results.at(-1).rows;
      assert(last.some(row => row.rank === 10 && row.truncated));
      assert.equal(last.find(row => row.kind === 'creator-rank' && row.rank === 10).nameWidth, 72);
    }
    for (const rank of onlyBoundaries ? [] : [10]) {
      const trigger = card().locator(`[data-row="fan-rank"]`).nth(rank - 1).getByRole('button');
      await trigger.focus();
      await trigger.press(width === 390 ? 'Space' : 'Enter');
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      if (width === 1440) assert.equal((await dialog.boundingBox()).width, 480);
      await expect(dialog.getByText('1,234', { exact: false })).toBeVisible();
      await expect(dialog.getByRole('link', { name: /엘리나/ })).toHaveAttribute('href', '/elina?locale=ko');
      assert.equal(submittedReference.rank, rank);
      if (rank === 10) await dialog.screenshot({ path: path.join(output, `next-fixture-profile-${width}.png`) });
      for (let i = 0; i < 2; i++) { await page.keyboard.press(i % 2 ? 'Shift+Tab' : 'Tab'); assert(await dialog.evaluate(el => el.contains(document.activeElement))); }
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      results.push({ label: `fixture-profile-${width}-${rank}`, keyboard: true, focusTrap: true, focusReturn: true, storedRank: submittedReference.rank });
    }
    const boundaries = [];
    for (const index of [0, 8, 9]) {
      const row = card().locator('[data-row="fan-rank"]').nth(index);
      await row.evaluate(el => el.scrollIntoView({ block: 'center' }));
      const checks = await row.evaluate(el => {
        const r = el.getBoundingClientRect();
        return [r.top + 1, r.bottom - 1].map(y => ({ id: el.id, hit: document.elementFromPoint(r.x + r.width / 2, y)?.closest('[data-row]')?.id }));
      });
      boundaries.push(...checks);
    }
    results.push({ label: `row-boundaries-${width}`, boundaries });
    assert(boundaries.every(row => row.id === row.hit));
  }
} catch (error) {
  results.push({ failure: String(error) });
  if (await card().count()) await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  throw error;
} finally {
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  await browser.close();
}
console.log('real Next / actual DB + labeled browser fixtures: PASS');
