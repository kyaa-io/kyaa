import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "@playwright/test";
import { expect, it } from "vitest";
import { EarnBadge } from "./earn-badge";
import { ProofMethods } from "@/features/passport-proofs/ui/proofs-tab";
import { SUBMITTABLE_PROOF_TYPES } from "@/features/passport/domain/proof-types";
import { GroupPersonHearts, GroupPersonRow } from "@/features/groups/ui/group-person-row";
import earnStyles from "./dukjil.module.css";
import pillStyles from "@/components/fan-ui/earn-corner.module.css";
import proofStyles from "@/features/passport-proofs/ui/proofs-tab.module.css";
import memberStyles from "@/features/groups/ui/group-members.module.css";

// 포인트·보상 표시 원칙: 세로로 반복되는 행에서 아이콘(코인·하트)의 왼쪽 선은 숫자가 달라도 같다.
// 포인트는 폭이 고정된 알약(60, +999까지)이라 알약의 오른쪽 끝도 줄마다 같다(출석 팝업의 보상 줄과 `오늘 출석 완료` 줄 포함).
// 실제 CSS 모듈과 실제 부품 마크업을 그리고, 앱 서버·API·개인 데이터는 쓰지 않는다(합성 값).
function cssModule(path: string, names: Record<string, string>) {
  return readFileSync(resolve(process.cwd(), path), "utf8").replace(/\.([a-zA-Z_][\w-]*)/g, (match, name: string) => names[name] ? `.${names[name]}` : match);
}
const css = () => readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8")
  + cssModule("features/dukjil/ui/dukjil.module.css", earnStyles)
  + cssModule("components/fan-ui/earn-corner.module.css", pillStyles)
  + cssModule("features/passport-proofs/ui/proofs-tab.module.css", proofStyles)
  + cssModule("features/groups/ui/group-members.module.css", memberStyles);

it.each([390, 1440])("at %ipx the coin and heart of every row share one left line", async (width) => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height: 1100 } });
    let document = "";
    await page.route("https://point-slot.test/**", async route => {
      const url = new URL(route.request().url());
      if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: document });
      if (/^\/(fonts|images)\/[a-zA-Z0-9/_.-]+$/.test(url.pathname) && !url.pathname.includes("..")) {
        try { return await route.fulfill({ path: resolve(process.cwd(), "public", url.pathname.slice(1)) }); } catch { /* unavailable fixture asset */ }
      }
      return route.abort();
    });
    const types = [...SUBMITTABLE_PROOF_TYPES].slice(0, 4);
    const amounts = [2, 20, 100, 200];
    const markup = renderToStaticMarkup(<main data-sandbox="">
      <section data-case="attendance" className={earnStyles.checkin}><div className={earnStyles.checkinBox}><dl className={earnStyles.checkinRewards}>
        <div><dt>매일 출석</dt><dd><EarnBadge variant="inline" locale="ko" points={2} slot /></dd></div>
        <div><dt>7일 연속 보너스</dt><dd><EarnBadge variant="inline" locale="ko" points={20} slot /></dd></div>
      </dl></div><p className={earnStyles.checkinDone}><span>오늘 출석 완료</span><EarnBadge variant="inline" locale="ko" points={2} slot /></p></section>
      <section data-case="proofs"><ProofMethods locale="ko" slug="demo" types={types} pointsOf={(type) => amounts[types.indexOf(type)]} /></section>
      <section data-case="members"><ul className={memberStyles.list}>{[7, 120, 1234, 12345].map((hearts) => <GroupPersonRow key={hearts} nickname={`팬 ${hearts}`} avatarUrl={null} score={<GroupPersonHearts hearts={hearts} locale="ko" />} />)}</ul></section>
    </main>);
    document = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${css()}\nbody{margin:0}[data-sandbox]{display:grid;gap:24px;padding:16px}</style></head><body>${markup}</body></html>`;
    await page.goto("https://point-slot.test/");
    await page.evaluate(() => globalThis.document.fonts.ready);
    const lines = await page.evaluate(() => {
      // 줄의 왼쪽 끝에서 아이콘까지의 거리(1440에서 모임 목록은 2열이라 줄 기준으로 잰다).
      const left = (selector: string, row: string) => [...globalThis.document.querySelectorAll(selector)].map((el) => Math.round((el.getBoundingClientRect().left - el.closest(row)!.getBoundingClientRect().left) * 10) / 10);
      return {
        attendance: left('[data-case="attendance"] [data-earn-badge="inline"] img', "section"),
        attendanceRight: [...globalThis.document.querySelectorAll('[data-case="attendance"] [data-point-pill]')].map((el) => Math.round(el.getBoundingClientRect().right * 10) / 10),
        centers: [...globalThis.document.querySelectorAll("[data-point-pill]")].map((el) => { const coin = el.querySelector("img")!.getBoundingClientRect(), text = el.querySelector("[data-point-value]")!.getBoundingClientRect(); return Math.abs((coin.top + coin.height / 2) - (text.top + text.height / 2)); }),
        proofs: left('[data-case="proofs"] [data-earn-badge="inline"] img', "li"),
        members: left('[data-case="members"] img[data-reward-kind="heart"]', "li"),
        overflow: globalThis.document.documentElement.scrollWidth > innerWidth,
      };
    });
    expect(lines.attendance).toHaveLength(3);
    expect(new Set(lines.attendanceRight).size, `right ${lines.attendanceRight.join(",")}`).toBe(1);
    expect(Math.max(...lines.centers)).toBeLessThanOrEqual(0.5);
    expect(lines.proofs.length).toBeGreaterThan(1);
    expect(lines.members).toHaveLength(4);
    for (const key of ["attendance", "proofs", "members"] as const) expect(new Set(lines[key]).size, `${key} ${lines[key].join(",")}`).toBe(1);
    expect(lines.overflow).toBe(false);
    if (process.env.POINT_SLOT_SHOTS) { mkdirSync(process.env.POINT_SLOT_SHOTS, { recursive: true }); await page.screenshot({ path: `${process.env.POINT_SLOT_SHOTS}/point-slot-${width}.png`, fullPage: true }); }
  } finally { await browser.close(); }
});
