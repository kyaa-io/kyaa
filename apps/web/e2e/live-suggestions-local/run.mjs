import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { startHarness } from './server.mjs';
import { APP_LOCALES } from '../../i18n/locales.ts';
const out = process.env.SONG_BROWSER_OUTPUT ?? 'test-results/live-suggestions';
await mkdir(out, { recursive: true });
const harness = await startHarness(4200), browser = await chromium.launch();
const evidence = [];
try {
  for (const locale of APP_LOCALES) for (const width of ['ko', 'ja', 'vi', 'th'].includes(locale) ? [360, 390, 768, 1440] : [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(10_000);
    console.log(`Checking ${locale}/${width}`);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${harness.baseURL}/?locale=${locale}`);
    await expect(page.locator('main section li')).toHaveCount(3);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => [...document.images].every(image => image.complete));
    const images = await page.locator('main img').evaluateAll(images => images.map(image => ({ width: image.width, height: image.height, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, fit: getComputedStyle(image).objectFit })));
    assert(images.every(image => image.width === image.height && image.naturalWidth > 0 && image.fit === 'contain'), `${locale}/${width}: full artwork and platform mark`);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${locale}/${width}: no horizontal overflow`);
    const shortTargets = await page.locator('main :is(a,button,input,select,textarea)').evaluateAll(nodes => nodes.filter(node => node.getBoundingClientRect().height > 0 && node.getBoundingClientRect().height < 43.5).map(node => node.textContent));
    assert.deepEqual(shortTargets, [], `${locale}/${width}: reachable controls`);
    assert.deepEqual(errors, []);
    if (locale === 'ko' && [390, 1440].includes(width)) {
      await page.screenshot({ path: `${out}/public-${width}.png`, fullPage: true });
      const axe = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      assert.deepEqual(axe.violations.map(item => ({ id: item.id, impact: item.impact })), []);
      await page.getByRole('combobox', { name: '제출', exact: true }).selectOption('song');
      await page.getByRole('textbox', { name: '곡·아티스트 검색' }).fill('샘플 곡');
      await page.getByRole('button', { name: '검색', exact: true }).last().click();
      await page.getByRole('button', { name: '곡 선택 · 예시 신청곡', exact: true }).click();
      await page.getByRole('button', { name: '제출', exact: true }).click();
      await expect(page.getByText('저장했어요.', { exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByRole('button', { name: '삭제', exact: true })).toBeVisible();
      assert(await page.locator('a[href*="open.spotify.com"]').first().getAttribute('href').then(href => new URL(href).searchParams.get('utm_source') === 'kyaa'), 'shared outbound decoration');
      await page.screenshot({ path: `${out}/saved-${width}.png`, fullPage: true });
      await page.getByRole('button', { name: '삭제', exact: true }).click();
      await page.getByRole('combobox', { name: '제출', exact: true }).selectOption('song');
      await page.getByRole('textbox', { name: '곡·아티스트 검색' }).fill('error');
      await page.getByRole('button', { name: '검색', exact: true }).last().click();
      await expect(page.getByRole('alert')).toBeVisible();
      await page.getByRole('button', { name: '직접 입력', exact: true }).click();
      await page.getByRole('textbox', { name: '곡 제목', exact: true }).fill('직접 신청한 곡');
      await page.getByRole('textbox', { name: '아티스트', exact: true }).fill('직접 입력한 가수');
      await page.getByRole('textbox', { name: 'YouTube 링크 (선택)' }).fill('https://youtu.be/abcdefghijk');
      await page.getByRole('button', { name: '제출', exact: true }).click();
      await expect(page.getByText('저장했어요.', { exact: true })).toBeVisible();
      await page.screenshot({ path: `${out}/manual-${width}.png`, fullPage: true });
    }
    evidence.push({ locale, width, images, runtimeErrors: errors });
    await context.close();
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 1000 } });
  for (const state of ['empty', 'error', 'members', 'closed']) {
    await page.goto(`${harness.baseURL}/?locale=ko&state=${state}`);
    if (state === 'error') await expect(page.getByRole('alert')).toBeVisible();
    if (state === 'empty') await expect(page.getByText('아직 등록된 항목이 없어요.', { exact: true })).toBeVisible();
    if (state === 'members') await expect(page.getByRole('link', { name: '팬 인증하기' })).toBeVisible();
    if (state === 'closed') await expect(page.getByText('마감', { exact: true })).toBeVisible();
  }
  await page.goto(`${harness.baseURL}/?locale=ko&auth=off`);
  await expect(page.locator('main section li')).toHaveCount(3);
  await expect(page.getByRole('button', { name: '로그인하고 계속' })).toBeVisible();
  assert.equal(await page.locator('main form').count(), 0, 'guest reads public page without composer');
  for (const platform of ['tiktok', 'youtube', 'instagram', 'chzzk']) {
    await page.goto(`${harness.baseURL}/?locale=ko&platform=${platform}`);
    await expect(page.locator(`main img[src*="/guest-home/${platform}."]`)).toBeVisible();
  }
  await writeFile(`${out}/results.json`, JSON.stringify({ boundary: 'Actual public page and CSS; synthetic local identity, search and submission API; SQL and live Spotify checked separately.', evidence }, null, 2));
  console.log(`PASS: ${evidence.length} locale/viewport combinations, public read, song search/select/save/reload/delete, provider failure/manual fallback, image frames, accessibility, shared outbound decoration.`);
} finally { await browser.close(); await harness.server.close(); }
