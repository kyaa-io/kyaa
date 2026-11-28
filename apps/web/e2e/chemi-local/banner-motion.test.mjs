import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";

// Run against a local web server with CHEMI_TAB=true.
test("Chemi banner keeps video visible through hover, pause and reduced motion", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const base = process.env.CHEMI_TEST_URL ?? "http://localhost:3479";
    await page.goto(new URL("/chemi?locale=ko", base).href);
    const frame = page.locator("[data-content]:has(video)");
    const video = frame.locator("video");
    const tarot = page.getByRole("button", { name: "오늘의 타로", exact: true });
    await tarot.click();
    await page.waitForFunction(() => document.querySelector("[data-content] video")?.currentTime > 0.1);
    const slide = await frame.getAttribute("data-content");

    await frame.hover();
    const time = await video.evaluate(element => element.currentTime);
    await page.waitForFunction(start => {
      const element = document.querySelector("[data-content] video");
      return element && !element.paused && element.currentTime !== start && getComputedStyle(element).opacity === "1";
    }, time, { timeout: 2000 });
    await page.waitForTimeout(6100);
    assert.equal(await frame.getAttribute("data-content"), slide);

    await frame.locator("..").getByRole("button", { name: /일시\s?정지/ }).click();
    await page.waitForFunction(() => document.querySelector("[data-content] video")?.paused);
    assert.equal(await video.evaluate(element => getComputedStyle(element).opacity), "1");

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await tarot.click();
    await page.waitForFunction(() => {
      const element = document.querySelector("[data-content] video");
      return element?.paused && element.readyState >= 2 && getComputedStyle(element).opacity === "1";
    });
    assert.equal(await video.evaluate(element => element.currentTime), 0);
  } finally {
    await browser.close();
  }
});
