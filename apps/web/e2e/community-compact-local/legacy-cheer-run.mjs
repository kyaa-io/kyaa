import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { startServer } from './server.mjs';
const out = process.env.LEGACY_CHEER_OUTPUT ?? path.resolve('test-results/legacy-cheer');
await mkdir(out, { recursive: true });
const server = await startServer(), browser = await chromium.launch({ headless: true });
const context = await browser.newContext(), page = await context.newPage(), errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  for (const width of [390, 1440]) for (const locale of ['ko', 'en', 'vi']) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`http://127.0.0.1:4228/community?creator=yuna&locale=${locale}&legacy=1`);
    await expect(page.locator('article')).toHaveCount(1);
    await page.locator('section nav button').last().click();
    const card = page.locator('[data-cheer-id]');
    await expect(card).toHaveCount(1);
    const like = card.locator('button[class*="likeButton"]'), comments = card.locator('button[aria-controls$="-replies"]');
    await expect(like).toHaveText(/2/);
    await expect(comments).toHaveText(/1/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    for (const control of [like, comments]) {
      const box = await control.boundingBox(); assert(box.width >= 44 && box.height >= 44);
    }
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, `${locale}-${width}.png`) });
    await comments.focus(); await page.keyboard.press('Enter');
    await expect(comments).toHaveAttribute('aria-expanded', 'true');
    await expect(card.getByText('저도 기대돼요!')).toBeVisible();
    const field = card.getByRole('textbox'); await field.fill('실패해도 보존할 댓글');
    await card.locator('form button[type=submit]').click();
    await expect(card.locator('section > p[role=alert]')).toBeVisible();
    await expect(field).toHaveValue('실패해도 보존할 댓글');
    await comments.click(); await expect(field).toBeHidden(); await comments.click(); await expect(field).toHaveValue('실패해도 보존할 댓글');
    if (locale === 'ko' && width === 390) {
      const result = await new AxeBuilder({ page }).include('[data-cheer-id]').analyze();
      assert.deepEqual(result.violations, []);
    }
  }
  await page.goto('http://127.0.0.1:4228/community?creator=yuna&locale=en&legacy=1&auth=off');
  await page.locator('section nav button').last().click();
  const card = page.locator('[data-cheer-id]');
  await expect(card.locator('button[class*="likeButton"]')).toBeDisabled();
  await card.locator('button[aria-controls$="-replies"]').click();
  await expect(card.locator('a[href^="/login?"]')).toBeVisible();
  await expect(card.getByRole('textbox')).toHaveCount(0);
  assert.deepEqual(errors, []);
  console.log('Legacy cheer: 6 viewport/language combinations, pagination, keyboard, replies, failure drafts and guest access passed.');
} finally { await browser.close(); await server.close(); }
