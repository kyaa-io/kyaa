#!/usr/bin/env node
// copy-lint (5차, DESIGN.md §4-2 문구 규칙 · roles/skills/kyaa-copy.md). 사용자에게 보이는 한국어 문구를 규칙으로 센다.
//   node scripts/copy-lint.mjs [--report <out.json>] [--update-baseline] [--list <RULE>]
// 대상: apps/web/i18n/source-messages.json 의 ko 값 + apps/web/{app,components,features} 의 .ts/.tsx 안 한글 문자열 리터럴(시험·관리자 화면 제외).
// 판정: 규칙별·파일별 개수를 scripts/copy-lint-baseline.json 과 비교해 늘어난 곳만 실패(design-lint 와 같은 방식). 기존 문구는 집계만 한다.
// 외부 원문(SNS·공지 본문)은 DB 에 있고 코드에 없으므로 대상이 아니다. 법률 문구 파일은 EXEMPT 로 뺀다.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const WEB = join(ROOT, 'apps/web');
const BASELINE = join(ROOT, 'scripts/copy-lint-baseline.json');
const EXEMPT = [/\/admin\//, /\/legal\//, /terms|privacy|policy/i, /\.test\.|\.spec\.|\/e2e/, /\/i18n\/catalogs\//];

/** 규칙. sev fail = 늘면 실패, count = 늘어도 경고. 각 규칙은 문자열 하나를 받아 맞은 횟수를 돌려준다. */
export const COPY_RULES = {
  K1: { sev: 'fail', note: '`광고 보고` 같은 수단 문구를 버튼·라벨에 넣지 않는다(8장, R10)', test: (s) => count(s, /광고\s*보고/g) },
  K2: { sev: 'fail', note: '상대 시간 금지(8장 ⑨): N분 전·N시간 전·방금·어제', test: (s) => count(s, /\d+\s*(분|시간|초)\s*전|방금\s*전?|(^|\s)어제(\s|$)/g) },
  K3: { sev: 'fail', note: '설명형 상태 금지(4-2 3): 지금 N번 가능·N번 남음·N명까지', test: (s) => count(s, /지금\s*\{?\d*\}?\s*번\s*가능|\{?\d*\}?\s*번\s*남음|\{?\d*\}?\s*명까지/g) },
  K4: { sev: 'count', note: '느낌표는 홍보 배너(data-block="banner")에만(4-2 5)', test: (s) => count(s, /!/g) },
  K5: { sev: 'count', note: 'kyaa-copy 없앨 표현: 추상 환대·근거 없는 개인화·번역투·슬로건', test: (s) => count(s, /특별한 순간|새로운 경험|함께 만들어 ?가는|나에게 맞는|당신만의|를 통해|을 통해|에 있어(서)? |제공합니다|가능합니다|한곳에서|단순한 .+를 넘어/g) },
  K6: { sev: 'count', note: '대문자 영문 라벨 금지(허용 HOME·MY·LIVE·DM·QR·KYAA·브랜드)', test: (s) => count(s, /\b(?!(?:HOME|MY|LIVE|DM|QR|KYAA|SNS|URL|ID|PC|FAQ|QnA|OK|NFT|API|CHZZK|KST|UTC|AI)\b)[A-Z]{3,}\b/g) },
  K7: { sev: 'count', note: '권유형 `~해 보세요`·`~하세요`는 배너 안만(4-2 5)', test: (s) => count(s, /해\s?보세요|하세요[.!]?$/g) },
  K8: { sev: 'count', note: '버튼 화살표 글리프 금지(4-2 2): → ➜', test: (s) => count(s, /[→➜⟶]/g) },
};

function count(s, re) { return (s.match(re) || []).length; }

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name), st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else if (/\.(tsx?|mjs)$/.test(name)) yield p;
  }
}

/** 한글이 든 문자열 리터럴(따옴표·백틱)만 뽑는다. 주석은 지운 뒤 본다. */
export function hangulLiterals(source) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const out = [];
  for (const m of code.matchAll(/(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/g)) if (/[가-힣]/.test(m[2])) out.push(m[2]);
  for (const m of code.matchAll(/>([^<>{}\n]*[가-힣][^<>{}\n]*)</g)) out.push(m[1].trim());
  return out;
}

export function collect() {
  const hits = {}; // "RULE|file" -> n
  const add = (rule, file, n) => { if (n) hits[`${rule}|${file}`] = (hits[`${rule}|${file}`] || 0) + n; };
  const messages = JSON.parse(readFileSync(join(WEB, 'i18n/source-messages.json'), 'utf8'));
  for (const value of Object.values(messages)) {
    if (!value || typeof value.ko !== 'string') continue;
    const file = `i18n:${value.source ?? 'unknown'}`;
    if (EXEMPT.some((re) => re.test(file))) continue;
    for (const [rule, def] of Object.entries(COPY_RULES)) add(rule, file, def.test(value.ko));
  }
  for (const area of ['app', 'components', 'features']) {
    for (const path of walk(join(WEB, area))) {
      const file = relative(ROOT, path);
      if (EXEMPT.some((re) => re.test(file))) continue;
      for (const literal of hangulLiterals(readFileSync(path, 'utf8'))) for (const [rule, def] of Object.entries(COPY_RULES)) add(rule, file, def.test(literal));
    }
  }
  return hits;
}

export function compare(current, baseline) {
  const grown = [];
  for (const [key, n] of Object.entries(current)) {
    const was = baseline[key] ?? 0;
    if (n > was) grown.push({ key, was, now: n, sev: COPY_RULES[key.split('|')[0]].sev });
  }
  return grown;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const current = collect();
  if (args.includes('--update-baseline')) {
    writeFileSync(BASELINE, `${JSON.stringify(Object.fromEntries(Object.entries(current).sort()), null, 1)}\n`);
    console.log(`copy-lint: baseline written (${Object.keys(current).length} entries)`);
    process.exit(0);
  }
  const listAt = args.indexOf('--list');
  if (listAt >= 0) { const rule = args[listAt + 1]; for (const [k, n] of Object.entries(current)) if (k.startsWith(`${rule}|`)) console.log(n, k.slice(rule.length + 1)); process.exit(0); }
  const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {};
  const grown = compare(current, baseline);
  const reportAt = args.indexOf('--report');
  if (reportAt >= 0) writeFileSync(args[reportAt + 1], JSON.stringify({ totals: Object.fromEntries(Object.keys(COPY_RULES).map((r) => [r, Object.entries(current).filter(([k]) => k.startsWith(`${r}|`)).reduce((a, [, n]) => a + n, 0)])), grown }, null, 1));
  for (const g of grown) {
    const [rule, file] = g.key.split('|');
    console.log(`::${g.sev === 'fail' ? 'error' : 'warning'} file=${file},title=copy-lint::${rule} ${g.was} -> ${g.now}: ${COPY_RULES[rule].note}`);
  }
  const failed = grown.filter((g) => g.sev === 'fail');
  console.log(failed.length ? `copy-lint: ${failed.length} new violation(s)` : 'copy-lint: no new violations');
  process.exit(failed.length ? 1 : 0);
}
