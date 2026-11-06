import { expect, test } from "@playwright/test";
import { FIXED_NOW } from "./fixtures";

// Pixel baselines for the Home, Groups and Deokjil (benefits) tabs at 390 and 1440.
// Regression detection only: the harness is not the deployed app, so harness-only differences are not product defects.
const port = (name: string, fallback: number) => Number(process.env[`SCREEN_BASELINE_${name}_PORT`] ?? fallback);
const HOME = `http://127.0.0.1:${port("HOME", 3191)}`;
const GROUPS = `http://127.0.0.1:${port("GROUPS", 3192)}`;
const BENEFITS = `http://127.0.0.1:${port("BENEFITS", 3193)}`;
const tabs = [
  { name: "home", url: `${HOME}/?locale=ko&auth=off`, ready: "main", fullPage: false },
  { name: "groups", url: `${GROUPS}/pages/groups?locale=ko`, ready: "main", fullPage: false },
  { name: "benefits", url: `${BENEFITS}/benefits?locale=ko`, ready: "#wallet-history", fullPage: true },
] as const;

for (const width of [390, 1440]) {
  for (const tab of tabs) {
    test(`${tab.name} ${width}`, async ({ page }) => {
      await page.clock.install({ time: new Date(FIXED_NOW) });
      await page.setViewportSize({ width, height: 900 });
      await page.goto(tab.url, { waitUntil: "load" });
      await page.locator(tab.ready).first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => [...document.images].every(image => image.complete));
      if (tab.fullPage) {
        // A tall viewport keeps the fixed bottom nav at the page end so it cannot cover the history section.
        const full = await page.evaluate(() => document.documentElement.scrollHeight);
        await page.setViewportSize({ width, height: full });
        await page.waitForFunction(() => [...document.images].every(image => image.complete));
      }
      await page.clock.runFor(1000);
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveScreenshot(`${tab.name}-${width}.png`, { fullPage: tab.fullPage });
    });
  }
}
