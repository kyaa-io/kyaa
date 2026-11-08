// design-lint 추가 규칙(조사: board/reports/design-rules-research.md §1). stylelint 가 못 보는 CSS 선언, TSX 구조, 문구 원본(ko)을 본다.
// 한 파일의 내용을 받아 "규칙|세부" -> 개수 Map 을 돌려준다. 기준선 비교와 출력은 design-lint.mjs 가 한다.
// 심각도: fail 은 새 위반이면 실패, count 는 집계만(경고 출력). 오탐이 큰 규칙은 count 로 두고 이유를 RULES 에 적었다.
import postcss from 'postcss';

export const RULES = {
  // 기존 stylelint·버튼 규칙(C1)
  'color-no-hex': { sev: 'fail', note: 'use var(--color-*)' },
  'color-named': { sev: 'fail', note: 'use var(--color-*)' },
  'function-disallowed-list': { sev: 'fail', note: 'use var(--color-*)' },
  'scale-unlimited/declaration-strict-value': { sev: 'fail', note: 'use a design token' },
  C1: { sev: 'fail', note: 'use FanAction (components/fan-ui/fan-action.tsx) instead of <button>' },
  // 토큰
  T1: { sev: 'count', note: 'font-weight 는 var(--fan-*-weight) 만. 650·750 같은 일반 강조 굵기 토큰이 globals.css 에 없어 새 코드가 따를 수 없으므로 집계(토큰을 만든 뒤 fail 로 승격)' },
  T2: { sev: 'count', note: 'line-height 는 var(--fan-*-leading)·normal·1 만. 숫자 직접 지정이 많아 집계(다음 묶음에서 승격)' },
  T3: { sev: 'fail', note: 'letter-spacing 은 var(--fan-heading-tracking)·0·normal 만' },
  T4: { sev: 'fail', note: 'calc() 안에 원시 px 금지(1px 헤어라인 제외). 토큰 var() 로 계산' },
  T5: { sev: 'fail', note: '모듈 안 --지역변수에 원시 숫자·px 를 두어 토큰을 우회하지 않는다' },
  T6: { sev: 'fail', note: 'box-shadow 색은 var(--color-*) 나 검정 12% 이하만(블러 0 링은 허용)' },
  T7: { sev: 'count', note: 'transition·animation 시간은 var(--motion-*). 애니메이션 전용 값이 많아 집계' },
  T8: { sev: 'fail', note: 'z-index 는 var(--z-*), 0, 1, -1, auto 만' },
  T9: { sev: 'count', note: '44·48·52px 높이·너비는 --min-target·--fan-action-*-height. 이미지 크기와 겹쳐 집계' },
  T10: { sev: 'fail', note: 'font-family 직접 지정 금지(globals.css 와 패스포트 MRZ 제외). inherit·var() 는 허용' },
  // 공통 컴포넌트
  C2: { sev: 'fail', note: '<h1>~<h3> 대신 FanHeading (app/guide 제외)' },
  C3: { sev: 'count', note: '원시 input·textarea·select. 공통 입력 컴포넌트가 없어 집계' },
  C4: { sev: 'fail', note: '인라인 style={{}} 은 width 진행 막대와 CSS 변수 주입만' },
  C5: { sev: 'fail', note: '로딩 글자 대신 FanSkeleton' },
  C6: { sev: 'fail', note: 'FanState kind="loading" 금지, FanSkeleton' },
  C7: { sev: 'count', note: '외부 링크 <a>. 공통 OutboundLink 판별이 정규식으로 불확실해 집계' },
  C8: { sev: 'count', note: 'locale === "ko" ? "..." 하드코딩. 카탈로그 함수 사용. 집계' },
  C9: { sev: 'fail', note: '포인트 숫자(+20P)를 화면 코드에 직접 쓰지 않는다. API 값을 쓴다' },
  C10: { sev: 'fail', note: '이모지·장식 기호로 아이콘을 대신하지 않는다' },
  // 안티패턴
  S1: { sev: 'fail', note: '그라데이션 전부 금지(배경·테두리·마스크·글자). 강조 버튼은 var(--color-accent) 단색. 로고 아트 경로(*logo*·*wordmark*)만 예외(2026-11-09 8장 ⑤)' },
  S2: { sev: 'fail', note: 'backdrop-filter·filter: blur 장식 금지' },
  S3: { sev: 'fail', note: '유채색 번짐 그림자(글로) 금지' },
  S4: { sev: 'count', note: '정적으로 3번 나열된 같은 카드. 데이터라서 같은 경우가 많아 집계' },
  S5: { sev: 'count', note: '가운데 정렬 세로 카드(아이콘+제목+문장). 아이콘 크기를 CSS 로 못 봐 집계' },
  S6: { sev: 'fail', note: 'grayscale() 로 회색 도장·아이콘 나열 금지. 점선 자리 + 획득만 컬러' },
  S7: { sev: 'count', note: '*Intro·*Lead·*Subtitle 소개 문장. 키 이름 추정이라 집계' },
  S8: { sev: 'fail', note: '한 파일에 강조(primary) 버튼 둘 이상 금지' },
  S9: { sev: 'fail', note: 'FanTag·EarnBadge 에는 숫자·단위만(설명 금지)' },
  S10: { sev: 'count', note: '한 모듈에 반경 토큰 3종 이상. 책 모양 예외가 있어 집계' },
  S11: { sev: 'count', note: '줄표·가운뎃점 멋내기, 문장 끝 느낌표. 집계' },
  S12: { sev: 'fail', note: '추상 환대·상투 문구(kyaa-copy 표). 새 ko 문구에만' },
  S13: { sev: 'fail', note: '근거 없는 숫자 홍보(10K+, 99.9%, 24/7)' },
  S14: { sev: 'count', note: 'eyebrow(대문자+자간+작은 글자) 한 모듈 2개 이상. 집계' },
  // 261107-2 검수 규칙(reports/doc-261107-2-review-rules.md N 표). fan-ui 자체는 design-lint 가 건너뛴다.
  N7: { sev: 'count', note: 'animation 을 쓰는 모듈에는 @media (prefers-reduced-motion: reduce) 분기. 전역 분기(globals.css)가 있어 집계' },
  N15: { sev: 'fail', note: '모달·드롭다운·툴팁·팝오버는 fan-ui 래퍼(FanDialog·FanSheet·FanMenu·FanTooltip·FanHelpTip)만. @radix-ui 금지' },
  N15b: { sev: 'count', note: 'fan-ui 밖 @base-ui/react 직접 사용·role="dialog" 수동 마크업. 기존 사용처 치환 중이라 집계' },
  N16: { sev: 'fail', note: 'motion 은 components/fan-ui/fan-motion-pop.tsx 와 보상·출석 연출 파일만. lottie-web 은 stamp-press 만' },
  N20: { sev: 'fail', note: '×N 표기 금지(S4). `N번 남음`·`N명까지`·`N/M` 만' },
};

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const short = (s, n = 110) => { const t = norm(s); return t.length > n ? `${t.slice(0, n)}…` : t; };
const add = (m, key, n = 1) => { if (n > 0) m.set(key, (m.get(key) ?? 0) + n); };

// ---------- CSS ----------
const NAMED = /^(white|black|red|green|blue|yellow|orange|purple|pink|gray|grey|silver|gold|navy|teal|cyan|magenta|lime|maroon|olive|aqua|fuchsia|brown|coral|crimson|indigo|violet)$/i;
const CHROMA = /(primary|service|accent|brand|error|success|warning|pink|purple|blue|red|green)/;

function topLevelSplit(value, sepRe) {
  const parts = [];
  let depth = 0; let cur = '';
  for (const ch of value) {
    if (ch === '(') depth += 1; else if (ch === ')') depth -= 1;
    if (depth === 0 && sepRe.test(ch)) { if (cur) parts.push(cur); cur = ''; } else cur += ch;
  }
  if (cur) parts.push(cur);
  return parts;
}

const blackLow = (c) => {
  const m = c.match(/^rgba?\(\s*0[\s,]+0[\s,]+0\s*[/,]\s*([\d.]+)(%?)\s*\)$/i);
  if (!m) return false;
  const a = m[2] ? Number(m[1]) / 100 : Number(m[1]);
  return a <= 0.12;
};

function shadowLayers(value) {
  return topLevelSplit(value, /,/).map((layer) => {
    const toks = topLevelSplit(layer.trim(), /\s/);
    const lengths = toks.filter((t) => /^-?[\d.]+(px|rem|em)?$/.test(t));
    const colors = toks.filter((t) => !/^-?[\d.]+(px|rem|em)?$/.test(t) && t !== 'inset');
    const blur = lengths[2] ? parseFloat(lengths[2]) : 0;
    return { layer: layer.trim(), blur, colors };
  });
}

const rawTime = (v) => [...v.replace(/var\([^)]*\)/g, '').matchAll(/(^|[\s,])(\d*\.?\d+)(ms|s)\b/g)].filter((m) => parseFloat(m[2]) !== 0);

export function scanCss(code, file) {
  const out = new Map();
  const root = postcss.parse(code, { from: file });
  const perRule = new Map(); // rule node -> decl map
  const radii = new Set();
  let eyebrow = 0;
  const passportPaper = /passport-paper/.test(file);
  root.walkDecls((d) => {
    const prop = d.prop.toLowerCase();
    const value = d.value;
    const where = `${prop}: ${short(value)}`;
    const rule = d.parent;
    if (!perRule.has(rule)) perRule.set(rule, new Map());
    perRule.get(rule).set(prop, value);
    if (prop === 'line-height' && !/^(var\(--[^)]*\)|normal|1|inherit|initial|unset)$/i.test(value.trim())) add(out, `T2|${where}`);
    if (/^calc\(/i.test(value) || /calc\(/i.test(value)) {
      const inner = value.replace(/var\([^)]*\)/g, '');
      for (const m of inner.matchAll(/(-?\d*\.?\d+)px/g)) { if (Math.abs(parseFloat(m[1])) > 1) { add(out, `T4|${where}`); break; } }
    }
    if (prop.startsWith('--') && !/^--(fan|color|space|radius|z|motion|min)-/.test(prop)) {
      const v = value.trim();
      if (/^-?\d/.test(v) && !/^-?0(\.0+)?$/.test(v) && !/%$/.test(v)) add(out, `T5|${prop}: ${short(v)}`);
    }
    if (prop === 'box-shadow') {
      for (const l of shadowLayers(value)) {
        if (l.blur <= 0) continue;
        for (const c of l.colors) {
          const raw = c.startsWith('#') || /^(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i.test(c) || NAMED.test(c);
          if (raw && !blackLow(c)) add(out, `T6|box-shadow: ${short(l.layer)}`);
          const tok = c.match(/^var\(--color-([\w-]+)/);
          if (tok && CHROMA.test(tok[1])) add(out, `S3|box-shadow: ${short(l.layer)}`);
        }
      }
    }
    if ((/^(transition|animation)(-duration|-delay)?$/.test(prop)) && rawTime(value).length) add(out, `T7|${where}`);
    if (prop === 'z-index' && !/^(var\(--z-[\w-]+\)|0|1|-1|auto)$/.test(value.trim())) add(out, `T8|${where}`);
    if (/^(width|height|min-height|min-width|block-size|inline-size)$/.test(prop) && /^(44|48|52)px$/.test(value.trim())) add(out, `T9|${where}`);
    if (prop === 'font-family' && !passportPaper && !/^(inherit|initial|unset|var\(--[^)]*\))$/i.test(value.trim())) add(out, `T10|${where}`);
    if (!/(logo|wordmark)/i.test(file) && /gradient\(/i.test(value)) add(out, `S1|${where}`);
    if (/^(-webkit-)?background-clip$/.test(prop) && /text/i.test(value)) add(out, `S1|${where}`);
    if (prop === '-webkit-text-fill-color' && /transparent/i.test(value)) add(out, `S1|${where}`);
    if (prop === 'backdrop-filter' || prop === '-webkit-backdrop-filter') add(out, `S2|${where}`);
    if (prop === 'filter' && /blur\(/i.test(value)) add(out, `S2|${where}`);
    if (prop === 'filter' && /grayscale\(/i.test(value)) add(out, `S6|${where}`);
    if (prop === 'border-radius') { for (const m of value.matchAll(/var\(--radius-(control|collection|hero)\)/g)) radii.add(m[1]); }
  });
  for (const [rule, decls] of perRule) {
    const sel = rule.selector ?? '';
    if (decls.get('text-align')?.trim() === 'center' && /column/.test(decls.get('flex-direction') ?? '') && decls.get('align-items')?.trim() === 'center') add(out, `S5|${short(sel, 60)}`);
    const op = decls.get('opacity');
    if (op && parseFloat(op) < 0.5 && /(^|[\s>+~,])img\b|\[data-art\]/.test(sel)) add(out, `S6|opacity: ${short(sel, 60)} ${op}`);
    const ls = decls.get('letter-spacing');
    if (/uppercase/.test(decls.get('text-transform') ?? '') && ls && !/^(0|normal|-)/.test(ls.trim())) { eyebrow += 1; }
  }
  if (radii.size >= 3) add(out, `S10|${[...radii].sort().join('+')}`);
  let animated = false;
  root.walkDecls(/^animation(-name)?$/i, (d) => { if (!/^none$/i.test(d.value.trim())) animated = true; });
  let reduced = false;
  root.walkAtRules('media', (a) => { if (/prefers-reduced-motion\s*:\s*reduce/.test(a.params)) reduced = true; });
  if (animated && !reduced) add(out, 'N7|animation without reduced-motion');
  if (eyebrow >= 2) add(out, 'S14|eyebrow labels', eyebrow);
  return out;
}

// ---------- TSX ----------
export const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// <Name ...> 여는 태그를 중괄호·따옴표를 고려해 끝까지 읽는다. attrs 와 children(같은 이름의 닫는 태그까지의 글자)을 돌려준다.
export function jsxTags(code, name) {
  const out = [];
  const re = new RegExp(`<${name}(?![\\w.])`, 'g');
  let m;
  while ((m = re.exec(code))) {
    let i = m.index + m[0].length; let depth = 0; let quote = '';
    const attrStart = i;
    for (; i < code.length; i += 1) {
      const ch = code[i];
      if (quote) { if (ch === '\\') i += 1; else if (ch === quote) quote = ''; continue; }
      if (depth > 0 && (ch === '"' || ch === "'" || ch === '`')) { quote = ch; continue; }
      if (depth === 0 && (ch === '"' || ch === "'")) { quote = ch; continue; }
      if (ch === '{') depth += 1; else if (ch === '}') depth -= 1;
      else if (ch === '>' && depth === 0) break;
    }
    const attrs = code.slice(attrStart, i);
    const selfClosing = attrs.trimEnd().endsWith('/');
    let children = '';
    if (!selfClosing) { const close = code.indexOf(`</${name}>`, i); children = close === -1 ? '' : code.slice(i + 1, close); }
    out.push({ attrs, children, selfClosing, index: m.index });
  }
  return out;
}

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

export function scanTsx(code, file) {
  const out = new Map();
  const c = stripComments(code);
  add(out, 'C1|<button>', (c.match(/<button\b/g) ?? []).length);
  if (!/^apps\/web\/app\/guide\//.test(file)) for (const m of c.matchAll(/<h([1-3])\b/g)) add(out, `C2|<h${m[1]}>`);
  for (const m of c.matchAll(/<(input|textarea|select)\b([^>]*)>/g)) {
    if (m[1] === 'input' && /type=["'](hidden|file)["']/.test(m[2])) continue;
    add(out, `C3|<${m[1]}>`);
  }
  // OG image routes under app/share render through Satori, which reads inline styles only (no CSS modules or variables).
  const ogImageRoute = /^apps\/web\/app\/share\/.+\/route\.tsx$/.test(file);
  for (const m of ogImageRoute ? [] : c.matchAll(/style=\{\{\s*([^}]{0,60})/g)) {
    const head = m[1];
    if (/^(width\s*:|["']--|\.\.\.)/.test(head)) continue;
    add(out, `C4|style={{ ${short(head, 40)}`);
  }
  for (const m of c.matchAll(/불러오는 중|Loading\.\.\./g)) {
    const before = c.slice(Math.max(0, m.index - 40), m.index);
    if (/aria-label=/.test(before)) continue;
    add(out, `C5|${m[0]}`);
  }
  if (/kind=["']loading["']/.test(c)) add(out, 'C6|kind="loading"', (c.match(/kind=["']loading["']/g) ?? []).length);
  for (const m of c.matchAll(/<a\b([^>]*)>/g)) {
    if (/href=["']https?:/.test(m[1]) && !/data-outbound-tracking=["']off["']/.test(m[1])) add(out, 'C7|<a href=http>');
  }
  for (const m of c.matchAll(/locale === ["']ko["'] \? ["'][^"']*/g)) add(out, `C8|${short(m[0], 60)}`);
  for (const m of c.matchAll(/[+＋]\s?\d+\s?P\b/g)) add(out, `C9|${m[0]}`);
  for (const m of c.matchAll(/>([^<>{}]*[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}][^<>{}]*)</gu)) add(out, `C10|${short(m[1], 40)}`);
  for (const m of c.matchAll(/(["'`])([^"'`\n]*[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}][^"'`\n]*)\1/gu)) add(out, `C10|${short(m[2], 40)}`);
  for (const m of c.matchAll(/from\s+["'](@radix-ui\/[\w-]+)/g)) add(out, `N15|${m[1]}`);
  if (!/^apps\/web\/components\/(fan-ui|ui\/overlay)\//.test(file)) {
    for (const m of c.matchAll(/from\s+["'](@base-ui\/react[\w/-]*)/g)) add(out, `N15b|${m[1]}`);
    for (const m of c.matchAll(/role=["'](dialog|alertdialog)["']/g)) add(out, `N15b|role="${m[1]}"`);
  }
  const motionOk = /^apps\/web\/(components\/fan-ui\/fan-motion-pop\.tsx|features\/dukjil\/ui\/(reward-|attendance-|stamp-press)[\w-]*\.tsx)$/.test(file);
  for (const m of c.matchAll(/from\s+["'](motion(?:\/[\w-]+)?|framer-motion)["']/g)) if (!motionOk) add(out, `N16|${m[1]}`);
  if (!/^apps\/web\/features\/dukjil\/ui\/stamp-press\.tsx$/.test(file)) for (const m of c.matchAll(/from\s+["'](lottie-web[\w/-]*)["']/g)) add(out, `N16|${m[1]}`);
  for (const m of c.matchAll(/×(\{|\d)/g)) add(out, `N20|×${m[1]}`);
  const counts = new Map();
  for (const m of c.matchAll(/className=\{styles\.(\w+)\}/g)) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  for (const [k, n] of counts) if (n === 3 && !/\.map\(/.test(c)) add(out, `S4|styles.${k} x3`);
  const primaries = jsxTags(c, 'FanAction').filter((t) => /variant=["']primary["']/.test(t.attrs)).length;
  if (primaries >= 2) add(out, 'S8|primary FanAction', primaries);
  for (const name of ['FanTag', 'EarnBadge']) {
    for (const t of jsxTags(c, name)) {
      const text = t.children.trim();
      if (!text || /[{<]/.test(text) || /^[+\d×P ]+$/.test(text)) continue;
      if (text.length > 8 || (text.match(/ /g) ?? []).length >= 2) add(out, `S9|<${name}> ${short(text, 30)}`);
    }
  }
  return out;
}

// ---------- 문구 원본(ko) ----------
const COPY_RE = /특별한|새로운 경험|나에게 맞는|당신만의|함께 만들어|한곳에서|한 장이면|를 통해|에 있어|제공합니다|가능합니다|해 보세요|순간|무제한|혁신|게임 체인저|심리스|강력한|차곡차곡|소중한|설레는/;
const NUMBERS_RE = /\d+(K|만)\+|99\.\d%|24\/7/;
const SAFE_KEY = /(Legal|Notice|Error|Source)$/;

function scanCopy(entries, out) {
  for (const { key, ko } of entries) {
    if (typeof ko !== 'string') continue;
    const m = ko.match(COPY_RE); if (m) add(out, `S12|${key}: ${m[0]}`);
    const n = ko.match(NUMBERS_RE); if (n) add(out, `S13|${key}: ${n[0]}`);
    if (EMOJI.test(ko)) add(out, `C10|${key}: ${short(ko, 30)}`);
    if (/×(\{|\d)/.test(ko)) add(out, `N20|${key}`);
    const dots = (ko.match(/ — | - |·/g) ?? []).length;
    if (dots >= 3 || /!\s*$/.test(ko)) add(out, `S11|${key}`);
    if (/(Intro|Lead|Subtitle)$/.test(key) && !SAFE_KEY.test(key) && ko.length >= 15 && /[.요]$/.test(ko.trim())) add(out, `S7|${key}`);
  }
}

export function scanSourceTs(code) {
  const out = new Map();
  const entries = [];
  for (const m of code.matchAll(/(\w+)\s*:\s*\{\s*ko\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g)) {
    entries.push({ key: m[1], ko: m[2].slice(1, -1) });
  }
  scanCopy(entries, out);
  return out;
}

export function scanSourceJson(text) {
  const out = new Map();
  const data = JSON.parse(text);
  scanCopy(Object.entries(data).map(([key, v]) => ({ key: v.id ?? key, ko: v.ko })), out);
  return out;
}
