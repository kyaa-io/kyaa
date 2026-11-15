// 규칙마다 빨간 입력(걸려야 함)과 통과 입력(안 걸려야 함)을 확인한다. 심각도 표(RULES)가 조사 문서의 분류와 같은지도 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, scanCss, scanTsx, scanSourceTs, scanSourceJson } from './design-lint-rules.mjs';
import { scanFile } from './design-lint.mjs';

const CSS = 'apps/web/features/home/x.module.css';
const TSX = 'apps/web/features/home/x.tsx';
const SRC = 'apps/web/features/home/x-source.ts';
const src = (key, ko) => `export const s = { ${key}: { ko: ${JSON.stringify(ko)}, en: "x" } } as const;`;
const hits = (map, id) => [...map.keys()].filter((k) => k.startsWith(`${id}|`));
const css = (c) => scanCss(c, CSS);
const tsx = (c) => scanTsx(c, TSX);

// [규칙, 걸리는 입력, 안 걸리는 입력] 을 만드는 함수. scan 결과 Map 을 돌려준다.
const CASES = {
  T2: [() => css('.a{line-height:1.37}'), () => css('.a{line-height:var(--fan-body-leading)} .b{line-height:1} .c{line-height:normal}')],
  T11: [() => css('.a{font-size:var(--fan-metadata-size);font-weight:var(--fan-section-weight)} .b{font-size:var(--fan-h1-size);font-weight:var(--fan-item-title-weight)}'),
    () => css('.a{font-size:var(--fan-metadata-size);font-weight:var(--fan-body-weight)} .b{font-size:var(--fan-item-title-size);font-weight:var(--fan-item-title-weight)} .c{font-size:var(--fan-h1-size);font-weight:var(--fan-heading-weight)} .d{font-size:var(--fan-section-size);font-weight:var(--fan-section-weight)} .e{font-size:var(--fan-number-size);font-weight:var(--fan-number-weight)}')],
  T4: [() => css('.a{width:calc(100% - 13px)}'), () => css('.a{width:calc(100% - var(--space-4))} .b{width:calc(100% - 1px)}')],
  T5: [() => css('.a{--thumb:64px}'), () => css('.a{--thumb:var(--space-6);--p:0;--fill:50%;--fan-x:12px}')],
  T6: [() => css('.a{box-shadow:0 4px 12px #d11b62}'), () => css('.a{box-shadow:0 1px 2px rgb(0 0 0 / 8%);outline:0} .b{box-shadow:0 0 0 3px #d11b62} .c{box-shadow:0 1px 2px var(--color-line)}')],
  T7: [() => css('.a{transition:opacity 180ms ease}'), () => css('.a{transition:opacity var(--motion-control) var(--motion-easing)} .b{transition:none}')],
  T8: [() => css('.a{z-index:999}'), () => css('.a{z-index:var(--z-dialog)} .b{z-index:1} .c{z-index:auto}')],
  T9: [() => css('.a{min-height:48px}'), () => css('.a{min-height:var(--min-target)} .b{width:56px}')],
  T10: [() => css('.a{font-family:"Courier New"}'), () => css('.a{font-family:inherit} .b{font-family:var(--font-body)}')],
  S1: [() => css('.a{background:linear-gradient(90deg,var(--color-line),var(--color-ink))}'), () => css('.a{background:var(--color-primary-action)} .b{background:var(--color-soft)}')],
  S2: [() => css('.a{backdrop-filter:blur(8px)}'), () => css('.a{background:var(--color-backdrop)}')],
  S3: [() => css('.a{box-shadow:0 0 24px var(--color-primary-action)}'), () => css('.a{box-shadow:0 0 0 3px var(--color-primary-action)} .b{box-shadow:0 4px 12px var(--color-ink)}')],
  S5: [() => css('.card{display:flex;flex-direction:column;align-items:center;text-align:center}'), () => css('.card{display:flex;flex-direction:column;align-items:flex-start}')],
  S6: [() => css('.a{filter:grayscale(1)}'), () => css('.a{opacity:.5}')],
  S10: [() => css('.a{border-radius:var(--radius-control)} .b{border-radius:var(--radius-collection)} .c{border-radius:var(--radius-hero)}'), () => css('.a{border-radius:var(--radius-control)} .b{border-radius:var(--radius-collection)}')],
  S14: [() => css('.a{text-transform:uppercase;letter-spacing:.08em} .b{text-transform:uppercase;letter-spacing:.1em}'), () => css('.a{text-transform:uppercase;letter-spacing:.08em}')],
  C1: [() => tsx('export const A = () => <button>x</button>;'), () => tsx('export const A = () => <FanAction>x</FanAction>;')],
  C2: [() => tsx('export const A = () => <h2>x</h2>;'), () => tsx('export const A = () => <FanHeading>x</FanHeading>;')],
  C3: [() => tsx('export const A = () => <input type="text" />;'), () => tsx('export const A = () => <input type="hidden" value="1" />;')],
  C4: [() => tsx('export const A = () => <div style={{ margin: 0 }} />;'), () => tsx('export const A = () => <div style={{ width: `${p}%` }} /><i style={{ "--x": 1 }} />;')],
  C5: [() => tsx('export const A = () => <p>불러오는 중</p>;'), () => tsx('export const A = () => <p aria-label="불러오는 중" />;')],
  C6: [() => tsx('export const A = () => <FanState kind="loading" />;'), () => tsx('export const A = () => <FanState kind="empty" />;')],
  C11: [() => tsx('export const A = () => <LoaderCircle className={styles.spin} />;'), () => tsx('export const A = () => <FanSkeletonRows rows={3} />;')],
  C7: [() => tsx('export const A = () => <a href="https://example.com">x</a>;'), () => tsx('export const A = () => <a href="/x">x</a><a href="https://a.b" data-outbound-tracking="off">y</a>;')],
  C8: [() => tsx('const t = locale === "ko" ? "안녕" : "hi";'), () => tsx('const t = copy.hello;')],
  C9: [() => tsx('export const A = () => <p>+20P 적립</p>;'), () => tsx('export const A = () => <p>{points}P 적립</p>;')],
  C10: [() => tsx('export const A = () => <p>🔥 인기</p>;'), () => tsx('export const A = () => <p>인기</p>;')],
  S4: [() => tsx('export const A = () => <><div className={styles.card}/><div className={styles.card}/><div className={styles.card}/></>;'), () => tsx('export const A = () => <>{xs.map(() => <div className={styles.card}/>)}<i className={styles.card}/></>;')],
  S8: [() => tsx('export const A = () => <><FanAction variant="primary">a</FanAction><FanAction variant="primary" onClick={() => go()}>b</FanAction></>;'), () => tsx('export const A = () => <><FanAction variant="primary" onClick={() => go()}>a</FanAction><FanAction>b</FanAction></>;')],
  S9: [() => tsx('export const A = () => <FanTag>지금 가입하면 혜택</FanTag>;'), () => tsx('export const A = () => <><FanTag>+20P ×5</FanTag><EarnBadge>{label}</EarnBadge></>;')],
  S7: [() => scanSourceTs(src('heroIntro', '친구와 함께 도장을 모으는 곳이에요.')), () => scanSourceTs(src('heroIntro', '도장 모으기'))],
  S11: [() => scanSourceTs(src('a', '하나 · 둘 · 셋 · 넷')), () => scanSourceTs(src('a', '페이지명 · 시간'))],
  S12: [() => scanSourceTs(src('a', '특별한 경험을 제공합니다')), () => scanSourceTs(src('a', '미션 9칸을 채우면 도장을 받아요'))],
  S13: [() => scanSourceTs(src('a', '팬 10K+ 가입')), () => scanSourceTs(src('a', '팬 120명 가입'))],
};
const CLEAN_IDS = ['T1', 'T3'];

test('every new rule has a red and a green case', () => {
  const ids = Object.keys(RULES).filter((id) => /^[TCS]\d+$/.test(id));
  for (const id of ids) {
    if (CLEAN_IDS.includes(id)) continue;
    assert.ok(CASES[id], `${id} 시험 없음`);
  }
  for (const [id, [red, green]] of Object.entries(CASES)) {
    assert.ok(hits(red(), id).length > 0, `${id}: 빨간 입력이 안 걸림`);
    assert.equal(hits(green(), id).length, 0, `${id}: 통과 입력이 걸림 ${JSON.stringify([...green().keys()])}`);
  }
});

test('T1 and T3 (stylelint) red and green', async () => {
  const stylelint = (await import('stylelint')).default;
  const bad = await scanFile(stylelint, CSS, '.a{font-weight:700;letter-spacing:-.02em}\n');
  assert.ok(hits(bad, 'T1').length === 1 && hits(bad, 'T3').length === 1, JSON.stringify([...bad.keys()]));
  const ok = await scanFile(stylelint, CSS, '.a{font-weight:var(--fan-heading-weight);letter-spacing:var(--fan-heading-tracking)} .b{letter-spacing:0;font-weight:inherit}\n');
  assert.equal(hits(ok, 'T1').length + hits(ok, 'T3').length, 0);
});

test('C4 skips only the share OG image routes (Satori reads inline styles only)', () => {
  const code = 'export const A = () => <div style={{ display: "flex" }} />;';
  assert.equal(hits(scanTsx(code, 'apps/web/app/share/jjinfan/[slug]/route.tsx'), 'C4').length, 0);
  assert.equal(hits(scanTsx(code, 'apps/web/app/share/jjinfan/[slug]/page.tsx'), 'C4').length, 1);
  assert.equal(hits(scanTsx(code, 'apps/web/app/live/route.tsx'), 'C4').length, 1);
});
test('C2 skips the guide pages', () => {
  assert.equal(hits(scanTsx('export const A = () => <h2>x</h2>;', 'apps/web/app/guide/a.tsx'), 'C2').length, 0);
});

test('C10 and S12 also read the ko values of source-messages.json', () => {
  const m = scanSourceJson(JSON.stringify({ a: { ko: '✨ 특별한 순간', en: 'x', id: 'f:a' }, b: { ko: '도장 9칸', en: 'x', id: 'f:b' } }));
  assert.ok(hits(m, 'C10').length === 1 && hits(m, 'S12').length === 1);
});

test('comments do not count', () => {
  assert.equal(scanTsx('// <h2>\n/* <button> */\nexport const A = 1;', TSX).size, 0);
});

test('severity table: 24 rules fail on a new violation, 11 are counted only (35 new in total)', () => {
  const isNew = (id) => /^[TCS]\d+$/.test(id) && id !== 'C1';
  const ids = Object.keys(RULES).filter(isNew);
  assert.equal(ids.length, 35); // C1 은 기존 규칙이라 제외
  assert.equal(ids.filter((id) => RULES[id].sev === 'fail').length, 24);
  assert.equal(ids.filter((id) => RULES[id].sev === 'count').length, 11);
});

test('261107-2 N rules: red and green', () => {
  const N = {
    N7: [() => css('.a{animation:spin var(--motion-control) linear}'), () => css('.a{animation:spin var(--motion-control) linear} @media (prefers-reduced-motion: reduce){.a{animation:none}} .b{animation:none}')],
    N15: [() => tsx('import * as Dialog from "@radix-ui/react-dialog";'), () => tsx('import { FanDialog } from "@/components/fan-ui";')],
    N15b: [() => tsx('import { Menu } from "@base-ui/react/menu"; export const A = () => <div role="dialog" />;'), () => scanTsx('import { Menu } from "@base-ui/react/menu";', 'apps/web/components/fan-ui/fan-menu.tsx')],
    N16: [() => tsx('import { m } from "motion/react"; import lottie from "lottie-web";'), () => scanTsx('import { m } from "motion/react";', 'apps/web/components/fan-ui/fan-motion-pop.tsx')],
    N20: [() => tsx('export const A = () => <span>×{remaining}</span>;'), () => tsx('export const A = () => <small>ELINA × BANKSY</small>;')],
  };
  for (const [id, [red, green]] of Object.entries(N)) {
    assert.ok(hits(red(), id).length > 0, `${id}: 빨간 입력이 안 걸림`);
    assert.equal(hits(green(), id).length, 0, `${id}: 통과 입력이 걸림 ${JSON.stringify([...green().keys()])}`);
  }
  assert.equal(hits(scanTsx('import lottie from "lottie-web";', 'apps/web/features/dukjil/ui/stamp-press.tsx'), 'N16').length, 0);
  assert.equal(hits(scanSourceTs(src('a', '+20P ×{0}')), 'N20').length, 1);
  assert.deepEqual(['N7', 'N15', 'N15b', 'N16', 'N20'].map((id) => RULES[id].sev), ['count', 'fail', 'count', 'fail', 'fail']);
});

test('approved CSS exceptions stay on their selector and exact rule ID', () => {
  const code = '.approved{/* design-lint-disable S1 -- user approved */background:linear-gradient(red,blue);filter:blur(4px)} .other{background:linear-gradient(red,blue);filter:blur(4px)}';
  assert.equal(css(code).get('S1|background: linear-gradient(red,blue)'), 1);
  assert.equal(css(code).get('S2|filter: blur(4px)'), 2);
  assert.equal(hits(css('.approved{/* design-lint-disable S2 -- user approved */filter:blur(4px)} .other{filter:blur(4px)}'), 'S2').length, 1);
  assert.equal(hits(css('.a{/* design-lint-disable S10 -- unrelated */background:linear-gradient(red,blue)}'), 'S1').length, 1);
});

test('T11 forbids component-owned tokens in screen CSS and allows them in the owner', () => {
  for (const t of ['--fan-action-primary-bg', '--fan-chip-height', '--fan-tab-weight', '--fan-badge-size', '--fan-calendar-cell']) {
    assert.ok(hits(css(`.a{color:var(${t})}`), 'T11').length > 0, t);
  }
  assert.equal(hits(css('.a{color:var(--fan-body-size)}'), 'T11').length, 0);
  assert.equal(hits(scanCss('.a{height:var(--fan-calendar-cell)}', 'apps/web/components/fan-calendar/x.module.css'), 'T11').length, 0);
});

test('T1 and T2 are fail-level now', async () => {
  const { RULES } = await import('./design-lint-rules.mjs');
  assert.equal(RULES.T1.sev, 'fail');
  assert.equal(RULES.T2.sev, 'fail');
});
