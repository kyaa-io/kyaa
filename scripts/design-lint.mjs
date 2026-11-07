#!/usr/bin/env node
// 디자인 린트 이행 모드: "새로 생긴" 위반만 실패시키고, 기존 위반은 집계만 한다.
//   node scripts/design-lint.mjs [--base <sha>] [--report <out.json>] [--all] [--update-baseline]
// 기본(scripts/design-lint-baseline.json 이 있을 때): 작업 트리 전체를 기준선 파일과 비교한다. 파일·규칙·선언 문장별 개수가 기준선보다 늘면 새 위반이다.
// 기준선을 다시 만들 때: npm run design-lint -- --update-baseline  (합침 뒤 묶음 담당이 실행하고, 줄어든 숫자만 커밋한다)
// --base <sha> 를 직접 주거나 기준선 파일이 없으면 예전 방식(기준 커밋과 변경된 파일만 비교)을 쓴다.
// 종료 코드: 0 통과, 1 새 위반, 2 도구 오류(기준 커밋 없음, stylelint 실패 등. 조용히 통과시키지 않는다).
// 비교 방식: 기준 커밋의 같은 파일과 작업 트리를 같은 규칙으로 린트하고 "규칙|선언 문장" 별 개수를 비교한다.
// 줄 번호가 아니라 선언 문장으로 비교하므로 파일의 무관한 줄 수정·줄 이동은 위반으로 보지 않는다.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { RULES as RULES_TCS, scanCss, scanTsx, scanSourceTs, scanSourceJson } from './design-lint-rules.mjs';
import { RULES_N, scanNFile, scanNAll, nEligible } from './design-lint-n-rules.mjs';
import { dirname, resolve } from 'node:path';

const RULES = { ...RULES_TCS, ...RULES_N };
const SCRIPT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = process.env.DESIGN_LINT_ROOT ? resolve(process.env.DESIGN_LINT_ROOT) : SCRIPT_ROOT; // 시험용으로만 바꾼다
const ZERO = /^0+$/;
const CSS_RE = /^apps\/web\/(app|components|features)\/.+\.css$/;
const TSX_RE = /^apps\/web\/(app|components|features)\/.+\.tsx$/;
const SRC_RE = /^apps\/web\/.+-source\.ts$/;
const JSON_RE = /^apps\/web\/i18n\/source-messages\.json$/;
const BASELINE_PATH = resolve(ROOT, 'scripts/design-lint-baseline.json');
const SKIP_RE = /(\.test\.tsx?$|\/e2e\/|\/__tests__\/|^apps\/web\/components\/fan-ui\/|^apps\/web\/app\/globals\.css$)/;

export const areaOf = (file) => {
  if (/^apps\/web\/features\/dukjil\//.test(file)) return 'dukjil';
  if (/^apps\/web\/(features\/(groups|group-[a-z]+)\/|app\/groups\/)/.test(file)) return 'groups';
  if (/^apps\/web\/(features\/home\/|app\/page)/.test(file)) return 'home';
  return 'other';
};

const git = (args, opts = {}) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
const tryGit = (args) => { try { return git(args).trim(); } catch { return ''; } };
const hasCommit = (sha) => !!sha && !ZERO.test(sha) && !!tryGit(['rev-parse', '--verify', '--quiet', `${sha}^{commit}`]);

// 기준 커밋 결정. 푸시는 github.event.before, PR 은 base.sha 가 들어온다(워크플로 env DESIGN_LINT_BASE).
// 없거나(새 브랜치의 0000…) 강제 푸시로 사라졌으면 origin/main 과의 merge-base, 그다음 HEAD^ 로 내려간다.
export function resolveBase(given, io = { hasCommit, tryGit }) {
  const tried = [];
  if (given && !ZERO.test(given)) {
    if (io.hasCommit(given)) return { sha: given, via: 'given' };
    io.tryGit(['fetch', '--no-tags', '--depth=1', 'origin', given]);
    if (io.hasCommit(given)) return { sha: given, via: 'fetched' };
    tried.push(`given ${given.slice(0, 12)} unreachable`);
  } else tried.push('no base given');
  io.tryGit(['fetch', '--no-tags', '--depth=200', 'origin', 'main']);
  const mb = io.tryGit(['merge-base', 'HEAD', 'origin/main']);
  if (io.hasCommit(mb) && mb !== io.tryGit(['rev-parse', 'HEAD'])) return { sha: mb, via: 'merge-base' };
  tried.push('merge-base unavailable');
  if (io.hasCommit('HEAD^')) return { sha: io.tryGit(['rev-parse', 'HEAD^']), via: 'parent' };
  tried.push('no parent commit');
  return { sha: '', via: '', tried };
}

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const sepAt = (key) => key.indexOf('|');
const ruleOf = (key) => key.slice(0, sepAt(key));
const declOf = (key) => key.slice(sepAt(key) + 1);
const REMAP = { 'font-weight': 'T1', 'letter-spacing': 'T3' };

async function lintCss(stylelint, code, file) {
  const r = await stylelint.lint({ code, codeFilename: resolve(ROOT, file), configFile: resolve(SCRIPT_ROOT, 'stylelint.config.mjs') });
  const lines = code.split('\n');
  const counts = new Map();
  for (const res of r.results) {
    for (const w of res.invalidOptionWarnings ?? []) throw new Error(`stylelint option error: ${w.text}`);
    for (const w of res.warnings) {
      if (w.severity !== 'error' && w.severity !== 'warning') continue;
      // 한 줄로 압축된 CSS 도 있어서 줄 전체가 아니라 위반 지점 앞의 속성 이름과 위반한 값만 키로 쓴다.
      const text = lines[w.line - 1] ?? '';
      const before = text.slice(0, Math.max(0, w.column - 1));
      const prop = (before.match(/([a-zA-Z-]+)\s*:[^;{}]*$/) ?? [])[1] ?? '';
      // 선언 전체 규칙(strict-value)은 끝 위치가 마지막 선언에서 어긋나므로 다음 ; 또는 } 까지를 값으로 본다.
      const rest = text.slice(w.column - 1);
      const span = w.rule.includes('strict-value') ? rest.split(/[;}]/)[0] : (w.endLine === w.line && w.endColumn > w.column ? text.slice(w.column - 1, w.endColumn - 1) : rest.split(/[;}]/)[0]);
      const spanProp = (norm(span).match(/^([a-zA-Z-]+)\s*:/) ?? [])[1] ?? prop;
      const rule = w.rule.includes('strict-value') && REMAP[spanProp] ? REMAP[spanProp] : w.rule;
      const key = `${rule}|${prop}: ${norm(span)}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    if (res.parseErrors?.length) throw new Error(`parse error in ${file}`);
  }
  return counts;
}

const baseText = (base, file) => { try { return git(['show', `${base}:${file}`]); } catch { return null; } };
const sum = (m) => [...m.values()].reduce((a, b) => a + b, 0);
const kindOf = (file) => (CSS_RE.test(file) ? 'css' : TSX_RE.test(file) ? 'tsx' : SRC_RE.test(file) ? 'src' : JSON_RE.test(file) ? 'json' : '');
const lintable = (f) => { const k = kindOf(f); if (!k) return false; return k === 'json' || k === 'src' ? !/(\.test\.|\/e2e\/|\/__tests__\/)/.test(f) : !SKIP_RE.test(f); };

// 한 파일의 위반을 "규칙|세부" -> 개수 Map 으로 센다. 규칙 정의는 design-lint-rules.mjs 와 stylelint.config.mjs.
export async function scanFile(stylelint, file, text) {
  const kind = kindOf(file);
  try {
    if (kind === 'css') {
      const m = await lintCss(stylelint, text, file);
      for (const [k, n] of scanCss(text, file)) m.set(k, (m.get(k) ?? 0) + n);
      return m;
    }
    if (kind === 'tsx') return scanTsx(text, file);
    if (kind === 'src') return scanSourceTs(text);
    if (kind === 'json') return scanSourceJson(text);
  } catch (e) { throw new Error(`${file}: ${e.message}`); }
  return new Map();
}

const violation = (file, key, added) => {
  const id = ruleOf(key);
  const meta = RULES[id] ?? { sev: 'fail', note: '' };
  const kind = id === 'C1' ? 'raw-button' : /^(T|C|S|N)\d+$/.test(id) ? 'rule' : 'css-token';
  const rule = id === 'C1' ? meta.note : kind === 'rule' ? `${id} ${meta.note}` : id;
  const sev = meta.countDecl?.test(declOf(key)) ? 'count' : meta.sev; // 규칙 안에서 오탐이 큰 갈래만 집계로 내린다
  return { file, kind, id, sev, rule, decl: declOf(key), added };
};

function compare(file, head, old, out) {
  for (const [key, n] of head) {
    const extra = n - (old.get(key) ?? 0);
    if (extra <= 0) continue;
    const v = violation(file, key, extra);
    (v.sev === 'fail' ? out.newViolations : out.warnings).push(v);
  }
}

const areaTally = (out, file, map) => {
  const css = kindOf(file) === 'css';
  for (const [k, n] of map) {
    if (css && ruleOf(k) !== 'C1' && !/^N\d+$/.test(ruleOf(k))) out.existing[areaOf(file)] = (out.existing[areaOf(file)] ?? 0) + n;
    if (ruleOf(k) === 'C1') out.rawButtons[areaOf(file)] = (out.rawButtons[areaOf(file)] ?? 0) + n;
  }
};

// 기준선 파일 형식: { version, files: { 경로: { "규칙|세부": 개수 } } }. 정렬해서 저장해 줄어든 숫자만 diff 에 보인다.
export function toBaselineJson(scanned) {
  const files = {};
  for (const f of Object.keys(scanned).sort()) {
    const m = scanned[f];
    if (!m.size) continue;
    files[f] = Object.fromEntries([...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)));
  }
  const rules = {};
  for (const m of Object.values(files)) for (const [k, n] of Object.entries(m)) rules[ruleOf(k)] = (rules[ruleOf(k)] ?? 0) + n;
  return { version: 1, rules: Object.fromEntries(Object.entries(rules).sort()), files };
}

const trackedFiles = () => [...new Set([...git(['ls-files', 'apps/web']).split('\n'), ...git(['ls-files', '--others', '--exclude-standard', 'apps/web']).split('\n')])].filter((f) => f && existsSync(resolve(ROOT, f)));
const mergeInto = (target, extra) => { for (const [k, n] of extra) target.set(k, (target.get(k) ?? 0) + n); };

async function scanTree(stylelint) {
  const all = trackedFiles();
  const files = all.filter(lintable);
  const scanned = {};
  for (const f of files) scanned[f] = await scanFile(stylelint, f, readFileSync(resolve(ROOT, f), 'utf8'));
  // 261107-2 N 규칙: fan-ui 안과 라우트 파일까지 포함해 전체 목록을 본다.
  const texts = new Map();
  const read = (f) => { if (!texts.has(f)) texts.set(f, readFileSync(resolve(ROOT, f), 'utf8')); return texts.get(f); };
  for (const [f, m] of scanNAll(all, read)) { if (!scanned[f]) scanned[f] = new Map(); mergeInto(scanned[f], m); }
  return scanned;
}

export async function analyze({ base, all = false, baseline = null }) {
  const stylelint = (await import('stylelint')).default;
  const out = { base, files: 0, newViolations: [], warnings: [], existing: {}, rawButtons: {} };
  if (all || baseline) {
    const scanned = await scanTree(stylelint);
    out.files = Object.keys(scanned).length;
    for (const [f, m] of Object.entries(scanned)) {
      areaTally(out, f, m);
      if (baseline) compare(f, m, new Map(Object.entries(baseline.files?.[f] ?? {})), out);
    }
    out.mode = baseline ? 'baseline' : 'all';
    return out;
  }
  const renamedFrom = new Map(); // 새 경로 -> 옛 경로. 이름만 바뀐 파일은 옛 내용을 기준으로 삼는다.
  const changed = [];
  for (const line of git(['diff', '-M', '--name-status', '--diff-filter=ACMR', base]).split('\n').filter(Boolean)) {
    const [status, a, b] = line.split('\t');
    if (status.startsWith('R') && b) { renamedFrom.set(b, a); changed.push(b); } else changed.push(a);
  }
  const files = [...new Set([...changed, ...git(['ls-files', '--others', '--exclude-standard']).split('\n')])].filter((f) => f && (lintable(f) || nEligible(f)) && existsSync(resolve(ROOT, f)));
  out.files = files.length;
  out.mode = 'base'; // 기준 커밋 비교 방식은 N10·N14(파일 목록 규칙)를 보지 않는다. 기준선 방식이 기본이다.
  for (const f of files) {
    const lint = lintable(f);
    const head = lint ? await scanFile(stylelint, f, readFileSync(resolve(ROOT, f), 'utf8')) : new Map();
    const oldText = baseText(base, renamedFrom.get(f) ?? f);
    const old = oldText == null || !lint ? new Map() : await scanFile(stylelint, f, oldText);
    if (nEligible(f)) { mergeInto(head, scanNFile(f, readFileSync(resolve(ROOT, f), 'utf8'))); if (oldText != null) mergeInto(old, scanNFile(f, oldText)); }
    areaTally(out, f, old);
    compare(f, head, old, out);
  }
  return out;
}

function arg(name) { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; }

function readBaseline() {
  if (!existsSync(BASELINE_PATH)) return null;
  const b = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  if (b.version !== 1 || typeof b.files !== 'object') throw new Error(`unreadable baseline ${BASELINE_PATH}`);
  return b;
}

async function main() {
  const all = process.argv.includes('--all');
  if (process.argv.includes('--update-baseline')) {
    const stylelint = (await import('stylelint')).default;
    const json = toBaselineJson(await scanTree(stylelint));
    writeFileSync(BASELINE_PATH, JSON.stringify(json, null, 1) + '\n');
    console.log(`design-lint: baseline written ${BASELINE_PATH} (${Object.keys(json.files).length} files). per rule: ${JSON.stringify(json.rules)}`);
    return;
  }
  const explicitBase = arg('--base');
  const baseline = !all && !explicitBase ? readBaseline() : null;
  let base = '';
  if (!all && !baseline) {
    const r = resolveBase(explicitBase ?? process.env.DESIGN_LINT_BASE ?? '');
    if (!r.sha) { console.error(`::error title=design-lint::no comparison base (${r.tried.join('; ')}). Fix the CI checkout or pass --base; not passing silently.`); process.exit(2); }
    base = r.sha;
    console.log(`design-lint: base ${base.slice(0, 12)} (${r.via})`);
  } else if (baseline) console.log('design-lint: comparing with scripts/design-lint-baseline.json');
  const result = await analyze({ base, all, baseline });
  const reportPath = arg('--report');
  if (reportPath) writeFileSync(resolve(reportPath), JSON.stringify(result, null, 2) + '\n');
  console.log(`design-lint: checked ${result.files} CSS/TSX/copy file(s); existing CSS violations (counted only): ${JSON.stringify(result.existing)}; existing raw <button>: ${JSON.stringify(result.rawButtons)}`);
  for (const v of result.warnings) console.warn(`::warning file=${v.file},title=design-lint::count-only ${v.id} x${v.added}: ${v.rule} -> ${v.decl}`);
  if (result.newViolations.length) {
    for (const v of result.newViolations) console.error(`::error file=${v.file},title=design-lint::new ${v.kind} violation x${v.added}: ${v.rule} -> ${v.decl}`);
    console.error('design-lint: new violations found. Use the tokens in apps/web/app/globals.css and the shared components in apps/web/components/fan-ui. If a rule is wrong for this case, report it instead of editing the baseline.');
    process.exit(1);
  }
  console.log('design-lint: no new violations');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`::error title=design-lint::tool error: ${e.message}`); process.exit(2); });
}
