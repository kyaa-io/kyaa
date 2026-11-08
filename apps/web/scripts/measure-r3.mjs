#!/usr/bin/env node
// 루브릭 r3(UI/UX U1~U16) 측정 뼈대. 명세: board/tasks/doc-261107-2/benchmark-full/rubric-r3-draft.md 4절.
// 실행 예:
//   NODE_PATH=<repo>/node_modules node apps/web/scripts/measure-r3.mjs --base http://127.0.0.1:3001 \
//     --out <dir> [--ids <coverage-r3.json>] [--only stan.today] [--widths 390,1440] [--storage <state.json>] [--state fan] [--full]
// --ids 파일 형식: [{ "id": "stan.today", "path": "/benefits?locale=ko" }, ...]. 없으면 아래 DEFAULT_IDS(5차 범위).
// 출력: id·폭·상태마다 <id>.<state>.<width>.json + 같은 이름 .png(첫 뷰포트). 스키마는
//   { id, state, viewport, url, verified, typo, blocks, shell, layout, rows, text, color, shape, icons, lucky, network, interaction }
// 이 뼈대가 재는 것: typo·blocks·shell·layout·rows·text·color(gradients·hues)·shape·icons·lucky(정적 개수).
// 아직 안 재는 것(verified:false 로 남긴다, 조용히 통과시키지 않는다): color.neutralRatio(픽셀), lucky 애니메이션 주기·긴 프레임,
//   network(3분 체류), interaction(출석·교환·공감·재정렬 시나리오).
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

export const DEFAULT_IDS = [
  { id: "header.default", path: "/?locale=ko" },
  { id: "home.default", path: "/?locale=ko" },
  { id: "stan.today", path: "/benefits?locale=ko" },
  { id: "stan.history", path: "/benefits?tab=history&locale=ko" },
  { id: "my.default", path: "/my?locale=ko" },
];
export const ALLOWED_SIZES = [48, 44, 26, 18, 15, 14, 12, 11];
export const ALLOWED_WEIGHTS = ["400", "700", "800"];
export const UPPER_ALLOW = ["LIVE", "DM", "QR", "HOME", "MY", "KYAA"];
const VIEWPORT_HEIGHT = { 390: 844, 1440: 900 };

function parseArgs(argv) {
  const o = { base: "http://127.0.0.1:3001", out: ".", ids: "", only: "", widths: [390, 1440], storage: "", state: "", full: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]; const v = argv[i + 1];
    if (k === "--base") { o.base = v; i++; } else if (k === "--out") { o.out = v; i++; } else if (k === "--ids") { o.ids = v; i++; }
    else if (k === "--only") { o.only = v; i++; } else if (k === "--widths") { o.widths = v.split(",").map(Number); i++; }
    else if (k === "--storage") { o.storage = v; i++; } else if (k === "--state") { o.state = v; i++; } else if (k === "--full") o.full = true;
  }
  if (!o.state) o.state = o.storage ? "fan" : "guest";
  return o;
}

// 페이지 안에서 돈다(직렬화되므로 바깥 변수를 쓰지 않는다).
function measureInPage({ full, allowedSizes, allowedWeights, upperAllow }) {
  const vw = innerWidth; const vh = innerHeight;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    if (full) return true;
    const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0)); const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
    return (w * h) / (r.width * r.height) >= 0.2;
  };
  const cs = (el) => getComputedStyle(el);
  const inArt = (el) => !!el.closest("img,canvas,[data-art]");
  // sRGB → OKLab chroma·hue (culori 없이)
  const oklch = (str) => {
    const m = str.match(/rgba?\(([^)]+)\)/); if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    if (a === 0) return null;
    const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const [R, G, B] = [lin(r), lin(g), lin(b)];
    const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B), mm = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B), s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
    const A = 1.9779984951 * l - 2.428592205 * mm + 0.4505937099 * s, Bb = 0.0259040371 * l + 0.7827717662 * mm - 0.808675766 * s;
    return { c: Math.hypot(A, Bb), h: ((Math.atan2(Bb, A) * 180) / Math.PI + 360) % 360 };
  };
  const all = [...document.querySelectorAll("body *")].filter(visible);

  // typo
  const textEls = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const p = n.parentElement;
    if (p && n.textContent.trim() && !inArt(p) && !p.closest("svg,script,style,noscript") && visible(p)) textEls.add(p);
  }
  const families = {}, sizes = {}, weights = {}; let ko = 0, keepAll = 0; const sizeNodes = [];
  for (const el of textEls) {
    const s = cs(el); const fam = s.fontFamily.split(",")[0].trim().replace(/["']/g, ""); const size = Math.round(parseFloat(s.fontSize));
    families[fam] = (families[fam] ?? 0) + 1; sizes[size] = (sizes[size] ?? 0) + 1; weights[s.fontWeight] = (weights[s.fontWeight] ?? 0) + 1; sizeNodes.push(size);
    if (/[가-힣]/.test(el.textContent)) { ko++; if (s.wordBreak === "keep-all") keepAll++; }
  }
  const distinct = [...new Set(sizeNodes)].sort((a, b) => b - a);
  const typo = {
    families, sizes, weights, keepAll: ko ? keepAll / ko : 1,
    outOfScale: Object.keys(sizes).map(Number).filter((x) => !allowedSizes.includes(x)),
    outOfWeights: Object.keys(weights).filter((x) => !allowedWeights.includes(x)),
    focalCount: sizeNodes.filter((x) => x === distinct[0]).length, focalRatio: distinct[1] ? +(distinct[0] / distinct[1]).toFixed(2) : null,
  };

  // blocks
  const main = document.querySelector("main");
  const firstLevel = main ? [...main.querySelectorAll(":scope > [data-block], :scope > * > [data-block]")].filter(visible) : [];
  const seq = firstLevel.map((el) => el.dataset.block).filter((v, i, a) => i === 0 || v !== a[i - 1]);
  const missing = main ? [...main.querySelectorAll(":scope > section, :scope > article, :scope > div[role=region], :scope > * > section")].filter((el) => visible(el) && !el.dataset.block).length : 0;
  const cardRuns = new Set(); for (const el of main ? main.querySelectorAll('[data-block="card"]') : []) { const sib = [...el.parentElement.children].filter((c) => c.dataset.block === "card" && Math.abs(c.offsetWidth - el.offsetWidth) <= 2 && c.offsetTop === el.offsetTop); if (sib.length >= 3) cardRuns.add(el.parentElement); }
  const blocks = { kinds: [...new Set(seq)], count: new Set(seq).size, sequence: seq, missing, sameKindRuns: cardRuns.size };

  // shell
  const header = document.querySelector("header[data-fan-header]") ?? document.querySelector("header");
  const tabs = [...document.querySelectorAll("[data-shell-tabs] a")];
  const bottom = document.querySelector("[data-bottom-nav]");
  const sub = document.querySelector('[data-fan-tabs="underline"]');
  const shell = {
    headerHeight: header ? Math.round(header.getBoundingClientRect().height) : null,
    headerActions: header ? header.querySelectorAll("[data-actions] > *").length : null,
    headerDigits: header ? /\d/.test(header.innerText) : null,
    tabs: tabs.length, tabsCurrent: tabs.filter((a) => a.getAttribute("aria-current")).length,
    bottomNav: bottom ? { height: Math.round(bottom.getBoundingClientRect().height), items: bottom.querySelectorAll("a").length } : null,
    subTabs: sub ? { height: Math.round(sub.getBoundingClientRect().height), sticky: cs(sub).position === "sticky", top: cs(sub).top } : null,
  };

  // layout
  const two = document.querySelector('[data-layout="two-col"]');
  const cols = two ? [...two.children].map((c) => c.getBoundingClientRect().width) : [];
  const layout = {
    mainWidth: main ? Math.round(main.getBoundingClientRect().width) : null,
    ratio: cols.length >= 2 && cols[1] ? +(cols[0] / cols[1]).toFixed(2) : null,
    asideBlocks: two && two.children[1] ? two.children[1].querySelectorAll(":scope > [data-block], :scope > * > [data-block]").length : null,
    overflow: [...document.querySelectorAll("body *")].filter((el) => el.scrollWidth > 1100 && el.offsetParent && cs(el).overflowX === "visible").length,
    pageOverflow: document.documentElement.scrollWidth > vw,
  };

  // rows
  const rowEls = [...document.querySelectorAll("[data-row]")].filter(visible);
  const heights = {}; for (const r of rowEls) { const k = r.dataset.row; (heights[k] ??= {}); const h = Math.round(r.offsetHeight); heights[k][h] = (heights[k][h] ?? 0) + 1; }
  const endWidths = rowEls.map((r) => r.querySelector("[data-row-end]")?.getBoundingClientRect().width).filter((x) => x != null);
  const mean = endWidths.reduce((a, b) => a + b, 0) / (endWidths.length || 1);
  const missions = rowEls.filter((r) => r.dataset.row === "mission").map((r) => {
    const t = r.querySelector("[data-row-title]")?.getBoundingClientRect(); const b = r.querySelector("[data-row-bar]")?.getBoundingClientRect(); const p = r.querySelector("[data-row-progress]")?.getBoundingClientRect();
    return { titleX: t ? Math.round(t.left - r.getBoundingClientRect().left) : null, barX: b ? Math.round(b.left - r.getBoundingClientRect().left) : null, barH: b ? Math.round(b.height) : null, progressGap: t && p ? Math.round(p.left - t.right) : null, buttons: r.querySelectorAll("button").length };
  });
  const notices = rowEls.filter((r) => r.dataset.row === "notice");
  const deltaEls = [...document.querySelectorAll("[data-delta]")].filter(visible);
  const rows = {
    heights, rightColVar: endWidths.length ? +(endWidths.reduce((a, w) => a + (w - mean) ** 2, 0) / endWidths.length).toFixed(2) : null, missions,
    facts: notices.length ? notices.filter((r) => [...r.querySelectorAll("[data-fact]")].filter((f) => f.textContent.trim()).length >= 2).length / notices.length : null,
    deltas: { count: deltaEls.length, valid: deltaEls.filter((d) => /^(▲\d+|▼\d+|—|\+\d+)$/.test(d.textContent.trim())).length },
  };

  // text
  const texts = [...textEls];
  const upperRe = /\b[A-Z]{3,}\b/g;
  const empties = [...document.querySelectorAll('[data-fan-state="empty"]')].filter(visible).map((e) => ({ text: e.innerText.trim(), len: e.innerText.trim().length, buttons: e.querySelectorAll("button,a").length, icons: e.querySelectorAll("svg,img").length, height: Math.round(e.getBoundingClientRect().height) }));
  const text = {
    helpTips: document.querySelectorAll("[data-help-tip]").length,
    headingThenP: [...document.querySelectorAll("main :is(h1,h2,h3) + p")].filter(visible).length,
    explains: document.querySelectorAll("[data-explains]").length,
    emptyStates: empties,
    dotsOutsideMeta: texts.filter((el) => el.textContent.includes(" · ") && !el.closest("[data-meta]")).length,
    upperTokens: [...new Set(texts.flatMap((el) => el.textContent.match(upperRe) ?? []).filter((t) => !upperAllow.includes(t)))],
    uppercaseCss: texts.filter((el) => cs(el).textTransform === "uppercase").length,
    buttonArrows: document.querySelectorAll('button svg[data-icon="arrow-right"], a[class*=action] svg[data-icon="arrow-right"]').length,
    longCounts: [...document.querySelectorAll('[data-metric="count"]')].filter((e) => /\d{1,3}(,\d{3}){2,}/.test(e.textContent)).length,
    assetKM: [...document.querySelectorAll('[data-metric="asset"]')].filter((e) => /\d[KM]\b/.test(e.textContent)).length,
    relative: texts.filter((el) => /(분 전|시간 전|일 전|어제|방금|ago\b)/.test(el.textContent)).length,
    headerBadges: document.querySelectorAll("header [data-count]").length, dots: document.querySelectorAll("[data-dot]").length,
    adWatch: texts.filter((el) => el.textContent.includes("광고 보고")).length,
    transparency: {
      balanceHistory: document.querySelectorAll("[data-balance-history]").length,
      missionReset: [...document.querySelectorAll("[data-mission-reset]")].map((e) => /\d{2}:\d{2}|자정/.test(e.textContent)),
      rankingBasis: document.querySelectorAll("[data-ranking-basis]").length,
      updatedAt: [...document.querySelectorAll("[data-updated-at]")].map((e) => e.textContent.trim()),
    },
  };

  // color · shape · icons
  let gradients = 0; const hues = []; const radii = {}; let pillNotBadge = 0, accentBars = 0, iconBoxes = 0, shadows = 0, filters = 0, infinite = 0; const durations = {};
  for (const el of all) {
    const s = cs(el);
    if (/gradient/.test(s.backgroundImage) && !el.closest("[data-art]")) gradients++;
    for (const v of [s.backgroundColor, s.color]) { const o = oklch(v); if (o && o.c > 0.05) hues.push(o.h); }
    const r = Math.max(...s.borderRadius.split(" ").map((x) => (x.endsWith("%") ? -50 : parseFloat(x) || 0)));
    const rk = r === -50 ? "50%" : r >= 999 ? "pill" : String(Math.round(r)); radii[rk] = (radii[rk] ?? 0) + 1;
    if (rk === "pill" && !el.closest("[data-badge]") && !el.hasAttribute("data-badge")) pillNotBadge++;
    if (parseFloat(s.borderLeftWidth) >= 3 && (oklch(s.borderLeftColor)?.c ?? 0) > 0.05) accentBars++;
    if (s.boxShadow !== "none" && !el.closest('[role=menu],[data-toast],[role=tooltip],[role=dialog]')) shadows++;
    if (s.filter !== "none") filters++;
    if (s.animationIterationCount === "infinite" && !el.closest("[data-lucky-module],[data-skeleton]")) infinite++;
    if (!el.closest("[data-motion]")) for (const d of s.transitionDuration.split(",")) { const ms = Math.round(parseFloat(d) * (d.includes("ms") ? 1 : 1000)); if (ms) durations[ms] = (durations[ms] ?? 0) + 1; }
  }
  for (const ic of document.querySelectorAll("svg, img")) {
    const b = ic.getBoundingClientRect(); if (b.width > 24 || !visible(ic)) continue;
    const p = ic.parentElement; const ps = p ? cs(p) : null;
    if (ps && ps.backgroundColor !== "rgba(0, 0, 0, 0)" && parseFloat(ps.borderWidth) === 0 && p.getBoundingClientRect().width <= 56) iconBoxes++;
  }
  const clusters = []; for (const h of hues) if (!clusters.some((c) => Math.min(Math.abs(c - h), 360 - Math.abs(c - h)) <= 15)) clusters.push(h);
  const color = { gradients, hues: clusters.length, neutralRatio: { verified: false } };
  const shape = { radii, pillNotBadge, accentBars, iconBoxes, shadows, filters, infiniteAnims: infinite, transitions: durations };
  const iconEls = [...document.querySelectorAll("svg[data-icon]")].filter(visible);
  const icons = {
    strokeWidths: [...new Set(iconEls.map((s) => s.getAttribute("stroke-width")))], sizes: [...new Set(iconEls.map((s) => Math.round(s.getBoundingClientRect().width)))],
    sets: [...new Set(iconEls.map((s) => s.dataset.iconSet ?? "none"))], unwrappedLucide: [...document.querySelectorAll("svg.lucide:not([data-icon])")].filter(visible).length,
    imgIcons: [...document.querySelectorAll("img")].filter((i) => visible(i) && i.getBoundingClientRect().width <= 24 && !i.closest("[data-art]")).length,
  };

  // lucky (정적)
  const modules = [...document.querySelectorAll("[data-lucky-module]")];
  const lucky = {
    modules: modules.length,
    media: modules.reduce((a, m) => a + m.querySelectorAll("img:not([data-art]),video").length, 0),
    states: modules.map((m) => m.dataset.luckyState ?? null),
    labelValues: modules.map((m) => m.querySelectorAll('[data-row="label-value"]').length),
    buttons: modules.map((m) => m.querySelectorAll("button, a[class*=action]").length),
    disabled: modules.map((m) => m.querySelectorAll('button:disabled, [aria-disabled="true"]').length),
    animations: modules.reduce((a, m) => a + m.getAnimations({ subtree: true }).length, 0),
    timing: { verified: false },
  };
  return { typo, blocks, shell, layout, rows, text, color, shape, icons, lucky };
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const ids = (o.ids ? JSON.parse(fs.readFileSync(o.ids, "utf8")) : DEFAULT_IDS).filter((x) => !o.only || x.id === o.only);
  fs.mkdirSync(o.out, { recursive: true });
  const browser = await chromium.launch();
  const summary = [];
  try {
    for (const width of o.widths) {
      const context = await browser.newContext({ viewport: { width, height: VIEWPORT_HEIGHT[width] ?? 900 }, locale: "ko-KR", ...(o.storage ? { storageState: o.storage } : {}) });
      const page = await context.newPage();
      for (const { id, path: p } of ids) {
        const name = `${id}.${o.state}.${width}`;
        const result = { id, state: o.state, viewport: { width, height: VIEWPORT_HEIGHT[width] ?? 900 }, url: new URL(p, o.base).href, verified: false,
          network: { verified: false }, interaction: { verified: false } };
        try {
          await page.goto(result.url, { waitUntil: "load", timeout: 45_000 });
          await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {}); // 폴링이 있는 화면은 networkidle 에 닿지 않는다
          await page.evaluate(() => document.fonts.ready);
          Object.assign(result, await page.evaluate(measureInPage, { full: o.full, allowedSizes: ALLOWED_SIZES, allowedWeights: ALLOWED_WEIGHTS, upperAllow: UPPER_ALLOW }));
          result.verified = true;
          await page.screenshot({ path: path.join(o.out, `${name}.png`) });
        } catch (error) {
          result.error = String(error?.message ?? error);
        }
        fs.writeFileSync(path.join(o.out, `${name}.json`), JSON.stringify(result, null, 2));
        summary.push({ name, verified: result.verified, error: result.error });
        console.log(`${result.verified ? "ok  " : "FAIL"} ${name}${result.error ? ` — ${result.error.split("\n")[0]}` : ""}`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(o.out, "summary.json"), JSON.stringify(summary, null, 2));
  if (summary.some((s) => !s.verified)) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
