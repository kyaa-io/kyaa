// 반응형 시스템 측정 함수(DESIGN.md "Responsive system" R12). 브라우저가 모은 원시 값을 받아 판정만 하는 순수 함수라 단위 시험이 된다.
export const WIDTHS = [390, 1024, 1440];
export const LINE_LIMITS = { ko: { warn: 45, fail: 60 }, latin: { warn: 75, fail: 100 } };
export const ROW_GAP_MAX_RATIO = 0.4;
export const MARGIN_TOLERANCE_PX = 2;
export const ROW_MIN_WIDTH = 1024;

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/g;

export function hangulShare(text) {
  const t = String(text).replace(/\s+/g, "");
  if (!t.length) return 0;
  return (t.match(HANGUL) ?? []).length / t.length;
}

/** 한 줄에 들어가는 글자 수 추정: 한글은 약 0.95em, 라틴·숫자는 약 0.5em. */
export function charsPerLine({ text, width, fontSize }) {
  const share = hangulShare(text);
  const per = fontSize * (share * 0.95 + (1 - share) * 0.5);
  return per > 0 ? width / per : 0;
}

export const lineCount = ({ height, lineHeight }) => (lineHeight > 0 ? Math.round(height / lineHeight) : 1);

/** 문단 1개 판정. 한 줄짜리(제목·행)는 제외한다. */
export function judgeParagraph(p) {
  if (lineCount(p) < 2) return { status: "skip", cpl: 0 };
  const lang = hangulShare(p.text) >= 0.5 ? "ko" : "latin";
  const limit = LINE_LIMITS[lang];
  const cpl = Math.round(charsPerLine(p) * 10) / 10;
  const status = cpl > limit.fail ? "fail" : cpl > limit.warn ? "warn" : "ok";
  return { status, cpl, lang, limit };
}

export const overflowX = ({ scrollWidth, clientWidth }) => scrollWidth > clientWidth;

/** 이름과 값 사이의 빈 간격 비율. 1024 이상에서만 판정한다. */
export function judgeRow(row, viewport) {
  if (viewport < ROW_MIN_WIDTH || !(row.width > 0)) return { status: "skip", ratio: 0 };
  const gap = Math.max(0, row.valueLeft - row.nameRight);
  const ratio = Math.round((gap / row.width) * 1000) / 1000;
  return { status: ratio > ROW_GAP_MAX_RATIO ? "fail" : "ok", ratio };
}

export function judgeMargins({ left, right }) {
  const diff = Math.round(Math.abs(left - right) * 10) / 10;
  return { status: diff > MARGIN_TOLERANCE_PX ? "fail" : "ok", diff };
}

/** 한 페이지·한 폭의 원시 측정값 -> 실패 목록. */
export function evaluate(raw, viewport) {
  const failures = [];
  const warnings = [];
  if (overflowX(raw)) failures.push({ rule: "overflow-x", detail: `scrollWidth ${raw.scrollWidth} > clientWidth ${raw.clientWidth}` });
  for (const p of raw.paragraphs ?? []) {
    const j = judgeParagraph(p);
    const item = { rule: "line-length", detail: `${j.cpl}자/줄(${j.lang}) ${String(p.text).slice(0, 24)}`, selector: p.selector };
    if (j.status === "fail") failures.push(item);
    else if (j.status === "warn") warnings.push(item);
  }
  for (const r of raw.rows ?? []) {
    const j = judgeRow(r, viewport);
    if (j.status === "fail") failures.push({ rule: "row-gap", detail: `빈 간격 ${Math.round(j.ratio * 100)}% > 40%`, selector: r.selector });
  }
  if (raw.margins) {
    const j = judgeMargins(raw.margins);
    if (j.status === "fail") failures.push({ rule: "outer-margin", detail: `좌 ${raw.margins.left} / 우 ${raw.margins.right} (차 ${j.diff}px)` });
  }
  return { failures, warnings };
}

export function summarize(results) {
  const lines = [];
  let failed = 0;
  for (const r of results) {
    const mark = r.error ? "ERROR" : r.failures.length ? "FAIL" : "ok";
    if (mark !== "ok") failed += 1;
    lines.push(`${mark.padEnd(5)} ${String(r.width).padStart(4)} ${r.route}${r.error ? ` — ${r.error}` : ""}`);
    for (const f of r.failures) lines.push(`        - ${f.rule}: ${f.detail}${f.selector ? ` [${f.selector}]` : ""}`);
  }
  lines.push(`${results.length - failed}/${results.length} 통과, 실패 ${failed}`);
  return { text: lines.join("\n"), failed };
}

/** 브라우저 안에서 실행되는 수집 함수(page.evaluate). 외부 값을 쓰지 않는다. */
export function collectInPage() {
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
  const sel = (el) => el.tagName.toLowerCase() + (el.id ? `#${el.id}` : "") + (typeof el.className === "string" && el.className ? `.${el.className.trim().split(/\s+/)[0]}` : "");
  const de = document.documentElement;
  const paragraphs = [];
  for (const el of document.querySelectorAll("main p, main li, main dd, article p")) {
    if (el.querySelector("p, li, div") || !vis(el)) continue;
    const text = (el.textContent ?? "").trim();
    if (text.length < 20) continue;
    const s = getComputedStyle(el); const r = el.getBoundingClientRect();
    const fontSize = parseFloat(s.fontSize); const lh = parseFloat(s.lineHeight);
    paragraphs.push({ text, width: r.width - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight), height: r.height - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom), fontSize, lineHeight: Number.isFinite(lh) ? lh : fontSize * 1.5, selector: sel(el) });
  }
  const rows = [];
  for (const el of document.querySelectorAll("main [data-row], main li, main tr")) {
    const kids = [...el.children].filter(vis);
    if (kids.length < 2) continue;
    const r = el.getBoundingClientRect();
    const first = kids[0].getBoundingClientRect(); const last = kids[kids.length - 1].getBoundingClientRect();
    rows.push({ width: r.width, nameRight: first.right, valueLeft: last.left, selector: sel(el) });
  }
  const box = document.querySelector("[data-fan-content-container]") ?? document.querySelector("main");
  let margins = null;
  if (box) { const r = box.getBoundingClientRect(); margins = { left: Math.round(r.left * 10) / 10, right: Math.round((de.clientWidth - r.right) * 10) / 10 }; }
  return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, paragraphs, rows, margins };
}
