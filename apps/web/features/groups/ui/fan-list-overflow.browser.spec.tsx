import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "@playwright/test";
import { expect, it } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { GroupPersonRow, GroupPersonHearts, GroupPersonTier } from "./group-person-row";
import { FanListMeta } from "./fan-list-meta";
import { fanListCopy } from "./fan-list-copy";
import { fanListTime } from "./fan-list-time";
import styles from "./group-members.module.css";
import tagStyles from "@/components/fan-ui/fan-tag.module.css";

// Render actual row markup with actual CSS modules; no app server, API or private data.
function cssModule(path: string, names: Record<string, string>) {
  return readFileSync(resolve(process.cwd(), path), "utf8").replace(/\.([a-zA-Z_][\w-]*)/g, (match, name: string) => names[name] ? `.${names[name]}` : match);
}
it("at 390px every locale, including the widest label, keeps the entire date visible in a 64px row", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 850 } });
    const globals = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
    const css = globals + cssModule("features/groups/ui/group-members.module.css", styles) + cssModule("components/fan-ui/fan-tag.module.css", tagStyles);
    let document = "";
    await page.route("https://fan-list.test/**", async route => {
      const url = new URL(route.request().url());
      if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: document });
      // Only repository-owned static fonts/images; no external requests.
      if (/^\/(fonts|images)\/[a-zA-Z0-9/_.-]+$/.test(url.pathname) && !url.pathname.includes("..")) {
        try { return await route.fulfill({ path: resolve(process.cwd(), "public", url.pathname.slice(1)) }); } catch { /* unavailable fixture asset */ }
      }
      return route.abort();
    });
    const metrics = [];
    const now = Date.parse("2026-11-10T12:00:00Z");
    // Previous year is longer than this year's label; both must remain wholly visible.
    for (const locale of APP_LOCALES) for (const at of ["2026-11-08T04:47:00Z", "2025-11-08T04:47:00Z"]) {
      const markup = renderToStaticMarkup(<main className={styles.section}><div className={styles.body} data-sorted-fans><ul className={styles.list}>
        <GroupPersonRow nickname={"긴 닉네임 Very Long Fan Name 熱烈ファン ".repeat(4)} avatarUrl={null}
          badge={<GroupPersonTier tier="Gold" locale={locale}/>}
          score={<GroupPersonHearts hearts={12345} locale={locale}/>}
          meta={<FanListMeta locale={locale} hearts={12345} stamps={1234} firstJjinfanAt={at} now={now}/>}/>
      </ul></div></main>);
      document = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><style>${css}\nbody{margin:0;padding:24px;box-sizing:border-box}</style></head><body>${markup}</body></html>`;
      await page.goto("https://fan-list.test/");
      await page.evaluate(() => globalThis.document.fonts.ready);
      const measured = await page.locator("[data-fan-since]").evaluate(element => {
        const label = element.firstElementChild as HTMLElement, date = element.lastElementChild as HTMLElement;
        const row = element.closest("li")!, bounds = element.getBoundingClientRect(), rect = date.getBoundingClientRect();
        const range = globalThis.document.createRange(); range.selectNodeContents(date);
        const text = range.getBoundingClientRect();
        return { labelWidth: label.scrollWidth, dateShrink: getComputedStyle(date).flexShrink, labelEllipsis: getComputedStyle(label).textOverflow,
          date: date.textContent, clipped: text.left < rect.left - 1 || text.right > rect.right + 1 || rect.right > bounds.right + 1 || rect.left < bounds.left - 1,
          overflow: globalThis.document.documentElement.scrollWidth > innerWidth,
          height: row.getBoundingClientRect().height, labelFirst: label.compareDocumentPosition(date) === Node.DOCUMENT_POSITION_FOLLOWING };
      });
      expect(measured.date, locale).toBe(fanListTime(at, locale, now));
      expect(measured.dateShrink, locale).toBe("0");
      expect(measured.labelEllipsis, locale).toBe("ellipsis");
      expect(measured.clipped, locale).toBe(false); expect(measured.overflow, locale).toBe(false);
      expect(measured.labelFirst, locale).toBe(true);
      expect(measured.height, locale).toBeGreaterThanOrEqual(56); expect(measured.height, locale).toBeLessThanOrEqual(64);
      if (process.env.FAN_LIST_OVERFLOW_SCREENSHOT && measured.labelWidth >= Math.max(0, ...metrics.map(m => m.labelWidth))) {
        await page.screenshot({ path: process.env.FAN_LIST_OVERFLOW_SCREENSHOT });
      }
      metrics.push({ locale, label: fanListCopy(locale).since, ...measured });
    }
    const longest = metrics.reduce((a, b) => a.labelWidth >= b.labelWidth ? a : b);
    expect(longest.clipped).toBe(false);
    if (process.env.FAN_LIST_OVERFLOW_SCREENSHOT) writeFileSync(`${process.env.FAN_LIST_OVERFLOW_SCREENSHOT}.json`, JSON.stringify({ width: 390, cases: metrics.length, widestLocale: longest.locale, metrics }, null, 2));
    console.info(`390px overflow: ${metrics.length} cases passed; widest locale=${longest.locale}, label=${longest.label}`);
  } finally { await browser.close(); }
}, 30_000);
