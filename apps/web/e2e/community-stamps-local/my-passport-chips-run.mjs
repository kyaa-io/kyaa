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
    const nickname = '별빛따라걷는팬친구';
    await page.goto(`${harness.baseURL}/?view=my-passport-chips&nickname=${encodeURIComponent(nickname)}`);
    const heading = page.getByRole('heading', { name: `${nickname}님`, exact: true });
    await expect(heading).toBeVisible();
    const rail = page.locator('[data-fan-tabs="chip"]');
    const chips = rail.getByRole('button');
    await expect(rail.locator("button")).toHaveCount(15);
    await page.evaluate(() => document.fonts.ready);
    await expect(chips.first()).toHaveAttribute('aria-pressed', 'true');
    assert.ok(await heading.evaluate((element) => element.scrollWidth <= element.clientWidth));
    const geometry = await rail.evaluate((element) => {
      const profile = document.querySelector('header:has(h1)');
      const edge = element.getBoundingClientRect().right;
      const book = document.querySelector('[data-my-passport-book]');
      const stats = document.querySelector('[data-block="my-stats"]').parentElement;
      const passport = book.closest('section');
      const profileRect = profile.getBoundingClientRect();
      const centerY = (rect) => (rect.top + rect.bottom) / 2;
      const record = element.parentElement.nextElementSibling;
      const visible = [...element.children].filter((chip) => !chip.inert);
      return {
        alignedEdges: [stats, passport].every((card) => {
          const rect = card.getBoundingClientRect();
          return Math.abs(rect.left - profileRect.left) <= 1 && Math.abs(rect.right - profileRect.right) <= 1;
        }),
        alignedProfile: Math.abs(centerY(profile.children[0].getBoundingClientRect()) -
          centerY(profile.querySelector("h1").getBoundingClientRect())) <= 1,
        actionsBelow: profile.children[2].getBoundingClientRect().top >=
          profile.children[0].getBoundingClientRect().bottom - 1,
        bookBottom: book.getBoundingClientRect().bottom,
        chipTop: element.getBoundingClientRect().top,
        chipBottom: element.getBoundingClientRect().bottom,
        recordTop: record.getBoundingClientRect().top,
        recordLeft: record.getBoundingClientRect().left,
        bookRight: book.getBoundingClientRect().right,
        profileBeforeBook: profile.compareDocumentPosition(book) & Node.DOCUMENT_POSITION_FOLLOWING,
        rows: new Set(visible.map((chip) => chip.offsetTop)).size,
        hidden: element.children.length - visible.length,
        visibleCount: visible.length,
        clipped: visible.some((chip) => {
          const { left, right } = chip.getBoundingClientRect();
          return left < element.getBoundingClientRect().left - 0.5 || right > edge + 0.5;
        }),
        pageWidth: document.documentElement.scrollWidth,
        profileHeight: profile.getBoundingClientRect().height,
        profileGap: profile.nextElementSibling.getBoundingClientRect().top - profile.getBoundingClientRect().bottom,
      };
    });
    assert.ok(geometry.profileBeforeBook && geometry.alignedEdges && geometry.alignedProfile);
    assert.ok(geometry.bookBottom < geometry.chipTop);
    if (width === 390) assert.ok(geometry.chipBottom < geometry.recordTop);
    else assert.ok(geometry.bookRight < geometry.recordLeft && geometry.recordTop < geometry.bookBottom);
    if (width === 390) assert.ok(geometry.bookBottom <= 844 && geometry.recordTop < 844);
    assert.equal(geometry.rows, 1);
    assert.equal(geometry.pageWidth, width);
    assert.equal(geometry.actionsBelow, width === 390);
    if (width === 1440) assert.equal(geometry.profileHeight, 56);
    assert.equal(geometry.profileGap, width === 390 ? 12 : 16);
    if (width === 390) {
      assert.ok(geometry.hidden > 0);
    }
    assert.equal(geometry.clipped, false);
    await expect(page.getByRole('link', { name: '자세히 보기', exact: true })).toHaveAttribute('href', '/passports?locale=ko');
    const target = chips.nth(1);
    const name = await target.innerText();
    await target.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-my-passport-book]')).toHaveAccessibleName(`${name} · 자세히 보기`);
    await expect(chips.first()).toHaveText(name);
    await expect(chips.first()).toHaveAttribute('aria-pressed', 'true');
    await expect(chips.first()).toBeFocused();
    await expect(chips.first()).toBeInViewport({ ratio: 0.99 });
    await page.setViewportSize({ width: width === 390 ? 1440 : 390, height: 844 });
    if (width === 390) await expect.poll(() => chips.count()).toBeGreaterThan(geometry.visibleCount);
    else await expect.poll(() => chips.count()).toBeLessThan(geometry.visibleCount);
    assert.deepEqual(errors, []);
    console.log(width, geometry);
    await page.close();
  }
} finally {
  await browser?.close();
  await harness.server.close();
}
