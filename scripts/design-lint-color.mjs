// N29 보라 색상값 금지 (H6, 사용자 지시 2026-11-08). UI 강조색은 kyaa 핑크 1색이고 보라는 로고 아트에만 남긴다.
// CSS·TSX 의 hex / rgb() / hsl() / oklch() / 색 이름 중 보라 범위(HSL 색상 250~320°, 채도 10% 이상, 거의 흰색·검정 제외)를 찾는다.
// 채도가 낮은 보랏빛 회색(#f4f3f7 같은 값)도 '회색·보라가 AI 티' 지시의 대상이라 같이 잡는다.
// 허용 목록(LOGO_ART): 로고·워드마크 아트 파일과 그림 파일. 여기 있는 파일은 보라값을 그대로 둘 수 있다.
export const PURPLE_HUE = [250, 320];
export const PURPLE_MIN_SAT = 0.1;
export const LOGO_ART = /(?:logo|wordmark|-art\.|-artwork\.|empty-illustration\.tsx$|default-avatar)/i;

const NAMED = /\b(purple|violet|indigo|lavender|rebeccapurple|mediumpurple|blueviolet|darkviolet|darkorchid|slateblue|mediumslateblue)\b/i;
const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g;
const FUNC = /\b(rgba?|hsla?|oklch|oklab|lch|lab)\(([^()]*)\)/gi;

export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const l = (max + min) / 2; const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)); else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

const num = (t) => { const v = parseFloat(t); return t.trim().endsWith('%') ? v : v; };

// 색 문자열 하나를 {r,g,b,a} 로 푼다. 풀 수 없으면(var(), 키워드) null.
export function parseColor(text) {
  const t = text.trim();
  let m = t.match(/^#([0-9a-f]{3,8})$/i);
  if (m) {
    let x = m[1];
    if (x.length === 3 || x.length === 4) x = [...x].map((c) => c + c).join('');
    if (x.length !== 6 && x.length !== 8) return null;
    return { r: parseInt(x.slice(0, 2), 16), g: parseInt(x.slice(2, 4), 16), b: parseInt(x.slice(4, 6), 16), a: x.length === 8 ? parseInt(x.slice(6, 8), 16) / 255 : 1 };
  }
  m = t.match(/^(rgba?|hsla?|oklch|oklab|lch|lab)\(([^()]*)\)$/i);
  if (!m) return null;
  const fn = m[1].toLowerCase();
  const parts = m[2].replace(/\//g, ' ').replace(/,/g, ' ').trim().split(/\s+/);
  if (parts.length < 3) return null;
  const alpha = parts[3] !== undefined ? (parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3])) : 1;
  if (fn === 'rgb' || fn === 'rgba') {
    const c = parts.slice(0, 3).map((p) => (p.endsWith('%') ? (parseFloat(p) / 100) * 255 : parseFloat(p)));
    if (c.some(Number.isNaN)) return null;
    return { r: c[0], g: c[1], b: c[2], a: alpha };
  }
  if (fn === 'hsl' || fn === 'hsla') {
    const h = parseFloat(parts[0]); const s = parseFloat(parts[1]) / 100; const l = parseFloat(parts[2]) / 100;
    if ([h, s, l].some(Number.isNaN)) return null;
    const k = (n) => (n + h / 30) % 12; const a2 = s * Math.min(l, 1 - l);
    const f = (n) => l - a2 * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255, a: alpha };
  }
  // oklch(L C H): sRGB 로 바꿔 같은 HSL 판정에 쓴다. oklab/lch/lab 은 보라 판정 대상이 아니라 건너뛴다.
  if (fn === 'oklch') {
    const L = parts[0].endsWith('%') ? parseFloat(parts[0]) / 100 : parseFloat(parts[0]);
    const C = parts[1].endsWith('%') ? (parseFloat(parts[1]) / 100) * 0.4 : parseFloat(parts[1]);
    const H = (parseFloat(parts[2]) * Math.PI) / 180;
    if ([L, C, H].some(Number.isNaN)) return null;
    const a1 = C * Math.cos(H); const b1 = C * Math.sin(H);
    const l_ = (L + 0.3963377774 * a1 + 0.2158037573 * b1) ** 3;
    const m_ = (L - 0.1055613458 * a1 - 0.0638541728 * b1) ** 3;
    const s_ = (L - 0.0894841775 * a1 - 1.291485548 * b1) ** 3;
    const lin = [4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_, -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_, -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_];
    const g = (v) => { const c = Math.max(0, Math.min(1, v)); return (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055) * 255; };
    return { r: g(lin[0]), g: g(lin[1]), b: g(lin[2]), a: alpha };
  }
  return null;
}

export function isPurple(color) {
  if (!color) return false;
  const { h, s, l } = rgbToHsl(color.r, color.g, color.b);
  return h >= PURPLE_HUE[0] && h <= PURPLE_HUE[1] && s >= PURPLE_MIN_SAT && l > 0.03 && l < 0.985;
}

const stripCssComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
const stripJsComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length));

// 색 리터럴 위치를 모두 찾는다: [{ text, index }]
export function colorLiterals(code) {
  const out = [];
  for (const m of code.matchAll(HEX)) out.push({ text: m[0], index: m.index });
  for (const m of code.matchAll(FUNC)) out.push({ text: m[0], index: m.index });
  return out;
}

// 파일 하나의 보라 색상값을 "N29|값" -> 개수 Map 으로 센다.
export function scanPurple(code, file) {
  const out = new Map();
  if (LOGO_ART.test(file)) return out;
  const isCss = /\.css$/.test(file);
  const text = isCss ? stripCssComments(code) : stripJsComments(code);
  const add = (v) => out.set(`N29|${v}`, (out.get(`N29|${v}`) ?? 0) + 1);
  for (const lit of colorLiterals(text)) if (isPurple(parseColor(lit.text))) add(lit.text.toLowerCase().replace(/\s+/g, ' '));
  if (isCss) {
    // CSS 값 안의 색 이름(purple 등). 선택자·클래스 이름은 제외하고 선언의 값만 본다.
    for (const m of text.matchAll(/:\s*([^;{}]*)/g)) {
      const hit = m[1].match(NAMED);
      if (hit && !/var\(|url\(/.test(hit[0])) add(hit[1].toLowerCase());
    }
  }
  return out;
}

// N30 짙은 회색 채움 캡슐 금지 (H6). 같은 규칙 안에서 배경이 짙은 무채색(밝기 40% 미만·채도 30% 미만·불투명도 80% 이상, var(--color-ink) 포함)이고
// border-radius 가 알약(999·var(--radius-pill))이면 센다. 캡슐·칩·배지는 흰 바탕 + 1px 테두리, 선택은 핑크 테두리/글자 또는 옅은 핑크 바탕이다.
// 영상 위 표시처럼 사진 위에 얹는 반투명 막(불투명도 < 80%)은 보지 않는다. 한 파일에서 다 잡지 못하는 경우(변수·상속)는 집계 밖이다.
export function scanDarkCapsule(css, file, postcss) {
  const out = new Map();
  if (LOGO_ART.test(file)) return out;
  const root = postcss.parse(css, { from: file });
  root.walkRules((r) => {
    let bg; let radius;
    for (const d of r.nodes ?? []) {
      if (d.type !== 'decl') continue;
      if (/^background(-color)?$/i.test(d.prop)) bg = d.value.trim();
      if (d.prop === 'border-radius') radius = d.value.trim();
    }
    if (!bg || !radius || !/999|var\(--radius-pill\)/.test(radius)) return;
    let dark = /^var\(--color-ink\)$/.test(bg);
    const lit = colorLiterals(bg)[0];
    if (!dark && lit) {
      const c = parseColor(lit.text);
      if (c) { const { s, l } = rgbToHsl(c.r, c.g, c.b); dark = l < 0.4 && s < 0.3 && c.a > 0.8; }
    }
    if (dark) out.set(`N30|${r.selector.replace(/\s+/g, ' ').slice(0, 70)} { background: ${bg.slice(0, 30)} }`, 1);
  });
  return out;
}
