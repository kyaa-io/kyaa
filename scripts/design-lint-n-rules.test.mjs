// 261107-2 규칙 N1~N19 시험: 규칙마다 빨간 입력(걸려야 함)과 통과 입력(안 걸려야 함), 기준선 비교, 실행 시험 파일 존재.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { RULES_N, N_CONTRACTS, scanNFile, scanNAll, n31ActionArrows } from './design-lint-n-rules.mjs';

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
  N31: [
    () => ts('export const A = () => <header><h2>x</h2><FanAction variant="text" trailingIcon={<ArrowRight/>} href="/a">전체</FanAction></header>;', 'apps/web/features/home/ui/list.tsx'),
    () => ts('export const A = () => <header><h2>x</h2><FanSectionLink href="/a">전체</FanSectionLink></header>;', 'apps/web/features/home/ui/list.tsx'),
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

test('N31 flags pill, icon and styled-link actions beside a heading and leaves close buttons, rail rows and the shared link alone', () => {
  const F = 'apps/web/features/home/ui/list.tsx';
  assert.equal(hits(ts('export const A = () => <div className={styles.intro}><div><FanHeading>x</FanHeading></div><Link className={styles.calendarLink} href="/c"><CalendarDays/>일정</Link></div>;', F), 'N31').length, 0, 'container without head in its class name is out of scope');
  assert.equal(hits(ts('export const A = () => <header className={styles.intro}><div><FanHeading>x</FanHeading></div><Link className={styles.calendarLink} href="/c"><CalendarDays/>일정</Link></header>;', F), 'N31').length, 1);
  assert.equal(hits(ts('export const A = () => <div className={styles.sectionHeading}><h2>x</h2>{more && <Link href="/a">전체<ArrowRight/></Link>}</div>;', F), 'N31').length, 1);
  assert.equal(hits(ts('export const A = () => <header><h2>x</h2><FanAction variant="neutral" href="/a">전체</FanAction></header>;', F), 'N31').length, 1);
  assert.equal(hits(ts('export const A = () => <header><h2>x</h2><FanAction onClick={close}>닫기</FanAction></header>;', F), 'N31').length, 0);
  assert.equal(hits(ts('export const A = () => <header><h1>x</h1><FanAction variant="text" leadingIcon={<ArrowLeft/>} href="/a">뒤로</FanAction></header>;', F), 'N31').length, 0);
  assert.equal(hits(ts('export const A = () => <header><h2>x</h2><button className={styles.close} aria-label="닫기"><X/></button></header>;', F), 'N31').length, 0);
  assert.equal(hits(ts('export const A = () => <header><h2>x</h2><FanAction variant="text" trailingIcon={<ArrowRight/>} href="/a">전체</FanAction></header>;', 'apps/web/components/fan-ui/fan-heading.tsx'), 'N31').length, 0);
  assert.equal(hits(css('.sectionHeading>a{border:1px solid var(--color-line);border-radius:999px}'), 'N31').length, 1);
  assert.equal(hits(css('.listHead a{background:var(--color-surface)}'), 'N31').length, 1);
  assert.equal(hits(css('.sectionHeading>a{flex:none;color:var(--color-ink)} .sheetHeader button{border:1px solid var(--color-line)}'), 'N31').length, 0);
});

test('N31 judges CSS module styles, not class names or accessible names', () => {
  for (const tag of ['Link', 'a', 'button']) for (const label of ['', ' aria-label="More"']) {
    for (const [style, count] of [
      ['min-height:44px;color:var(--color-ink);background:transparent;border:0;border-radius:0', 0],
      ['border:1px solid transparent', 0],
      ['border-radius:999px', 1],
      ['background:var(--color-soft)', 1],
    ]) {
      const files = {
        [SCREEN]: `import styles from './x.module.css'; export const A = () => <header><h2>Title</h2><${tag} className={styles.more}${label}>More ›</${tag}></header>;`,
        'apps/web/features/home/ui/x.module.css': `.more{${style}}`,
      };
      assert.equal(hits(scanNAll(Object.keys(files), (f) => files[f]).get(SCREEN) ?? new Map(), 'N31').length, count, `${tag}${label}: ${style}`);
    }
    assert.equal(hits(ts(`export const A = () => <header><h2>Title</h2><${tag} className={styles.more}${label}>More ›</${tag}></header>`), 'N31').length, 0);
    assert.equal(hits(ts(`export const A = () => <header><h2>Title</h2><${tag}${label}><ChevronRight/>More</${tag}></header>`), 'N31').length, 1);
  }
});

test('N31 checks plain buttons and FanAction without href, including conditional icons', () => {
  for (const action of [
    '<button style={{borderRadius:999}}>More</button>',
    '<button style={{backgroundColor:"var(--color-soft)"}} aria-label="More">More</button>',
    '<button><svg/></button>',
    '<FanAction onClick={expand}>More</FanAction>',
    '<FanAction variant="neutral" onClick={expand} aria-label="More">More</FanAction>',
    '<FanAction variant="text" onClick={expand} trailingIcon={expanded ? <ChevronUp/> : <RowChevron/>}>More</FanAction>',
  ]) assert.equal(hits(ts(`export const A = () => <div className={styles.sectionHead}><h2>Title</h2>${action}</div>`), 'N31').length, 1, action);
  for (const action of [
    '<button onClick={expand}>More ›</button>',
    '<button style={{background:"transparent",border:0,borderRadius:0}}>More ›</button>',
    '<FanAction variant="text" onClick={expand}>More <span aria-hidden="true">›</span></FanAction>',
    '<FanAction onClick={onClose}>Close</FanAction>',
    '<button className={styles.close} aria-label="Close"><X/></button>',
  ]) assert.equal(hits(ts(`export const A = () => <header><h2>Title</h2>${action}</header>`), 'N31').length, 0, action);
  assert.equal(hits(ts('import { Plus as Add } from "lucide-react"; export const A = () => <header><h2>Title</h2><button aria-label="Add"><Add/></button></header>'), 'N31').length, 1);
});

test('N31 checks comma-separated selectors independently of sheet exceptions', () => {
  for (const selector of ['.sheetHeader button, .sectionHead > a', '.sectionHead > button, .sheetHeader button']) {
    assert.equal(hits(css(`${selector}{border-radius:999px;background:var(--color-soft)}`), 'N31').length, 1);
    assert.equal(hits(css(`${selector}{min-height:44px;background:transparent;border:0;border-radius:0}`), 'N31').length, 0);
  }
  assert.equal(hits(css('.sheetHeader button, .dialogHeader button{border-radius:999px}'), 'N31').length, 0);
  assert.equal(hits(css('.sectionHead > a, .listHead > button{background:var(--color-soft)}'), 'N31').length, 2);
});

test('N31 distinguishes close controls and app navigation from section actions', () => {
  assert.equal(hits(ts('<header className={styles.modalHeader}><h2>Dialog</h2><button aria-label={copy.close} onClick={() => setOpen(false)}><X aria-hidden="true"/></button></header>'), 'N31').length, 0);
  assert.equal(hits(ts('<header className={styles.modalHeader}><h2>Dialog</h2><FanAction onClick={add}>Add</FanAction></header>'), 'N31').length, 1);
  for (const [markup, expected] of [
    ['<span>kyaa.io</span><button aria-label="Share"><Share2/></button>', 0],
    ['<h2>Section</h2><button aria-label="More">More ›</button>', 1],
  ]) {
    const files = {
      [SCREEN]: `import styles from './x.module.css'; export const A = () => <header className={styles.header}>${markup}</header>;`,
      'apps/web/features/home/ui/x.module.css': '.header button, .sheetHeading button{border-radius:999px;background:var(--color-soft)}',
    };
    assert.equal(hits(scanNAll(Object.keys(files), (f) => files[f]).get(SCREEN) ?? new Map(), 'N31').length, expected);
  }
});

test('N31 catches home-ranking-card function-separated conditional actions', () => {
  const code = 'const all = (tab: string) => <Link href={tab}>전체<ArrowRight/></Link>; const head = (tab: string) => <div><FanHeading>순위</FanHeading>{tab ? all(tab) : null}</div>;';
  assert.equal(hits(ts(code), 'N31').length, 1);
});

test('N31 catches wallet-card whole-card links with FanIcon', () => {
  assert.equal(hits(ts('<Link href="/wallet"><span><FanHeading>지갑</FanHeading><FanIcon icon={ChevronRight}/></span><dl>잔액</dl></Link>'), 'N31').length, 1);
});

test('N31 catches stan-wallet guide links away from headings', () => {
  assert.equal(hits(ts('<section><h2>지갑</h2><dl>잔액</dl><Link href="/guide">안내<ChevronRight size={16}/></Link></section>'), 'N31').length, 1);
});

test('N31 resolves same-file JSX variables, returned JSX and local components', () => {
  for (const helper of [
    'const arrow = <MoveRight/>; const body = <span>{arrow}</span>;',
    'function icon() { return <MoveRight/>; } const body = <span>{icon()}</span>;',
    'const icon = () => <MoveRight/>; const body = <span>{icon()}</span>;',
    'const icon = () => { if (ready) return <MoveRight/>; return null; }; const body = icon();',
    'function Icon() { return <MoveRight/>; } const body = <Icon/>;',
    'const arrow = <MoveRight/>; const body = ready ? arrow : null;',
  ]) {
    const code = helper + ' const Card = () => <Link href="/x">{body}</Link>;';
    assert.equal(n31ActionArrows(code, SCREEN).length, 1, helper);
    assert.equal(hits(ts(code), 'N31').length, 1, helper);
  }
});

test('N31 covers action tags, card wrappers, import aliases and icon props', () => {
  for (const tag of ['a', 'Link', 'button', 'FanAction', 'FanCard', 'Cell']) {
    for (const icon of ['<ChevronRight/>', '<FanIcon icon={ArrowRight}/>', '<MoveRight/>']) {
      assert.equal(hits(ts(`<${tag} href="/x"><span>${icon}</span></${tag}>`), 'N31').length, 1);
    }
  }
  for (const code of [
    'import { ChevronRight as Next } from "lucide-react"; <Link href="/x"><Next/></Link>;',
    'import { ArrowRight as Next, FanIcon as Icon } from "@/components/fan-ui"; <button><Icon icon={Next}/></button>;',
    'import * as Icons from "lucide-react"; <button><Icons.MoveRight/></button>;',
    'const Arrow = ChevronRight; <button><FanIcon icon={Arrow}/></button>;',
    'const arrow = <ArrowRight/>; <FanAction trailingIcon={arrow}>더 보기</FanAction>;',
    '<div role="button"><ChevronRight/></div>;',
    '<FanCard onClick={open}><ArrowRight/></FanCard>;',
  ]) assert.equal(hits(ts(code), 'N31').length, 1, code);
});

for (const [reason, controls] of Object.entries({
  close: ['onClick={onClose}', 'aria-label="닫기"'],
  back: ['onClick={goBack}', 'aria-label="Back"'],
  carousel: ['onClick={scrollNext}', 'aria-label="Next slide"', 'aria-label="이전 슬라이드"'],
  pagination: ['onClick={nextPage}', 'aria-label="Next page"', 'aria-label="이전 페이지"'],
})) test(`N31 allows explicit ${reason} controls including heading-adjacent ones`, () => {
  for (const attrs of controls) for (const wrapper of [false, true]) {
    const code = `<button ${attrs}><ChevronRight/></button>`;
    assert.equal(hits(ts(wrapper ? `<header><h2>Title</h2>${code}</header>` : code), 'N31').length, 0, attrs);
  }
});

test('N31 does not exempt generic next, arbitrary labels or whole files', () => {
  for (const attrs of ['onClick={onNext}', 'aria-label="More"', 'className={styles.carousel}', 'aria-label="Next"']) {
    assert.equal(hits(ts(`<button ${attrs}><ArrowRight/></button>`), 'N31').length, 1);
  }
  const code = '<><button aria-label="Next slide"><ArrowRight/></button><Link href="/all"><ArrowRight/></Link></>';
  assert.equal(n31ActionArrows(code, SCREEN).length, 1);
});

const localControls = [
  ['components/fan-calendar/calendar-parts.tsx', '<Link className={styles.control} href={value.href}><ChevronRight/></Link>'],
  ['components/home-community-preview.tsx', '<button aria-label={pagination.next} onClick={() => setPage(value => value + 1)}><ChevronRight/></button>'],
  ['features/bias/ui/promotion-page.tsx', '<button aria-label={t.next} onClick={() => setPage(visiblePage + 1)}><ChevronRight/></button>'],
  ['features/fan-posts/ui/fan-post-feed.tsx', '<button aria-label={copy.older} onClick={() => goToPage(cursors)}><ChevronRight/></button>'],
  ['features/groups/ui/creator-group-home.tsx', '<button aria-label={t.next} onClick={() => setCursors(next)}><ChevronRight/></button>'],
  ['features/groups/ui/group-board.tsx', '<button aria-label={paginationCopy(locale).next} onClick={() => goPreview(next)}><ChevronRight/></button>'],
  ['features/home/ui/events-pagination.tsx', '<Link href={href(page + 1)}><ChevronRight/></Link>'],
  ['features/live/ui/live-catalog-screen.tsx', '<button aria-label={t.next} onClick={() => setPage(Math.min(pageCount - 1, currentPage + 1))}><ChevronRight/></button>'],
  ['features/passport/ui/passport-mission-book.tsx', '<FanAction ariaLabel={passportBookText(locale, "pageNext")} onClick={() => onChange(index + 1)} leadingIcon={<ChevronRight/>}/>'],
  ['components/home-entry-cards/home-guide-carousel.tsx', '<button className={styles.carouselNext} onClick={() => goTo(activeIndex + 1, true)}><ChevronRight/></button>'],
  ['components/live-hero-carousel.tsx', '<button className={styles.carouselNext} onClick={() => goTo(activeIndex + 1, true)}><ChevronRight/></button>'],
  ['features/fan-posts/ui/post-attachment-viewer.tsx', '<button aria-label={page.next} onClick={() => setSelected(value => value + 1)}><ChevronRight/></button>'],
  ['features/groups/ui/directory-top.tsx', '<FanAction ariaLabel={c.nextBanner} onClick={() => move(1)} leadingIcon={<ChevronRight/>}/>'],
  ['features/groups/ui/discovery-carousel.tsx', '<button aria-label={t.next} onClick={() => setActive((index + 1) % slides.length)}><ArrowRight/></button>'],
  ['features/live/ui/live-calendar-screen.tsx', '<button aria-label={participation.nextEvent} onClick={() => move(1)}><ChevronRight/></button>'],
  ['features/live/ui/observed-live-strip.tsx', '<button aria-controls={listId} onClick={next}><ChevronRight/></button>'],
  ['features/notification/ui/notification-inbox.tsx', '<FanIconButton className={styles.chipNext} onClick={next}><FanIcon icon={ChevronRight}/></FanIconButton>'],
];
for (const [path, control] of localControls) test(`N31 allows only the reviewed control in ${path}`, () => {
  const file = `apps/web/${path}`;
  assert.equal(hits(ts(control, file), 'N31').length, 0);
  assert.equal(hits(ts(`<header><h2>Title</h2>${control}</header>`, file), 'N31').length, 0);
  assert.equal(hits(ts(control, SCREEN), 'N31').length, 1, 'not a global markup exemption');
  const code = `<>{control}<Link href="/all"><ArrowRight/></Link></>`;
  assert.equal(n31ActionArrows(code, file).length, 1, 'content links in the same file still fail');
});

test('N31 recognizes a local card wrapper without repeating its href at the call site', () => {
  const code = 'function Card({ children }) { return <Link href="/wallet">{children}</Link>; } <Card><FanIcon icon={ChevronRight}/></Card>;';
  assert.equal(hits(ts(code), 'N31').length, 1);
});

test('N31 ignores unrendered arrows, comments, strings, event callbacks and shadowed bindings', () => {
  for (const code of [
    '<div><ChevronRight/><Link href="/x">전체 ›</Link></div>',
    'const text = "<Link><ArrowRight/></Link>";',
    '/* <Link><ArrowRight/></Link> */ <Link href="/x">전체 ›</Link>',
    'const arrow = <ArrowRight/>; <button onClick={() => arrow}>확인</button>;',
    'const arrow = <ArrowRight/>; function Card(arrow: string) { return <Link>{arrow}</Link>; }',
    'const arrow = <ArrowRight/>; function Card({arrow}: Props) { return <Link>{arrow}</Link>; }',
    'const arrow = <ArrowRight/>; function Card() { const arrow = "›"; return <Link>{arrow}</Link>; }',
    'const cycle = () => cycle(); <Link>{cycle()}</Link>;',
  ]) assert.equal(hits(ts(code), 'N31').length, 0, code);
});

test('N31 keeps stable counts and source locations across nested/repeated references', () => {
  const code = '// lead\nconst icon = <ArrowRight/>;\nconst body = <span>{icon}</span>;\n<Link>{body}{body}</Link>;';
  assert.equal(n31ActionArrows(code, SCREEN).length, 1);
  assert.equal(n31ActionArrows(code, SCREEN)[0].line, 2);
  const heading = '// lead\n<header><h2>Title</h2><Link><ArrowRight/></Link></header>;';
  assert.equal([...ts(heading)].filter(([key]) => key.startsWith('N31|')).reduce((sum, [, n]) => sum + n, 0), 1);
  assert.equal(n31ActionArrows('<Link><button aria-label="Next page"><ArrowRight/></button></Link>', SCREEN).length, 0);
  assert.equal(n31ActionArrows('<Link><button><ArrowRight/></button></Link>', SCREEN).length, 1);
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
