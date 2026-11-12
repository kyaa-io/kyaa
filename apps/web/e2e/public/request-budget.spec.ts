import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Request } from "@playwright/test";

/** G5: 비로그인 390에서 load 뒤 8초 동안 상호작용이 없을 때 화면이 만드는 요청 수.
 * 한도는 `request-budget.json`에 있고 내리기만 한다. 시간 값이 아니라 요청 개수만 비교해 러너 속도에 흔들리지 않는다. */
type Budget = { idleWindowMs: number; screens: Record<string, { rsc: number; api: number; total: number }> };
const budget = JSON.parse(readFileSync(path.join(__dirname, "request-budget.json"), "utf8")) as Budget;
const tabIds = ["home", "community", "favorites", "my"] as const;

test.use({ viewport: { width: 390, height: 844 } });

function classify(request: Request): "rsc" | "api" | "other" {
  const url = new URL(request.url());
  if (url.searchParams.has("_rsc") || request.headers()["rsc"] === "1") return "rsc";
  if (url.pathname.startsWith("/api/")) return "api";
  return "other";
}

for (const id of tabIds) {
  test(`idle request budget: ${id}`, async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "요청 계수는 Chromium 한 곳에서 고정한다");
    await page.goto("/", { waitUntil: "load" });
    const href = await page.locator(`a[data-fan-navigation-id="${id}"]`).first().getAttribute("href");
    expect(href, `탭 링크 ${id}`).toBeTruthy();
    if (id !== "home") await page.goto(href!, { waitUntil: "load" });
    const counts = { rsc: 0, api: 0, total: 0 };
    page.on("request", (request) => { counts.total += 1; const kind = classify(request); if (kind !== "other") counts[kind] += 1; });
    await page.waitForTimeout(budget.idleWindowMs);
    const limit = budget.screens[id]!;
    console.log(`request-budget ${id}`, JSON.stringify(counts));
    expect(counts.rsc).toBeLessThanOrEqual(limit.rsc);
    expect(counts.api).toBeLessThanOrEqual(limit.api);
    expect(counts.total).toBeLessThanOrEqual(limit.total);
  });
}
