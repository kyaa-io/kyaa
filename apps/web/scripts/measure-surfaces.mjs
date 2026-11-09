#!/usr/bin/env node
// DS-SWEEP §6-16 surface measurement. Usage:
//   node apps/web/scripts/measure-surfaces.mjs --base http://localhost:3141 --out out.json \
//     [--state anon] [--state login=<storageState.json>] [--paths /,/benefits] [--widths 390,1440] [--shots <dir>]
// Counts, per page × state × width: grey (achromatic, not #fff) background faces ≥ 8×8 (computed colours — lab()/oklch()/
// color-mix() included — are resolved to sRGB through a canvas), the font-weight set of text nodes, the radius set of controls and
// faces, block heights ([data-block]) and header overflow. Interaction-state rules (:hover/:active/…) cannot be seen statically
// in the DOM, so a CSS grep counts the ones that paint grey. Playwright is loaded from this repo or from PLAYWRIGHT_FROM.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "..");
const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const many = (name) => args.flatMap((a, i) => (a === `--${name}` ? [args[i + 1]] : []));

const BASE = opt("base", "http://localhost:3141");
const OUT = opt("out", null);
const SHOTS = opt("shots", null);
const PATHS = opt("paths", "/,/benefits,/pages/groups,/my,/my/wallet,/c/elina").split(",");
const WIDTHS = opt("widths", "390,1440").split(",").map(Number);
const HEADER_WIDTHS = [360, 390, 768, 1024, 1200, 1280, 1440];
const STATES = (many("state").length ? many("state") : ["anon"]).map((s) => { const [name, file] = s.split("="); return { name, file }; });

// U-7 (user 2026-11-09 11:36): passport paper and foil are a concept exception. Only these faces are excluded from the grey count.
export const GREY_EXCEPTIONS = [
  { module: "passport-book-module", classes: ["book", "cover", "stampLeaf", "photo"] },
  { module: "passport-identity-artwork-module", classes: "*" },
  { module: "passport-stamp-artwork-module", classes: "*" },
];
// The common layer: tokens + fan-ui + fan-shell modules.
const commonModules = new Set(
  ["components/fan-ui", "components/fan-shell"].flatMap((dir) =>
    fs.readdirSync(path.join(webRoot, dir)).filter((f) => f.endsWith(".module.css")).map((f) => f.replace(/\.module\.css$/, "-module")),
  ),
);

// ---- static CSS grep: interaction-state rules that paint grey, and --color-soft users ----
const GREY_VALUE = /var\(--color-soft\)|var\(--color-line-subtle\)|oklch\(\s*\d+(\.\d+)?%\s+0\s+0\s*\)|#(f[0-9a-f]){3}\b|#e[0-9a-f]e[0-9a-f]e[0-9a-f]\b/i;
const STATE_SELECTOR = /:hover|:active|:focus|\[data-highlighted\]|\[data-popup-open\]|:disabled|\[aria-disabled/;
function walkCss(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walkCss(p, acc); else if (entry.name.endsWith(".css")) acc.push(p);
  }
  return acc;
}
function staticCss() {
  const files = walkCss(webRoot);
  const result = { stateGreyRules: { common: [], screen: 0 }, colorSoftUses: { tokens: 0, common: 0, screen: 0, files: 0 } };
  for (const file of files) {
    const rel = path.relative(webRoot, file);
    const scope = rel === "app/globals.css" ? "tokens" : /^components\/fan-(ui|shell)\//.test(rel) ? "common" : "screen";
    const css = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const soft = (css.match(/var\(--color-soft\)/g) || []).length + (css.match(/--color-soft\s*:/g) || []).length;
    if (soft) { result.colorSoftUses[scope] += soft; if (scope === "screen") result.colorSoftUses.files += 1; }
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const [, selector, body] = m;
      if (!STATE_SELECTOR.test(selector)) continue;
      const bg = body.split(";").filter((d) => /^\s*background(-color)?\s*:/.test(d) && GREY_VALUE.test(d));
      if (!bg.length) continue;
      if (scope === "screen") result.stateGreyRules.screen += 1;
      else result.stateGreyRules.common.push(`${rel}: ${selector.trim().replace(/\s+/g, " ")} { ${bg.map((d) => d.trim()).join("; ")} }`);
    }
  }
  return result;
}

// ---- in-page measurement ----
// ---- production class names: hash_cls -> source module (no source maps, so match each hash's class set to the CSS file that defines them) ----
const moduleClasses = (() => {
  const index = new Map();
  for (const file of walkCss(webRoot).filter((f) => f.endsWith(".module.css"))) {
    const css = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    index.set(path.basename(file).replace(/\.module\.css$/, "-module"), new Set([...css.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1])));
  }
  return index;
})();
function stylesheetClasses() {
  const byHash = {};
  const visit = (rules) => { for (const rule of rules) {
    if (rule.cssRules && !rule.selectorText) { visit(rule.cssRules); continue; }
    for (const m of (rule.selectorText || "").matchAll(/\.(_?[A-Za-z0-9_-]{6})_([A-Za-z_][\w-]*)/g)) (byHash[m[1]] ||= new Set()).add(m[2]);
  } };
  for (const sheet of document.styleSheets) { try { visit(sheet.cssRules); } catch { /* cross-origin */ } }
  return Object.fromEntries(Object.entries(byHash).map(([h, set]) => [h, [...set]]));
}
// A hash belongs to the module whose class set matches best (Jaccard >= .8 and strictly better than the runner-up); otherwise it stays unresolved.
function hashToModule(byHash, index) {
  const map = {};
  for (const [hash, classes] of Object.entries(byHash)) {
    const seen = new Set(classes);
    const scored = [...index].map(([name, set]) => { const inter = classes.filter((c) => set.has(c)).length; return [name, inter / (set.size + seen.size - inter)]; }).sort((a, b) => b[1] - a[1]);
    if (scored[0] && scored[0][1] >= 0.8 && (!scored[1] || scored[0][1] > scored[1][1])) map[hash] = scored[0][0];
  }
  return map;
}

function pageProbe({ exceptions, common, hashToModule }) {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const toRgb = (css) => {
    ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = "#000"; ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data; return { r, g, b, a: a / 255 };
  };
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const oklch = ({ r, g, b }) => {
    const [R, G, B] = [lin(r), lin(g), lin(b)];
    const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
    const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
    const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
    const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
    const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    return { L, C: Math.hypot(A, Bb) };
  };
  const hex = ({ r, g, b }) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  // dev: `name-module__hash__cls`. production: `hash_cls` (6-char hash); the hash is resolved to its source module through hashToModule.
  const splitClass = (c) => { const m = c.match(/^(.+-module)__[A-Za-z0-9_-]{6}__(.+)$/); if (m) return { module: m[1], cls: m[2] }; const p = c.match(/^(_?[A-Za-z0-9_-]{6})_([A-Za-z_][\w-]*)$/); return p && hashToModule[p[1]] ? { module: hashToModule[p[1]], cls: p[2] } : null; };
  const modulesOf = (el) => [...el.classList].map(splitClass).filter(Boolean);
  const isException = (el) => modulesOf(el).some(({ module, cls }) => exceptions.some((x) => x.module === module && (x.classes === "*" || x.classes.includes(cls))));
  const ruleOwners = (el) => {
    const owners = [];
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch { continue; }
      const visit = (list) => { for (const rule of list) {
        if (rule.cssRules && !rule.selectorText) { if (!rule.media || matchMedia(rule.media.mediaText).matches) visit(rule.cssRules); continue; }
        if (!rule.selectorText || !(rule.style.background || rule.style.backgroundColor)) continue;
        let hit = false; try { hit = el.matches(rule.selectorText); } catch {}
        if (hit) owners.push(`${rule.selectorText.replace(/([a-z0-9-]+-module)__[A-Za-z0-9_-]{6}__/gi, "$1.").replace(/\.(_?[A-Za-z0-9_-]{6})_(?=[A-Za-z_])/g, (all, h) => (hashToModule[h] ? `.${hashToModule[h]}.` : all))} { background: ${rule.style.backgroundColor || rule.style.background} }`);
      } };
      visit(rules);
    }
    return owners.slice(-3);
  };
  const visible = (el, rect) => {
    if (rect.width < 8 || rect.height < 8) return false;
    if (rect.right <= 0 || rect.bottom <= 0 || rect.left >= document.documentElement.scrollWidth) return false; // skip links and other off-page boxes
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") return false;
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) if (Number(getComputedStyle(n).opacity) === 0) return false;
    return true;
  };

  const grey = []; const weights = {}; const radii = {};
  for (const el of document.body.querySelectorAll("*")) {
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if ([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && rect.width > 0 && cs.visibility !== "hidden") weights[cs.fontWeight] = (weights[cs.fontWeight] || 0) + 1;
    if (!visible(el, rect)) continue;
    const bg = cs.backgroundColor; const rgb = toRgb(bg);
    const painted = rgb.a > 0;
    const control = el.matches("a, button, [role=tab], [role=button], input, select, textarea");
    if (control || painted || cs.borderTopWidth !== "0px") radii[cs.borderTopLeftRadius] = (radii[cs.borderTopLeftRadius] || 0) + 1;
    if (!painted) continue;
    const flat = { r: Math.round(rgb.r * rgb.a + 255 * (1 - rgb.a)), g: Math.round(rgb.g * rgb.a + 255 * (1 - rgb.a)), b: Math.round(rgb.b * rgb.a + 255 * (1 - rgb.a)) };
    if (flat.r >= 254 && flat.g >= 254 && flat.b >= 254) continue;
    const { L, C } = oklch(flat);
    if (C > 0.01) continue;
    const mods = modulesOf(el);
    const owners = ruleOwners(el);
    const ownerModules = [...new Set(owners.map((o) => (o.match(/([a-z0-9-]+-module)\./i) || [])[1]).filter(Boolean))];
    const origin = ownerModules.length ? (ownerModules.some((m) => common.includes(m)) ? "common" : "screen") : (mods.some((m) => common.includes(m.module)) ? "common" : "screen-or-inline");
    grey.push({
      tag: el.tagName.toLowerCase(), classes: mods.map((m) => `${m.module}.${m.cls}`).join(" ") || el.className.toString().slice(0, 80),
      computed: bg, hex: hex(flat), L: Number(L.toFixed(3)), size: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
      exception: isException(el), origin, owners,
    });
  }
  const blocks = [...document.querySelectorAll("[data-block]")].map((el) => ({ block: el.getAttribute("data-block"), height: Math.round(el.getBoundingClientRect().height * 10) / 10 }));
  const headings = [...document.querySelectorAll("main h2")].map((h) => h.textContent.trim().slice(0, 40));
  return { signedIn: Boolean(document.querySelector("[data-header-status]")), grey, weights, radii, blocks, headings, docHeight: document.documentElement.scrollHeight, overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth };
}

function headerProbe() {
  const header = document.querySelector("header");
  if (!header) return { header: false };
  const clipped = [...header.querySelectorAll("*")].filter((el) => el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && el.textContent.trim() && getComputedStyle(el).overflow !== "visible")
    .map((el) => el.className.toString().replace(/([a-z0-9-]+-module)__[A-Za-z0-9_-]{6}__/gi, "$1.").slice(0, 80));
  const items = [...header.querySelectorAll("a, button")].filter((el) => el.getBoundingClientRect().width > 0).length;
  return { header: true, overflow: header.scrollWidth > header.clientWidth + 1, clipped, items, height: Math.round(header.getBoundingClientRect().height) };
}

async function main() {
  const require = createRequire(process.env.PLAYWRIGHT_FROM ? path.join(process.env.PLAYWRIGHT_FROM, "package.json") : import.meta.url);
  const { chromium } = require("playwright");
  const browser = await chromium.launch();
  const out = { base: BASE, at: new Date().toISOString(), exceptions: GREY_EXCEPTIONS, static: staticCss(), pages: [], header: [] };
  const probeArgs = { exceptions: GREY_EXCEPTIONS, common: [...commonModules], hashToModule: {} };
  try {
    for (const state of STATES) {
      const storage = state.file ? JSON.parse(fs.readFileSync(state.file, "utf8")) : undefined;
      if (storage) for (const o of storage.origins || []) o.origin = new URL(BASE).origin; // the dev-fan-3 state was saved on another local port
      for (const width of WIDTHS) {
        const context = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 }, deviceScaleFactor: 1, storageState: storage, locale: "ko-KR" });
        const page = await context.newPage();
        for (const route of PATHS) {
          let me = null;
          page.on("response", (r) => { if (r.url().includes("/api/me/summary")) me = r.status(); });
          await page.goto(new URL(route, BASE).href, { waitUntil: "load", timeout: 240000 });
          await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
          // Measure the loaded page, not its skeleton: wait (max 45s) until no loading placeholder is left.
          await page.waitForFunction(() => !document.querySelector('[aria-busy="true"], [class*="fan-skeleton-module__"], [class*="Skeleton"], [class*="skeleton"]'), null, { timeout: 45000, polling: 500 }).catch(() => {});
          await page.waitForTimeout(1000);
          probeArgs.hashToModule = hashToModule(await page.evaluate(stylesheetClasses), moduleClasses);
          const result = await page.evaluate(pageProbe, probeArgs);
          const greyFaces = result.grey.filter((g) => !g.exception);
          out.pages.push({
            route, state: state.name, width, finalUrl: page.url().replace(BASE, ""), meSummary: me,
            greyCount: greyFaces.length, greyCommon: greyFaces.filter((g) => g.origin === "common").length, greyExceptions: result.grey.length - greyFaces.length,
            ...result,
          });
          if (SHOTS) {
            fs.mkdirSync(SHOTS, { recursive: true });
            const slug = route === "/" ? "home" : route.replace(/^\//, "").replace(/\//g, "-");
            await page.screenshot({ path: path.join(SHOTS, `${slug}-${state.name}-${width}.png`), fullPage: true });
          }
          page.removeAllListeners("response");
        }
        await context.close();
      }
      for (const width of HEADER_WIDTHS) {
        const context = await browser.newContext({ viewport: { width, height: 800 }, storageState: storage, locale: "ko-KR" });
        const page = await context.newPage();
        await page.goto(new URL("/", BASE).href, { waitUntil: "load", timeout: 240000 });
        await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
        await page.waitForTimeout(1000);
        out.header.push({ state: state.name, width, ...(await page.evaluate(headerProbe)) });
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  const summary = out.pages.map((p) => `${p.state}\t${p.width}\t${p.route}\tgrey=${p.greyCount} (common ${p.greyCommon}, exceptions ${p.greyExceptions})\th=${p.docHeight}\tsignedIn=${p.signedIn}`);
  console.log(summary.join("\n"));
  console.log(`header overflow: ${out.header.filter((h) => h.overflow || h.clipped?.length).length}/${out.header.length}`);
  console.log(`state rules painting grey: common ${out.static.stateGreyRules.common.length}, screen ${out.static.stateGreyRules.screen}; --color-soft uses: ${JSON.stringify(out.static.colorSoftUses)}`);
  if (OUT) fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
}

await main();
