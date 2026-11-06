#!/usr/bin/env node
// 누름부터 화면 변화까지의 클라이언트 지표를 잰다. 읽기 전용이다: 같은 출처의 GET이 아닌 요청은 서버로 보내지 않고 204로 답한다.
// 실행 예:
//   NODE_PATH=<repo>/node_modules node apps/web/scripts/measure-interaction.mjs \
//     --base https://dev.kyaa.io --out <파일>.json --widths 390,1440 [--storage <상태>.json] [--runs 5] \
//     [--only 5,6] [--map-to 127.0.0.1:3171]
// --map-to: 주소창은 --base 그대로 두고 연결만 다른 서버로 보낸다(인증 허용 출처가 localhost:3000뿐이라 별도 포트의 worktree를 잴 때 쓴다).
// 지표: a 선택 모양 ms, b 본문 첫 변화 ms, c 마지막 API 끝 ms, d API 수·중복 수, e 머리 재호출 수, f 기준 요소 밀림 px·밀림 합계, g 로딩 글자 노출 수, h 머리 노드 유지.
// 첫 회는 버리고 나머지의 가운데 값을 낸다. 요소를 찾지 못하면 그 단계를 "측정 실패"로 남기고 조용히 건너뛰지 않는다.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const LOADING_TEXT = /불러오는 중|불러오고 있어요|확인하고 있어요/;
const HEAD_CALL = /^\/api\/(?:groups\/[0-9a-f-]{36}(?:\/presence)?|groups\/resolve\/[^/]+|public\/celebrities\/[^/]+|me\/summary)$/i;
const SETTLE_QUIET_MS = 500;
const SETTLE_MAX_MS = 8000;

function parseArgs() {
  const a = process.argv.slice(2);
  const o = { base: "http://localhost:3000", out: "", storage: "", widths: [390, 1440], runs: 5, only: null, mapTo: "", slug: "elina" };
  for (let i = 0; i < a.length; i += 2) {
    const [k, v] = [a[i], a[i + 1]];
    if (k === "--base") o.base = v.replace(/\/$/, "");
    else if (k === "--out") o.out = v;
    else if (k === "--storage") o.storage = v;
    else if (k === "--widths") o.widths = v.split(",").map(Number);
    else if (k === "--runs") o.runs = Number(v);
    else if (k === "--only") o.only = v.split(",").map(Number);
    else if (k === "--map-to") o.mapTo = v;
    else if (k === "--slug") o.slug = v;
    else throw new Error(`알 수 없는 인자 ${k}`);
  }
  if (!o.out) throw new Error("--out 파일을 지정한다");
  return o;
}

// 브라우저 안의 관측기. 페이지마다 먼저 심고, 단계마다 mark()로 기준 시각을 다시 잡는다.
function installObservers(loadingSource) {
  const loading = new RegExp(loadingSource);
  const state = { clickAt: null, firstMain: null, loadingHits: 0, shift: 0, shiftAfterAction: 0, selectedAt: null, selectedSelector: "" };
  window.__measure = state;
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (state.clickAt === null || entry.startTime < state.clickAt) continue;
        state.shift += entry.value;
        if (entry.startTime <= state.clickAt + 500) state.shiftAfterAction += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: false });
  } catch { /* layout-shift를 지원하지 않는 엔진 */ }
  const inMain = (node) => {
    const el = node?.nodeType === 1 ? node : node?.parentElement;
    return Boolean(el?.closest?.("main"));
  };
  const seen = new WeakSet();
  const start = () => {
    new MutationObserver((records) => {
      if (state.clickAt === null) return;
      for (const r of records) {
        const swapped = r.type === "childList" && [...r.addedNodes, ...r.removedNodes].some((n) => n.nodeType === 1 && (n.matches("main") || n.querySelector("main")));
        if (state.firstMain === null && (swapped || inMain(r.target) && (r.type === "childList" ? r.addedNodes.length + r.removedNodes.length > 0 : r.type === "characterData"))) state.firstMain = performance.now();
        const nodes = r.type === "childList" ? [...r.addedNodes] : [r.target];
        for (const n of nodes) {
          const el = n.nodeType === 1 ? n : n.parentElement;
          if (!el || seen.has(el) || el.closest("[hidden]")) continue;
          const box = el.getBoundingClientRect();
          if (box.width <= 1 || box.height <= 1) continue; // 스크린리더 전용 문구는 화면 노출이 아니다
          if (loading.test(n.textContent ?? "")) { seen.add(el); state.loadingHits += 1; }
        }
      }
    }).observe(document.documentElement, { subtree: true, childList: true, characterData: true });
    const tick = () => {
      if (state.clickAt !== null && state.selectedAt === null && state.selectedSelector && document.querySelector(state.selectedSelector)) state.selectedAt = performance.now();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  if (document.documentElement) start(); else addEventListener("DOMContentLoaded", start);
  window.__mark = (selectedSelector) => {
    Object.assign(state, { clickAt: performance.now(), firstMain: null, loadingHits: 0, shift: 0, shiftAfterAction: 0, selectedAt: null, selectedSelector });
    return state.clickAt;
  };
}

const navLink = (page, href, width) => (width >= 1024 ? page.locator(`header a[href*="${href}"]`).first() : page.locator(`nav a[href*="${href}"]`).last());
const tabLink = (page, name) => page.locator("main nav a, main [role=tablist] a").filter({ hasText: name }).first();
const tabSelected = (name) => ({ text: name });

function scenarios(slug) {
  const groups = "/pages/groups?locale=ko";
  const home = `/${slug}?locale=ko`;
  return [
    { id: 1, name: "홈 → 모임 탭", start: "/?locale=ko", steps: [{ label: "모임", act: (p, w) => navLink(p, "/pages/groups", w).click(), selected: 'a[href*="/pages/groups"][aria-current="page"]' }] },
    { id: 2, name: "모임 목록 Ru 입력", start: groups, anchor: "main form input", steps: [{ label: "Ru", act: async (p) => { await p.locator("main form input").first().click(); await p.keyboard.type("Ru", { delay: 40 }); } }] },
    { id: 3, name: "유형 팬페이지 → 직군 아이돌", start: groups, anchor: "main form input", steps: [
      { label: "팬페이지", act: (p) => p.locator("main button").filter({ hasText: /^팬페이지$/ }).first().click(), selected: { button: "팬페이지" } },
      { label: "아이돌", act: (p) => p.locator("main button").filter({ hasText: /^아이돌$/ }).first().click(), selected: { button: "아이돌" } },
    ] },
    { id: 4, name: "엘리나 진입", start: `${groups}&type=fan`, steps: [{ label: "엘리나", act: (p) => p.locator("main a").filter({ hasText: /엘리나/ }).first().click() }], waitFor: "h1" },
    { id: 5, name: "팬페이지 탭 순회", start: home, anchor: "main nav", head: "main h1", steps: ["게시판", "비밀방", "캘린더", "팬·랭킹", "홈"].map((name) => ({ label: name, act: (p) => tabLink(p, name).click(), selected: { tab: name } })) },
    { id: 6, name: "캘린더 다음 달", start: `${home}&tab=calendar`, anchor: "main nav", head: "main h1", steps: [{ label: "다음 달", act: (p) => p.locator('main a[aria-label^="다음 달"], main button[aria-label^="다음 달"]').first().click() }] },
    { id: 7, name: "게시글 열기", start: `${home}&tab=board`, head: "main h1", steps: [{ label: "첫 글", act: (p) => p.locator('main a[href*="/community/"], main a[href*="post="]').first().click() }] },
    { id: 8, name: "덕질 탭", start: groups, steps: [{ label: "덕질", act: (p, w) => navLink(p, "/benefits", w).click(), selected: 'a[href*="/benefits"][aria-current="page"]' }] },
    { id: 9, name: "MY 탭", start: groups, steps: [{ label: "MY", act: (p, w) => navLink(p, "/my", w).click(), selected: 'a[href*="/my"][aria-current="page"]' }] },
  ].map((s) => ({ ...s, steps: s.steps.map((step) => ({ ...step, selected: selectorFor(step.selected) })) }));
}

function selectorFor(selected) {
  if (!selected) return "";
  if (typeof selected === "string") return selected;
  // 글자로 고르는 선택 표시는 브라우저 안에서 찾기 어려워 aria 상태로만 잰다. 이름은 단계 라벨로 대조한다.
  if (selected.tab) return `__tab:${selected.tab}`;
  if (selected.button) return `__button:${selected.button}`;
  return "";
}

const median = (values) => {
  const v = values.filter((x) => typeof x === "number" && Number.isFinite(x)).sort((x, y) => x - y);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const round = (x, d = 0) => (x === null ? null : Number(x.toFixed(d)));

async function settle(tracker) {
  const started = Date.now();
  let quietSince = Date.now();
  for (;;) {
    await new Promise((r) => setTimeout(r, 50));
    if (tracker.inflight > 0) quietSince = Date.now();
    if (Date.now() - quietSince >= SETTLE_QUIET_MS || Date.now() - started >= SETTLE_MAX_MS) return;
  }
}

async function runStep(page, step, scenario, width, tracker, base) {
  const anchorBefore = scenario.anchor ? await page.locator(scenario.anchor).first().boundingBox().catch(() => null) : null;
  const scrollBefore = await page.evaluate(() => scrollY);
  if (scenario.head) await page.locator(scenario.head).first().evaluate((el) => { el.__kept = true; }).catch(() => undefined);
  tracker.reset();
  // 글자로 찾는 선택 표시는 눌린 요소에 표식을 달아 rAF 관측기가 CSS 선택자로 볼 수 있게 한다.
  let selector = step.selected;
  if (selector.startsWith("__tab:") || selector.startsWith("__button:")) {
    const [kind, name] = selector.replace(/^__/, "").split(":");
    await page.evaluate(({ kind, name }) => {
      const sel = kind === "tab" ? "main nav a, main [role=tablist] a" : "main button";
      window.__selectionWatch = setInterval(() => {
        const m = window.__measure;
        if (m.clickAt === null || m.selectedAt !== null) return;
        const el = [...document.querySelectorAll(sel)].find((e) => e.textContent?.trim() === name || e.textContent?.includes(name) && kind === "tab");
        const on = el && (el.getAttribute("aria-current") === "page" || el.getAttribute("aria-pressed") === "true" || el.getAttribute("aria-selected") === "true");
        if (on) m.selectedAt = performance.now();
      }, 8);
    }, { kind, name });
    selector = "";
  }
  await page.evaluate((s) => window.__mark(s), selector);
  await step.act(page, width);
  const actedAt = await page.evaluate(() => performance.now());
  await settle(tracker);
  await page.waitForTimeout(500); // 조작 뒤 500ms 밀림 합계 창
  const m = await page.evaluate(async () => {
    const s = window.__measure;
    clearInterval(window.__selectionWatch);
    const entries = performance.getEntriesByType("resource").filter((e) => e.name.includes("/api/") && e.startTime >= s.clickAt);
    return { clickAt: s.clickAt, a: s.selectedAt === null ? null : s.selectedAt - s.clickAt, b: s.firstMain === null ? null : s.firstMain - s.clickAt, c: entries.length ? Math.max(...entries.map((e) => e.responseEnd)) - s.clickAt : null, shift: s.shift, shiftAfterAction: s.shiftAfterAction, loading: s.loadingHits };
  });
  const anchorAfter = scenario.anchor ? await page.locator(scenario.anchor).first().boundingBox().catch(() => null) : null;
  const scrollAfter = await page.evaluate(() => scrollY);
  const headKept = scenario.head ? await page.locator(scenario.head).first().evaluate((el) => el.__kept === true).catch(() => false) : null;
  const calls = tracker.calls.filter((c) => c.method === "GET");
  const unique = new Set(calls.map((c) => c.key));
  void base; void actedAt;
  return {
    a: step.selected ? m.a : null, b: m.b, c: m.c,
    apiCalls: calls.length, duplicateCalls: calls.length - unique.size,
    headCalls: calls.filter((c) => HEAD_CALL.test(c.pathname)).length,
    anchorShiftPx: anchorBefore && anchorAfter ? Math.abs(anchorAfter.y - anchorBefore.y) : null,
    scrollShiftPx: Math.abs(scrollAfter - scrollBefore),
    layoutShift: m.shiftAfterAction,
    loadingText: m.loading,
    headKept,
    stubbedWrites: tracker.stubbed,
    serverErrors: tracker.serverErrors,
  };
}

async function main() {
  const opt = parseArgs();
  const origin = new URL(opt.base).origin;
  const launchArgs = opt.mapTo ? [`--host-resolver-rules=MAP ${new URL(opt.base).host} ${opt.mapTo}`] : [];
  const browser = await chromium.launch({ args: launchArgs });
  const result = { base: opt.base, mappedTo: opt.mapTo || null, account: opt.storage ? path.basename(opt.storage).split(".")[0] : "guest", runs: opt.runs, droppedFirst: true, startedAt: new Date().toISOString(), scenarios: [] };
  try {
    for (const width of opt.widths) {
      for (const scenario of scenarios(opt.slug)) {
        if (opt.only && !opt.only.includes(scenario.id)) continue;
        const stepRuns = scenario.steps.map(() => []);
        const failures = [];
        const context = await browser.newContext({ viewport: { width, height: width >= 1024 ? 900 : 844 }, locale: "ko-KR", ...(opt.storage ? { storageState: opt.storage } : {}) });
        await context.addInitScript(installObservers, LOADING_TEXT.source);
        const tracker = { inflight: 0, calls: [], stubbed: 0, serverErrors: 0, reset() { this.calls = []; this.serverErrors = 0; } };
        await context.route(`${origin}/**`, async (route) => {
          const request = route.request();
          if (request.method() === "GET" || request.method() === "HEAD") return route.fallback();
          const { pathname } = new URL(request.url());
          if (pathname.startsWith("/_next/")) return route.fallback();
          tracker.stubbed += 1;
          return route.fulfill({ status: 204, body: "" });
        });
        for (let run = 0; run < opt.runs; run++) {
          const page = await context.newPage();
          const onRequest = (request) => {
            const url = new URL(request.url());
            if (url.origin !== origin || !url.pathname.startsWith("/api/")) return;
            tracker.inflight += 1;
            tracker.calls.push({ method: request.method(), key: `${request.method()} ${url.pathname}${url.search}`, pathname: url.pathname });
          };
          const onDone = (request) => {
            const url = new URL(request.url());
            if (url.origin === origin && url.pathname.startsWith("/api/")) tracker.inflight = Math.max(0, tracker.inflight - 1);
          };
          page.on("request", onRequest);
          page.on("response", (response) => { if (response.status() >= 500 && new URL(response.url()).origin === origin) tracker.serverErrors += 1; });
          page.on("requestfinished", onDone);
          page.on("requestfailed", onDone);
          try {
            await page.goto(`${opt.base}${scenario.start}`, { waitUntil: "domcontentloaded", timeout: 90000 });
            await page.waitForLoadState("load", { timeout: 60000 }).catch(() => undefined);
            await settle(tracker);
            for (let i = 0; i < scenario.steps.length; i++) {
              const metrics = await runStep(page, scenario.steps[i], scenario, width, tracker, opt.base);
              if (run > 0 || opt.runs === 1) stepRuns[i].push(metrics);
            }
          } catch (error) {
            failures.push({ run, reason: String(error.message ?? error).split("\n")[0] });
          } finally {
            await page.close();
          }
        }
        await context.close();
        scenario.steps.forEach((step, i) => {
          const runs = stepRuns[i];
          const pick = (k) => median(runs.map((r) => r[k]));
          result.scenarios.push({
            id: scenario.id, scenario: scenario.name, step: step.label, width, samples: runs.length,
            status: runs.length ? "ok" : "측정 실패",
            a_selectedMs: round(pick("a")), b_firstChangeMs: round(pick("b")), c_lastResponseMs: round(pick("c")),
            d_apiCalls: pick("apiCalls"), d_duplicateCalls: pick("duplicateCalls"), e_headCalls: pick("headCalls"),
            f_anchorShiftPx: round(pick("anchorShiftPx"), 1), f_scrollShiftPx: round(pick("scrollShiftPx"), 1), f_layoutShift: round(pick("layoutShift"), 4),
            g_loadingText: pick("loadingText"),
            h_headKept: runs.length && runs[0].headKept !== null ? runs.every((r) => r.headKept) : null,
            stubbedWrites: runs.reduce((sum, r) => sum + r.stubbedWrites, 0),
            serverErrors: runs.reduce((sum, r) => sum + r.serverErrors, 0),
            failures,
          });
        });
        process.stdout.write(`${width} ${scenario.name}: ${stepRuns.map((r) => r.length).join("/")} 표본${failures.length ? ` · 실패 ${failures.length} (${failures[0].reason})` : ""}\n`);
      }
    }
  } finally {
    await browser.close();
  }
  result.finishedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(opt.out), { recursive: true });
  fs.writeFileSync(opt.out, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`저장 ${opt.out}\n`);
}

await main();
