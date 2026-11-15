import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { startServer } from './server.mjs';
const out = process.env.COMMUNITY_COMPACT_OUTPUT ?? path.resolve(import.meta.dirname, '../../../../work/community-compact-20261028');
await mkdir(out, { recursive: true });
const server = process.argv.includes('--existing') ? { close: async () => {} } : await startServer();
if (process.argv.includes('--serve')) { console.log('http://127.0.0.1:4228/community?creator=elina&locale=ko'); } else {
 const browser = await chromium.launch({ headless: true }), context = await browser.newContext(), page = await context.newPage(), errors = [], matrix = [];
 page.on('pageerror', error => errors.push(error.message));
 const href = (extra = '') => `http://127.0.0.1:4228/community?creator=elina&locale=ko${extra}`;
 const hot = () => page.locator('section[aria-labelledby="hot-community-heading"]');
 const filters = () => page.locator('main nav').filter({ has: page.locator('a[href*="media=1"]') }).last();
 try {
  const source = await readFile(path.resolve(import.meta.dirname, '../../i18n/locales.ts'), 'utf8');
  const locales = [...source.match(/APP_LOCALES\s*=\s*\[([^\]]+)/s)[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
  assert(locales.length);
  for (const width of [390, 1440, 360, 768]) for (const locale of locales) {
   if ([360, 768].includes(width) && !['ko', 'ja', 'vi', 'th'].includes(locale)) continue;
   await page.setViewportSize({ width, height: 1000 }); await page.goto(href().replace('locale=ko', `locale=${locale}`));
   await expect(page.locator('article')).toHaveCount(4);
   await expect(page.locator('article img[alt]:not([alt=""])')).toHaveCount(3);
   await expect(hot().locator('ol li')).toHaveCount(5);
   assert.deepEqual(await hot().locator('ol a').evaluateAll(links => links.map(link => new URL(link.href).searchParams.get('creator'))), ['elina', 'kara', 'yuna', 'music', 'wave']);
   await expect.poll(() => page.locator('article img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
   const geometry = await page.evaluate(() => {
    const main = document.querySelector('main'), header = main.querySelector('h1'), card = main.querySelector('article'), media = [...main.querySelectorAll('article img[alt]:not([alt=""])')];
    const controls = [...main.querySelectorAll('a, button, [role="combobox"]')];
    return { overflow: document.documentElement.scrollWidth > innerWidth, alignment: Math.abs(header.getBoundingClientRect().left - card.getBoundingClientRect().left), smallControls: controls.filter(el => { const r = el.getBoundingClientRect(); return r.width < 43.9 || r.height < 43.9; }).map(el => ({ text: el.textContent, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })), photoCount: media.length, ratios: media.map(img => Math.abs(img.clientWidth / img.clientHeight - img.naturalWidth / img.naturalHeight)) };
   });
   assert.equal(geometry.overflow, false, JSON.stringify({ width, locale, geometry }));
   assert(geometry.alignment <= 1, JSON.stringify({ width, locale, geometry }));
   assert.deepEqual(geometry.smallControls, [], JSON.stringify({ width, locale, geometry }));
   assert.equal(geometry.photoCount, 3);
   assert(geometry.ratios.every(error => error < .025), JSON.stringify({ width, locale, geometry }));
   if (width < 768) {
    const row = await hot().locator('ol a').evaluateAll(links => links.map(link => ({ image: link.querySelector('[data-creator-avatar]').getBoundingClientRect().top, count: link.lastElementChild.lastElementChild.getBoundingClientRect().bottom, bottom: link.getBoundingClientRect().bottom })));
    for (const key of ['image', 'count', 'bottom']) assert(Math.max(...row.map(item => item[key])) - Math.min(...row.map(item => item[key])) <= 1, `${locale}/${width} hot row ${key}`);
   }
   matrix.push({ width, locale, geometry });
   if (['ko', 'en'].includes(locale) && [390, 1440].includes(width)) {
    await page.screenshot({ path: path.join(out, `${locale}-${width}.png`), fullPage: true });
    await page.screenshot({ path: path.join(out, `${locale}-${width}-viewport.png`) });
    if (width === 390) assert.deepEqual((await new AxeBuilder({ page }).analyze()).violations, []);
   }
  }
  await page.setViewportSize({ width: 390, height: 1000 }); await page.goto(href());
  const selector = page.locator('main').getByRole('combobox'); await selector.focus(); await selector.press('Enter'); await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Escape'); await expect(selector).toBeFocused();
  await selector.press('Enter'); await page.getByRole('option', { name: 'KARA', exact: true }).click();
  await expect(page).toHaveURL(/creator=kara/); await expect(page.locator('article')).toHaveCount(4);
  await filters().locator('a[href*="media=1"]').click(); await expect(page).toHaveURL(/media=1/); await expect(page.locator('article')).toHaveCount(3);
  await expect(page.locator('article').filter({ hasText: '사진 없이' })).toHaveCount(0);
  const page2 = page.waitForRequest(request => request.url().includes('/feed?') && request.url().includes('cursor=') && request.url().includes('media=1'));
  await page.locator('section nav button').last().click(); await page2; await expect(page.locator('article')).toHaveCount(1);
  await filters().locator('a:not([href*="media=1"])').click(); await expect(page).not.toHaveURL(/media=1/); await expect(page.locator('article')).toHaveCount(4);
  await page.goto(href('&media=1&state=empty')); await expect(page.locator('article')).toHaveCount(0); await expect(page.locator('main section[tabindex="-1"] [role="status"]')).toBeVisible();
  await page.screenshot({ path: path.join(out, 'empty-390.png'), fullPage: true });
  await page.goto(href('&media=1&state=error')); await expect(page.getByRole('alert')).toBeVisible(); await expect(page.getByRole('alert').getByRole('button')).toBeVisible();
  await page.screenshot({ path: path.join(out, 'error-390.png'), fullPage: true });
  await page.goto(href('&counts=zero')); await expect(page.locator('article')).toHaveCount(4); await expect(hot()).toHaveCount(0);
  assert.deepEqual(errors, []);
  await writeFile(path.join(out, 'evidence.json'), JSON.stringify({ matrix, errors, axe: ['ko', 'en'], selector: 'pass', mediaFilterAndPagination: 'pass', emptyAndError: 'pass', synthetic: true }, null, 2));
  console.log(`PASS ${matrix.length} locale/width cases; real frame/feed, top-five ranks, image ratios, 44px controls, alignment, media/reset/pagination, selector and Axe KO/EN`);
 } finally { await browser.close(); await server.close(); }
}
