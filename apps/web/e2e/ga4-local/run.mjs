// Loopback check of the real GA4 behaviour: the real app, the real gtag.js from Google, every request to Google intercepted
// (answered 204) so nothing reaches Analytics. Counts what the Google tag sends in each consent state.
//
// Start the app with the stream ID (public) on a loopback port, from this worktree:
//   NEXT_PUBLIC_GA4_MEASUREMENT_ID=G-WKSF9KP5QW is the only extra variable (public); start the app on a free loopback port from this worktree.
// Run from apps/web:
//   GA4_LOCAL_URL=http://localhost:3003 node e2e/ga4-local/run.mjs
// The local CSP does not list Google, so the browser context bypasses CSP (the deployed CSP opens those origins itself).
import { chromium } from "playwright";

const BASE = process.env.GA4_LOCAL_URL ?? "http://localhost:3003";
const CONSENT_KEY = "kyaa.analytics-consent.v1";
const GOOGLE = /(^|\.)(google-analytics\.com|analytics\.google\.com|googletagmanager\.com|google\.com|doubleclick\.net)$/;
const failures = [];
const check = (label, ok, detail = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`); if (!ok) failures.push(label); };

const browser = await chromium.launch();
async function open({ consent, referer } = {}) {
  const ctx = await browser.newContext({ locale: "ko-KR", bypassCSP: true, extraHTTPHeaders: referer ? { referer } : undefined });
  if (consent) await ctx.addInitScript(([key, choice]) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ choice, at: Date.now() })); }, [CONSENT_KEY, consent]);
  const requests = []; const hits = [];
  await ctx.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (!GOOGLE.test(url.hostname)) return route.continue();
    requests.push(`${url.hostname}${url.pathname}`);
    if (/\/collect$/.test(url.pathname)) {
      const body = (route.request().postData() ?? "").split("\n").filter(Boolean);
      for (const line of body.length ? body : [""]) {
        const q = new URLSearchParams(`${url.search.slice(1)}&${line}`);
        hits.push({ host: url.hostname, en: q.get("en"), dl: q.get("dl"), dt: q.get("dt"), dr: q.get("dr"), gcs: q.get("gcs") });
      }
      return route.fulfill({ status: 204, body: "" });
    }
    return route.continue();
  });
  const page = await ctx.newPage();
  return { ctx, page, requests, hits, pageViews: () => hits.filter((h) => h.en === "page_view") };
}
// dispatchEvent instead of click: a real click scrolls the footer button into view, which would itself make the tag queue a scroll event.
const click = (page, name) => page.getByRole("button", { name }).first().dispatchEvent("click");

// 1. Before any choice, and after a stored refusal: nothing goes to Google.
for (const consent of [undefined, "denied"]) {
  const s = await open({ consent });
  await s.page.goto(`${BASE}/elina`, { waitUntil: "load" }); await s.page.waitForTimeout(3500);
  await s.page.evaluate(() => { document.body.style.minHeight = "4000px"; window.scrollTo(0, 4000); }); await s.page.waitForTimeout(800);
  await s.page.goto("about:blank"); await s.page.waitForTimeout(800);
  check(`${consent ? "stored refusal" : "no choice yet"}: no request to Google`, s.requests.length === 0, `${s.requests.length} requests`);
  await s.ctx.close();
}

// 2. Allowed, direct open with a query, a hash and an outside referrer: one normalized page_view.
const a = await open({ consent: "granted", referer: "https://www.google.com/search?q=kyaa" });
await a.page.goto(`${BASE}/elina?returnTo=%2Fmy&authIntent=x#cheers`, { waitUntil: "load" }); await a.page.waitForTimeout(6000);
const first = a.pageViews();
check("direct open: exactly one page_view", first.length === 1, `${first.length}`);
check("direct open: dl is the origin and the normalized path only", first[0]?.dl === `${BASE}/elina`, first[0]?.dl ?? "none");
check("direct open: dt is the screen kind, not the document title", first[0]?.dt === "creator", first[0]?.dt ?? "none");
check("direct open: dr is the outside origin only", first[0]?.dr === "https://www.google.com", first[0]?.dr ?? "none");
await a.ctx.close();

// 3. Allowed, then a client navigation: one more page_view, no referrer.
const n = await open({ consent: "granted" });
await n.page.goto(`${BASE}/`, { waitUntil: "load" }); await n.page.waitForTimeout(5000);
await n.page.getByRole("link", { name: "모임" }).first().click(); await n.page.waitForTimeout(12000);
check("client navigation: two page_views in total (first screen + one move)", n.pageViews().length === 2, n.pageViews().map((h) => h.dt).join(","));
check("client navigation: the move carries no referrer", !n.pageViews()[1]?.dr, n.pageViews()[1]?.dr ?? "");
await n.ctx.close();

// 4. Allowed, then refused from the footer: nothing more goes to Google, even when the page is left; allowed again: one page_view.
const r = await open({ consent: "granted" });
await r.page.goto(`${BASE}/`, { waitUntil: "load" }); await r.page.waitForTimeout(5000);
// Refuse early, before the tag has queued engagement events of its own, so nothing made under consent is still in flight.
await r.page.waitForTimeout(2500);
const hitsBefore = r.hits.length;
await click(r.page, "방문 통계 설정"); await click(r.page, "거부"); await r.page.waitForTimeout(500);
await r.page.evaluate(() => { document.body.style.minHeight = "4000px"; window.scrollTo(0, 4000); }); await r.page.waitForTimeout(1500);
await r.page.getByRole("link", { name: "모임" }).first().click(); await r.page.waitForTimeout(4000);
await r.page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
await r.page.goto("about:blank"); await r.page.waitForTimeout(1500);
const afterRefusal = r.hits.slice(hitsBefore);
check("after a refusal: no collect request, including on leaving the page", afterRefusal.length === 0, `${afterRefusal.length} (${afterRefusal.map((h) => `${h.host} ${h.en} gcs=${h.gcs}`).join("; ")})`);
await r.ctx.close();

const g = await open({ consent: "granted" });
await g.page.goto(`${BASE}/`, { waitUntil: "load" }); await g.page.waitForTimeout(5000);
await click(g.page, "방문 통계 설정"); await click(g.page, "거부"); await g.page.waitForTimeout(800);
await g.page.getByRole("link", { name: "모임" }).first().click(); await g.page.waitForTimeout(3000);
const pvBefore = g.pageViews().length;
await click(g.page, "방문 통계 설정"); await click(g.page, "허용"); await g.page.waitForTimeout(6000);
const re = g.pageViews().slice(pvBefore);
check("allowed again: exactly the current screen goes out once", re.length === 1 && /\/pages\/groups$/.test(re[0]?.dl ?? ""), re.map((h) => h.dl).join(",") || "none");
await g.ctx.close();

await browser.close();
if (failures.length) { console.error(`\n${failures.length} check(s) failed`); process.exit(1); }
console.log("\nall GA4 loopback checks passed");
