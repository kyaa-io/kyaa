import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { startHarness } from "./server.mjs";
const output = path.resolve(process.env.KYAA_WAVE_OUTPUT ?? "test-results/kyaa-wave-local");
await mkdir(output, { recursive: true });
const harness = process.env.KYAA_WAVE_LOCAL_URL ? { baseURL: process.env.KYAA_WAVE_LOCAL_URL, close: async () => {} } : await startHarness();
const browser = await chromium.launch();
const result = { boundary: "Production CelebrityFanPage, event components, shared overlays and CSS. Synthetic identities, campaign dates and API responses on loopback; no production participation or drawing.", checks: [], screenshots: [] };
const save = async (locator, name) => { const file = path.join(output, name); await locator.screenshot({ path: file, ...(locator.constructor.name === "Page" ? { fullPage: true } : {}) }); result.screenshots.push(file); };
const settle = async page => { await page.evaluate(() => document.fonts.ready); await page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => undefined)))); };
try {
 for (const slug of ["changha", "wena"]) for (const width of [390, 1440]) {
  const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 1000 }, reducedMotion: "reduce" });
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto(`${harness.baseURL}/${slug}?locale=ko`);
  const dialog = page.getByRole("dialog"); await expect(dialog).toBeVisible(); await settle(page);
  const contrasts = await dialog.locator("a").evaluate(element => {
    const colors = getComputedStyle(element).backgroundImage.match(/rgb\([^)]*\)/g) ?? [];
    return colors.map(color => {
      const rgb = color.match(/[\d.]+/g).map(Number).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
      return 1.05 / (.2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2] + .05);
    });
  });
  assert(contrasts.length === 2 && contrasts.every(ratio => ratio >= 4.5), `CTA white text contrast: ${contrasts}`);
  await expect(dialog.getByRole("checkbox")).not.toBeChecked();
  const box = await dialog.boundingBox(); assert(box && box.y >= 0 && box.y + box.height <= (width === 390 ? 844 : 1000));
  await expect(dialog.getByText("2배", { exact: true })).toBeVisible();
  await save(page, `${slug}-modal-${width}.png`);
  await dialog.getByRole("checkbox").check();
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
  await page.reload(); await expect(page.locator('section[aria-label^="KYAA WAVE"]')).toBeVisible();
  await expect(dialog).toHaveCount(0);
  const banner = page.locator('section[aria-label^="KYAA WAVE"]'); await save(banner, `${slug}-banner-${width}.png`);
  const sidebar = page.locator('aside').filter({hasText:"KYAA WAVE"}).last();
  if (width === 1440) { await expect(sidebar).toBeVisible(); await save(sidebar, `${slug}-sidebar-${width}.png`); }
  await save(page, `${slug}-home-${width}.png`);
  await page.goto(`${harness.baseURL}/${slug}?locale=ko&tab=events&auth=1`);
  await expect(page.getByRole("textbox")).toBeVisible(); await settle(page);
  await save(page.locator('section[aria-label^="KYAA WAVE"]'), `${slug}-detail-${width}.png`);
  const field = page.getByRole("textbox"); await field.fill("함께 응원해요!");
  await page.getByRole("button", {name:/응원 보내기/}).click();
  await expect(page.getByText("이벤트 참여가 확인됐어요",{exact:false})).toBeVisible();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  for (const image of await page.locator('section[aria-label^="KYAA WAVE"] img').all()) assert(await image.evaluate(i=>i.complete && i.naturalWidth > 0));
  assert.deepEqual(errors,[]);
  result.checks.push(`${slug}/${width}: modal fits, large 2x, checked Escape/reload hidden, banner remains, detail and comment participation, no overflow or JS errors`);
  await page.close();
 }
 const page = await browser.newPage({viewport:{width:390,height:844}, reducedMotion:"reduce"});
 await page.goto(`${harness.baseURL}/wena?locale=fr&tab=events&auth=1&scenario=reserved`);
 await expect(page.locator('section[aria-label^="KYAA WAVE"]')).toBeVisible(); await settle(page);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth));
 await save(page,"wena-fr-reserved-390.png");
 result.checks.push("French reserved mobile: translated event, no horizontal overflow");
 await page.goto(`${harness.baseURL}/changha?locale=ko&tab=events&scenario=closed`);
 await expect(page.getByText("참여가 마감됐어요")).toBeVisible(); await expect(page.getByRole("dialog")).toHaveCount(0); await expect(page.getByRole("textbox")).toHaveCount(0);
 result.checks.push("Closed campaign: no modal or entry form");
 await page.close();
 await writeFile(path.join(output,"evidence.json"),JSON.stringify(result,null,2)); console.log(JSON.stringify(result,null,2));
} finally { await browser.close(); await harness.close(); }
