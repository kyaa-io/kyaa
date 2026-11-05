#!/usr/bin/env node
// 탭 간 같은 역할 요소의 계산값을 재서 역할×탭 비교표(md, json)를 만든다.
// 실행 예:
//   NODE_PATH=<repo>/node_modules node apps/web/scripts/measure-tab-parity.mjs \
//     --base https://dev.kyaa.io --out <dir> --widths 390,1440 \
//     --tab 홈=/ --tab 모임=/pages/groups?locale=ko --tab 덕질=/benefits?locale=ko \
//     [--storage <테스트계정>.storageState.json]
// 다크 모드: DESIGN.md가 light-only(theme: "light-only")이므로 측정하지 않고, 기록란에 그 사실을 적는다.
// 값을 찾지 못하면 "없음"(그 탭에 역할 요소가 없음) 또는 "측정 실패"(오류)로 낸다. 조용히 건너뛰지 않는다.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

// ── 역할 지정 표: 탭을 더하려면 TAB_OVERRIDES에 키만 추가한다. ──
// selectors는 위에서부터 보이는 첫 요소를 쓴다. 탭별 재정의가 있으면 그것을 먼저 시도한다.
export const ROLES = {
  "화면 제목": ["main h1", "h1"],
  "구역 제목": ["main h2:not([class*=srOnly]):not([class*=carousel] *)", "main h2:not([class*=srOnly])"], // 탭에 따라 히어로 h2를 잡을 수 있어 TAB_OVERRIDES로 지정
  "본문": ["main p:not([class*=meta]):not([class*=caption])", "main [class*=description]", "main [class*=body]"],
  "보조 정보": ["main small", "main time", "main [class*=meta]", "main [class*=caption]", "main [class*=sub]"],
  "카드 외곽": ["main article", "main li[class*=card]", "main [class*=card]:not(button):not(a)", "main [class*=Card]"],
  "강조 버튼": ["a[class*=action][class*=primary]", "button[class*=action][class*=primary]", "main button[class*=primary]", "main a[class*=primary]", "main button[type=submit]"],
  "보조 버튼": ["a[class*=action][class*=neutral]", "button[class*=action][class*=neutral]", "main button[class*=secondary]", "main a[class*=secondary]", "main [class*=outline]"],
  "탭/세그먼트": ["main [role=tab]", "main button[class*=chip]", "main button[aria-pressed]", "main [class*=tabs] > a", "main [aria-selected]:not([class*=carousel])"],
  "빈 상태": ["main [class*=empty]", "main [class*=Empty]"],
  "오류": ["main [role=alert]", "main [class*=error]", "main [class*=Error]"],
};
// 확인 근거(2026-11-05 요소 박스 조사): 홈 구역 제목은 FanHeading(클래스 *_heading) h2이고 캐러셀 히어로 h2(28~42px)와 구분해야 한다.
// 홈 보조 정보는 게시판 표의 날짜 time, 홈 탭은 클래스 없는 aria-pressed 버튼(내 최애/전체/아이돌), 덕질 탭은 HistoryTabs의 a.
export const TAB_OVERRIDES = {
  "홈": {
    "구역 제목": ["main h2[class*=_heading]"],
    "보조 정보": ["main time"],
    "탭/세그먼트": ["main button[aria-pressed]:not([class*=carousel])"],
    "본문": [], // 홈에는 본문 역할이 없다(2026-11-06): 빈 목록이면 "없음"으로 낸다
  },
  "모임": {
    "보조 정보": ["main span[class*=meta]"],
    "탭/세그먼트": ["main button[class*=chip]"],
  },
  "덕질": {
    "탭/세그먼트": ["main [class*=tabs] > a"],
  },
};

const STYLE_KEYS = ["owner", "position", "fontFamily", "fontSize", "fontWeight", "lineHeight", "color", "backgroundColor", "borderRadius", "padding", "border", "boxShadow", "height", "gapToNext"];

function args() {
  const a = process.argv.slice(2);
  const o = { tabs: [], widths: [390, 1440], base: "https://dev.kyaa.io", out: ".", storage: "", only: "" };
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    const v = a[i + 1];
    if (k === "--base") { o.base = v; i++; }
    else if (k === "--out") { o.out = v; i++; }
    else if (k === "--storage") { o.storage = v; i++; }
    else if (k === "--widths") { o.widths = v.split(",").map(Number); i++; }
    else if (k === "--only") { o.only = v; i++; }
    else if (k === "--tab") { const j = v.indexOf("="); o.tabs.push([v.slice(0, j), v.slice(j + 1)]); i++; }
  }
  if (!o.tabs.length) throw new Error("--tab 이름=경로 를 하나 이상 지정한다");
  return o;
}

// 브라우저 안에서 실행: 역할별 첫 보이는 요소의 값을 뽑는다.
function collect({ roles, keys }) {
  const out = {};
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && r.bottom > 0;
  };
  // 역할별 추가 조건: 본문은 실제 문장(12자 이상, 높이 12px 이상), 카드 외곽은 테두리·그림자·배경+반경 중 하나가 있는 상자.
  const extra = {
    "본문": (el) => (el.textContent || "").trim().length >= 8 && el.getBoundingClientRect().height >= 12 && el.getBoundingClientRect().width >= 100,
    "카드 외곽": (el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const bordered = parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== "none";
      const shadow = cs.boxShadow !== "none";
      const filled = cs.backgroundColor !== "rgba(0, 0, 0, 0)" && parseFloat(cs.borderTopLeftRadius) > 0;
      return r.height >= 60 && (bordered || shadow || filled);
    },
  };
  // 공통 소유자: 요소 또는 가까운 조상(3단계)의 CSS 모듈 클래스가 fan-ui 컴포넌트 이름으로 끝나면 공통, 아니면 로컬 CSS.
  const OWNERS = [["_heading", "FanHeading"], ["_surface", "FanSurface"], ["_action", "FanAction"], ["_state", "FanState"]];
  const ownerOf = (el) => {
    let e = el;
    for (let i = 0; e && i < 4; i++, e = e.parentElement) {
      for (const c of String(e.className || "").split(" ")) {
        for (const [suf, name] of OWNERS) if (c.endsWith(suf)) return name;
      }
    }
    return "로컬 CSS";
  };
  for (const [role, sels] of Object.entries(roles)) {
    let found = null;
    let usedSel = "";
    try {
      for (const sel of sels) {
        const el = [...document.querySelectorAll(sel)].find((e) => visible(e) && (!extra[role] || extra[role](e)));
        if (el) { found = el; usedSel = sel; break; }
      }
    } catch (e) {
      out[role] = { status: "측정 실패", reason: String(e) };
      continue;
    }
    if (!found) { out[role] = { status: "없음" }; continue; }
    try {
      const cs = getComputedStyle(found);
      const r = found.getBoundingClientRect();
      const next = found.nextElementSibling;
      const gap = next ? Math.round(next.getBoundingClientRect().top - r.bottom) : null;
      out[role] = {
        status: "ok",
        selector: usedSel,
        tag: found.tagName.toLowerCase(),
        cls: String(found.className || "").slice(0, 80),
        text: (found.textContent || "").trim().slice(0, 24),
        values: {
          owner: ownerOf(found),
          position: `x${Math.round(r.left)} y${Math.round(r.top + scrollY)} w${Math.round(r.width)}`,
          fontFamily: cs.fontFamily.split(",")[0].replace(/"/g, ""),
          fontSize: cs.fontSize,
          fontWeight: cs.fontWeight,
          lineHeight: cs.lineHeight,
          color: cs.color,
          backgroundColor: cs.backgroundColor,
          borderRadius: cs.borderRadius,
          padding: cs.padding,
          border: cs.borderTopWidth + " " + cs.borderTopStyle + " " + cs.borderTopColor,
          boxShadow: cs.boxShadow,
          height: Math.round(r.height * 10) / 10 + "px",
          gapToNext: gap === null ? "-" : gap + "px",
        },
      };
    } catch (e) {
      out[role] = { status: "측정 실패", reason: String(e) };
    }
  }
  return out;
}

// 구성(짜임새) 측정: 여백, 최대 폭, 제목 위치, 구역·카드 간격, 폴드 안 구역 수와 강조 버튼 수, 가로 넘침.
function layout() {
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.display !== "none" && cs.visibility !== "hidden"; };
  const px = (n) => (n === null || n === undefined || Number.isNaN(n) ? "측정 실패" : Math.round(n) + "px");
  const out = {};
  const vh = innerHeight;
  const h1 = [...document.querySelectorAll("main h1, h1")].find(vis);
  const header = [...document.querySelectorAll("header")].find((e) => vis(e) && e.getBoundingClientRect().top < 5);
  out["가로 넘침"] = document.documentElement.scrollWidth > innerWidth ? "있음(" + document.documentElement.scrollWidth + "px)" : "없음";
  if (h1) {
    const r = h1.getBoundingClientRect();
    out["제목 왼쪽 여백"] = px(r.left);
    const mn = document.querySelector("main"); if (mn) { const mr = mn.getBoundingClientRect(); out["main 좌우 안쪽 패딩"] = getComputedStyle(mn).paddingLeft + "/" + getComputedStyle(mn).paddingRight; out["main 오른쪽 여백"] = px(innerWidth - mr.right); }
    out["제목 위치(문서 y)"] = px(r.top + scrollY);
    out["상단 바 아래 제목 여백"] = header ? px(r.top + scrollY - header.getBoundingClientRect().bottom) : "상단 바 없음";
    // 콘텐츠 최대 폭: h1에서 올라가며 max-width가 있는 첫 조상의 폭
    let e = h1.parentElement, mw = "max-width 없음(전체 폭)";
    for (let i = 0; e && e !== document.body && i < 8; i++, e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.maxWidth !== "none") { mw = cs.maxWidth + " (" + e.tagName.toLowerCase() + "." + String(e.className).split(" ")[0] + ")"; break; }
    }
    out["콘텐츠 max-width"] = mw;
    out["제목 소유자"] = /_heading/.test(String(h1.className)) ? "FanHeading" : "로컬 CSS(" + (String(h1.className).split(" ")[0] || "클래스 없음") + ")";
  } else {
    out["제목 왼쪽 여백"] = "없음";
  }
  // 구역 제목(h2) 간격: 캐러셀·sr-only 제외, 앞 10개
  const h2s = [...document.querySelectorAll("main h2")].filter((e) => vis(e) && !/srOnly/.test(String(e.className)) && !e.closest("[class*=carousel]") && !e.closest("[class*=hero]")).filter((e) => e.getBoundingClientRect().left >= 0).slice(0, 10);
  const above = []; const below = [];
  for (const h of h2s) {
    let block = h;
    if (h.parentElement && h.parentElement.children.length <= 3 && h.parentElement.tagName !== "SECTION" && h.parentElement.tagName !== "MAIN") block = h.parentElement;
    const nx = block.nextElementSibling; const pv = block.previousElementSibling;
    const br = block.getBoundingClientRect();
    if (nx && vis(nx)) below.push(Math.round(nx.getBoundingClientRect().top - br.bottom));
    const box = h.closest("section") || h.parentElement; // 구역 컨테이너 상단→제목 상단(2026-11-06 기준)
    if (box) above.push(Math.round(h.getBoundingClientRect().top - box.getBoundingClientRect().top));
  }
  out["구역 제목 위 간격(앞 10개)"] = above.length ? above.join("/") : "측정 실패";
  out["구역 제목-내용 간격(앞 10개)"] = below.length ? below.join("/") : "측정 실패";
  // 구역 사이: 구역 제목 y 간격
  out["구역 수(제목 h2)"] = String(h2s.length);
  // 카드 간격: 같은 부모의 형제 카드(테두리·그림자·배경 있는 60px 이상 상자) 사이
  const cardOk = (el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return r.height >= 60 && r.width >= 100 && ((parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== "none") || cs.boxShadow !== "none"); };
  let gaps = "카드 없음";
  for (const el of document.querySelectorAll("main a, main article, main li, main div")) {
    if (!vis(el) || !cardOk(el)) continue;
    const sibs = [...el.parentElement.children].filter((s) => vis(s) && cardOk(s));
    if (sibs.length < 2) continue;
    const g = [];
    for (let i = 1; i < sibs.length && i < 6; i++) { const a = sibs[i - 1].getBoundingClientRect(), b = sibs[i].getBoundingClientRect(); const v = b.top - a.bottom; const hgap = b.left - a.right; g.push(Math.round(v > 0 ? v : hgap)); }
    gaps = g.join("/") + " (부모 gap " + getComputedStyle(el.parentElement).gap + ")";
    break;
  }
  out["카드 사이 간격"] = gaps;
  // 폴드: 첫 화면 안
  out["폴드 안 구역 제목 수"] = String(h2s.filter((e) => e.getBoundingClientRect().top < vh).length);
  const prim = [...document.querySelectorAll("a[class*=action][class*=primary], button[class*=action][class*=primary]")].filter((e) => vis(e) && e.getBoundingClientRect().top < vh && e.getBoundingClientRect().bottom > 0);
  out["폴드 안 강조 버튼 수"] = String(prim.length);
  return out;
}

async function version(base) {
  try {
    const r = await fetch(base + "/api/health/live");
    const j = await r.json();
    return String(j.revision || "").slice(0, 9) || "알 수 없음";
  } catch (e) {
    return "조회 실패";
  }
}

async function main() {
  const o = args();
  fs.mkdirSync(o.out, { recursive: true });
  const startedAt = new Date().toISOString();
  const verBefore = await version(o.base);
  const browser = await chromium.launch({ headless: true });
  const results = []; // {tab,width,roles}
  const failures = [];
  for (const [tab] of o.tabs) { void tab; }
  for (const width of o.widths) {
    for (const [tab, route] of o.tabs) {
      if (o.only && o.only !== tab) continue;
      const ctx = await browser.newContext({
        viewport: { width, height: width < 600 ? 844 : 900 },
        storageState: o.storage || undefined,
        colorScheme: "light",
      });
      const page = await ctx.newPage();
      const roles = { ...ROLES, ...(TAB_OVERRIDES[tab] || {}) };
      // 구성 측정에 쓸 카드 판정은 collect와 같은 규칙을 layout() 안에서 다시 쓴다.
      try {
        const resp = await page.goto(o.base + route, { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
        await page.waitForTimeout(1500);
        const status = resp ? resp.status() : 0;
        if (status >= 400) throw new Error("HTTP " + status);
        const data = await page.evaluate(collect, { roles, keys: STYLE_KEYS });
        const lay = await page.evaluate(layout, { tab });
        results.push({ tab, width, route, url: page.url(), roles: data, layout: lay });
      } catch (e) {
        failures.push({ tab, width, reason: String(e).slice(0, 160) });
        results.push({ tab, width, route, error: String(e).slice(0, 160), roles: {} });
      }
      await ctx.close();
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  await browser.close();
  const verAfter = await version(o.base);

  const meta = {
    startedAt,
    finishedAt: new Date().toISOString(),
    base: o.base,
    versionBefore: verBefore,
    versionAfter: verAfter,
    widths: o.widths,
    darkMode: "미포함: DESIGN.md가 theme light-only. colorScheme은 light로 고정",
    login: o.storage ? "로그인 상태(storageState 사용)" : "비로그인",
  };
  fs.writeFileSync(path.join(o.out, "parity.json"), JSON.stringify({ meta, results, failures }, null, 1));

  // md: 폭별, 역할별 표. 값 종류별로 탭 열을 두고, 값이 다른 행은 ⚠ 표시.
  const tabs = o.tabs.map((t) => t[0]);
  let md = `# 탭 간 실측 비교\n\n- 측정 시각: ${meta.startedAt} ~ ${meta.finishedAt}\n- 대상: ${meta.base} (응답 버전 시작 ${verBefore} / 끝 ${verAfter}${verBefore !== verAfter ? " ⚠ 도중 변경" : ""})\n- ${meta.login}\n- 다크 모드: ${meta.darkMode}\n- ⚠ = 탭 사이 값이 다름. 없음 = 그 탭에 해당 역할 요소가 보이지 않음. 측정 실패/미측정 = 값을 얻지 못함.\n`;
  if (failures.length) md += `- 미측정(페이지 오류): ${failures.map((f) => `${f.tab}@${f.width} ${f.reason}`).join("; ")}\n`;
  const diffs = [];
  for (const width of o.widths) {
    md += `\n## ${width}px\n`;
    for (const role of Object.keys(ROLES)) {
      md += `\n### ${role}\n\n| 항목 | ${tabs.join(" | ")} |\n|---|${tabs.map(() => "---").join("|")}|\n`;
      const cells = tabs.map((t) => results.find((r) => r.tab === t && r.width === width)?.roles?.[role]);
      const row = (label, f, noDiff) => {
        const vals = cells.map((c, i) => {
          const res = results.find((r) => r.tab === tabs[i] && r.width === width);
          if (!res || res.error) return "미측정";
          if (!c) return "측정 실패";
          if (c.status === "없음") return "없음";
          if (c.status !== "ok") return "측정 실패";
          return f(c);
        });
        const real = [...new Set(vals.filter((v) => !["없음", "미측정", "측정 실패"].includes(v)))];
        const differ = real.length > 1;
        if (differ && !noDiff) diffs.push({ width, role, label, vals: Object.fromEntries(tabs.map((t, i) => [t, vals[i]])) });
        md += `| ${differ ? "⚠ " : ""}${label} | ${vals.map((v) => v.replace(/\|/g, "/")).join(" | ")} |\n`;
      };
      row("잡힌 요소", (c) => `${c.tag}.${c.cls.split(" ")[0] || "-"} "${c.text}"`, true);
      for (const k of STYLE_KEYS) row(k, (c) => c.values[k]);
    }
  }
  md += `\n## 구성(짜임새) 지표\n`;
  const lkeys = [...new Set(results.flatMap((r) => Object.keys(r.layout || {})))];
  for (const width of o.widths) {
    md += `\n### ${width}px\n\n| 지표 | ${tabs.join(" | ")} |\n|---|${tabs.map(() => "---").join("|")}|\n`;
    for (const k of lkeys) {
      const vals = tabs.map((t) => { const r = results.find((x) => x.tab === t && x.width === width); return !r || r.error ? "미측정" : (r.layout && r.layout[k]) || "측정 실패"; });
      const real = [...new Set(vals.filter((v) => !["미측정", "측정 실패"].includes(v)))];
      const differ = real.length > 1;
      if (differ) diffs.push({ width, role: "구성", label: k, vals: Object.fromEntries(tabs.map((t, i) => [t, vals[i]])) });
      md += `| ${differ ? "⚠ " : ""}${k} | ${vals.join(" | ")} |\n`;
    }
  }
  md += `\n## 값이 다른 항목 수\n\n${diffs.length}건 (json의 diffs 참고)\n`;
  fs.writeFileSync(path.join(o.out, "parity.md"), md);
  fs.writeFileSync(path.join(o.out, "diffs.json"), JSON.stringify(diffs, null, 1));
  console.log(`done: ${o.out} results=${results.length} failures=${failures.length} diffs=${diffs.length} version ${verBefore}->${verAfter}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
