import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { startHarness } from "./server.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const localeSource = await readFile(path.resolve(here, "../../i18n/locales.ts"), "utf8");
const locales = JSON.parse(localeSource.match(/APP_LOCALES = (\[[^;]+\]) as const/)[1]);
const output = path.resolve(process.env.BANNER_EVIDENCE_DIR ?? "test-results/banner-welcome");
await mkdir(output, { recursive: true });
const harness = process.env.BANNER_LOCAL_URL ? { baseURL: process.env.BANNER_LOCAL_URL, close: async () => {} } : await startHarness();
const browser = await chromium.launch();
const checks = [];
try {
  const matrix = locales.flatMap(locale => [390, 1440].map(width => ({ locale, width })));
  for (const locale of ["ko", "ja", "vi", "th"]) for (const width of [360, 768]) matrix.push({ locale, width });
  for (const width of [1024, 1199, 1200]) matrix.push({ locale: "en", width });
  for (const { locale, width } of matrix) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${harness.baseURL}/?scenario=welcome&locale=${locale}`);
    const banner = page.locator('[data-kind="welcome"]');
    await expect(banner).toBeVisible();
    await banner.locator("img").evaluate(image => image.decode());
    await page.evaluate(() => document.fonts.ready);
    const compact = width < 768 || (width >= 1024 && width < 1200);
    const metrics = await banner.evaluate(element => {
      const copy = element.querySelector("h2").parentElement;
      const boxes = [...copy.children].map(child => {
        const r = child.getBoundingClientRect();
        return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, height: r.height, scroll: child.scrollWidth, width: child.clientWidth };
      });
      const r = element.getBoundingClientRect();
      const image = element.querySelector("img");
      return { boxes, frame: { x: r.x, y: r.y, bottom: r.bottom, right: r.right }, image: { src: image.currentSrc, width: image.naturalWidth, height: image.naturalHeight } };
    });
    const [eyebrow, title, description, action] = metrics.boxes;
    assert(Math.abs(title.y - eyebrow.bottom - 16) < 1, `${locale}/${width}: category separation`);
    assert(Math.abs(description.y - title.bottom - (compact ? 8 : 12)) < 1, `${locale}/${width}: title/description group`);
    assert(Math.abs(action.y - description.bottom - (compact ? 24 : 32)) < 1, `${locale}/${width}: action separation`);
    for (const box of metrics.boxes) {
      assert(box.y >= metrics.frame.y && box.bottom <= metrics.frame.bottom + 1, `${locale}/${width}: vertical clipping`);
      assert(box.scroll <= box.width + 1, `${locale}/${width}: text overflow`);
    }
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${locale}/${width}: page overflow`);
    const slogan = page.locator("#live-heading span span");
    const sloganStyle = await slogan.evaluate(el => ({ size: getComputedStyle(el).fontSize, rect: el.getBoundingClientRect().toJSON() }));
    assert.equal(sloganStyle.size, "13px");
    if (width >= 390) {
      const titleRect = await page.locator("#live-heading").boundingBox();
      assert(sloganStyle.rect.x > titleRect.x + 40 && sloganStyle.rect.y < titleRect.y + 20, `${locale}/${width}: inline slogan`);
    }
    const cta = banner.getByRole("link");
    await expect(cta).toHaveAttribute("href", `/wena?locale=${locale}`);
    const target = await cta.boundingBox();
    assert(target.height >= 44 && target.width >= 44);
    await cta.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(cta).toBeFocused();
    assert.equal(await cta.evaluate(el => getComputedStyle(el).outlineStyle), "solid");
    const hidden = page.locator('article[aria-hidden="true"]');
    await expect(hidden).toHaveAttribute("inert", "");
    assert.deepEqual(errors, []);
    if (locale === "ko" && [390, 1440].includes(width)) {
      const accessibility = await new AxeBuilder({ page }).include('[data-kind="welcome"]').include('#live-heading').analyze();
      assert.deepEqual(accessibility.violations, [], `${width}: banner and brand accessibility`);
    }
    await cta.blur();
    const top = await page.locator('#live-heading').boundingBox();
    const frame = await banner.boundingBox();
    const screenshot = path.join(output, `${locale}-${width}.png`);
    await page.screenshot({ path: screenshot, clip: { x: frame.x, y: top.y - 12, width: frame.width, height: frame.y + frame.height - top.y + 56 } });
    checks.push({ locale, width, ...metrics, screenshot });
    await context.close();
  }
  await writeFile(path.join(output, "evidence.json"), JSON.stringify({ boundary: "Real GuestHome and welcome banner/CSS; public We;Na assets and local fixture copy, no production identity or writes. Other home sections are not certified by this banner review.", checks }, null, 2));
  console.log(`PASS: ${checks.length} viewport/locale cases; grouped spacing, inline slogan, unclipped content, 44px CTA, keyboard focus, inert slides, localized links, no runtime errors.`);
} finally { await browser.close(); await harness.close(); }
