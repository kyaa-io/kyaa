// Actual product components/styles with synthetic auth/API; no production writes.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createTranslationFixtureServer } from "./server.mjs";
import { translated } from "./fixtures.mjs";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const here = import.meta.dirname, web = path.resolve(here, "../.."), root = path.resolve(web, "../..");
const out = path.join(root, "work/translation-ui");
await mkdir(out, { recursive: true });
const port = 4217;
const server = await createTranslationFixtureServer(port);

let browser;
const evidence = { matrix: [], requests: [], errors: [], axe: [] };
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const preview = await context.newPage();
  await preview.goto(`http://127.0.0.1:${port}/?locale=ru`);
  await expect(preview.locator("article").first().getByText(translated.ru)).toBeVisible();
  await expect(preview.locator("article").first().locator("img").last()).toBeVisible();
  await preview.close();
  const page = await context.newPage();
  page.on("pageerror", error => evidence.errors.push(error.message));
  await page.route("**/api/content-assets/*", route => route.fulfill({ path: path.join(web, "public/images/guest-home", route.request().url().endsWith("1") ? "elina-card.jpg" : "changha-card.jpg"), contentType: "image/jpeg" }));
  let fail = false;
  await page.route(/\/api\/(?:content|display)-translations$/, async route => {
    const input = route.request().postDataJSON(); evidence.requests.push({ ...input, authorized: !!route.request().headers().authorization });
    if (fail) return route.fulfill({ status: 503, json: { error: { code: "TRANSLATION_FAILED" } } });
    const text = translated[input.targetLocale];
    await route.fulfill({ json: input.targetId ? { targetType: input.targetType, targetId: input.targetId, targetLocale: input.targetLocale, translatedText: text, sourceRevision: 1, cached: false }
      : input.texts ? { translatedTexts: input.texts.map(() => text), cached: false } : { translatedText: text, cached: false } });
  });
  for (const width of [390, 1440]) for (const locale of Object.keys(translated)) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`http://127.0.0.1:${port}/?locale=${locale}`);
    const cards = page.locator("article");
    await expect(cards).toHaveCount(3);
    for (const card of await cards.all()) {
      await card.scrollIntoViewIfNeeded();
      const button = card.locator("button[aria-pressed]:not(:has(svg))");
      if (await button.count()) await expect(button).toHaveAttribute("aria-pressed", "true");
    }
    for (const selector of ["#external", "#rich"]) {
      await page.locator(selector).scrollIntoViewIfNeeded();
      const button = page.locator(selector).locator("button[aria-pressed]:not(:has(svg))");
      if (locale !== "ko") await expect(button).toHaveAttribute("aria-pressed", "true");
    }
    await expect(page.locator("#rich img")).toHaveAttribute("src", "/images/guest-home/elina-card.jpg");
    await expect(page.locator("#rich strong")).toBeVisible();
    await expect(page.locator("#rich a")).toHaveAttribute("href", "https://example.com/news");
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    evidence.matrix.push({ width, locale });
    if (["ko", "en", "ru"].includes(locale)) await page.screenshot({ path: path.join(out, `${locale}-${width}.png`), fullPage: true });
    if (locale === "ru") {
      await page.locator("#rich").screenshot({ path: path.join(out, `ru-rich-${width}.png`) });
      await page.locator("#rich button").click();
      await page.locator("#rich").screenshot({ path: path.join(out, `ru-original-${width}.png`) });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(out, `ru-top-${width}.png`) });
    }
  }
  const visibilityStart = evidence.requests.length;
  await page.goto(`http://127.0.0.1:${port}/?locale=en&case=visibility`);
  await expect(page.locator("article").first().locator("button[aria-pressed]:not(:has(svg))")).toHaveAttribute("aria-pressed", "true");
  assert(!evidence.requests.slice(visibilityStart).some(input => input.text === "공연 소식을 여러분과 나눕니다." || input.texts), "offscreen captions and rich document wait for visibility");
  const requestCount = evidence.requests.length;
  await page.locator("article").first().getByRole("button", { name: "Show original" }).click();
  await expect(page.locator("article").first().getByText("엘리나 유튜브 재개!!")).toBeVisible();
  await page.locator("article").first().getByRole("button", { name: "Translate", exact: true }).click();
  assert.equal(evidence.requests.length, requestCount, "original toggle reuses successful results");

  fail = true;
  await page.goto(`http://127.0.0.1:${port}/?locale=ko&case=failure`);
  const english = page.locator("article").nth(1);
  await english.scrollIntoViewIfNeeded(); await expect(english.getByRole("alert")).toBeVisible();
  await expect(english.getByText("We are so excited to see everyone at the concert tonight!")).toBeVisible();
  fail = false;
  const retry = english.getByRole("button", { name: "번역 보기" });
  await retry.focus(); await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab"); await expect(retry).toBeFocused();
  const outline = await retry.evaluate(el => ({ style: getComputedStyle(el).outlineStyle, width: getComputedStyle(el).outlineWidth, height: el.getBoundingClientRect().height }));
  assert.equal(outline.style, "solid"); assert.equal(outline.width, "3px"); assert(outline.height >= 44);
  await retry.press("Enter"); await expect(english.getByRole("button", { name: "원문 보기" })).toHaveAttribute("aria-pressed", "true");
  await english.getByRole("button", { name: "원문 보기" }).click();
  await expect(english.getByText("We are so excited to see everyone at the concert tonight!")).toBeVisible();

  const guestStart = evidence.requests.length;
  await page.goto(`http://127.0.0.1:${port}/?locale=ru&auth=off`);
  await expect(page.locator("article").first().getByText(translated.ru)).toBeVisible();
  assert(evidence.requests.slice(guestStart).every(input => !input.authorized && !input.targetId));
  await page.getByRole("combobox").click(); await page.getByRole("option", { name: "English", exact: true }).click();
  await expect(page).toHaveURL(/locale=en/); await expect(page.locator("html")).toHaveAttribute("lang", "en");
  evidence.axe = (await new AxeBuilder({ page }).analyze()).violations;
  assert.deepEqual(evidence.axe, []); assert.deepEqual(evidence.errors, []);
  await writeFile(path.join(out, "evidence.json"), JSON.stringify(evidence, null, 2));
  console.log(`PASS ${evidence.matrix.length} locale/width checks; automatic visible translation, guest, original/retry, rich media, selector, keyboard, 44px and Axe`);
} finally { await browser?.close(); await server.close(); }
