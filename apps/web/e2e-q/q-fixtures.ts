// 실행 계약 시험 공용: 로그인 상태 확인, 콘솔 오류 수집, SQL 조회.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { test as base, expect, type Page } from "@playwright/test";

export { expect };
export const STATE = process.env.Q_STATE || "";
export const WRITE = process.env.Q_ALLOW_WRITE === "1";

export type Q = { errors: string[] };

export const test = base.extend<{ q: Q }>({
  q: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|Cross-Origin-Opener-Policy/.test(m.text())) errors.push(`console: ${m.text()}`); });
    await use({ errors });
  },
});

/** 로그인 상태가 실제로 유효한지 확인한다. 만료면 null 을 돌려주고 호출한 시험이 건너뛴다(조용히 통과시키지 않고 이유를 남긴다). */
export async function loggedInPage(browser: import("@playwright/test").Browser, viewport: { width: number; height: number }, baseURL: string): Promise<{ page: Page; close: () => Promise<void> } | null> {
  if (!STATE || !existsSync(STATE)) return null;
  const context = await browser.newContext({ storageState: STATE, viewport, baseURL });
  const page = await context.newPage();
  const probe = await page.request.get("/api/me/summary");
  if (probe.status() !== 200) { await context.close(); return null; }
  return { page, close: () => context.close() };
}

export const SKIP_AUTH = "로그인 상태 파일(Q_STATE)이 없거나 만료되어 /api/me/summary 가 200 이 아니다. 로그인 필요 시험을 실행하지 못했다.";

/** 로컬 DB 조회. PGHOST·PGPORT·PGUSER 환경 변수를 쓴다(일회용 로컬 DB 규칙). */
export function sql(query: string): string[][] {
  const out = execFileSync("psql", ["-X", "-d", process.env.PGDATABASE || "byus", "-At", "-F", "\t", "-c", query], { encoding: "utf8", env: { PGHOST: "127.0.0.1", PGPORT: "55433", PGUSER: "localsuper", ...process.env } });
  return out.split("\n").filter(Boolean).map((l) => l.split("\t"));
}

export const ROUTES = {
  home: "/?locale=ko",
  groups: "/pages/groups?locale=ko",
  stan: "/benefits?locale=ko",
  rankings: "/rankings?locale=ko",
  my: "/my?locale=ko",
};
