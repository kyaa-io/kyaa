// 실행 계약 시험 공용: 로그인 상태 확인, 콘솔 오류 수집, SQL 조회.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { test as base, expect, type Page } from "@playwright/test";

export { expect };
export const STATE = process.env.Q_STATE || "";
export const WRITE = process.env.Q_ALLOW_WRITE === "1";

export type Q = { errors: string[] };

export const test = base.extend<{ q: Q }>({
  q: async ({ page }, provide) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|Cross-Origin-Opener-Policy/.test(m.text())) errors.push(`console: ${m.text()}`); });
    await provide({ errors });
  },
});

/** 상태 파일에 저장된 Privy 접근 토큰. 앱은 이 값을 Authorization 헤더로 보낸다(쿠키 세션이 아니다). */
export function stateAccessToken(state = STATE): string | null {
  if (!state || !existsSync(state)) return null;
  const parsed = JSON.parse(readFileSync(state, "utf8")) as { origins?: { localStorage?: { name: string; value: string }[] }[] };
  for (const origin of parsed.origins ?? []) for (const item of origin.localStorage ?? []) {
    if (item.name !== "privy:token") continue;
    try { const v = JSON.parse(item.value); return typeof v === "string" ? v : null; } catch { return item.value; }
  }
  return null;
}

/** 로그인 상태가 실제로 유효한지 확인한다. 만료면 null 을 돌려주고 호출한 시험이 건너뛴다(조용히 통과시키지 않고 이유를 남긴다).
 *  확인은 앱과 같은 방식(Authorization: Bearer)으로 한다. 헤더 없이 부르면 유효한 상태도 401 이라 로그인 시험이 모두 건너뛰어졌다(2회차 H2-1). */
export async function loggedInPage(browser: import("@playwright/test").Browser, viewport: { width: number; height: number }, baseURL: string): Promise<{ page: Page; close: () => Promise<void>; api: (url: string) => Promise<{ status: number; json: any }> } | null> {
  const token = stateAccessToken();
  if (!token) return null;
  const context = await browser.newContext({ storageState: STATE, viewport, baseURL });
  const page = await context.newPage();
  const api = async (url: string) => { const r = await page.request.get(mappedUrl(url, baseURL), { headers: { Authorization: `Bearer ${token}` } }); return { status: r.status(), json: await r.json().catch(() => null) }; };
  if ((await api("/api/me/summary")).status !== 200) { await context.close(); return null; }
  return { page, api, close: () => context.close() };
}

/** Q_MAP_TO 를 쓰면 브라우저 연결만 다른 포트로 간다. Node 쪽 요청(page.request)은 그 규칙을 모르니 같은 곳으로 보낸다(Host 는 그대로 두지 않아도 앱은 경로만 본다). */
export function mappedUrl(url: string, baseURL: string): string {
  const mapTo = process.env.Q_MAP_TO;
  const full = new URL(url, baseURL);
  if (!mapTo) return full.href;
  const base = new URL(baseURL);
  if (full.host === base.host) full.host = mapTo;
  return full.href;
}

export const SKIP_AUTH = "로그인 상태 파일(Q_STATE)이 없거나 토큰이 만료되어 Bearer /api/me/summary 가 200 이 아니다(kyaa-t3 local-login 으로 갱신). 로그인 필요 시험을 실행하지 못했다.";

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
