// 261107-2 규칙 N1~N19 시험: 규칙마다 빨간 입력(걸려야 함)과 통과 입력(안 걸려야 함), 기준선 비교, 실행 시험 파일 존재.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { RULES_N, N_CONTRACTS, scanNFile, scanNAll } from './design-lint-n-rules.mjs';

const SCREEN = 'apps/web/features/home/ui/home-screen.tsx';
const PAGE = 'apps/web/app/pages/x/page.tsx';
const CSS = 'apps/web/features/home/x.module.css';
const hits = (map, id) => [...map.keys()].filter((k) => k.startsWith(`${id}|`));
const ts = (code, file = SCREEN) => scanNFile(file, code);
const css = (code, file = CSS) => scanNFile(file, code);

// [규칙, 걸리는 입력, 안 걸리는 입력]
const CASES = {
  N1: [
    () => ts('export const A = () => <div className={styles.cardBody}/>;'),
    () => ts('export const A = () => <FanEntityCard className={styles.grid}/>;'),
  ],
  N3: [
    () => ts('export const A = () => <div className={styles.identityHeader}/>;'),
    () => ts('export const A = () => <FanPageHeader name="x"/>;'),
  ],
  N4: [
    () => css('.a{margin-top:64px;min-height:300px}'),
    () => css('.a{margin-top:var(--space-12);padding:var(--space-6) 0;min-height:200px} .b{margin-top:-80px}'),
  ],
  N6: [
    () => css('.a{font-variant-numeric:lining-nums} [data-number-role="primary"]{font-size:20px}'),
    () => css('[data-number-role="primary"]{font-size:var(--fan-number-size);font-weight:var(--fan-number-weight);font-variant-numeric:tabular-nums} [data-number-role="table"]{font-size:13px;font-variant-numeric:tabular-nums}'),
  ],
  N7: [
    () => css('.a{animation:pulse 1s infinite}'),
    () => css('.a{animation:pulse 1s infinite} @media (prefers-reduced-motion: reduce){.a{animation:none}}'),
  ],
  N8: [
    () => ts('export const A = () => <><FanHeading level={2}>미션</FanHeading><p>{copy.missionIntro}</p></>;'),
    () => ts('export const A = () => <><FanHeading level={2}>미션</FanHeading><p>{copy.missionLegal}</p><FanHelpTip>짧은 도움말</FanHelpTip></>;'),
  ],
  N9: [
    () => ts('const MOCK_ROWS = [1];\nexport const A = () => null;', 'apps/web/features/home/ui/list.tsx'),
    () => ts('const rows = await load();\nexport const A = () => null;', 'apps/web/features/home/ui/list.tsx'),
  ],
  N11: [
    () => ts('export const A = () => <FanAction>x</FanAction>;'),
    () => ts('export const A = () => <><FanAction onClick={go}>x</FanAction><FanAction href="/a">y</FanAction><FanAction type="submit">z</FanAction></>;'),
  ],
  N15: [
    () => ts('import { Select } from "@base-ui/react/select";\nexport const A = () => <div role="dialog"/>;', 'apps/web/features/home/ui/x.tsx'),
    () => ts('import { Select } from "@base-ui/react/select";', 'apps/web/components/fan-ui/fan-dropdown.tsx'),
  ],
  N16: [
    () => ts('import { motion } from "motion/react";', 'apps/web/features/home/ui/hero.tsx'),
    () => ts('import { motion, useReducedMotion } from "motion/react";', 'apps/web/components/fan-ui/fan-dialog.tsx'),
  ],
  N21: [
    () => ts('export const A = () => <section className={styles.a}>x</section>;'),
    () => ts('export const A = () => <section data-block="wallet">x</section>;'),
  ],
  N22: [
    () => ts('export const A = () => <ul><li className={styles.row}>x</li></ul>;', 'apps/web/features/home/ui/list.tsx'),
    () => ts('export const A = () => <ul><li data-row="notice">x</li><li><FanRow variant="menu"/></li></ul>;', 'apps/web/features/home/ui/list.tsx'),
  ],
  N23: [
    () => ts('const t = formatRelativeTime(at, locale); const f = new Intl.DateTimeFormat(l, { dateStyle: "medium" });', 'apps/web/features/home/ui/list.tsx'),
    () => ts('const f = new Intl.DateTimeFormat(l, { month: "2-digit", day: "2-digit" });', 'apps/web/features/home/ui/list.tsx'),
  ],
  N24: [
    () => ts('export const A = () => <FanAction href="/a" trailingIcon={<ArrowRight/>}>x</FanAction>;'),
    () => ts('export const A = () => <FanAction href="/a">x</FanAction>;'),
  ],
  N25: [
    () => ts('import { Heart } from "lucide-react";\nexport const A = () => <Heart strokeWidth={2}/>;', 'apps/web/features/home/ui/list.tsx'),
    () => ts('import { Heart } from "lucide-react";\nexport const A = () => <Heart strokeWidth={1.5}/>;', 'apps/web/components/fan-ui/fan-icon.tsx'),
  ],
  N26: [
    () => css('.a{box-shadow:0 2px 8px rgb(0 0 0 / 8%)}'),
    () => css('.a{box-shadow:none} .b{box-shadow:var(--shadow-overlay)} .c{box-shadow:0 0 0 1px var(--color-line)} .d{box-shadow:inset 0 -2px 0 var(--color-accent)}'),
  ],
  N27: [
    () => css('.a{border-radius:16px} .b{border-radius:var(--radius-collection)}'),
    () => css('.a{border-radius:var(--radius-card)} .b{border-radius:var(--radius-control)} .c{border-radius:50%} .d{border-radius:0}'),
  ],
  N28: [
    () => css('.a{font-family:"Pretendard UI 850",sans-serif}'),
    () => css('.a{font-weight:var(--fan-heading-weight)}'),
  ],
  // H6: 보라 색상값(hex·rgb·hsl·oklch)과 짙은 회색 채움 알약
  N29: [
    () => css('.a{color:#7c3aed;background:rgb(124 58 237 / .2);border-color:hsl(270 60% 50%);outline-color:oklch(60% .2 300)}'),
    () => css('.a{color:var(--color-accent);background:#fff0f6;border-color:#f4c3d7;outline-color:oklch(62% .2 5);fill:#d11b62}'),
  ],
  N30: [
    () => css('.chip{border-radius:999px;background:var(--color-ink);color:#fff} .dot{border-radius:var(--radius-pill);background:#17171b}'),
    () => css('.chip{border-radius:999px;background:var(--color-surface);border:1px solid var(--color-line)} .on{border-radius:999px;background:var(--color-accent-soft)} .btn{border-radius:8px;background:var(--color-ink)} .veil{border-radius:999px;background:rgb(0 0 0 / .5)}'),
  ],
};

test('every static N rule has a red and a green case', () => {
  for (const [id, [red, green]] of Object.entries(CASES)) {
    assert.ok(hits(red(), id).length > 0, `${id}: 빨간 입력이 안 걸림 ${JSON.stringify([...red().keys()])}`);
    assert.equal(hits(green(), id).length, 0, `${id}: 통과 입력이 걸림 ${JSON.stringify([...green().keys()])}`);
  }
});

test('N7 also covers Motion files: reduced-motion hook or a global MotionConfig passes', () => {
  const bad = ts('import { motion } from "motion/react";', 'apps/web/components/fan-ui/fan-dialog.tsx');
  assert.ok(bad.has('N7|motion without useReducedMotion'));
  const ok = ts('import { motion, useReducedMotion } from "motion/react"; const r = useReducedMotion();', 'apps/web/components/fan-ui/fan-dialog.tsx');
  assert.equal(hits(ok, 'N7').length, 0);
  const files = ['apps/web/components/fan-ui/fan-dialog.tsx', 'apps/web/components/fan-ui/motion-provider.tsx'];
  const texts = { [files[0]]: 'import { motion } from "motion/react";', [files[1]]: '<MotionConfig reducedMotion="user">{children}</MotionConfig>' };
  const all = scanNAll(files, (f) => texts[f]);
  assert.equal(all.get(files[0])?.has('N7|motion without useReducedMotion') ?? false, false);
});

test('N4 honors the design-lint-disable comment for the one hero banner', () => {
  assert.equal(hits(css('/* design-lint-disable N4 */\n.hero{min-height:480px}'), 'N4').length, 0);
  assert.ok(hits(css('.hero{min-height:480px}'), 'N4').length > 0);
  assert.equal(hits(css('.s{min-height:300px}', 'apps/web/components/fan-ui/fan-state.module.css'), 'N4').length, 0);
});

test('N10 needs a contract test beside each api route; N14 bans small flows as pages', () => {
  const route = 'apps/web/app/api/me/summary/route.ts';
  const bare = scanNAll([route], () => '');
  assert.ok(hits(bare.get(route), 'N10').length === 1);
  const paired = scanNAll([route, 'apps/web/app/api/me/summary/summary.contract.test.ts'], () => '');
  assert.equal(paired.get(route), undefined);
  const page = 'apps/web/app/my/profile-edit/page.tsx';
  assert.ok(hits(scanNAll([page], () => '').get(page), 'N14').length === 1);
  const list = 'apps/web/app/my/wallet/history/page.tsx';
  assert.equal(scanNAll([list], () => '').get(list), undefined);
});

test('N11 reports FanAction without a destination or handler, and counts a disabled one without a reason only as a warning', () => {
  assert.ok(hits(ts('export const A = () => <FanAction disabled onClick={x}>x</FanAction>;'), 'N11').every((k) => /disabled without reason/.test(k)));
  assert.equal(RULES_N.N11.countDecl.test('disabled without reason'), true);
  assert.equal(RULES_N.N11.countDecl.test('<FanAction> without href/onClick'), false);
  assert.equal(RULES_N.N3.countDecl.test('<header>'), true);
  assert.equal(RULES_N.N3.countDecl.test('identityHeader'), false);
});

test('N19 N17 N18 N13 N5 N12 N2 are run by contract files that exist and carry the rule id in a test title', () => {
  for (const [id, c] of Object.entries(N_CONTRACTS)) {
    const p = resolve(dirname(new URL(import.meta.url).pathname), '..', c.file);
    assert.ok(existsSync(p), `${id}: ${c.file} 없음`);
    assert.match(readFileSync(p, 'utf8'), new RegExp(`['"\`]${id}[ :]`), `${id}: 시험 이름에 규칙 ID 없음`);
  }
});

test('N29 reads purple in TSX strings and tinted grays, ignores comments, logo art files and pink', () => {
  assert.ok(hits(ts('export const A = () => <path fill="#8a18b8" />;'), 'N29').length === 1);
  assert.ok(hits(ts('export const A = () => <div style={{ background: "#f4f3f7" }} />;'), 'N29').length === 1);
  assert.equal(hits(ts('// old #7c3aed\nexport const A = () => <path fill="#d11b62" />;'), 'N29').length, 0);
  assert.equal(hits(css('/* was #7c3aed */ .a{color:#ad1457;background:#fd48aa}'), 'N29').length, 0);
  assert.equal(hits(css('.a{color:#7c3aed}', 'apps/web/components/brand-logo.module.css'), 'N29').length, 0);
  assert.equal(hits(css('.a{background:#e8e8e8;color:#5d5d5d;border:1px solid #3b82f6}'), 'N29').length, 0);
  assert.equal(hits(css('.a{color:rebeccapurple}'), 'N29').length, 1);
});

test('N29 also covers fan-ui, globals.css and admin files (the other N rules skip admin)', () => {
  assert.equal(hits(css('.a{color:#6d4aff}', 'apps/web/components/fan-ui/fan-x.module.css'), 'N29').length, 1);
  assert.equal(hits(css(':root{--c:#6d4aff}', 'apps/web/app/globals.css'), 'N29').length, 1);
  assert.equal(hits(css('.a{color:#6d4aff}', 'apps/web/components/admin/x.module.css'), 'N29').length, 1);
});

test('severity table: N rules fail on a new violation (two with a counted branch); N26~N28 count only', () => {
  const counted = ['N26', 'N27', 'N28'];
  for (const id of Object.keys(RULES_N)) assert.equal(RULES_N[id].sev, counted.includes(id) ? 'count' : 'fail', id);
  assert.deepEqual(Object.keys(RULES_N).filter((id) => RULES_N[id].countDecl).sort(), ['N11', 'N3']);
});

// ---- 기준선 비교 통합 ----
const SCRIPT = resolve('scripts/design-lint.mjs');
function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'design-lint-n-'));
  const g = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  g('init', '-q', '-b', 'work'); g('config', 'user.email', 't@example.invalid'); g('config', 'user.name', 't');
  mkdirSync(join(dir, 'apps/web/features/home/ui'), { recursive: true });
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  return { dir, g };
}
const run = (dir, args = []) => spawnSync('node', [SCRIPT, ...args], { env: { ...process.env, DESIGN_LINT_ROOT: dir }, encoding: 'utf8' });

test('baseline mode: an existing N violation passes, one more fails, fixing it passes', () => {
  const { dir, g } = repo();
  try {
    const f = 'apps/web/features/home/ui/home-screen.tsx';
    writeFileSync(join(dir, f), 'export const A = () => <div className={styles.cardBody}/>;\n');
    g('add', '-A'); g('commit', '-qm', 'base');
    assert.equal(run(dir, ['--update-baseline']).status, 0);
    assert.equal(run(dir).status, 0, 'same tree passes against its baseline');
    writeFileSync(join(dir, f), 'export const A = () => <><div className={styles.cardBody}/><div className={styles.cardBody}/></>;\n');
    const bad = run(dir);
    assert.equal(bad.status, 1, bad.stderr + bad.stdout);
    assert.match(bad.stderr, /N1/);
    writeFileSync(join(dir, f), 'export const A = () => <FanSurface/>;\n');
    assert.equal(run(dir).status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('baseline mode: a new api route without a contract test fails and passes once the test file exists', () => {
  const { dir, g } = repo();
  try {
    writeFileSync(join(dir, 'apps/web/features/home/ui/keep.tsx'), 'export const A = () => null;\n');
    g('add', '-A'); g('commit', '-qm', 'base');
    assert.equal(run(dir, ['--update-baseline']).status, 0);
    mkdirSync(join(dir, 'apps/web/app/api/x'), { recursive: true });
    writeFileSync(join(dir, 'apps/web/app/api/x/route.ts'), 'export const GET = () => new Response("ok");\n');
    const bad = run(dir);
    assert.equal(bad.status, 1, bad.stderr + bad.stdout);
    assert.match(bad.stderr, /N10/);
    writeFileSync(join(dir, 'apps/web/app/api/x/x.contract.test.ts'), '// contract\n');
    assert.equal(run(dir).status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a counted N branch (raw <header> in a screen) warns but does not fail', () => {
  const { dir, g } = repo();
  try {
    writeFileSync(join(dir, 'apps/web/features/home/ui/keep.tsx'), 'export const A = () => null;\n');
    g('add', '-A'); g('commit', '-qm', 'base');
    assert.equal(run(dir, ['--update-baseline']).status, 0);
    writeFileSync(join(dir, 'apps/web/features/home/ui/home-screen.tsx'), 'export const A = () => <header/>;\n');
    const r = run(dir);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /count-only N3/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('N23 only permits the approved first-heart relative label in fan-list-time', () => {
  const file = 'apps/web/features/groups/ui/fan-list-time.ts';
  assert.equal(hits(ts('const label = formatRelativeTime(at, locale);', file), 'N23').length, 0);
  assert.equal(hits(ts('const label = formatRelativeTime(at, locale);', 'apps/web/features/groups/ui/other-time.ts'), 'N23').length, 1);
  assert.equal(hits(ts('const label = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });', file), 'N23').length, 1);
});
