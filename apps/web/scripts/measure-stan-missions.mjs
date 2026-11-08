// F3 수용 기준 5~8: 덕질 미션 행 높이 64·원 40·오른쪽 열 96/120·기준선 x=64·화살표 0. 사용: node scripts/measure-stan-missions.mjs [base] [state.json]
import { chromium } from "playwright";
const base = process.argv[2] ?? "http://localhost:3127";
const storageState = process.argv[3];
const locales = (process.env.LOCALES ?? "ko,ja,th,ru").split(",");
const widths = (process.env.WIDTHS ?? "390,1024,1440").split(",").map(Number);
const shot = process.env.SHOT_DIR;
const browser = await chromium.launch();
const out = [];
for (const locale of locales) for (const width of widths) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, ...(storageState ? { storageState } : {}) });
  const page = await context.newPage();
  await page.goto(`${base}/benefits?locale=${locale}`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForSelector("[data-missions-today] li[data-mission]", { timeout: 60000 });
  await page.waitForTimeout(500);
  const m = await page.evaluate(() => {
    const card = document.querySelector("[data-fan-missions] > div:nth-of-type(2), [data-fan-missions] [class*=folds]");
    const cardBox = card.getBoundingClientRect();
    const rows = [...document.querySelectorAll('[data-missions-today] a[data-fan-mission-row], button[data-fan-mission-row="fold"]')];
    const r = rows.map(row => {
      const b = row.getBoundingClientRect(), art = row.querySelector("[data-mission-art]"), a = art.getBoundingClientRect(), img = art.firstElementChild?.getBoundingClientRect();
      const title = row.querySelector("[data-mission-title]").getBoundingClientRect(), trail = row.querySelector("[data-mission-trailing]"), t = trail.getBoundingClientRect();
      const detail = row.querySelector("[data-mission-detail]")?.getBoundingClientRect();
      const tc = trail.firstElementChild?.getBoundingClientRect();
      return { key: row.closest("li")?.dataset.mission ?? "fold", h: Math.round(b.height * 10) / 10, art: `${a.width}x${a.height}`, radius: getComputedStyle(art).borderRadius, img: img ? `${img.width}x${img.height}` : null,
        trailW: t.width, titleX: Math.round(title.left - cardBox.left), detailX: detail ? Math.round(detail.left - cardBox.left) : null,
        trailRightGap: Math.round(cardBox.right - t.right), centerDiff: tc && !detail ? Math.round(Math.abs((title.top + title.height / 2) - (tc.top + tc.height / 2))) : null,
        overflow: row.scrollWidth > row.clientWidth };
    });
    return { cardW: cardBox.width, rows: r, arrows: document.querySelectorAll("[data-fan-missions] .lucide-arrow-right").length,
      help: document.querySelectorAll("#benefits-main [aria-label*='?'], [data-help-hint], [data-fan-help-tip]").length,
      pending: document.querySelector("[data-missions-pending]")?.getBoundingClientRect().height ?? null,
      section: document.querySelector("[data-fan-missions]").getBoundingClientRect().height,
      cheerGauge: document.querySelectorAll("#stan-cheer [role=progressbar]").length };
  });
  out.push({ locale, width, ...m });
  if (shot) await page.screenshot({ path: `${shot}/missions-${locale}-${width}.png`, fullPage: true });
  await context.close();
}
await browser.close();
console.log(JSON.stringify(out, null, 1));
