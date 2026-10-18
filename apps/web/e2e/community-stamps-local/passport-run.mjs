import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { startHarness } from './server.mjs';
import { APP_LOCALES } from '../../i18n/locales.ts';

const out = process.env.PASSPORT_LAYOUT_OUTPUT ?? 'test-results/passport-layout';
await mkdir(out, { recursive: true });
const harness = await startHarness(4197);
const browser = await chromium.launch();
const results = [];
const locales = APP_LOCALES;
try {
  for (const locale of locales) {
    const widths = ['ko', 'ja', 'vi', 'th'].includes(locale) ? [360, 390, 768, 1440] : [390, 1440];
    for (const width of widths) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${harness.baseURL}/?view=passports&locale=${locale}&data=mixed`);
      await expect(page.locator('article')).toHaveCount(6);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
      const cards = await page.locator('article').evaluateAll(articles => articles.map(article => {
        const rect = article.getBoundingClientRect();
        const footer = article.lastElementChild.getBoundingClientRect();
        const facts = article.querySelector('[class*="cardFacts"]').getBoundingClientRect();
        const title = article.querySelector('h2');
        const numbers = [...article.querySelectorAll('[class*="cardFacts"] strong')].map(number => number.getBoundingClientRect().bottom);
        return { top: rect.top, height: rect.height, width: rect.width, footer: footer.top, footerHeight: footer.height, facts: facts.top, score: numbers[0], stamps: numbers[1], titleFits: title.scrollHeight <= title.clientHeight + 1, overflow: article.scrollWidth > article.clientWidth + 1 };
      }));
      await page.screenshot({ path: `${out}/${locale}-${width}.png`, fullPage: true });
      if (width === 1440) assert(cards.filter(card => Math.abs(card.top - cards[0].top) <= 1).length > 1, `${locale}: desktop must exercise a multi-card row`);
      for (const card of cards) {
        assert(card.width <= 380.5, `${locale}/${width}: card width stays bounded`);
        assert(card.footerHeight >= 44, `${locale}/${width}: reachable footer`);
        assert(card.titleFits && !card.overflow, `${locale}/${width}: content remains readable`);
        const row = cards.filter(other => Math.abs(other.top - card.top) <= 1);
        for (const peer of row) for (const metric of ['height', 'footer', 'facts', 'score', 'stamps']) {
          assert(Math.abs(peer[metric] - card[metric]) <= 1, `${locale}/${width}: same-row ${metric} differs: ${JSON.stringify(row)}`);
        }
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${locale}/${width}: no page overflow`);
      assert.deepEqual(errors, [], `${locale}/${width}: no runtime errors`);
      if (locale === 'ko' && [390, 1440].includes(width)) {
        const axe = await new AxeBuilder({ page }).include('#passport-content').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        assert.deepEqual(axe.violations.map(v => ({ id: v.id, impact: v.impact })), []);
        await page.locator('article').first().locator('a').last().focus();
        assert(await page.locator('article').first().locator('a').last().evaluate(a => a.matches(':focus-visible') && getComputedStyle(a).outlineStyle !== 'none'), 'visible keyboard focus');
      }
      await page.goto(`${harness.baseURL}/?view=raffle-layout&locale=${locale}`);
      await expect(page.locator('[data-testid="raffle-grid"] article')).toHaveCount(3);
      await page.evaluate(() => document.fonts.ready);
      const gifts = await page.locator('[data-testid="raffle-grid"] article').evaluateAll(articles => articles.map(article => ({
        top: article.getBoundingClientRect().top,
        entry: article.querySelector('[class*="myEntry"]').getBoundingClientRect().top,
        action: article.lastElementChild.lastElementChild.getBoundingClientRect().top,
        bottom: article.getBoundingClientRect().bottom,
      })));
      if (locale === 'ko' && [390, 1440].includes(width)) await page.screenshot({ path: `${out}/gifts-${locale}-${width}.png`, fullPage: true });
      if (width === 1440) assert(gifts.filter(gift => Math.abs(gift.top - gifts[0].top) <= 1).length > 1, `${locale}: desktop must exercise a multi-gift row`);
      for (const gift of gifts) for (const peer of gifts.filter(other => Math.abs(other.top - gift.top) <= 1)) {
        for (const metric of ['entry', 'action', 'bottom']) assert(Math.abs(gift[metric] - peer[metric]) <= 1, `${locale}/${width}: gift ${metric} alignment`);
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${locale}/${width}: no gift overflow`);
      assert.deepEqual(errors, [], `${locale}/${width}: no gift runtime errors`);
      results.push({ locale, width, cards, gifts });
      await context.close();
    }
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  for (const mode of ['demo', 'one', 'empty', 'error']) {
    await page.goto(`${harness.baseURL}/?view=passports&locale=ko&data=${mode}`);
    if (mode === 'empty') await expect(page.getByRole('status')).toContainText('아직');
    else if (mode === 'error') await expect(page.getByRole('alert')).toBeVisible();
    else await expect(page.locator('article')).toHaveCount(mode === 'one' ? 1 : 3);
  }
  await page.goto(`${harness.baseURL}/?view=passports&locale=ko&auth=off`);
  await expect(page.getByRole('heading', { name: '로그인하고 내 패스포트를 확인하세요.' })).toBeVisible();
  await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
  console.log(`PASS: ${results.length} locale/viewport combinations; row heights, facts, footers, overflow, keyboard focus, accessibility and collection states`);
} finally {
  await browser.close();
  await harness.server.close();
}
