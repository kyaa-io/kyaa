#!/usr/bin/env node
// 버튼·링크 전체 훑기. 읽기 위주다: 같은 출처의 GET이 아닌 요청은 서버로 보내지 않고 204로 답한다(쓰기 요청이 나가려 했다는 사실만 남긴다).
// 실행 예(3000 개발 서버가 떠 있어야 한다. Privy가 허용한 출처가 localhost:3000뿐이다):
//   cd apps/web && node scripts/button-qa-sweep.mjs --label guest --out <파일>.json
//   cd apps/web && node scripts/button-qa-sweep.mjs --label dev-fan --state ~/.kyaa-dev-test-accounts/dev-fan.local3000.json --out <파일>.json
// 인자: --base (기본 http://localhost:3000)  --slug (팬페이지, 기본 elina)  --width (기본 1440)  --only <부분 문자열>  --no-click
//        --max-per-page (기본 24)  --budget-min (눌러 보기 제한 시간, 기본 14)  --concurrency (기본 3)
// 눌러 보지 않는 것: 결제·구매·출금·삭제·탈퇴·제재·전송·로그아웃·환불·차단, 외부 링크, 새 창 링크.
// 결과: 화면마다 요소 목록, 링크 응답(상태·이동 위치·returnTo 유무), 누른 버튼의 반응(주소·대화상자·펼침·DOM 변화·요청·콘솔 오류).
// 표로 옮기는 일은 scripts/button-qa-report.mjs가 한다.
import { chromium } from "playwright";
import fs from "node:fs";

function parseArgs() {
  const a = process.argv.slice(2);
  const o = { base: "http://localhost:3000", out: "", state: "", label: "guest", slug: "elina", width: 1440, only: "", click: true, maxPerPage: 24, budgetMin: 14, concurrency: 3 };
  for (let i = 0; i < a.length; i += 1) {
    const k = a[i];
    if (k === "--no-click") { o.click = false; continue; }
    const v = a[++i];
    if (k === "--base") o.base = v.replace(/\/$/, "");
    else if (k === "--out") o.out = v;
    else if (k === "--state") o.state = v;
    else if (k === "--label") o.label = v;
    else if (k === "--slug") o.slug = v;
    else if (k === "--width") o.width = Number(v);
    else if (k === "--only") o.only = v;
    else if (k === "--max-per-page") o.maxPerPage = Number(v);
    else if (k === "--budget-min") o.budgetMin = Number(v);
    else if (k === "--concurrency") o.concurrency = Number(v);
    else throw new Error(`알 수 없는 인자 ${k}`);
  }
  if (!o.out) throw new Error("--out 파일을 지정한다");
  return o;
}

const DANGEROUS = /결제|구매|출금|삭제|탈퇴|제재|전송|발송|로그아웃|환불|송금|차단|delete|withdraw|log ?out|sign ?out|purchase|checkout|pay\b/i;
const NOISE_REQUEST = /analytic|track|metric|vital|beacon|telemetry|collect|outbound|presence|heartbeat/i;

export function screensFor(slug) {
  const s = (p) => `${p}${p.includes("?") ? "&" : "?"}locale=ko`;
  return [
    ["home", s("/")],
    ["groups-list", s("/pages/groups")],
    ["fan-home", s(`/${slug}?tab=home`)],
    ["fan-board", s(`/${slug}?tab=board`)],
    ["fan-board-fans", s(`/${slug}?tab=board&source=fans`)],
    ["fan-board-official", s(`/${slug}?tab=board&source=official`)],
    ["fan-calendar", s(`/${slug}?tab=calendar`)],
    ["fan-members", s(`/${slug}?tab=members`)],
    ["fan-rooms", s(`/${slug}?tab=rooms`)],
    ["fan-certifications", s(`/${slug}?tab=certifications`)],
    ["dukjil-guide", s("/guide/dukjil")],
    ["jjinfan-guide", s("/guide/jjinfan")],
    ["guide", s("/guide")],
    ["c-home", s(`/c/${slug}`)],
    ["c-leaderboard", s(`/c/${slug}/leaderboard`)],
    ["c-raffles", s(`/c/${slug}/raffles`)],
    ["c-lounge", s(`/c/${slug}/lounge`)],
        ["c-verify", s(`/c/${slug}/verify`)],
    ["my", s("/my")],
    ["my-wallet", s("/my/wallet")],
    ["my-friends", s("/my/friends")],
    ["my-activity", s("/my/activity")],
    ["my-raffles", s("/my/raffles")],
    ["my-presence", s("/my/presence")],
    ["my-invitations", s("/my/invitations")],
    ["passports", s("/passports")],
    ["notifications", s("/notifications")],
    ["rankings", s("/rankings")],
    ["rankings-slug", s(`/rankings/${slug}`)],
    ["live", s("/live")],
    ["live-calendar", s("/live/calendar")],
    ["benefits", s("/benefits")],
    ["events", s("/events")],
    ["settings", s("/settings")],
    ["community", s("/community")],
    ["admin", s("/admin")],
    ["admin-dashboard", s("/admin/dashboard")],
    ["admin-groups", s("/admin/groups/overview")],
    ["operator", s("/operator")],
    ["privacy", s("/privacy")],
    ["terms", s("/terms")],
  ];
}

// 브라우저 안에서 도는 요소 수집. 찾은 요소마다 data-qa-i 번호를 붙인다.
function collectInPage() {
  const sel = 'a[href], button, [role=button], [role=tab], [role=menuitem], [role=switch], [role=checkbox], summary, input[type=button], input[type=submit], [onclick]';
  const out = [];
  let i = 0;
  document.querySelectorAll("[data-qa-i]").forEach((el) => el.removeAttribute("data-qa-i"));
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const hidden = r.width < 1 || r.height < 1 || cs.visibility === "hidden" || cs.display === "none" || !!el.closest("[aria-hidden=true], [inert]");
    const tag = el.tagName.toLowerCase();
    const img = el.querySelector("img[alt]");
    const name = (el.getAttribute("aria-label") || el.innerText || el.getAttribute("title") || img?.getAttribute("alt") || el.value || "").replace(/\s+/g, " ").trim().slice(0, 80);
    const href = tag === "a" ? el.getAttribute("href") : null;
    let region = "main";
    if (el.closest("dialog, [role=dialog], [aria-modal=true]")) region = "dialog";
    else if (el.closest("header, [data-site-header]")) region = "header";
    else if (el.closest("footer")) region = "footer";
    else if (el.closest("nav, [role=navigation], [role=tablist]")) region = "nav";
    const idx = i++;
    el.setAttribute("data-qa-i", String(idx));
    out.push({
      i: idx, tag, role: el.getAttribute("role"), name, href, hidden, region,
      target: el.getAttribute("target"), download: el.hasAttribute("download"),
      disabled: el.disabled === true || el.getAttribute("aria-disabled") === "true",
      expanded: el.getAttribute("aria-expanded"), pressed: el.getAttribute("aria-pressed"), selected: el.getAttribute("aria-selected"),
      type: el.getAttribute("type"), w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y + scrollY),
      hasName: name.length > 0,
    });
  }
  return out;
}

const stateInPage = () => ({
  url: location.pathname + location.search,
  hash: location.hash,
  text: (document.body.innerText || "").length,
  textSig: (document.body.innerText || "").replace(/\s+/g, "").slice(0, 4000).split("").reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7),
  dialogs: document.querySelectorAll("dialog[open], [role=dialog], [aria-modal=true]").length,
  scrollY: Math.round(scrollY),
  mut: window.__qaMut || 0,
  focus: document.activeElement?.tagName || "",
});

const INIT = `(() => { window.__qaMut = 0; const start = () => { try { new MutationObserver((l) => { window.__qaMut += l.length; }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true }); } catch {} }; start(); })();`;

async function main() {
  const o = parseArgs();
  const base = new URL(o.base);
  const deadline = Date.now() + o.budgetMin * 60_000;
  const browser = await chromium.launch();
  const ctxOptions = { viewport: { width: o.width, height: o.width <= 600 ? 844 : 900 }, locale: "ko-KR" };
  if (o.state) ctxOptions.storageState = o.state;
  const linkCache = new Map();
  const results = { label: o.label, base: o.base, width: o.width, startedAt: new Date().toISOString(), screens: [], writesBlocked: [] };
  const seenChrome = new Set();

  const screens = screensFor(o.slug);
  // 상세 화면 찾기: 팬페이지 글, 패스포트.
  const discover = await browser.newContext(ctxOptions);
  const dp = await discover.newPage();
  try {
    await dp.goto(new URL(`/${o.slug}?tab=board&source=fans&locale=ko`, base).href, { waitUntil: "domcontentloaded", timeout: 60000 });
    await dp.waitForTimeout(2500);
    const postHref = await dp.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).find((h) => /[?&]post=|\/posts?\//.test(h || "")) || "");
    if (postHref) screens.push(["fan-post-detail", postHref]);
    await dp.goto(new URL("/passports?locale=ko", base).href, { waitUntil: "domcontentloaded", timeout: 60000 });
    await dp.waitForTimeout(2500);
    const passHrefs = await dp.evaluate(() => [...new Set([...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).filter((h) => /^\/passports\/[0-9a-f-]{36}/.test(h || "")))]);
    if (passHrefs[0]) { screens.push(["passport-detail", passHrefs[0]]); screens.push(["passport-issuance", `${passHrefs[0].split("?")[0]}/issuance?locale=ko`]); }
  } catch (e) {
    results.discoverError = String(e).slice(0, 200);
  }
  await discover.close();

  const queue = screens.filter(([id]) => !o.only || id.includes(o.only));

  async function runScreen([id, url]) {
    const entry = { id, url, label: o.label, elements: [], links: [], clicks: [], notes: [] };
    results.screens.push(entry);
    const context = await browser.newContext(ctxOptions);
    await context.addInitScript(INIT);
    const page = await context.newPage();
    let buffer = null; // 눌러 보는 동안 모이는 관측치
    const attach = (p) => {
      p.on("console", (m) => { if (buffer && m.type() === "error") buffer.console.push(m.text().slice(0, 160)); });
      p.on("pageerror", (e) => { if (buffer) buffer.pageErrors.push(String(e).slice(0, 160)); });
      p.on("response", (r) => { if (buffer && r.status() >= 400 && new URL(r.url()).origin === base.origin) buffer.failed.push(`${r.status()} ${new URL(r.url()).pathname}`); });
      p.on("request", (r) => { if (buffer && !NOISE_REQUEST.test(r.url())) buffer.requests.push(`${r.method()} ${new URL(r.url()).pathname}`); });
      p.on("popup", (pop) => { if (buffer) buffer.popup = pop.url(); pop.close().catch(() => {}); });
    };
    attach(page);
    await context.route("**/*", (route) => {
      const r = route.request();
      const u = new URL(r.url());
      if (u.origin === base.origin && !["GET", "HEAD", "OPTIONS"].includes(r.method())) {
        results.writesBlocked.push(`${id} ${r.method()} ${u.pathname}`);
        if (buffer && !NOISE_REQUEST.test(u.pathname)) buffer.blocked.push(`${r.method()} ${u.pathname}`);
        return route.fulfill({ status: 204, body: "" });
      }
      return route.continue();
    });
    const open = async () => {
      const resp = await page.goto(new URL(url, base).href, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(500);
      return resp;
    };
    try {
      const resp = await open();
      entry.status = resp?.status() ?? 0;
      entry.finalUrl = page.url().replace(base.origin, "");
      entry.title = await page.title();
      entry.redirected = new URL(page.url()).pathname !== new URL(url, base).pathname;
      if (entry.redirected) entry.notes.push(`이동됨: ${entry.finalUrl}`);
      entry.elements = await page.evaluate(collectInPage);
    } catch (e) {
      entry.error = String(e).slice(0, 200);
      await context.close();
      return;
    }

    // 링크 응답
    const anchors = entry.elements.filter((e) => e.tag === "a" && e.href && !e.hidden);
    const uniqueHrefs = [...new Set(anchors.map((a) => a.href))];
    for (const href of uniqueHrefs) {
      if (/^(mailto:|tel:|javascript:|data:)/i.test(href)) { entry.links.push({ href, kind: "special" }); continue; }
      if (href.startsWith("#")) {
        const ok = href === "#" ? false : await page.evaluate((h) => !!document.getElementById(decodeURIComponent(h.slice(1))) || !!document.querySelector(`[name="${h.slice(1)}"]`), href);
        entry.links.push({ href, kind: "hash", ok });
        continue;
      }
      let abs;
      try { abs = new URL(href, page.url()); } catch { entry.links.push({ href, kind: "bad" }); continue; }
      if (abs.origin !== base.origin) { entry.links.push({ href, kind: "external" }); continue; }
      const key = `${o.label}|${abs.pathname}${abs.search}`;
      if (!linkCache.has(key)) {
        linkCache.set(key, (async () => {
          const chain = [];
          let cur = abs.href;
          for (let n = 0; n < 4; n += 1) {
            const r = await context.request.get(cur, { maxRedirects: 0, timeout: 60000, failOnStatusCode: false }).catch((e) => ({ err: String(e).slice(0, 80) }));
            if (r.err) { chain.push({ url: cur, err: r.err }); break; }
            const loc = r.headers()["location"];
            chain.push({ url: new URL(cur).pathname + new URL(cur).search, status: r.status(), location: loc || null });
            if (loc && r.status() >= 300 && r.status() < 400) { cur = new URL(loc, cur).href; if (new URL(cur).origin !== base.origin) break; } else break;
          }
          return chain;
        })());
      }
      entry.links.push({ href, kind: "internal", chain: await linkCache.get(key) });
    }

    // 눌러 보기
    if (o.click && Date.now() < deadline) {
      const pick = entry.elements.filter((e) => !e.hidden && !e.disabled && !(e.tag === "a" && e.href && !/^(#|javascript:)/.test(e.href)) && !(e.target === "_blank") && !e.download);
      const todo = [];
      for (const e of pick) {
        const key = `${e.region}|${e.tag}|${e.role}|${e.name}`;
        if (["header", "footer"].includes(e.region) && seenChrome.has(key)) continue;
        if (todo.some((t) => t.key === key)) continue;
        todo.push({ ...e, key });
      }
      // 본문 → 대화상자 → 이동줄 순으로 먼저 본다.
      const order = { main: 0, dialog: 1, nav: 2, header: 3, footer: 4 };
      todo.sort((a, b) => order[a.region] - order[b.region] || a.y - b.y);
      let n = 0;
      for (const e of todo) {
        if (n >= o.maxPerPage || Date.now() > deadline) { entry.notes.push(`누름 중단: ${n}개 눌렀고 ${todo.length - n}개 남음`); break; }
        n += 1;
        if (["header", "footer"].includes(e.region)) seenChrome.add(e.key);
        const rec = { i: e.i, name: e.name, tag: e.tag, role: e.role, region: e.region, href: e.href, expanded: e.expanded, pressed: e.pressed, selected: e.selected, type: e.type };
        entry.clicks.push(rec);
        if (DANGEROUS.test(e.name)) { rec.result = "skipped"; rec.reason = "위험 동작 이름"; continue; }
        if (e.tag === "a" && /^#/.test(e.href || "") && /바로가기|skip/i.test(e.name)) { rec.result = "skipped"; rec.reason = "초점일 때만 보이는 건너뛰기 링크"; continue; }
        const loc = page.locator(`[data-qa-i="${e.i}"]`);
        if (!(await loc.count())) { rec.result = "gone"; rec.reason = "다시 찾지 못함"; continue; }
        buffer = { console: [], pageErrors: [], failed: [], requests: [], blocked: [], popup: null };
        try {
          await loc.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {});
          const before = await page.evaluate(stateInPage);
          await page.waitForTimeout(150);
          const mid = await page.evaluate(stateInPage);
          const base0 = mid.mut - before.mut;
          const attrBefore = await loc.evaluate((el) => ({ expanded: el.getAttribute("aria-expanded"), pressed: el.getAttribute("aria-pressed"), selected: el.getAttribute("aria-selected"), cls: el.className?.toString?.().length || 0 })).catch(() => null);
          await loc.click({ timeout: 2500 }).catch(async (err) => {
            // 앞서 연 메뉴·팝오버의 바깥 막이 눌림을 가로채면 사용자도 먼저 닫는다. Escape 한 번 뒤 다시 누른다.
            if (!/intercepts pointer events/.test(String(err.message))) throw err;
            rec.recovered = "열린 팝업을 닫고 다시 누름";
            await page.keyboard.press("Escape");
            await page.waitForTimeout(300);
            await loc.click({ timeout: 6000 });
          });
          await page.waitForTimeout(650);
          const after = await page.evaluate(stateInPage);
          const attrAfter = await loc.evaluate((el) => ({ expanded: el.getAttribute("aria-expanded"), pressed: el.getAttribute("aria-pressed"), selected: el.getAttribute("aria-selected"), cls: el.className?.toString?.().length || 0 })).catch(() => "gone");
          rec.urlChanged = after.url !== mid.url ? after.url : null;
          rec.dialogDelta = after.dialogs - mid.dialogs;
          rec.textChanged = after.textSig !== mid.textSig;
          rec.domMutations = Math.max(0, after.mut - mid.mut - Math.round(base0 * 4));
          rec.scrolled = Math.abs(after.scrollY - mid.scrollY) > 40;
          rec.hashChanged = after.hash !== mid.hash ? after.hash : null;
          rec.attrChanged = attrAfter === "gone" ? "gone" : attrBefore && (attrBefore.expanded !== attrAfter.expanded || attrBefore.pressed !== attrAfter.pressed || attrBefore.selected !== attrAfter.selected) ? `${attrBefore.expanded ?? attrBefore.pressed ?? attrBefore.selected}→${attrAfter.expanded ?? attrAfter.pressed ?? attrAfter.selected}` : null;
          rec.requests = [...new Set(buffer.requests)].slice(0, 6);
          rec.blocked = [...new Set(buffer.blocked)].slice(0, 4);
          rec.console = buffer.console.slice(0, 3);
          rec.pageErrors = buffer.pageErrors.slice(0, 2);
          rec.failed = [...new Set(buffer.failed)].slice(0, 4);
          rec.popup = buffer.popup;
          const reacted = rec.urlChanged || rec.dialogDelta !== 0 || rec.textChanged || rec.domMutations > 0 || rec.scrolled || rec.hashChanged || rec.attrChanged || rec.requests.length || rec.blocked.length || rec.popup;
          rec.result = reacted ? "reacted" : "noop";
          // 다음 버튼을 위해 상태 되돌리기: 열린 메뉴가 뒤 버튼을 가리지 않게 Escape를 한 번 누르고 펼쳐진 채면 다시 눌러 접는다.
          await page.keyboard.press("Escape");
          if (rec.attrChanged && /→true$/.test(rec.attrChanged)) await loc.click({ timeout: 2000 }).catch(() => {});
          let reset = false;
          if (rec.urlChanged || rec.popup) reset = true;
          else if (after.dialogs > mid.dialogs) {
            await page.keyboard.press("Escape");
            await page.waitForTimeout(300);
            if ((await page.evaluate(stateInPage)).dialogs > mid.dialogs) reset = true;
          }
          if (reset) {
            await open();
            await page.evaluate(collectInPage).then((els) => {
              // 번호는 같은 순서로 다시 붙는다. 길이가 다르면 이후 항목은 이름으로 못 찾는다.
              if (els.length !== entry.elements.length) entry.notes.push(`다시 열고 요소 수가 ${entry.elements.length}→${els.length}`);
            });
          }
        } catch (err) {
          rec.result = "failed";
          rec.reason = String(err.message || err).replace(/\s+/g, " ").slice(0, 420);
          if (/intercepts pointer|not visible|outside|Timeout/i.test(rec.reason)) rec.result = "unclickable";
          if (e.tag === "a" && /^#/.test(e.href || "") && /outside of the viewport/.test(rec.reason)) { rec.result = "skipped"; rec.reason = "화면 밖에 숨은 건너뛰기 링크(초점일 때만 보임)"; }
          if (page.isClosed()) break;
        } finally {
          buffer = null;
        }
      }
    }
    await context.close();
  }

  const workers = Array.from({ length: Math.min(o.concurrency, queue.length) }, async () => {
    while (queue.length) {
      const next = queue.shift();
      const t = Date.now();
      await runScreen(next).catch((e) => results.screens.push({ id: next[0], url: next[1], error: String(e).slice(0, 200) }));
      console.log(`${o.label} ${next[0]} ${Math.round((Date.now() - t) / 1000)}s`);
    }
  });
  await Promise.all(workers);
  results.finishedAt = new Date().toISOString();
  fs.writeFileSync(o.out, JSON.stringify(results, null, 1));
  await browser.close();
  const clicked = results.screens.reduce((s, x) => s + (x.clicks || []).filter((c) => c.result !== "skipped" && c.result !== "gone").length, 0);
  console.log(`끝: 화면 ${results.screens.length}개, 누름 ${clicked}개, 쓰기 차단 ${results.writesBlocked.length}건 → ${o.out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
