import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { startHarness } from "./server.mjs";
const output = path.resolve(process.env.WAVE_STAGE_OUTPUT ?? "work/wave-stage-ui");
await mkdir(output, { recursive: true });
const harness = process.env.WAVE_STAGE_LOCAL_URL ? { baseURL: process.env.WAVE_STAGE_LOCAL_URL, close: async () => {} } : await startHarness();
const browser = await chromium.launch();
const evidence = { boundary: "Loopback fixture; production presentation, authentication hook and player code with synthetic metrics and winners. Portrait poster is the existing approved source, not a live stream.", checks: [], screenshots: [] };
try {
  for (const locale of ["ko", "en"]) for (const [width, height] of [[1920, 1080], [1440, 810], [390, 844]]) for (const scenario of ["dashboard", "long"]) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
    const page = await context.newPage();
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${harness.baseURL}/?mode=presentation&locale=${locale}&scenario=${scenario}`);
    await expect(page.locator("main")).toBeVisible(); await page.evaluate(() => document.fonts.ready);
    if (scenario === "long") await expect(page.locator("ol li")).toHaveCount(30);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: horizontal overflow`);
    if (width > 1000) {
      const bounds = await page.locator("main").evaluate(main => ({ scroll: main.scrollHeight, client: main.clientHeight }));
      assert(bounds.scroll <= bounds.client + 1, `${locale}/${width}/${scenario}: stage scrolls ${JSON.stringify(bounds)}`);
      const controls = await page.locator("section[aria-label] > footer").boundingBox();
      for (const name of await page.locator("ol li").all()) {
        const box = await name.boundingBox(); assert(box && box.y >= 0 && box.y + box.height <= (controls?.y ?? height) - 8, `Winner outside stage or overlapping controls: ${JSON.stringify(box)}`);
      }
    }
    const file = path.join(output, `${locale}-${scenario}-${width}.png`);
    await page.screenshot({ path: file, fullPage: width < 1000 }); evidence.screenshots.push(file);
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    assert.deepEqual(axe.violations.map(v => ({ id: v.id, count: v.nodes.length })), [], `${locale}/${width}/${scenario}: accessibility`);
    assert.deepEqual(errors, []);
    evidence.checks.push(`${locale}/${width}x${height}/${scenario}: no overflow or runtime errors, all winners fit, WCAG A/AA`);
    await context.close();
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 810 }, reducedMotion: "reduce" });
  await page.goto(`${harness.baseURL}/?scenario=busy&run=${Date.now()}`);
  const trigger = page.getByRole("button", { name: "응모 마감 · 전체 추첨" }); await expect(trigger).toBeEnabled(); await trigger.click();
  const dialog = page.getByRole("dialog"); await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "취소" })).toBeFocused();
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
  await trigger.click(); await dialog.getByRole("checkbox").check(); await dialog.getByRole("button", { name: "마감하고 추첨 · 동시 공개" }).click();
  await expect(dialog.getByRole("button", { name: "추첨 결과를 확인하는 중…" })).toBeDisabled();
  await page.keyboard.press("Escape"); await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCount(0, { timeout: 8000 }); await expect(page.locator("ol li")).toHaveCount(30);
  evidence.checks.push("Confirmation: initial focus, Escape/focus return, explicit consent, processing prevents closing and duplicate submission, 30 simultaneous results");
  await page.goto(`${harness.baseURL}/?scenario=retry&run=${Date.now()}`); await page.getByRole("button", { name: "응모 마감 · 전체 추첨" }).click(); await page.getByRole("checkbox").check(); await page.getByRole("button", { name: "마감하고 추첨 · 동시 공개" }).click();
  await expect(page.locator("ol li")).toHaveCount(30); evidence.checks.push("Lost POST result: automatic GET recovers persisted draw and shows every winner");
  for (const scenario of ["empty", "conflict"]) { await page.goto(`${harness.baseURL}/?scenario=${scenario}`); await expect(page.getByRole("button", { name: "응모 마감 · 전체 추첨" })).toBeDisabled(); }
  await page.goto(`${harness.baseURL}/?role=viewer`); await expect(page.getByText(/읽기 전용/)).toBeVisible(); await expect(page.getByRole("button", { name: "응모 마감 · 전체 추첨" })).toHaveCount(0);
  await page.goto(`${harness.baseURL}/?scenario=chain-error`); await expect(page.getByRole("button", { name: "응모 마감 · 전체 추첨" })).toBeEnabled(); await expect(page.getByText("—", { exact: true })).toHaveCount(4);
  evidence.checks.push("Zero entrants/conflict blocked; viewer has no draw control; unavailable chain shows — and does not block draw");
  await page.getByRole("button", { name: "전체 화면", exact: true }).click(); await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true); await page.getByRole("button", { name: "전체 화면 종료", exact: true }).click(); await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
  evidence.checks.push("Actual Fullscreen API enters and exits");
  await page.close();
  await writeFile(path.join(output, "evidence.json"), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ checks: evidence.checks, screenshotCount: evidence.screenshots.length, output }, null, 2));
} finally { await browser.close(); await harness.close(); }
