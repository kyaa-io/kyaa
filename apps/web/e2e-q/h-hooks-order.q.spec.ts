// 2회차 H2-2 재현: 홈 → 모임 3탭 → /passports 순서를 반복하며 React 훅 순서 경고를 모은다.
// 경고는 개발 서버에서만 나온다(production 빌드는 출력하지 않는다). 그래서 Q_DEV=1 일 때만 돈다. 예:
//   kyaa-t3 localdev-port <worktree> 3896
//   Q_DEV=1 Q_MAP_TO=127.0.0.1:3896 Q_STATE=~/.kyaa-dev-test-accounts/dev-fan-3.local3000.json Q_HOOK_RUNS=10 \
//     npx playwright test -c playwright.q.config.ts h-hooks-order --project chromium-390
// 경고가 나면 React 가 넘긴 컴포넌트 이름과 앞뒤 훅 표를 그대로 실패 메시지에 싣는다(2회차 평가 스크립트는 220자에서 잘라 원인을 못 남겼다).
import { test, expect, STATE } from "./q-fixtures";

const GROUP = process.env.Q_HOOK_GROUP || "d2611003-0000-4000-8000-000000000002";
const RUNS = Number(process.env.Q_HOOK_RUNS || 5);

test("H2-2: 홈 → 모임 3탭 → 패스포트 이동을 반복해도 훅 순서 경고가 없다", async ({ browser, baseURL }, info) => {
  test.skip(process.env.Q_DEV !== "1", "훅 순서 경고는 개발 서버에서만 출력된다. Q_DEV=1 과 개발 서버(Q_MAP_TO)로 돌린다.");
  test.setTimeout(RUNS * 90_000);
  const warnings: string[] = [];
  for (let run = 0; run < RUNS; run += 1) {
    const context = await browser.newContext({ viewport: info.project.use.viewport!, baseURL, ...(STATE ? { storageState: STATE } : {}) });
    const page = await context.newPage();
    page.on("console", async (message) => {
      if (!/order of Hooks|Rendered (more|fewer) hooks/.test(message.text())) return;
      const args = await Promise.all(message.args().map((a) => a.jsonValue().catch(() => "?")));
      warnings.push(`run ${run} ${page.url()}\n${args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join("\n")}`);
    });
    await page.goto("/?locale=ko", { waitUntil: "domcontentloaded" }); await page.waitForTimeout(2500);
    for (const tab of [/팬·랭킹/, /^비밀방$/, /^게시판$/]) {
      await page.goto(`/pages/groups/${GROUP}?locale=ko`, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(2500);
      const el = page.locator("main button, main a, main [role=tab]").filter({ hasText: tab }).first();
      if (await el.count()) { await el.click().catch(() => undefined); await page.waitForTimeout(1500); }
    }
    await page.goto("/passports?locale=ko", { waitUntil: "domcontentloaded" }); await page.waitForTimeout(2500);
    await context.close();
  }
  expect(warnings, warnings.join("\n\n")).toEqual([]);
});
