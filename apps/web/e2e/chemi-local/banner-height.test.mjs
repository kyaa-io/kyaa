import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";

// Run against a local web server with CHEMI_TAB=true and APP_ENV=prod.
test("the Chemi banner keeps its frame when filtering the content list", async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
      reducedMotion: "reduce",
    });
    const base = process.env.CHEMI_TEST_URL ?? "http://localhost:3479";
    await page.goto(new URL("/chemi?locale=ko", base).href);

    const home = page.locator('[data-ranked="false"]');
    const artwork = home.locator('[data-content="fortune"]');
    await artwork.waitFor();
    await page.evaluate(() => document.fonts.ready);
    const frame = await artwork.boundingBox();
    assert.ok(frame?.height > 0);

    for (const [label, rows] of [["운세", 4], ["게임", 2], ["전체", 6]]) {
      const chip = home.getByRole("button", { name: label, exact: true });
      await chip.click();
      await home.locator("[data-selected]").nth(rows - 1).waitFor();
      await page.waitForFunction(
        ({ label, rows }) =>
          document.querySelectorAll("[data-ranked=false] [data-selected]").length === rows &&
          [...document.querySelectorAll("[data-ranked=false] button[aria-pressed=true]")]
            .some(button => button.textContent.trim() === label),
        { label, rows },
      );
      assert.deepEqual(await artwork.boundingBox(), frame, label);
    }
  } finally {
    await browser.close();
  }
});
