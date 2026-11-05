#!/usr/bin/env node
// 디자인 린트 이행 모드: 기준 커밋과 비교해 "새로 생긴" 위반만 실패시키고, 기존 위반은 집계만 한다.
//   node scripts/design-lint.mjs [--base <sha>] [--report <out.json>] [--all]
// 종료 코드: 0 통과, 1 새 위반, 2 도구 오류(기준 커밋 없음, stylelint 실패 등. 조용히 통과시키지 않는다).
// 비교 방식: 기준 커밋의 같은 파일과 작업 트리를 같은 규칙으로 린트하고 "규칙|선언 문장" 별 개수를 비교한다.
// 줄 번호가 아니라 선언 문장으로 비교하므로 파일의 무관한 줄 수정·줄 이동은 위반으로 보지 않는다.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const SCRIPT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = process.env.DESIGN_LINT_ROOT ? resolve(process.env.DESIGN_LINT_ROOT) : SCRIPT_ROOT; // 시험용으로만 바꾼다
const ZERO = /^0+$/;
const CSS_RE = /^apps\/web\/(app|components|features)\/.+\.css$/;
const TSX_RE = /^apps\/web\/(app|components|features)\/.+\.tsx$/;
const SKIP_RE = /(\.test\.tsx$|\/e2e\/|\/__tests__\/|^apps\/web\/components\/fan-ui\/|^apps\/web\/app\/globals\.css$)/;

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
      const key = `${w.rule}|${prop}: ${norm(span)}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    if (res.parseErrors?.length) throw new Error(`parse error in ${file}`);
  }
  return counts;
}

// 주석 속 <button 은 세지 않는다(/* */ 와 줄 시작의 //). 문자열 속은 구분하지 않는다.
const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const rawButtons = (code) => (stripComments(code).match(/<button\b/g) ?? []).length;
const baseText = (base, file) => { try { return git(['show', `${base}:${file}`]); } catch { return null; } };
const sum = (m) => [...m.values()].reduce((a, b) => a + b, 0);

export async function analyze({ base, all = false }) {
  const stylelint = (await import('stylelint')).default;
  let files;
  if (all) files = git(['ls-files', 'apps/web']).split('\n').filter(Boolean);
  const renamedFrom = new Map(); // 새 경로 -> 옛 경로. 이름만 바뀐 파일은 옛 내용을 기준으로 삼는다.
  if (!all) {
    const changed = [];
    for (const line of git(['diff', '-M', '--name-status', '--diff-filter=ACMR', base]).split('\n').filter(Boolean)) {
      const [status, a, b] = line.split('\t');
      if (status.startsWith('R') && b) { renamedFrom.set(b, a); changed.push(b); } else changed.push(a);
    }
    files = [...new Set([...changed, ...git(['ls-files', '--others', '--exclude-standard']).split('\n')])].filter(Boolean);
  }
  files = files.filter((f) => (CSS_RE.test(f) || TSX_RE.test(f)) && !SKIP_RE.test(f) && existsSync(resolve(ROOT, f)));
  const out = { base, files: files.length, newViolations: [], existing: {}, rawButtons: {} };
  const bump = (bucket, area, n) => { out[bucket][area] = (out[bucket][area] ?? 0) + n; };
  for (const f of files) {
    const head = readFileSync(resolve(ROOT, f), 'utf8');
    const old = all ? null : baseText(base, renamedFrom.get(f) ?? f);
    if (CSS_RE.test(f)) {
      const h = await lintCss(stylelint, head, f);
      const b = old == null ? new Map() : await lintCss(stylelint, old, f);
      bump('existing', areaOf(f), sum(b));
      for (const [key, n] of h) {
        const extra = n - (b.get(key) ?? 0);
        if (extra > 0 && !all) out.newViolations.push({ file: f, kind: 'css-token', rule: key.split('|')[0], decl: key.split('|')[1], added: extra });
      }
      if (all) bump('existing', areaOf(f), 0);
    } else {
      const hn = rawButtons(head);
      const bn = old == null ? 0 : rawButtons(old);
      bump('rawButtons', areaOf(f), all ? hn : bn);
      if (!all && hn > bn) out.newViolations.push({ file: f, kind: 'raw-button', rule: 'use FanAction (components/fan-ui/fan-action.tsx) instead of <button>', decl: '<button>', added: hn - bn });
    }
  }
  if (all) { // --all 은 집계만: head 기준으로 다시 센다.
    out.existing = {};
    for (const f of files.filter((x) => CSS_RE.test(x))) bump('existing', areaOf(f), sum(await lintCss(stylelint, readFileSync(resolve(ROOT, f), 'utf8'), f)));
  }
  return out;
}

function arg(name) { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; }

async function main() {
  const all = process.argv.includes('--all');
  let base = '';
  if (!all) {
    const r = resolveBase(arg('--base') ?? process.env.DESIGN_LINT_BASE ?? '');
    if (!r.sha) { console.error(`::error title=design-lint::no comparison base (${r.tried.join('; ')}). Fix the CI checkout or pass --base; not passing silently.`); process.exit(2); }
    base = r.sha;
    console.log(`design-lint: base ${base.slice(0, 12)} (${r.via})`);
  }
  const result = await analyze({ base, all });
  const reportPath = arg('--report');
  if (reportPath) writeFileSync(resolve(reportPath), JSON.stringify(result, null, 2) + '\n');
  console.log(`design-lint: checked ${result.files} changed CSS/TSX file(s); existing CSS violations (counted only): ${JSON.stringify(result.existing)}; existing raw <button>: ${JSON.stringify(result.rawButtons)}`);
  if (result.newViolations.length) {
    for (const v of result.newViolations) console.error(`::error file=${v.file},title=design-lint::new ${v.kind} violation x${v.added}: ${v.rule} -> ${v.decl}`);
    console.error('design-lint: new violations found. Use the tokens in apps/web/app/globals.css and the shared components in apps/web/components/fan-ui.');
    process.exit(1);
  }
  console.log('design-lint: no new violations');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`::error title=design-lint::tool error: ${e.message}`); process.exit(2); });
}
