import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { startHarness } from './server.mjs';

const harness = await startHarness();
let browser;
try {
  browser = await chromium.launch();
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 1050 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${harness.baseURL}/?view=my-passport-chips`);
    const rail = page.locator('[data-fan-tabs="chip"]');
    const chips = rail.getByRole('button');
    await expect(chips).toHaveCount(15);
    await page.evaluate(() => document.fonts.ready);
    await expect(chips.first()).toHaveAttribute('aria-pressed', 'true');
    const geometry = await rail.evaluate((element) => {
      const profile = document.querySelector('header:has(h1)');
      const edge = element.getBoundingClientRect().right;
      const book = document.querySelector('[data-my-passport-book]');
      const record = element.nextElementSibling;
      return {
        bookBottom: book.getBoundingClientRect().bottom,
        chipTop: element.getBoundingClientRect().top,
        chipBottom: element.getBoundingClientRect().bottom,
        recordTop: record.getBoundingClientRect().top,
        profileBeforeBook: profile.compareDocumentPosition(book) & Node.DOCUMENT_POSITION_FOLLOWING,
        rows: new Set([...element.children].map((chip) => chip.offsetTop)).size,
        overflows: element.scrollWidth > element.clientWidth,
        clipped: [...element.children].some((chip) => {
          const { left, right } = chip.getBoundingClientRect();
          return left < edge && right > edge;
        }),
        pageWidth: document.documentElement.scrollWidth,
        profileHeight: profile.getBoundingClientRect().height,
        profileGap: profile.nextElementSibling.getBoundingClientRect().top - profile.getBoundingClientRect().bottom,
      };
    });
    assert.ok(geometry.profileBeforeBook);
    assert.ok(geometry.bookBottom < geometry.chipTop && geometry.chipBottom < geometry.recordTop);
    if (width === 390) assert.ok(geometry.bookBottom <= 844 && geometry.recordTop < 844);
    assert.equal(geometry.rows, 1);
    assert.equal(geometry.pageWidth, width);
    assert.equal(geometry.profileHeight, width === 390 ? 48 : 56);
    assert.equal(geometry.profileGap, width === 390 ? 20 : 24);
    if (width === 390) {
      assert.equal(geometry.overflows, true);
      assert.equal(geometry.clipped, true);
    }
    if (process.env.MY_PASSPORT_CAPTURE_DIR) {
      await page.screenshot({ path: `${process.env.MY_PASSPORT_CAPTURE_DIR}/2026-11-18-my-passport-${width}.png` });
    }
    await chips.last().focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-my-passport-book]')).toHaveAccessibleName(/Aleksandra/);
    await expect(chips.first()).toHaveText('Aleksandra Wiśniewska-Kowalczyk');
    await expect(chips.first()).toHaveAttribute('aria-pressed', 'true');
    await expect(chips.first()).toBeFocused();
    await expect(chips.first()).toBeInViewport({ ratio: 0.99 });
    assert.deepEqual(errors, []);
    console.log(width, geometry);
    await page.close();
  }
} finally {
  await browser?.close();
  await harness.server.close();
}
