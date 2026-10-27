import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { startHarness } from "./server.mjs";

const output = path.resolve("test-results/events-layout");
await mkdir(output, { recursive: true });
const harness = await startHarness({ port: 4233 });
const browser = await chromium.launch();
const result = { boundary: "Production EventsCatalogScreen, header/footer and CSS with local public artwork and synthetic data; no production API or identity.", checks: [], resourceFailures: [] };

try {
  for (const locale of ["ko", "en"]) for (const width of [390, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("response", response => {
      if (response.status() >= 400 && ["font", "image", "stylesheet", "script"].includes(response.request().resourceType())) {
        result.resourceFailures.push({ locale, width, status: response.status(), url: response.url() });
      }
    });
    page.on("requestfailed", request => {
      if (["font", "image", "stylesheet", "script"].includes(request.resourceType())) result.resourceFailures.push({ locale, width, error: request.failure()?.errorText, url: request.url() });
    });
    await page.goto(`${harness.baseURL}/events?locale=${locale}`);
    await expect(page.locator("main#events-content > ul > li")).toHaveCount(3);
    for (const image of await page.locator("main#events-content img").all()) {
      await image.scrollIntoViewIfNeeded();
      await image.evaluate(element => element.decode());
    }
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => window.scrollTo(0, 0));

    const measured = await page.evaluate(() => {
      const edges = (selector, content = false) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error(`Missing layout element: ${selector}`);
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          left: box.left + (content ? parseFloat(style.paddingLeft) : 0),
          right: box.right - (content ? parseFloat(style.paddingRight) : 0),
        };
      };
      const main = document.querySelector("main#events-content");
      const section = main.querySelector("[data-fan-section-header]");
      return {
        header: edges("header > div", true),
        main: edges("main#events-content", true),
        list: edges("main#events-content > ul"),
        footer: edges("footer[data-fan-site-footer] > div:first-child", true),
        pagination: edges("main#events-content > nav"),
        sectionGap: section.getBoundingClientRect().top - document.querySelector("header").getBoundingClientRect().bottom,
        overflow: document.documentElement.scrollWidth > window.innerWidth,
      };
    });
    for (const role of ["header", "list", "footer", "pagination"]) {
      for (const edge of ["left", "right"]) assert(Math.abs(measured[role][edge] - measured.main[edge]) <= 1, `${locale}/${width}: ${role} ${edge} must align with main`);
    }
    assert(Math.abs(measured.sectionGap - (width < 768 ? 32 : 64)) <= 1, `${locale}/${width}: header-to-content spacing`);
    assert.equal(measured.overflow, false, `${locale}/${width}: horizontal overflow`);
    assert.deepEqual(errors, []);
    const screenshot = path.join(output, `${locale}-${width}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    result.checks.push({ locale, width, measured, screenshot });
    await page.close();
  }
  await writeFile(path.join(output, "evidence.json"), JSON.stringify(result, null, 2));
  assert.equal(result.resourceFailures.length, 0, `Layout evidence requires loaded resources; see ${path.join(output, "evidence.json")}`);
  console.log(JSON.stringify({ checks: result.checks.length, evidence: path.join(output, "evidence.json") }));
} finally {
  await writeFile(path.join(output, "evidence.json"), JSON.stringify(result, null, 2));
  await browser.close();
  await harness.close();
}
