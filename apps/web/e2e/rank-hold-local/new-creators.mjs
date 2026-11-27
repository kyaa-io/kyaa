import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const output = process.argv[2];
assert(output, "Pass the directory for the screenshots.");
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const longName = "아주 긴 예시 크리에이터 이름 ".repeat(8).trim();
const periods = { all: "누적", day: "오늘", week: "7일" };
const date = "2026-11-28T00:00:00Z";
try {
  for (const width of [390, 1440]) {
    for (const member of [false, true]) {
      const record = width === 390 && !member;
      const page = await browser.newPage({
        ...(record ? { recordVideo: { dir: output, size: { width: 390, height: 844 } } } : {}),
        viewport: { width, height: width === 390 ? 844 : 900 },
        reducedMotion: "reduce",
      });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      let count = 0;
      await page.route("**/api/**", async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname !== "/api/rankings/home") return route.fulfill({ json: {} });
        assert.equal(Boolean(route.request().headers().authorization), member);
        const creators = url.searchParams.get("kind") === "creators";
        if (creators && count === -1) return route.fulfill({ status: 503, json: {} });
        const rows = Array.from({ length: 10 }, (_, i) => ({
          rank: i + 1, score: 100 - i, delta: null, weekGain: null, dayGain: null, hearts: 10,
          ...(creators
            ? { slug: `sample-${i + 1}`, name: `예시 크리에이터 ${i + 1}`, imageUrl: null, points: null, fans: 0, challenge: false, likes: 100 - i }
            : { nickname: `예시 팬 ${i + 1}`, characterId: "star-pink", tier: null, isMe: false, favorite: null, points: 100 - i, tickets: 0 }),
        }));
        if (creators) assert.equal(url.searchParams.get("includeNew"), "1");
        await route.fulfill({ json: {
          state: "ready", day: date.slice(0, 10), computedAt: date, fetchedAt: date,
          comparable: true, weekGainDays: null, period: "day", me: null, metric: creators ? "likes" : "points", rows,
          ...(creators ? { newCreators: Array.from({ length: count }, (_, i) => ({
            slug: `new-sample-${i + 1}`, imageUrl: i === 0 ? "/chemi/fortune/avatar-elina-v1.jpg" : null, name: i === 0 ? longName : "예시 크리에이터",
          })) } : {}),
        } });
      });
      for (count = 0; count <= 2; count++) {
        await page.goto(`http://localhost:5199/?newCreators&auth=${member ? "on" : "off"}`);
        if (width === 390) await page.getByRole("button", { name: "크리에이터", exact: true }).click();
        for (const [period, label] of Object.entries(periods)) {
          const response = period === "all" ? null : page.waitForResponse((res) => {
            const query = new URL(res.url()).searchParams;
            return query.get("kind") === "creators" && (query.get("period") ?? "all") === period;
          });
          if (period !== "all") {
            await page.getByRole("button", { name: label, exact: true }).click();
            await response;
          }
          await expect(page.locator('[data-row="creator-rank"]')).toHaveCount(10 - count);
          const intro = page.getByRole("region", { name: "새 크리에이터" });
          await expect(intro.getByRole("link")).toHaveCount(count);
          if (count === 0) await expect(intro).toHaveCount(0);
          if (count > 0) {
            const link = intro.getByRole("link", { name: longName });
            await expect(link).toHaveAttribute("href", /new-sample-1/);
            const box = await link.boundingBox();
            const ranked = await page.locator('[data-row="creator-rank"]').last().boundingBox();
            assert(box.height >= 44 && box.height === ranked.height);
            assert(Math.abs(box.x - ranked.x) < 1 && Math.abs(box.width - ranked.width) < 1);
            assert(await link.evaluate((element) => {
              const name = element.querySelector("[title]");
              return element.getAnimations({ subtree: true }).length === 0 && name.scrollWidth > name.clientWidth;
            }));
            await page.locator('[data-row="creator-rank"]').last().getByRole("button").first().focus();
            await page.keyboard.press("Tab");
            await expect(link).toBeFocused();
            assert(await link.evaluate((element) => getComputedStyle(element).outlineStyle === "solid"));
            await expect.poll(() => link.locator("img").evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
            if (count === 2) await expect(intro.getByRole("link").last().locator("[data-creator-avatar] svg")).toBeVisible();
          }
          if (period === "all" && !member) {
            await page.evaluate(() => document.activeElement?.blur());
            await page.screenshot({ fullPage: true, path: `${output}/${width}-${count}.png` });
          }
        }
      }
      if (!member) {
        count = 2;
        await page.goto("http://localhost:5199/?newCreators&auth=off&locale=ru");
        if (width === 390) await page.getByRole("button", { name: "Авторы", exact: true }).click();
        await expect(page.getByRole("heading", { name: "Новые авторы" })).toBeVisible();
        assert(await page.locator("[data-home-ranking]").evaluate((card) => card.scrollWidth === card.clientWidth));
        await page.screenshot({ path: `${output}/${width}-ru.png` });

        count = -1;
        await page.goto("http://localhost:5199/?newCreators&auth=off");
        if (width === 390) await page.getByRole("button", { name: "크리에이터", exact: true }).click();
        await expect(page.getByRole("button", { name: "다시 시도", exact: true })).toBeVisible();
        await expect(page.getByRole("region", { name: "새 크리에이터" })).toHaveCount(0);
        await page.screenshot({ path: `${output}/${width}-error.png` });
      }
      assert.deepEqual(errors, []);
      const video = page.video();
      await page.close();
      if (video) await video.saveAs(`${output}/interaction.webm`);
    }
  }
  console.log("PASS: 36 browser combinations; touch area, keyboard, long name and reduced motion");
} finally {
  await browser.close();
}
