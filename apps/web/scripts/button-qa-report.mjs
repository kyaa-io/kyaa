#!/usr/bin/env node
// button-qa-sweep.mjs가 낸 JSON을 표로 옮긴다.
//   node scripts/button-qa-report.mjs --in guest.json --in devfan.json --out 요약.md --all 전체.md
import fs from "node:fs";

const a = process.argv.slice(2);
const ins = [], linksFrom = [];
let out = "", all = "";
for (let i = 0; i < a.length; i += 2) {
  if (a[i] === "--in") ins.push(a[i + 1]);
  else if (a[i] === "--links-from") linksFrom.push(a[i + 1]);
  else if (a[i] === "--out") out = a[i + 1];
  else if (a[i] === "--all") all = a[i + 1];
  else throw new Error(`알 수 없는 인자 ${a[i]}`);
}
if (!(ins.length + linksFrom.length) || !out) throw new Error("--in 과 --out 이 필요하다");

const OWNER = [
  [/^home/, "app/page.tsx, features/home"],
  [/^groups-list/, "app/pages/groups, features/groups"],
  [/^fan-(home|board|calendar|members|rooms|certifications|post)/, "app/[slug], features/groups/ui, features/fan-posts"],
  [/^(dukjil|jjinfan|guide)/, "app/guide, features/dukjil-guide"],
  [/^c-/, "app/c/[slug]"],
  [/^my-wallet/, "app/my/wallet, features/group-wallet"],
  [/^my/, "app/my, features/my"],
  [/^passport/, "features/passport, app/passports"],
  [/^notifications/, "features/notification"],
  [/^rankings/, "features/rankings"],
  [/^live/, "features/live"],
  [/^(admin|operator)/, "app/admin, features/operator"],
];
const ownerOf = (id) => OWNER.find(([re]) => re.test(id))?.[1] || "app";

const EXPECT = (c) => {
  if (c.expanded !== null && c.expanded !== undefined) return "펼침/접힘이 바뀐다";
  if (c.pressed !== null && c.pressed !== undefined) return "선택 상태가 바뀐다";
  if (c.selected !== null && c.selected !== undefined || c.role === "tab") return "탭 내용이 바뀐다";
  if (/로그인|가입/.test(c.name)) return "로그인 창이 열린다";
  if (/닫기|취소|close/i.test(c.name)) return "창이 닫힌다";
  if (/더 ?보기|more/i.test(c.name)) return "목록이 더 나온다";
  if (/검색/.test(c.name)) return "검색 창·결과가 열린다";
  if (/배너|슬라이드|다음|이전|일시정지/.test(c.name)) return "배너가 넘어가거나 멈춘다";
  return "화면이 바뀌거나 요청이 나간다";
};

const rows = [];
let clickedTotal = 0, anomalyTotal = 0;
const writes = new Set();
for (const file of [...ins, ...linksFrom]) {
  const linksOnly = linksFrom.includes(file);
  const d = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const w of d.writesBlocked || []) writes.add(`${d.label} ${w}`);
  for (const s of d.screens) {
    const who = d.label;
    const own = ownerOf(s.id);
    if (linksOnly) { /* 화면 열기 판정은 클릭 입력에서 한다 */ } else if (s.error) { rows.push({ who, screen: s.id, kind: "화면", name: s.url, expect: "화면이 열린다", actual: `열기 실패: ${s.error}`, status: "이상", sev: "높음", own }); continue; }
    if (!linksOnly && s.status >= 400) rows.push({ who, screen: s.id, kind: "화면", name: s.url, expect: "화면이 열린다", actual: `응답 ${s.status}`, status: "이상", sev: "높음", own });
    if (!linksOnly && s.redirected) rows.push({ who, screen: s.id, kind: "화면", name: s.url, expect: "화면이 열리거나 로그인으로 보낸다", actual: `이동 ${s.finalUrl}`, status: /returnTo|login/.test(s.finalUrl) && who === "guest" && !/returnTo/.test(s.finalUrl) ? "이상" : "정상", sev: "낮음", own });
    for (const l of linksOnly || !linksFrom.length ? s.links || [] : []) {
      if (l.kind === "hash" && !l.ok) rows.push({ who, screen: s.id, kind: "링크", name: l.href, expect: "같은 화면의 대상으로 이동", actual: "대상 요소가 없다", status: "이상", sev: "중간", own });
      if (l.kind === "bad") rows.push({ who, screen: s.id, kind: "링크", name: l.href, expect: "이동", actual: "주소 해석 실패", status: "이상", sev: "중간", own });
      if (l.kind !== "internal") continue;
      const last = l.chain[l.chain.length - 1];
      const names = (s.elements || []).filter((e) => e.href === l.href).map((e) => e.name).filter(Boolean);
      const label = `${names[0] || "(이름 없음)"} → ${l.href}`;
      let status = "정상", sev = "", actual = `${last.status ?? last.err}`;
      if (last.err) { status = "이상"; sev = "높음"; actual = `요청 실패 ${last.err}`; }
      else if (last.status >= 500) { status = "이상"; sev = "높음"; }
      else if (last.status === 404) { status = "이상"; sev = "높음"; }
      else if (last.status >= 400 && last.status !== 401 && last.status !== 403) { status = "이상"; sev = "중간"; }
      else if (l.chain.length > 1) {
        actual = l.chain.map((c) => `${c.status}${c.location ? "→" + c.location.replace(/^https?:\/\/[^/]+/, "").slice(0, 70) : ""}`).join(" / ");
        const loginHop = l.chain.find((c) => c.location && /\/login|\/verify|\/auth/.test(c.location));
        if (loginHop && who === "guest" && !/returnTo|redirect|next=/.test(loginHop.location)) { status = "이상"; sev = "중간"; actual += " (복귀 주소 없음)"; }
      }
      if (/\/(login|verify)\b/.test(l.href) && !/returnTo|redirect|next=/.test(l.href) && who === "guest" && !/^\/login\?locale/.test(l.href)) { status = "이상"; sev = sev || "낮음"; actual += " (링크에 복귀 주소 없음)"; }
      rows.push({ who, screen: s.id, kind: "링크", name: label, expect: "열린다(200)", actual, status, sev, own });
    }
    for (const c of linksOnly ? [] : s.clicks || []) {
      if (c.result === "skipped") { rows.push({ who, screen: s.id, kind: "버튼", name: c.name || "(이름 없음)", expect: EXPECT(c), actual: c.reason, status: "못 누름", sev: "", own }); continue; }
      if (c.result === "gone") continue;
      clickedTotal += 1;
      let status = "정상", sev = "", actual;
      if (c.result === "unclickable" || c.result === "failed") { status = "못 누름"; sev = "중간"; actual = c.reason; }
      else if (c.result === "noop") { status = "이상"; sev = "검토"; actual = "눌러도 변화·요청 없음"; }
      else {
        const bits = [];
        if (c.urlChanged) bits.push(`이동 ${c.urlChanged.slice(0, 80)}`);
        if (c.dialogDelta > 0) bits.push("창 열림");
        if (c.dialogDelta < 0) bits.push("창 닫힘");
        if (c.attrChanged) bits.push(`상태 ${c.attrChanged}`);
        if (c.hashChanged) bits.push(`해시 ${c.hashChanged}`);
        if (c.scrolled) bits.push("스크롤");
        if (c.textChanged && !bits.length) bits.push("본문 글자 바뀜");
        if (c.blocked?.length) bits.push(`쓰기 요청(차단) ${c.blocked.join(",")}`);
        if (c.requests?.length && !c.blocked?.length) bits.push(`요청 ${c.requests.slice(0, 2).join(",")}`);
        if (c.popup) bits.push("새 창");
        if (!bits.length) bits.push("DOM 변화");
        actual = bits.join("; ");
      }
      const errs = [...(c.pageErrors || []), ...(c.failed || []), ...(c.console || [])];
      if (errs.length && c.result !== "unclickable") { status = "이상"; sev = c.pageErrors?.length || c.failed?.some((f) => /^5/.test(f)) ? "높음" : "중간"; actual += ` | 오류: ${errs[0].slice(0, 90)}`; }
      if (status === "이상") anomalyTotal += 1;
      rows.push({ who, screen: s.id, kind: "버튼", name: `${c.region === "main" ? "" : "[" + c.region + "] "}${c.name || "(이름 없음)"}`, expect: EXPECT(c), actual, status, sev, own });
    }
    // 이름 없는 요소(접근성)
    for (const e of linksOnly ? [] : s.elements || []) {
      if (!e.hidden && !e.hasName && (e.tag === "button" || e.tag === "a")) rows.push({ who, screen: s.id, kind: e.tag === "a" ? "링크" : "버튼", name: `(이름 없음) ${e.href || ""} ${e.w}x${e.h}@${e.x},${e.y}`, expect: "읽을 수 있는 이름이 있다", actual: "이름 없음", status: "이상", sev: "중간", own });
    }
  }
}

const esc = (t) => String(t ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const line = (r) => `| ${r.who} | ${r.screen} | ${r.kind} | ${esc(r.name)} | ${esc(r.expect)} | ${esc(r.actual)} | ${r.status} | ${r.sev} | ${r.own} |`;
const head = "| 계정 | 화면 | 구분 | 버튼·링크 | 기대 | 실제 | 상태 | 심각도 | 소유 파일 |\n|---|---|---|---|---|---|---|---|---|";
const bad = rows.filter((r) => r.status === "이상");
const stuck = rows.filter((r) => r.status === "못 누름");
const sum = (f) => rows.filter(f).length;
let md = `# 전체 버튼 QA (항목 20)\n\n- 생성: scripts/button-qa-sweep.mjs → button-qa-report.mjs. 입력 ${ins.join(", ")}\n- 눌러 본 버튼 ${clickedTotal}개, 이상 판정 ${bad.length}행(링크 포함), 못 누름 ${stuck.length}행, 전체 ${rows.length}행. 링크는 응답만 확인했다.\n- 쓰기 요청은 서버로 보내지 않고 막았다(막은 요청 ${writes.size}종). 로컬 DB 쓰기: 없음.\n\n## 이상 (심각도 순)\n\n${head}\n`;
const rank = { 높음: 0, 검토: 1, 중간: 2, 낮음: 3, "": 4 };
md += bad.sort((x, y) => rank[x.sev] - rank[y.sev]).map(line).join("\n");
md += `\n\n## 못 누름\n\n${head}\n${stuck.map(line).join("\n")}\n`;
md += `\n## 화면별 요약\n\n| 계정 | 화면 | 정상 | 이상 | 못 누름 |\n|---|---|---|---|---|\n`;
const keys = [...new Set(rows.map((r) => `${r.who}|${r.screen}`))];
for (const k of keys) { const [w, sc] = k.split("|"); const rr = rows.filter((r) => r.who === w && r.screen === sc); md += `| ${w} | ${sc} | ${rr.filter((r) => r.status === "정상").length} | ${rr.filter((r) => r.status === "이상").length} | ${rr.filter((r) => r.status === "못 누름").length} |\n`; }
md += `\n## 막은 쓰기 요청\n\n${[...writes].map((w) => `- ${w}`).join("\n") || "- 없음"}\n`;
fs.writeFileSync(out, md);
if (all) fs.writeFileSync(all, `# 전체 버튼 QA 전체 행\n\n${head}\n${rows.map(line).join("\n")}\n`);
console.log(`행 ${rows.length}, 이상 ${bad.length}, 못 누름 ${stuck.length}, 누름 ${clickedTotal}`);
