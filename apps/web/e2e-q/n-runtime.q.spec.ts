// N2 N12 N19: 실제 화면을 열어서 보는 규칙(390·1440). 규칙 원문: board/reports/doc-261107-2-review-rules.md 2절.
import { test, expect, ROUTES } from "./q-fixtures";
import type { Page } from "@playwright/test";
import { APP_LOCALES, APP_LOCALE_NATIVE_NAMES } from "../i18n/locales";

async function open(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.locator("main").first().waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(1500); // 데이터 도착 뒤 한 번 더 자리 잡도록
}

// 역할 선택자는 scripts/measure-tab-parity.mjs 의 ROLES·TAB_OVERRIDES 와 같다(2026-11-06 확인). 탭마다 다른 선택자만 덮어쓴다.
const ROLE_SELECTORS: Record<string, string[]> = {
  "화면 제목 h1": ["main h1"],
  "구역 제목 h2": ["main h2:not([class*=srOnly]):not([class*=carousel] *)"],
  "강조 버튼": ['[data-fan-action-emphasis="primary"]'],
  "보조 버튼": ["main [data-fan-action]:not([data-fan-action-emphasis])"],
  "탭": ['main [role="tab"]', "main button[aria-pressed]:not([class*=carousel])", "main [class*=tabs] > a", "main button[class*=chip]"],
  "카드 외곽": ["main article", "main li[class*=card]"],
};
const TAB_OVERRIDES: Record<string, Record<string, string[]>> = {
  홈: { "구역 제목 h2": ["main h2[class*=_heading]"], "탭": ["main button[aria-pressed]:not([class*=carousel])"] },
  모임: { "탭": ["main button[class*=chip]"] },
  덕질: { "탭": ["main [class*=tabs] > a"] },
};

async function measure(page: Page, tab: string) {
  const roles = Object.fromEntries(Object.entries(ROLE_SELECTORS).map(([name, base]) => [name, TAB_OVERRIDES[tab]?.[name] ?? base]));
  return page.evaluate((roleMap) => {
    const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    const rgb = (c: string) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = "#000"; ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1); const d = ctx.getImageData(0, 0, 1, 1).data; return `rgb(${d[0]},${d[1]},${d[2]})`; };
    const out: Record<string, string | null> = {};
    for (const [name, selectors] of Object.entries(roleMap)) {
      let el: Element | undefined;
      for (const selector of selectors) { el = [...document.querySelectorAll(selector)].find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }); if (el) break; }
      if (!el) { out[name] = null; continue; }
      const s = getComputedStyle(el);
      out[name] = [s.fontSize, s.fontWeight, s.lineHeight, rgb(s.color), s.borderRadius].join(" | ");
    }
    return out;
  }, roles);
}

test("N2: 홈·모임·덕질에서 같은 역할의 글자 크기·굵기·줄 높이·색·반경이 같다", async ({ page }) => {
  const tabs = { 홈: ROUTES.home, 모임: ROUTES.groups, 덕질: ROUTES.stan };
  const seen: Record<string, Record<string, string | null>> = {};
  for (const [name, url] of Object.entries(tabs)) { await open(page, url); seen[name] = await measure(page, name); }
  const diffs: string[] = [];
  for (const role of Object.keys(ROLE_SELECTORS)) {
    const values = Object.entries(seen).filter(([, m]) => m[role]).map(([tab, m]) => [tab, m[role]] as const);
    if (new Set(values.map(([, v]) => v)).size > 1) diffs.push(`${role}: ${values.map(([t, v]) => `${t}=[${v}]`).join(" vs ")}`);
  }
  expect(diffs, `탭 사이에 다른 역할 값 ${diffs.length}건\n${diffs.join("\n")}`).toEqual([]);
});

test("N12: 홈 탭을 눌러도 위쪽 영역이 1px 넘게 밀리지 않고 레이아웃 이동 합계가 0.02 이하다", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __cls: number }).__cls = 0;
    new PerformanceObserver((list) => { for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value; }).observe({ type: "layout-shift", buffered: true });
  });
  await open(page, ROUTES.home);
  const tabs = page.locator('main [role="tab"], main button[aria-pressed]:not([class*=carousel])').filter({ hasText: /\S/ });
  const count = await tabs.count();
  expect(count, "홈에 누를 수 있는 탭이 없다").toBeGreaterThan(1);
  // 눌러도 변하면 안 되는 것(화면 좌표): 사이트 머리, 화면 제목, 탭 줄 자체의 위쪽 끝. 접속 직후 값 도착으로 생기는 이동은 위 open()에서 가라앉힌다.
  const top = async () => page.evaluate(() => {
    const y = (el: Element | null) => (el ? Math.round(el.getBoundingClientRect().top) : null);
    const tab = document.querySelector('main [role="tab"], main button[aria-pressed]');
    return { header: y(document.querySelector("body > div header, body > header, [data-fan-header]")), h1: y(document.querySelector("main h1")), tabRow: y(tab?.parentElement ?? null) };
  });
  await page.evaluate(() => { (window as unknown as { __cls: number }).__cls = 0; });
  const before = await top();
  for (let i = 0; i < Math.min(count, 4); i += 1) {
    await tabs.nth(i).evaluate((el) => (el as HTMLElement).click()); // 시험이 스스로 스크롤하지 않도록 DOM 클릭을 쓴다. 눌렀을 때 화면이 점프하면 그것이 밀림이다.
    await page.waitForTimeout(600);
    const after = await top();
    for (const k of ["header", "h1", "tabRow"] as const) if (before[k] !== null && after[k] !== null) expect(Math.abs((after[k] as number) - (before[k] as number)), `${k} 밀림`).toBeLessThanOrEqual(1);
  }
  expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBeLessThanOrEqual(0.02);
});

for (const [label, url] of [["홈", ROUTES.home], ["모임", ROUTES.groups], ["덕질", ROUTES.stan], ["순위", ROUTES.rankings]] as const) {
  test(`N19: ${label} 머리에 언어 선택이 하나 있고 12개 언어가 열린다`, async ({ page }) => {
    await open(page, url);
    const sw = page.locator("[data-language-switch], [data-fan-language-action]").filter({ visible: true });
    expect(await sw.count(), "보이는 언어 선택 수").toBe(1);
    await sw.first().click();
    const popup = page.locator('[role="dialog"], [role="listbox"]').filter({ visible: true }).first();
    await expect(popup, "언어 선택을 눌러도 목록이 열리지 않는다").toBeVisible();
    expect(APP_LOCALES.length).toBe(12);
    const text = (await popup.innerText()).replace(/\s+/g, " ");
    const missing = APP_LOCALES.filter((l) => !text.includes(APP_LOCALE_NATIVE_NAMES[l]));
    expect(missing, `열린 목록에 없는 언어 ${missing.join(",")}`).toEqual([]);
  });
}
