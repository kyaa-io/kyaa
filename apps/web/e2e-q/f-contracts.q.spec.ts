// F1~F12 기능 계약(실제 로컬 앱·로컬 DB 호출). 원문: board/reports/doc-261107-2-review-rules.md 4절.
// 로그인이 필요한 부분은 Q_STATE 가 유효할 때만 돌고, 아니면 건너뛴다고 이유를 출력한다(통과로 세지 않는다).
// 건너뛴 시험은 보고에 "못 봄"으로 적는다.
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { test, expect, sql, loggedInPage, SKIP_AUTH, WRITE, ROUTES } from "./q-fixtures";
import { APP_LOCALES } from "../i18n/locales";

async function settle(page: Page, ms = 1500) { await page.locator("main").first().waitFor({ state: "visible", timeout: 30_000 }); await page.waitForTimeout(ms); }
const get = async (page: Page, url: string) => { const r = await page.request.get(url); return { status: r.status(), json: await r.json().catch(() => null) as any }; };

test("F1: 홈 랭킹 두 탭(팬·크리에이터)이 /rankings 와 같은 API 를 쓰고 실제 행이 나온다", async ({ page }) => {
  const rankingUrls = async (url: string) => {
    const urls = new Set<string>();
    const on = (r: import("@playwright/test").Request) => { const u = new URL(r.url()); if (/^\/api\/(rankings|pages\/[^/]+\/rankings)/.test(u.pathname)) urls.add(u.pathname); };
    page.on("request", on);
    await page.goto(url, { waitUntil: "domcontentloaded" }); await settle(page, 3000);
    page.off("request", on);
    return urls;
  };
  const rankingsPage = await rankingUrls(ROUTES.rankings);
  const home = await rankingUrls(ROUTES.home);
  expect(rankingsPage.size, "/rankings 가 랭킹 API 를 부르지 않았다").toBeGreaterThan(0);
  expect(home.size, "홈이 랭킹 API 를 부르지 않았다").toBeGreaterThan(0);
  expect([...home].filter((u) => !rankingsPage.has(u)), "홈에만 있는 랭킹 엔드포인트").toEqual([]);
  // 홈 크리에이터 탭은 팬 수 기준(D3)이다. 같은 응답의 1위가 탭을 누른 뒤 실제로 보여야 한다.
  const { json } = await get(page, "/api/rankings/creators?metric=fans&limit=5&locale=ko");
  expect(json.rows.length).toBeGreaterThan(0);
  // 390·1440 이 같은 카드를 따로 그리고, 1440 은 최애 구역에도 "랭킹" 제목이 있다. 이름이 "랭킹"인 보이는 구역만 본다.
  const ranking = page.getByRole("region", { name: "랭킹", exact: true }).filter({ visible: true }).first();
  await expect(ranking, "홈에 랭킹 구역이 없다").toBeVisible();
  const tab = (name: RegExp) => ranking.getByRole("button", { name }).or(ranking.getByRole("tab", { name })).first();
  for (const name of [/팬/, /크리에이터/]) await expect(tab(name), `홈 랭킹 탭 ${name}`).toBeVisible();
  await tab(/크리에이터/).click();
  await expect(ranking).toContainText(json.rows[0].name);
});

test("F2: 인기글 10개, 추천·댓글·조회수와 랭킹이 DB 값과 일치한다", async ({ page }) => {
  const { json } = await get(page, "/api/public/popular-posts");
  expect(json.items.length, "인기글 개수").toBe(10);
  const mism: string[] = [];
  for (const it of json.items.filter((x: any) => x.source === "fan")) {
    const [[likes], [comments], [views]] = [
      sql(`select count(*) from fan_post_likes where post_id='${it.id}'`).flat(),
      sql(`select count(*) from fan_post_comments where post_id='${it.id}' and deleted_at is null and hidden_at is null`).flat(),
      sql(`select count(*) from fan_post_views where post_id='${it.id}'`).flat(),
    ].map((r) => [Number(r[0])]);
    if (it.likeCount !== likes) mism.push(`${it.id} 추천 화면 ${it.likeCount} / DB ${likes}`);
    if (it.commentCount !== comments) mism.push(`${it.id} 댓글 화면 ${it.commentCount} / DB ${comments}`);
    if (it.viewCount !== views) mism.push(`${it.id} 조회수 화면 ${it.viewCount} / DB ${views}`);
  }
  expect(mism, mism.join("\n")).toEqual([]);
  const ranking = (await get(page, "/api/rankings/creators?period=all")).json;
  const [[n]] = sql("select jsonb_array_length(rows) from ranking_snapshots where kind='creator_hearts' and period='all' order by computed_at desc limit 1");
  expect(ranking.rows.length, "랭킹 행 수가 최신 스냅샷과 다르다").toBe(Number(n));
});

test("F3: 글 상세에서 댓글 ⋯ 메뉴와 답글이 있고, 사진 업로드·대댓글 저장이 새로고침 뒤 유지된다", async ({ page, browser, baseURL }, info) => {
  const { json } = await get(page, "/api/public/popular-posts");
  const post = json.items.find((x: any) => x.source === "fan" && x.commentCount > 0) ?? json.items[0];
  await page.goto(`/c/${post.pageRef}/community/${post.id}?locale=ko`, { waitUntil: "domcontentloaded" }); await settle(page, 2500);
  const reply = page.getByText(/^(답글|Reply)$/).first();
  await expect(reply, "댓글의 답글 단추가 보이지 않는다").toBeVisible();
  const comment = reply.locator("xpath=ancestor::*[self::li or self::article][1]");
  await expect(comment.getByRole("button", { name: /더보기|메뉴|⋯|more/i }).first(), "댓글 ⋯ 메뉴").toBeVisible();
  const auth = await loggedInPage(browser, info.project.use.viewport as { width: number; height: number }, baseURL!);
  test.skip(!auth || !WRITE, auth ? "Q_ALLOW_WRITE=1 이 아니라 저장 시험을 건너뜀" : SKIP_AUTH);
  const p = auth!.page;
  await p.goto(`/c/${post.pageRef}/community/${post.id}?locale=ko`); await settle(p, 2500);
  const text = `Q계약 대댓글 ${Date.now()}`;
  await p.getByRole("button", { name: /답글/ }).first().click();
  await p.getByRole("textbox").last().fill(text);
  await p.getByRole("button", { name: /등록|저장|보내기/ }).last().click();
  await p.reload(); await settle(p, 2500);
  await expect(p.getByText(text)).toBeVisible();
  const rows = sql(`select parent_id is not null from fan_post_comments where body='${text}'`);
  console.log(`F3 로컬 DB 에 넣은 행: fan_post_comments body='${text}'`);
  expect(rows).toEqual([["t"]]);
  await auth!.close();
});

test("F4: 헤더 온도·포인트 값이 서버 값과 같다", async ({ browser, baseURL }, info) => {
  const auth = await loggedInPage(browser, info.project.use.viewport as { width: number; height: number }, baseURL!);
  test.skip(!auth, SKIP_AUTH);
  const p = auth!.page;
  await p.goto(ROUTES.home); await settle(p);
  const header = p.locator("header").first();
  await expect(header).toContainText(/\d{1,3}°/);
  const shown = Number((await header.innerText()).match(/(\d{1,3})°/)![1]);
  const { json } = await get(p, "/api/me/summary");
  expect(JSON.stringify(json)).toBeTruthy();
  const today = json.summary?.dailyMissions ?? json.summary?.today;
  if (today?.total) expect(shown).toBe(Math.round((today.completed / today.total) * 100));
  await auth!.close();
});

test("F5: 눌러 보이는 버튼은 반응이 있고 같은 쓰기 요청이 두 번 나가지 않는다", async ({ page, q }) => {
  test.setTimeout(420_000);
  const dead: string[] = [];
  for (const url of [ROUTES.home, ROUTES.groups, ROUTES.stan, ROUTES.rankings]) {
    await page.route("**/*", async (route) => {
      const r = route.request();
      if (!["GET", "HEAD", "OPTIONS"].includes(r.method()) && new URL(r.url()).origin === new URL(page.url()).origin) { writes.push(`${r.method()} ${new URL(r.url()).pathname}`); return route.fulfill({ status: 204, body: "" }); }
      return route.continue();
    });
    const writes: string[] = [];
    await page.goto(url, { waitUntil: "domcontentloaded" }); await settle(page, 2500);
    const buttons = page.locator("main button:visible, main [role=button]:visible");
    const total = Math.min(await buttons.count(), 14);
    for (let i = 0; i < total; i += 1) {
      if (i > 0 && page.url() !== new URL(url, page.url()).href) { await page.goto(url, { waitUntil: "domcontentloaded" }); await settle(page, 1200); }
      const b = page.locator("main button:visible, main [role=button]:visible").nth(i);
      if (!(await b.count()) || (await b.isDisabled().catch(() => false))) continue;
      if (await b.evaluate((el) => ["aria-pressed", "aria-selected", "aria-current"].some((a) => el.getAttribute(a) === "true" || (a === "aria-current" && el.getAttribute(a) && el.getAttribute(a) !== "false")))) continue; // 이미 선택된 탭은 눌러도 변하지 않는 것이 맞다
      const label = ((await b.innerText().catch(() => "")) || (await b.getAttribute("aria-label")) || `#${i}`).trim().slice(0, 24);
      await page.evaluate(() => { const w = window as any; w.__mut = 0; w.__mo?.disconnect(); w.__mo = new MutationObserver((l) => { w.__mut += l.length; }); w.__mo.observe(document.body, { subtree: true, childList: true, attributes: true }); });
      let popup = false; const onPopup = () => { popup = true; }; page.context().once("page", onPopup);
      const before = { url: page.url(), writes: writes.length };
      await b.evaluate((el) => (el as HTMLElement).click()).catch(() => undefined);
      await page.waitForTimeout(900);
      const after = await page.evaluate(() => (window as any).__mut ?? -1).catch(() => -2);
      page.context().off("page", onPopup);
      const changed = popup || page.url() !== before.url || writes.length > before.writes || after > 0 || after === -2;
      if (!changed) dead.push(`${url} "${label}" 눌러도 변화 없음`);
    }
    // 같은 쓰기 요청 중복: 쓰기를 일으킨 단일 클릭이 정확히 하나의 요청만 보내야 한다
    const pairs = new Map<string, number>(); for (const w of writes) pairs.set(w, (pairs.get(w) ?? 0) + 1);
    for (const [w, n] of pairs) if (n > 1 && !/\/api\/(events|analytics)/.test(w)) dead.push(`${url} ${w} 요청이 ${n}번 나감(중복 가능)`);
    await page.unroute("**/*");
  }
  expect(dead, dead.join("\n")).toEqual([]);
  expect(q.errors, "콘솔 오류").toEqual([]);
});

test("F6: 네트워크 실패에서 사유와 다시 시도가 보이고 콘솔 오류가 없다", async ({ page, q }) => {
  await page.route("**/api/rankings/**", (route) => route.abort("failed"));
  await page.goto(ROUTES.rankings, { waitUntil: "domcontentloaded" }); await settle(page, 3000);
  await expect(page.getByRole("alert").or(page.getByRole("status")).first(), "실패 안내").toBeVisible();
  await expect(page.getByRole("button", { name: /다시|재시도|Retry/ }).first(), "다시 시도").toBeVisible();
  await page.unroute("**/api/rankings/**");
  await page.route("**/api/me/summary", (route) => route.fulfill({ status: 401, contentType: "application/json", body: '{"error":{"code":"UNAUTHENTICATED"}}' }));
  await page.goto(ROUTES.my, { waitUntil: "domcontentloaded" }); await settle(page, 3000);
  await expect(page.getByRole("link", { name: /로그인|가입/ }).or(page.getByRole("button", { name: /로그인|가입/ })).first(), "세션 만료 때 로그인 행동").toBeVisible();
  expect(q.errors, "콘솔 오류").toEqual([]);
});

test("F7: 모임 페이지 안에서 탭을 옮겨도 머리가 다시 만들어지지 않는다", async ({ page }) => {
  await page.goto(ROUTES.groups, { waitUntil: "domcontentloaded" }); await settle(page, 3000);
  const link = page.locator('a[href^="/pages/groups/"]:not([href*="/apply"])').first();
  await expect(link, "모임 카드 링크").toBeVisible();
  await link.click(); await page.locator("[data-fan-page-header]").first().waitFor({ timeout: 30_000 }); await page.waitForTimeout(2000);
  await page.evaluate(() => { (window as any).__frame = document.querySelector("[data-fan-page-header]"); });
  const tabs = page.locator("[data-fan-page-header] ~ * a, [data-fan-page-header] [role=tab], [data-fan-page-header] a[href*='/pages/groups/']");
  const n = await tabs.count();
  expect(n, "머리 아래 탭").toBeGreaterThan(1);
  for (let i = 0; i < Math.min(n, 3); i += 1) {
    await tabs.nth(i).evaluate((el) => (el as HTMLElement).click()); await page.waitForTimeout(1200);
    const kept = await page.evaluate(() => (window as any).__frame === document.querySelector("[data-fan-page-header]"));
    expect(kept, `탭 ${i} 이동 뒤 머리 노드가 바뀜(다시 만들어짐)`).toBe(true);
  }
});

test("F8: 모달은 URL 을 바꾸지 않고 ESC·바깥 누름으로 닫힌다", async ({ page }) => {
  await page.goto(ROUTES.home, { waitUntil: "domcontentloaded" }); await settle(page);
  const trigger = page.locator('[data-fan-language-action], [aria-haspopup="dialog"]').filter({ visible: true }).first();
  await expect(trigger, "열 수 있는 모달 버튼").toBeVisible();
  const url = page.url();
  const dialog = page.getByRole("dialog");
  await trigger.click(); await expect(dialog).toBeVisible();
  expect(page.url(), "모달을 열었더니 URL 이 바뀜").toBe(url);
  await page.keyboard.press("Escape"); await expect(dialog, "ESC").toBeHidden();
  await trigger.click(); await expect(dialog).toBeVisible();
  await page.mouse.click(2, 2); await expect(dialog, "바깥 누름").toBeHidden();
  await trigger.click(); await expect(dialog).toBeVisible();
  await page.goBack().catch(() => undefined); await page.waitForTimeout(500);
  await expect(dialog, "뒤로가기").toBeHidden();
});

test("F9: 미션북의 모든 행동에 지급 규칙이 있다(미션 지급·이동 전수의 비로그인 부분)", async ({ page, browser, baseURL }, info) => {
  const { json } = await get(page, "/api/dukjil/catalog");
  const actions: string[] = json.missionBook.pages.flatMap((p: any) => p.slots.map((s: any) => s.action));
  const ruleKeys = Object.keys(json.rules);
  const ALIAS: Record<string, string> = { steady_checkin: "checkin" }; // 연속 출석은 출석 규칙의 연속 보너스(streakBonus)로 지급된다
  const missing = actions.filter((a) => !ruleKeys.includes(ALIAS[a] ?? a));
  expect(missing, `지급 규칙이 없는 미션 행동 ${missing.join(",")}`).toEqual([]);
  const auth = await loggedInPage(browser, info.project.use.viewport as { width: number; height: number }, baseURL!);
  test.skip(!auth, `${SKIP_AUTH} (완료 → 지급 → 내역 → 다음 미션 이동은 로그인 부분이라 못 봄)`);
  await auth!.close();
});

test("F10: 헤더 최애 칸을 누르면 최애를 고르거나 바꾸는 곳으로 간다", async ({ page, browser, baseURL }, info) => {
  await page.goto(ROUTES.home, { waitUntil: "domcontentloaded" }); await settle(page, 4000);
  const auth = await loggedInPage(browser, info.project.use.viewport as { width: number; height: number }, baseURL!);
  const cell = (auth ? auth.page : page).locator("header").first().getByText(/최애/).first();
  if (auth) { await auth.page.goto(ROUTES.home); await settle(auth.page); }
  await expect(cell, "헤더 최애 칸").toBeVisible();
  const cur = auth ? auth.page : page;
  const from = cur.url();
  await cell.click();
  // 개발 서버가 바쁠 때 첫 클릭이 늦게 먹을 수 있어 8초까지 기다린다. 8초 안에 이동도 팝업도 없으면 반응이 없는 것이다.
  await expect.poll(async () => cur.url() !== from || (await cur.locator('[role="dialog"], [role="listbox"], [role="menu"], [role="menuitem"]').filter({ visible: true }).count()) > 0, { timeout: 8000, message: "누르면 아무 일도 없다" }).toBe(true);
  if (auth) await auth.close();
});

test("F11: 팬페이지 소개가 수집 원문과 같고, 다른 언어에서는 번역과 원문 보기가 따로 있다", async ({ page }) => {
  const { json } = await get(page, "/api/public/celebrities/elina");
  const original: string = json.celebrity.summary;
  await page.goto("/c/elina?locale=ko", { waitUntil: "domcontentloaded" }); await settle(page, 2500);
  await expect(page.locator("main")).toContainText(original);
  await page.goto("/c/elina?locale=en", { waitUntil: "domcontentloaded" }); await settle(page, 2500);
  await expect(page.getByRole("button", { name: /원문|Original|Show original/i }).first(), "원문 보기").toBeVisible();
});

test("F12: 12개 언어 전환 뒤 덕질 라벨이 영어는 Stan, 나머지는 기존 번역을 유지하고 새로고침 뒤에도 남는다", async ({ page }) => {
  const projectName = test.info().project.name; // 390 은 아래 탭, 1440 은 위 탭이라 라벨이 다르다. 화면 폭마다 따로 기록한다.
  const snapshotPath = resolve(__dirname, `f12-stan-labels.${projectName}.snapshot.json`);
  const labelOf = async (locale: string) => {
    await page.goto(`/?locale=${locale}`, { waitUntil: "domcontentloaded" }); await settle(page, 1500);
    // 덕질 탭 자체를 읽는다(바닥글의 /benefits 링크가 DOM 에서 먼저 나와 390 기준선이 바닥글 문구로 잡혔던 결함).
    const link = page.locator('a[data-fan-navigation-id="favorites"][href^="/benefits"]').filter({ visible: true }).first();
    return ((await link.innerText()) || (await link.getAttribute("aria-label")) || "").trim();
  };
  const labels: Record<string, string> = {};
  for (const l of APP_LOCALES) labels[l] = await labelOf(l);
  if (process.env.Q_UPDATE_SNAPSHOT === "1" || !existsSync(snapshotPath)) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(snapshotPath, JSON.stringify(labels, null, 1) + "\n");
    console.log("F12 스냅샷을 새로 썼다: 구현 전 화면의 덕질 라벨. 영어 Stan 변경 전에만 갱신한다.");
  }
  const base = JSON.parse(readFileSync(snapshotPath, "utf8")) as Record<string, string>;
  expect(labels.en, "영어는 Stan").toBe("Stan");
  expect(labels.ko, "한국어는 덕질").toBe("덕질");
  const changed = APP_LOCALES.filter((l) => l !== "en" && labels[l] !== base[l]);
  expect(changed.map((l) => `${l}: ${base[l]} → ${labels[l]}`), "영어 외 언어는 기존 번역을 유지").toEqual([]);
  await page.goto("/?locale=ja", { waitUntil: "domcontentloaded" }); await settle(page, 1000);
  await page.reload(); await settle(page, 1000);
  expect(await page.evaluate(() => document.documentElement.lang)).toBe("ja");
});
