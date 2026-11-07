import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { resolveBase, areaOf } from './design-lint.mjs';
import './design-lint-rules.test.mjs'; // 게이트가 이 파일만 실행하므로 규칙 시험도 함께 돈다


const SCRIPT = resolve('scripts/design-lint.mjs');
const OLD_CSS = '.a { color: #ff0000; padding: 13px; }\n.b { margin: var(--space-2); }\n';
const OLD_TSX = 'export const A = () => <button type="button">x</button>;\n';

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'design-lint-'));
  const g = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  g('init', '-q', '-b', 'work');
  g('config', 'user.email', 't@example.invalid');
  g('config', 'user.name', 't');
  mkdirSync(join(dir, 'apps/web/features/home'), { recursive: true });
  write(dir, 'apps/web/features/home/old.module.css', OLD_CSS);
  write(dir, 'apps/web/features/home/old.tsx', OLD_TSX);
  g('add', '-A');
  g('commit', '-qm', 'base');
  return { dir, g, base: g('rev-parse', 'HEAD').trim() };
}
const write = (dir, rel, text) => writeFileSync(join(dir, rel), text);
const run = (dir, args = [], env = {}) => spawnSync('node', [SCRIPT, ...args], { env: { ...process.env, DESIGN_LINT_ROOT: dir, DESIGN_LINT_BASE: '', ...env }, encoding: 'utf8' });

test('a raw color in a new file fails and the token version passes', () => {
  const { dir, base } = repo();
  try {
    write(dir, 'apps/web/features/home/new.module.css', '.c { color: #123456; }\n');
    const bad = run(dir, ['--base', base]);
    assert.equal(bad.status, 1, bad.stderr + bad.stdout);
    assert.match(bad.stderr, /color-no-hex/);
    write(dir, 'apps/web/features/home/new.module.css', '.c { color: var(--color-ink); padding: var(--space-3); border-radius: var(--radius-control); }\n');
    assert.equal(run(dir, ['--base', base]).status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('raw spacing, radius and font-size values fail; tokens, 0, auto and percentages pass', () => {
  const { dir, base } = repo();
  try {
    write(dir, 'apps/web/features/home/new.module.css', '.c { padding: 10px; border-radius: 9px; font-size: 15px; }\n');
    const bad = run(dir, ['--base', base]);
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /declaration-strict-value/);
    write(dir, 'apps/web/features/home/new.module.css', '.c { margin: 0 auto; width: 50%; padding: var(--space-3); font-size: var(--fan-body-size); }\n');
    assert.equal(run(dir, ['--base', base]).status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('editing an unrelated line or shifting lines in a file with existing violations does not fail', () => {
  const { dir, base } = repo();
  try {
    write(dir, 'apps/web/features/home/old.module.css', '/* note */\n\n' + OLD_CSS.replace('var(--space-2)', 'var(--space-3)'));
    const r = run(dir, ['--base', base]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /existing CSS violations \(counted only\)/);
    // a second copy of an already-violating declaration is a new violation
    write(dir, 'apps/web/features/home/old.module.css', OLD_CSS + '.d { color: #ff0000; }\n');
    assert.equal(run(dir, ['--base', base]).status, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the common-button rule catches a new arbitrary button but not an existing one', () => {
  const { dir, base } = repo();
  try {
    write(dir, 'apps/web/features/home/old.tsx', OLD_TSX + 'export const Same = 1;\n');
    assert.equal(run(dir, ['--base', base]).status, 0);
    write(dir, 'apps/web/features/home/new.tsx', 'export const B = () => <button className="x">y</button>;\n');
    const bad = run(dir, ['--base', base]);
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /FanAction/);
    write(dir, 'apps/web/features/home/new.tsx', 'export const B = () => <FanAction>y</FanAction>;\n');
    assert.equal(run(dir, ['--base', base]).status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('committed changes are compared against the given base, including a parent fallback', () => {
  const { dir, g, base } = repo();
  try {
    write(dir, 'apps/web/features/home/new.module.css', '.c { color: rgb(1 2 3); }\n');
    g('add', '-A'); g('commit', '-qm', 'bad');
    assert.equal(run(dir, ['--base', base]).status, 1);
    assert.equal(run(dir, [], { DESIGN_LINT_BASE: base }).status, 1);
    // base missing (force-pushed away) and an all-zero base fall back to the parent commit
    assert.equal(run(dir, ['--base', 'f'.repeat(40)]).status, 1);
    assert.equal(run(dir, ['--base', '0'.repeat(40)]).status, 1);
    write(dir, 'apps/web/features/home/other.md', 'unrelated\n');
    g('add', '-A'); g('commit', '-qm', 'unrelated');
    assert.equal(run(dir, ['--base', 'f'.repeat(40)]).status, 0); // parent has no changes in CSS/TSX
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('no resolvable base is a loud tool error (exit 2), never a silent pass', () => {
  const { dir } = repo(); // single commit, no origin, no parent
  try {
    write(dir, 'apps/web/features/home/new.module.css', '.c { color: var(--color-ink); }\n');
    const r = run(dir, ['--base', '0'.repeat(40)]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /no comparison base/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('resolveBase order: given, fetched, merge-base, parent, none', () => {
  const mk = (known, out = {}) => ({ hasCommit: (s) => known.includes(s), tryGit: (a) => out[a[0]] ?? '' });
  assert.deepEqual(resolveBase('aaa', mk(['aaa'])), { sha: 'aaa', via: 'given' });
  let fetched = false;
  const io = { hasCommit: (s) => s === 'aaa' && fetched, tryGit: (a) => { if (a[0] === 'fetch' && a.at(-1) === 'aaa') fetched = true; return ''; } };
  assert.deepEqual(resolveBase('aaa', io), { sha: 'aaa', via: 'fetched' });
  assert.deepEqual(resolveBase('zzz', mk(['mb'], { 'merge-base': 'mb', 'rev-parse': 'head' })), { sha: 'mb', via: 'merge-base' });
  assert.equal(resolveBase('', mk(['HEAD^'], { 'rev-parse': 'p1' })).via, 'parent');
  assert.equal(resolveBase('0'.repeat(40), mk([])).sha, '');
});

test('editing a safe property on a minified one-line rule that already violates does not fail', () => {
  const { dir, g, base } = repo();
  try {
    write(dir, 'apps/web/features/home/min.module.css', '.r{display:grid;gap:12px;padding:12px 0;color:#eeecef}\n');
    g('add', '-A'); g('commit', '-qm', 'min');
    const b2 = g('rev-parse', 'HEAD').trim();
    write(dir, 'apps/web/features/home/min.module.css', '.r{display:flex;gap:12px;padding:12px 0;color:#eeecef;margin:var(--space-2)}\n');
    const ok = run(dir, ['--base', b2]);
    assert.equal(ok.status, 0, ok.stderr);
    write(dir, 'apps/web/features/home/min.module.css', '.r{display:flex;gap:12px;padding:12px 0;color:#eeecef;margin:7px}\n');
    assert.equal(run(dir, ['--base', b2]).status, 1);
    assert.ok(base);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('appending a declaration after the last one on a minified line does not split the key (M2)', () => {
  const { dir, g } = repo();
  try {
    write(dir, 'apps/web/features/home/m2.module.css', '.r{margin:var(--space-1);padding:7px}\n');
    g('add', '-A'); g('commit', '-qm', 'm2');
    const b2 = g('rev-parse', 'HEAD').trim();
    write(dir, 'apps/web/features/home/m2.module.css', '.r{margin:var(--space-1);padding:7px;color:var(--color-ink)}\n');
    const r = run(dir, ['--base', b2]);
    assert.equal(r.status, 0, r.stderr);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('<button inside comments is not counted (M3)', () => {
  const { dir, base } = repo();
  try {
    write(dir, 'apps/web/features/home/c.tsx', '// <button old\n/* <button x */\nexport const C = () => <div>{/* <button y */}</div>;\n');
    const r = run(dir, ['--base', base]);
    assert.equal(r.status, 0, r.stderr);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a pure rename passes, a rename that adds a violation fails, a split only passes the renamed half (M1)', () => {
  const { dir, g } = repo();
  try {
    const big = Array.from({ length: 12 }, (_, i) => `.k${i} { color: #11${i}${i}22; padding: ${13 + i}px; }`).join('\n') + '\n';
    write(dir, 'apps/web/features/home/old.module.css', big);
    g('add', '-A'); g('commit', '-qm', 'big');
    const b2 = g('rev-parse', 'HEAD').trim();
    g('mv', 'apps/web/features/home/old.module.css', 'apps/web/features/home/moved.module.css');
    assert.equal(run(dir, ['--base', b2]).status, 0, 'pure rename');
    write(dir, 'apps/web/features/home/moved.module.css', big + '.z { color: #abcdef; }\n');
    assert.equal(run(dir, ['--base', b2]).status, 1, 'rename plus new violation');
    // split: half stays renamed (detected), the other half is a new file and is judged as new
    const half = big.split('\n').slice(0, 6).join('\n') + '\n';
    const rest = big.split('\n').slice(6).join('\n');
    write(dir, 'apps/web/features/home/moved.module.css', half);
    write(dir, 'apps/web/features/home/part2.module.css', rest);
    const split = run(dir, ['--base', b2]);
    assert.equal(split.status, 1, 'the new half has no base, so its existing violations count as new (known limit)');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('areas are split into home, groups, dukjil and other', () => {
  assert.equal(areaOf('apps/web/features/dukjil/ui/a.css'), 'dukjil');
  assert.equal(areaOf('apps/web/features/groups/ui/a.css'), 'groups');
  assert.equal(areaOf('apps/web/features/home/ui/a.css'), 'home');
  assert.equal(areaOf('apps/web/components/x.css'), 'other');
});

test('baseline mode: only violations beyond the baseline fail, count-only rules warn, and --update-baseline regenerates it', () => {
  const { dir, g } = repo();
  const bl = join(dir, 'scripts/design-lint-baseline.json');
  try {
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    write(dir, 'apps/web/features/home/old.module.css', OLD_CSS + '.t { z-index: 999; line-height: 1.37; }\n');
    g('add', '-A'); g('commit', '-qm', 'old rules');
    const upd = run(dir, ['--update-baseline']);
    assert.equal(upd.status, 0, upd.stderr + upd.stdout);
    assert.match(upd.stdout, /baseline written/);
    // the existing violations are accepted; no base commit is needed
    const same = run(dir, [], { DESIGN_LINT_BASE: 'f'.repeat(40) });
    assert.equal(same.status, 0, same.stderr + same.stdout);
    assert.match(same.stdout, /baseline/);
    // a new fail-level violation in any file fails even though the file is not changed in git terms
    write(dir, 'apps/web/features/home/new.module.css', '.n { z-index: 777; }\n');
    const bad = run(dir, []);
    assert.equal(bad.status, 1, bad.stderr);
    assert.match(bad.stderr, /T8/);
    // a count-only rule warns but passes
    write(dir, 'apps/web/features/home/new.module.css', '.n { line-height: 1.41; }\n');
    const warn = run(dir, []);
    assert.equal(warn.status, 0, warn.stderr);
    assert.match(warn.stderr, /warning.*T2/);
    // regenerating accepts the new file; fixing a violation lowers the baseline
    write(dir, 'apps/web/features/home/new.module.css', '.n { z-index: 777; }\n');
    assert.equal(run(dir, ['--update-baseline']).status, 0);
    assert.equal(run(dir, []).status, 0);
    write(dir, 'apps/web/features/home/new.module.css', '.n { z-index: 1; }\n');
    assert.equal(run(dir, ['--update-baseline']).status, 0);
    assert.ok(!JSON.parse(readFileSync(bl, 'utf8')).files['apps/web/features/home/new.module.css']);
    // a TSX rule and a copy rule go through the same baseline
    write(dir, 'apps/web/features/home/new.tsx', 'export const A = () => <h2>x</h2>;\n');
    assert.equal(run(dir, []).status, 1);
    write(dir, 'apps/web/features/home/new.tsx', 'export const A = () => <FanHeading>x</FanHeading>;\n');
    write(dir, 'apps/web/features/home/new-source.ts', 'export const s = { a: { ko: "특별한 순간", en: "x" } } as const;\n');
    const copy = run(dir, []);
    assert.equal(copy.status, 1);
    assert.match(copy.stderr, /S12/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
