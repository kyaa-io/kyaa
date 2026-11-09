// design-lint 261107-2 규칙 N1~N19 (원문: board/reports/doc-261107-2-review-rules.md 2절).
// 기존 design-lint-rules.mjs(T·C·S)와 같은 틀이다: 한 파일의 내용을 받아 "규칙|세부" -> 개수 Map 을 돌려주고, 기준선 비교는 design-lint.mjs 가 한다.
// 정적으로 볼 수 있는 규칙(N1 N3 N4 N6 N7 N8 N9 N10 N11 N14 N15 N16)만 여기서 센다. 나머지는 실행 시험이 본다(N_CONTRACTS).
// 오탐이 큰 부분은 RULES_N 의 countDecl 로 집계로 내린다(실패시키지 않고 경고로만 센다). 이유는 note 에 적었다.
import postcss from 'postcss';
import ts from 'typescript';
import { posix } from 'node:path';
import { jsxTags, stripComments } from './design-lint-rules.mjs';
import { scanPurple, scanDarkCapsule } from './design-lint-color.mjs';

export const RULES_N = {
  N1: { sev: 'fail', note: '화면 파일은 버튼·탭·카드·태그를 components/fan-ui 에서 가져온다(styles.card|btn|button|tab|badge|chip 직접 사용·fan-ui 밖 *-card|*-button 모듈 가져오기 금지)' },
  N3: { sev: 'fail', countDecl: /^<header>/, note: '페이지 머리는 FanPageHeader 하나(identityHeader·GroupIdentityHeader 금지). 화면 파일의 원시 <header> 는 카드·팝오버 안 머리와 구분하지 못해 집계' },
  N4: { sev: 'fail', note: '구역 사이 margin/padding 64px 이상, min-height 280px 이상 금지(FanState 전체 대체 상태 제외). 히어로 1곳은 design-lint-disable N4 주석' },
  N6: { sev: 'fail', note: '숫자 역할([data-number-role])은 var(--fan-number-size|weight) 와 tabular-nums 만. font-variant-numeric 은 tabular-nums·normal 만' },
  N7: { sev: 'fail', note: 'animation 이 있는 CSS 모듈은 prefers-reduced-motion 분기가 있어야 하고, Motion 을 쓰는 파일은 useReducedMotion 이나 전역 MotionConfig reducedMotion="user" 가 있어야 한다' },
  N8: { sev: 'fail', note: '제목 아래 설명 문장(*Intro|*Lead|*Description|*Hint) 금지, FanHelpTip 본문 60자 이하' },
  N9: { sev: 'fail', note: '화면 코드(app/·features/**/ui)에 MOCK_·dummy·sample·fixture 상수 금지' },
  N10: { sev: 'fail', note: 'app/api/**/route.ts 마다 같은 폴더에 *.contract.test.ts 필요. 프록시 라우트를 정규식으로 못 가려서 기존 라우트는 모두 기준선, 새 라우트만 막는다' },
  N11: { sev: 'fail', countDecl: /^disabled without reason/, note: 'FanAction·Link 에 href 나 onClick 필요. disabled 사유 표시는 대기 중 잠금처럼 사유가 자명한 곳이 많아 집계' },
  N14: { sev: 'fail', note: '프로필 수정·퀴즈 시작·포인트 내역·교환 확인·언어 선택은 라우트 페이지가 아니라 모달' },
  N15: { sev: 'fail', note: '모달·드롭다운·툴팁·팝오버 라이브러리(@radix-ui, @base-ui)와 수동 role="dialog" 는 components/fan-ui 안에서만' },
  N16: { sev: 'fail', note: 'Motion·lottie 는 허용 파일(fan-dialog, fan-route-transition, reward-*, attendance-*, stamps/*, stamp-press, fan-motion-icon, point-reward-burst)에서만' },
  // 2026-11-09 브리프 v1.1(DESIGN.md §5). N21~N25 는 fail(새 파일·늘어난 개수), N26~N28 은 집계.
  N21: { sev: 'fail', note: '화면 파일(page.tsx·*-screen.tsx)의 1단계 <section> 은 data-block 이 있어야 한다(첫 뷰포트 블록 수 측정 R2)' },
  N22: { sev: 'fail', note: '목록 행(<li>)은 data-row 를 단다. FanRow 를 감싸면 FanRow 가 단다(R5)' },
  N23: { sev: 'fail', note: '상대 시간(formatRelativeTime·RelativeTime)과 dateStyle: "medium" 금지. 날짜는 2형식(11. 08. 13:47 / 2026.11.08) (8장 ⑨)' },
  N24: { sev: 'fail', note: '버튼 안 화살표(trailingIcon={<ArrowRight) 금지. 이동은 FanRow 의 › 만(R16)' },
  N25: { sev: 'fail', note: 'lucide-react 는 components/fan-ui(FanIcon) 안에서만 가져오고 strokeWidth 는 1.5 만(8장 ⑫)' },
  N26: { sev: 'count', note: 'box-shadow 는 none·var(--shadow-overlay)·포커스 링(블러 0)만. 카드·행·버튼 그림자 0(8장 ⑦)' },
  N27: { sev: 'count', note: 'border-radius 는 var(--radius-card|control|pill)·0·50%·inherit 만(8장 ④)' },
  N28: { sev: 'count', note: '정적 글꼴 Pretendard UI 참조 금지. 굵기 토큰을 쓴다(8장 ③)' },
  // 2026-11-08 H6(사용자 지시): 강조색은 kyaa 핑크 1색, 보라는 로고 아트에만, 짙은 회색 채움 캡슐 금지.
  N29: { sev: 'fail', note: 'CSS·TSX 의 보라 색상값(hex·rgb·hsl·oklch, 색상 250~320°·채도 10% 이상) 금지. 강조색은 var(--color-accent*) 핑크 1색. 로고·그림 아트 파일만 허용(H6)' },
  N31: { sev: 'fail', note: '섹션 제목과 같은 헤더의 더보기·전체보기 행동은 글자 링크 + 글자 ›. 같은 파일의 함수·변수로 분리된 머리 행동도 검사한다. CTA·카드 전체 링크·목록 행·양식 단계·모달 열기는 제외한다' },
  N30: { sev: 'fail', note: '짙은 회색(또는 --color-ink) 채움 알약 금지. 캡슐·칩·배지는 흰 바탕 + 1px 테두리, 선택은 핑크 테두리/글자나 옅은 핑크 바탕 1단, 진행 막대·행동 버튼은 핑크 토큰(H6)' },
};

// 실행 시험으로 보는 규칙. 파일은 저장소 루트 기준이고 시험 이름에 규칙 ID 가 들어간다. design-lint-n-rules.test.mjs 가 파일과 이름을 확인한다.
export const N_CONTRACTS = {
  N2: { file: 'apps/web/e2e-q/n-runtime.q.spec.ts', how: 'Playwright(로컬 앱): 같은 역할의 계산값을 홈·모임·덕질·MY 에서 재서 서로 대조' },
  N5: { file: 'apps/web/q-contract/n-contract.qc.tsx', how: 'vitest: FanCollapsible 기본 상태' },
  N12: { file: 'apps/web/e2e-q/n-runtime.q.spec.ts', how: 'Playwright(로컬 앱): 탭 전환 전후 위 영역 밀림 1px 이하' },
  N13: { file: 'apps/web/q-contract/n-contract.qc.tsx', how: 'vitest: FanAction 대기 상태' },
  N17: { file: 'apps/web/q-contract/n-contract.qc.tsx', how: 'vitest: FanHeaderStatus 3칸' },
  N18: { file: 'apps/web/q-contract/n-contract.qc.tsx', how: 'vitest: 0값 통계 숨김' },
  N19: { file: 'apps/web/e2e-q/n-runtime.q.spec.ts', how: 'Playwright(로컬 앱): 헤더 언어 선택 12개' },
};

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const short = (s, n = 90) => { const t = norm(s); return t.length > n ? `${t.slice(0, n)}…` : t; };
const add = (m, key, n = 1) => { if (n > 0) m.set(key, (m.get(key) ?? 0) + n); };

const FAN_UI = /^apps\/web\/components\/fan-ui\//;
const TEST_PATH = /(\.test\.[tj]sx?$|\.island-test\.[tj]sx?$|\.spec\.[tj]sx?$|\.qc\.[tj]sx?$|\/e2e\/|\/e2e-q\/|\/q-contract\/|\/__tests__\/|\/scripts\/|\.d\.ts$)/;
const ADMIN = /^apps\/web\/(app\/admin\/|components\/admin\/|features\/admin)/;
const GUIDE = /^apps\/web\/app\/guide\//;

export const nEligible = (file) => /^apps\/web\/(app|components|features)\//.test(file) && /\.(css|tsx?)$/.test(file) && !TEST_PATH.test(file) && !/\/node_modules\//.test(file);

// 공간 토큰(globals.css --space-N)을 64px 판정에 쓴다.
const SPACE = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 };

const pxOf = (token) => {
  const v = token.trim();
  let m = v.match(/^(\d*\.?\d+)px$/); if (m) return parseFloat(m[1]);
  m = v.match(/^(\d*\.?\d+)rem$/); if (m) return parseFloat(m[1]) * 16;
  m = v.match(/^var\(--space-(\d+)\)$/); if (m && SPACE[m[1]]) return SPACE[m[1]];
  return 0;
};

const disabledByComment = (node, id) => {
  for (let n = node; n; n = n.parent) {
    const prev = n.prev?.();
    if (prev?.type === 'comment' && prev.text.includes(`design-lint-disable ${id}`)) return true;
    if (n.type === 'rule' && n.raws?.before?.includes?.(`design-lint-disable ${id}`)) return true;
    if (n.type === 'rule' && n.nodes?.some((c) => c.type === 'comment' && c.text.includes(`design-lint-disable ${id}`))) return true;
  }
  return false;
};

// 블러 0 링(0 0 0 Npx 색)과 inset 선만 있는 그림자는 테두리 대용이라 N26 에서 뺀다.
const boxShadowIsRing = (v) => v.split(/,(?![^(]*\))/).every((layer) => /^\s*(inset\s+)?0(px)?\s+0(px)?\s+0(px)?\b/.test(layer) || /^\s*inset\s+0(px)?\s+-?\d+px\s+0(px)?\s/.test(layer));

export function scanNCss(code, file) {
  const out = new Map();
  if (GUIDE.test(file) || ADMIN.test(file)) return out;
  const root = postcss.parse(code, { from: file });
  let hasAnimation = false; let hasReduced = false;
  const fanState = /fan-state\.module\.css$/.test(file);
  root.walkAtRules('media', (a) => { if (/prefers-reduced-motion/.test(a.params)) hasReduced = true; });
  root.walkDecls((d) => {
    const prop = d.prop.toLowerCase(); const value = d.value; const sel = d.parent?.selector ?? '';
    const where = `${prop}: ${short(value)}`;
    if (/^(margin|padding)(-(top|bottom|block|block-start|block-end))?$/.test(prop) && !disabledByComment(d, 'N4')) {
      const toks = value.replace(/\s+/g, ' ').trim().split(' ').filter((t) => !t.startsWith('-'));
      if (toks.some((t) => pxOf(t) >= 64)) add(out, `N4|${where}`);
    }
    if (prop === 'min-height' && !fanState && !disabledByComment(d, 'N4') && pxOf(value) >= 280) add(out, `N4|${where}`);
    if ((prop === 'animation' || prop === 'animation-name') && !/^(none|initial|inherit|unset)\b/.test(value.trim())) hasAnimation = true;
    if (prop === 'font-variant-numeric' && !/^(tabular-nums|normal|inherit|initial|unset|var\(.*\))$/.test(value.trim())) add(out, `N6|${where}`);
    if (/\[data-number-role/.test(sel) && !/\[data-number-role=["']?table["']?\]/.test(sel)) {
      if (prop === 'font-size' && !/^var\(--fan-number-(size|sub-size)\)$/.test(value.trim())) add(out, `N6|${short(sel, 40)} ${where}`);
      if (prop === 'font-weight' && !/^var\(--fan-number-weight\)$/.test(value.trim())) add(out, `N6|${short(sel, 40)} ${where}`);
    }
  });
  root.walkDecls((d) => {
    const prop = d.prop.toLowerCase(); const v = d.value.trim(); const where = `${prop}: ${short(v)}`;
    if (prop === 'box-shadow' && !/^(none|var\(--shadow-overlay\)|inherit|initial|unset)$/.test(v) && !boxShadowIsRing(v)) add(out, `N26|${where}`);
    if (/^border(-(top|bottom|start|end)-(left|right|start|end))?-radius$/.test(prop) && !v.split(/\s+/).every((t) => /^(0|0px|50%|inherit|initial|unset|var\(--radius-(card|control|pill)\))$/.test(t))) add(out, `N27|${where}`);
    if (/Pretendard UI/.test(v)) add(out, `N28|${where}`);
  });
  root.walkRules((r) => {
    if (/\[data-number-role/.test(r.selector) && !r.nodes.some((c) => c.type === 'decl' && c.prop === 'font-variant-numeric' && /tabular-nums/.test(c.value))) add(out, `N6|${short(r.selector, 60)} no tabular-nums`);
  });
  root.walkRules((r) => {
    if (!r.nodes.some((c) => c.type === 'decl' && forbiddenHeadStyle(c.prop, c.value))) return;
    for (const selector of r.selectors) {
      if (HEAD_ACTION_SELECTOR.test(selector) && !DIALOG_HEAD.test(selector)) add(out, `N31|${short(selector, 70)}`);
    }
  });
  if (hasAnimation && !hasReduced) add(out, 'N7|animation without prefers-reduced-motion');
  return out;
}

const SCREEN = (file) => (/^apps\/web\/app\/.+\/page\.tsx$|^apps\/web\/app\/page\.tsx$/.test(file) || /^apps\/web\/features\/.+\/ui\/[\w-]*-screen\.tsx$/.test(file)) && !GUIDE.test(file) && !ADMIN.test(file);
const MOTION_IMPORT = /from\s+['"](motion|motion\/react|framer-motion|lottie-web|lottie-react|@lottiefiles\/[^'"]+|@dotlottie\/[^'"]+)['"]/;
const MOTION_ALLOW = /^apps\/web\/(components\/fan-ui\/(fan-dialog|fan-route-transition|fan-motion-icon|point-reward-burst|fan-motion)[\w-]*\.tsx?|features\/dukjil\/ui\/(reward-|attendance-|stamp-press)[\w-]*\.tsx?|features\/[\w-]+\/ui\/(reward-|attendance-)[\w-]*\.tsx?|features\/[\w-]+\/(ui\/)?stamps\/)/;
const UI_LIB = /from\s+['"](@radix-ui\/[^'"]+|@base-ui\/[^'"]+|@base-ui-components\/[^'"]+)['"]/;
const NOT_NEEDING_MOTION_CHECK = /useReducedMotion|MotionConfig|prefers-reduced-motion/;
const MOCK = /\b(?:const|let|var)\s+((?:MOCK|DUMMY|SAMPLE|FIXTURE)_\w+|(?:mock|dummy|sample|fixture)[A-Z]\w*)\s*[=:]/g;

// 머리 컨테이너(<header> 또는 className 에 head·Head 가 든 div) 안에서 제목 바로 뒤에 오는 행동 요소.
const SECTION_HEAD_ACTION = /<(?:header\b[^>]*|div\b[^>]*\bclassName=\{[^}]*[Hh]ead[^}]*\}[^>]*)>\s*(?:<div\b[^>]*>\s*)?<(?:h[1-3]|FanHeading)\b[^>]*>[^]{0,260}?<\/(?:h[1-3]|FanHeading)>\s*(?:<\/(?:div|span)>\s*)?(?:\{[^{}]{0,80}&&\s*)?<(FanAction|Link|a|button)\b/g;
// 섹션 머리 컨테이너(…Head|Heading|Header) 직계의 a·button 은 알약·테두리·배경을 갖지 못한다. 대화상자·시트·오버레이 머리의 닫기 버튼은 제외한다.
// Generic `.header` also styles app navigation. Its actual heading actions are
// checked in JSX with their imported stylesheet, rather than guessed from CSS.
const DIALOG_HEAD = /dialog|modal|sheet|overlay|drawer|popover|confirm|close|back|languages|valueRow|installButton|detailHeader|^\s*\.header(?=\s|>)/i;
const HEAD_ACTION_SELECTOR = /(?:head|heading|header)[\w-]*\s*>\s*(?:a|button)\b|(?:head|heading|header)[\w-]*\s+(?:a|button)\b/i;

const forbiddenHeadStyle = (prop, value) => {
  prop = prop.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  value = value.trim();
  return (/^border(-color)?$/.test(prop) && !/^(0|none)\b|\btransparent\b/.test(value))
    || (/^background(-color)?$/.test(prop) && !/^(none|transparent|inherit|initial|unset)\b/.test(value))
    || (/^border(-[a-z-]+)?-radius$/.test(prop) && !/^(0|0px)$/.test(value));
};

// Resolve only imported CSS modules; an accessible name never exempts styling.
function headActionHasStyle(attrs, code, file, read, head, name) {
  const inline = attrs.match(/\bstyle=\{\{([\s\S]*?)\}\}/)?.[1] ?? '';
  for (const m of inline.matchAll(/([\w]+)\s*:\s*(?:["']([^"']*)["']|([\d.]+))/g)) {
    if (forbiddenHeadStyle(m[1], m[2] ?? m[3])) return true;
  }
  if (!read) return false;
  for (const imported of code.matchAll(/import\s+(\w+)\s+from\s*["']([^"']+\.module\.css)["']/g)) {
    const classes = [...attrs.matchAll(new RegExp(String.raw`\b${imported[1]}\.(\w+)`, 'g'))].map((m) => m[1]);
    const headClasses = [...head.matchAll(new RegExp(String.raw`\b${imported[1]}\.(\w+)`, 'g'))].map((m) => m[1]);
    if (!classes.length && !headClasses.length) continue;
    const path = imported[2].startsWith('@/') ? `apps/web/${imported[2].slice(2)}` : posix.join(posix.dirname(file), imported[2]);
    const css = read(path);
    if (!css) continue;
    let forbidden = false;
    postcss.parse(css, { from: path }).walkRules((rule) => {
      // Match the action itself, not descendants such as `.more svg`.
      if (!rule.selectors.some((selector) => {
        const target = selector.trim().split(/[\s>+~]+/).at(-1);
        const ancestors = selector.slice(0, selector.lastIndexOf(target));
        const parentClasses = [...ancestors.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
        if (parentClasses.some((value) => !headClasses.includes(value))) return false;
        return classes.some((value) => new RegExp(String.raw`\.${value}(?![\w-])`).test(target))
          || (parentClasses.length > 0 && new RegExp(String.raw`^${name === 'Link' ? 'a' : name}(?:$|:)`).test(target));
      })) return;
      if (rule.nodes.some((decl) => decl.type === 'decl' && forbiddenHeadStyle(decl.prop, decl.value))) forbidden = true;
    });
    if (forbidden) return true;
  }
  return false;
}

// N31 starts at section headers, never at arbitrary links. Resolve only rendered
// local JSX; map callbacks/list rows and other files are deliberately not followed.
function n31SectionAnalysis(code, file) {
  const empty = { arrows: [], actions: new Map() };
  if (GUIDE.test(file) || ADMIN.test(file) || FAN_UI.test(file)) return empty;
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const scopes = new Map(), elements = [];
  const boundary = (n) => ts.isSourceFile(n) || ts.isBlock(n) || ts.isFunctionLike(n);
  const scopeOf = (n) => { while (n && !boundary(n)) n = n.parent; return n; };
  const bind = (scope, name, binding) => {
    if (!ts.isIdentifier(name)) {
      if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
        for (const element of name.elements) if (ts.isBindingElement(element)) bind(scope, element.name, { local: true });
      }
      return;
    }
    if (!scopes.has(scope)) scopes.set(scope, new Map());
    scopes.get(scope).set(name.text, binding);
  };
  const index = (n) => {
    if (ts.isVariableDeclaration(n)) bind(scopeOf(n.parent), n.name, { local: true, node: n.initializer });
    if (ts.isFunctionDeclaration(n) && n.name) bind(scopeOf(n.parent), n.name, { local: true, node: n });
    if (ts.isParameter(n)) bind(scopeOf(n.parent), n.name, { local: true });
    if (ts.isImportSpecifier(n)) bind(source, n.name, { name: n.propertyName?.text ?? n.name.text, module: n.parent.parent.parent.moduleSpecifier.text });
    if (ts.isImportClause(n) && n.name) bind(source, n.name, { name: n.name.text, module: n.parent.moduleSpecifier.text });
    if (ts.isNamespaceImport(n)) bind(source, n.name, { namespace: true, module: n.parent.parent.moduleSpecifier.text });
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) elements.push(n);
    ts.forEachChild(n, index);
  };
  index(source);
  const lookup = (n) => {
    if (!n || !ts.isIdentifier(n)) return undefined;
    for (let scope = scopeOf(n); scope; scope = scopeOf(scope.parent)) {
      if (scopes.get(scope)?.has(n.text)) return scopes.get(scope).get(n.text);
    }
  };
  const unwrap = (n) => {
    while (n && (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isNonNullExpression(n) || ts.isSatisfiesExpression(n))) n = n.expression;
    return n;
  };
  const resolveLocal = (n, seen = new Set()) => {
    n = unwrap(n);
    if (!n || seen.has(n)) return undefined;
    seen.add(n);
    if (ts.isIdentifier(n)) {
      const binding = lookup(n);
      return binding?.local ? resolveLocal(binding.node, seen) : n;
    }
    return n;
  };
  const symbol = (n) => {
    n = resolveLocal(n);
    if (!n) return {};
    if (ts.isIdentifier(n)) {
      const binding = lookup(n);
      // Check lexical bindings before spelling: even a parameter with no value
      // must hide an imported ArrowRight, FanIcon, Link or namespace.
      return binding ?? { name: n.text };
    }
    if (ts.isPropertyAccessExpression(n)) {
      const base = resolveLocal(n.expression), binding = lookup(base);
      if (binding?.namespace) return { name: n.name.text, module: binding.module };
    }
    return {};
  };
  const opening = (n) => ts.isJsxElement(n) ? n.openingElement : n;
  const attributes = (n) => opening(n).attributes.properties.filter(ts.isJsxAttribute);
  const attr = (n, name) => attributes(n).find((a) => a.name.getText(source) === name);
  const value = (a) => a?.initializer && (ts.isJsxExpression(a.initializer) ? a.initializer.expression : a.initializer);
  const nameOf = (n) => symbol(opening(n).tagName).name ?? '';
  const children = (n) => ts.isJsxElement(n) || ts.isJsxFragment(n) ? n.children : [];
  const returns = (fn) => {
    fn = resolveLocal(fn);
    if (!fn || !ts.isFunctionLike(fn) || !fn.body) return [];
    if (!ts.isBlock(fn.body)) return [fn.body];
    const result = [];
    const visit = (n) => {
      if (ts.isFunctionLike(n)) return;
      if (ts.isReturnStatement(n) && n.expression) result.push(n.expression);
      else ts.forEachChild(n, visit);
    };
    visit(fn.body);
    return result;
  };
  const roots = (n, seen = new Set()) => {
    n = unwrap(n);
    if (!n || seen.has(n)) return [];
    seen.add(n);
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) return [n];
    if (ts.isJsxFragment(n)) return [...n.children].flatMap((c) => roots(c, new Set(seen)));
    if (ts.isJsxExpression(n)) return roots(n.expression, seen);
    if (ts.isIdentifier(n)) return roots(lookup(n)?.node, seen);
    if (ts.isConditionalExpression(n)) return [...roots(n.whenTrue, new Set(seen)), ...roots(n.whenFalse, new Set(seen))];
    if (ts.isBinaryExpression(n) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(n.operatorToken.kind)) return roots(n.right, seen);
    if (ts.isCallExpression(n)) return returns(n.expression).flatMap((body) => roots(body, new Set(seen)));
    return [];
  };
  const childRoots = (n) => [...children(n)].flatMap((c) => roots(c));
  const isAction = (n) => /^(a|Link|button|FanAction)$/.test(nameOf(n));
  const isTitle = (n) => /^(h2|h3|FanHeading)$/.test(nameOf(n)) && value(attr(n, 'as'))?.text !== 'h1';
  const isTransparent = (n) => /^(div|span)$/.test(nameOf(n));
  const hasTitle = (n) => isTitle(n) || (isTransparent(n) && childRoots(n).some(hasTitle));
  const hasInteractiveAncestor = (n) => {
    for (let parent = n.parent; parent; parent = parent.parent) {
      if ((ts.isJsxElement(parent) || ts.isJsxSelfClosingElement(parent)) && (isAction(parent) || attr(parent, 'href') || attr(parent, 'onClick'))) return true;
    }
    return false;
  };
  const handlerCalls = (n) => {
    const reference = unwrap(n);
    n = resolveLocal(n);
    // A callback parameter is opaque, but the onClick identifier itself is
    // still a control reference (unlike a shadowed icon/component name).
    if (!n && reference && ts.isIdentifier(reference)) return [reference.text];
    if (!n) return [];
    if (ts.isIdentifier(n)) return [n.text];
    if (ts.isCallExpression(n) && /^(useCallback|React\.useCallback)$/.test(n.expression.getText(source))) n = n.arguments[0];
    if (!n) return [];
    if (!ts.isFunctionLike(n) || !n.body) return [];
    const calls = [];
    const visit = (node) => {
      if (ts.isFunctionLike(node)) return;
      if (ts.isCallExpression(node)) calls.push(node.expression.getText(source));
      ts.forEachChild(node, visit);
    };
    visit(n.body);
    return calls;
  };
  const isException = (n) => {
    const label = unwrap(value(attr(n, 'aria-label') ?? attr(n, 'ariaLabel')));
    const labelText = label?.text ?? '';
    const classText = value(attr(n, 'className'))?.getText(source) ?? '';
    const calls = handlerCalls(value(attr(n, 'onClick')));
    // Dismiss/back: explicit callback, or an identified close glyph. This keeps
    // existing close-only header controls out without exempting forward actions.
    if (calls.some((c) => /^(close|onClose|handleClose|closeDialog|dismiss|onDismiss|goBack|onBack|handleBack)$/.test(c))) return true;
    const tags = [...childRoots(n), ...roots(value(attr(n, 'leadingIcon')))].map(nameOf);
    if ((/^(닫기|Close|뒤로|Back)$/.test(labelText) || /\.(close|closeButton|backButton)$/.test(classText))
      && tags.length > 0 && tags.every((tag) => /^(X|ArrowLeft|ChevronLeft)$/.test(tag))) return true;
    if (tags.length === 1 && tags[0] === 'X' && calls.length > 0) return true;
    // Pagination/carousel: an identifying attribute AND the actual onClick AST
    // must agree. data-debug, strings and other attributes cannot supply calls.
    const labelProperty = label && ts.isPropertyAccessExpression(label) ? label.name.text : '';
    const pager = /^(Next page|Previous page|다음 페이지|이전 페이지)$/i.test(labelText)
      || /^(pageNext|pagePrev)$/.test(labelProperty)
      || (label && ts.isPropertyAccessExpression(label) && /^(next|previous)$/.test(labelProperty) && /^(pagination|paginationCopy\([^)]*\))$/.test(label.expression.getText(source)));
    const carousel = /^(Next slide|Previous slide|다음 슬라이드|이전 슬라이드)$/i.test(labelText)
      || /^(nextSlide|previousSlide|nextBanner|previousBanner)$/.test(labelProperty);
    return (pager && calls.some((c) => /^(nextPage|prevPage|previousPage|goToNextPage|goToPreviousPage|setPage|setCursors|goToPage|goPreview)$/.test(c)))
      || (carousel && calls.some((c) => /^(scrollNext|scrollPrev|nextSlide|prevSlide|goToNextSlide|goToPreviousSlide|goTo|move|setActive)$/.test(c)))
      // An identified controlled viewport plus an actual scroll call is a rail
      // control. A data-* callback cannot satisfy the onClick call list.
      || (Boolean(value(attr(n, 'aria-controls'))) && calls.some((c) => /\.(scrollTo|scrollBy)$/.test(c)));
  };
  const excludedAction = (n) => {
    // These are not section-head browse actions, even if placed in a header.
    return /^(primary|passport)$/.test(value(attr(n, 'variant'))?.text ?? '')
      || value(attr(n, 'type'))?.text === 'submit'
      || /^(dialog|true)$/.test(value(attr(n, 'aria-haspopup'))?.text ?? '')
      || (/\.profileAction\b/.test(value(attr(n, 'className'))?.getText(source) ?? '')
        && handlerCalls(value(attr(n, 'onClick'))).includes('onProfile'))
      || /\.(primaryAction|primaryButton|submitButton)\b/.test(value(attr(n, 'className'))?.getText(source) ?? '');
  };
  const viewAllLike = (n) => {
    // Only rendered copy participates, not URLs, classes or debug attributes.
    const copy = (node) => {
      if (ts.isJsxText(node)) return /^(전체(?:\s*보기)?|더\s*보기|모두\s*보기|view\s*all|see\s*all|more)\s*[›>]?$/i.test(node.text.trim());
      if (ts.isJsxExpression(node)) {
        const expression = unwrap(node.expression);
        if (!expression) return false;
        if (ts.isPropertyAccessExpression(expression)) return /^(more|all|viewAll|seeAll|rkViewAll)$/i.test(expression.name.text);
        if (ts.isCallExpression(expression)) return expression.arguments.some((a) => ts.isStringLiteral(a) && /^(more|all|viewAll|seeAll|rkViewAll)$/i.test(a.text));
      }
      return [...children(node)].some(copy);
    };
    return [...children(n)].some(copy);
  };
  const found = new Map(), actions = new Map();
  const iconsIn = (n, seen = new Set()) => {
    if (!n || seen.has(n)) return [];
    seen.add(n);
    const result = [];
    for (const node of roots(n)) {
      const open = opening(node), info = symbol(open.tagName), name = info.name ?? '';
      const icon = name === 'FanIcon' ? symbol(value(attr(node, 'icon'))).name : name;
      const isIcon = /^(svg|FanIcon|CalendarDays|X|RowChevron|(?:Arrow|Chevron|Move)\w*)$/.test(name)
        || /Icon$/.test(name) || /lucide|fan-icons|react-icons/.test(info.module ?? '');
      if (isIcon && (name !== 'FanIcon' || icon)) result.push({ node, icon: icon || name });
      else if (!isAction(node)) {
        for (const body of returns(open.tagName)) result.push(...iconsIn(body, new Set(seen)));
      }
      for (const a of attributes(node)) if (!/^(on[A-Z]|href$|className$|style$|aria-|data-)/.test(a.name.getText(source))) result.push(...iconsIn(value(a), new Set(seen)));
      for (const child of children(node)) result.push(...iconsIn(child, new Set(seen)));
    }
    return result;
  };
  for (const header of elements) {
    const name = nameOf(header), parts = childRoots(header);
    if (hasInteractiveAncestor(header) || isAction(header) || attr(header, 'data-calendar-header')) continue;
    const explicit = name === 'header' || (/^(div|section)$/.test(name) && /[Hh]ead/.test(value(attr(header, 'className'))?.getText(source) ?? ''));
    // A compact title + single action section acts as its own section header.
    // A section containing rows, body text, forms, etc. is NOT a header.
    const inlineContent = (node) => {
      const tag = nameOf(node), info = symbol(opening(node).tagName);
      return (/^(span|strong|small|em)$/.test(tag) && childRoots(node).every(inlineContent))
        || /^(FanIcon|(?:Arrow|Chevron|Move)\w*)$/.test(tag) || /lucide|fan-icons|react-icons/.test(info.module ?? '');
    };
    const structural = parts.length === 2 && isTitle(parts[0]) && isAction(parts[1])
      && (name === 'section' || (name === 'div' && viewAllLike(parts[1])))
      && childRoots(parts[1]).every(inlineContent);
    if (!(explicit && parts.some(hasTitle)) && !structural) continue;
    const visit = (node) => {
      if (isAction(node)) {
        if (isException(node) || excludedAction(node) || childRoots(node).some(hasTitle) || attr(node, 'key')) return;
        const offset = node.getStart(source), icons = iconsIn(node);
        actions.set(offset, { node, hasIcon: icons.length > 0 });
        for (const { node: iconNode, icon } of icons) if (/^(ChevronRight|ArrowRight|MoveRight)$/.test(icon)) {
          const iconOffset = iconNode.getStart(source);
          if (!found.has(iconOffset)) found.set(iconOffset, { offset: iconOffset, line: source.getLineAndCharacterOfPosition(iconOffset).line + 1,
            actionOffset: offset, action: opening(node).tagName.getText(source), icon,
            headerLine: source.getLineAndCharacterOfPosition(header.getStart(source)).line + 1 });
        }
      } else if (isTransparent(node) && !isTitle(node)) {
        // An action-only wrapper is part of the header; wallet summaries, row
        // content and paging status beside an action are separate controls.
        const nested = childRoots(node);
        if (nested.length && nested.every(isAction)) for (const child of nested) visit(child);
      }
    };
    for (const part of parts) visit(part);
  }
  return { arrows: [...found.values()].sort((a, b) => a.offset - b.offset), actions };
}

export function n31ActionArrows(code, file) {
  return n31SectionAnalysis(code, file).arrows;
}

export function scanNTs(code, file, read) {
  const out = new Map();
  if (GUIDE.test(file) || ADMIN.test(file)) return out;
  const c = stripComments(code);
  const fanUi = FAN_UI.test(file);
  if (!fanUi && SCREEN(file)) {
    for (const m of c.matchAll(/styles\.(card|btn|button|tabs?|badge|chip)\w*/g)) add(out, `N1|styles.${m[1]}${m[0].slice(7 + m[1].length)}`);
    for (const m of c.matchAll(/import[^;]*?from\s+['"]([^'"]*\/[\w-]*-(?:card|button))['"]/g)) if (!m[1].includes('fan-ui')) add(out, `N1|import ${short(m[1], 70)}`);
    add(out, 'N3|<header>', (c.match(/<header\b/g) ?? []).length);
  }
  if (!fanUi) {
    for (const m of c.matchAll(/styles\.(identityHeader|creatorIdentityHeader|pageHead\w*)|\b(GroupIdentityHeader|creatorIdentityHeader)\b/g)) add(out, `N3|${m[1] ?? m[2]}`);
  }
  // N8
  for (const t of jsxTags(c, 'FanHeading')) {
    if (t.selfClosing) continue;
    const closeAt = c.indexOf('</FanHeading>', t.index);
    if (closeAt === -1) continue;
    const after = c.slice(closeAt + '</FanHeading>'.length, closeAt + 260);
    const m = after.match(/^\s*<(p|span)\b[^>]*>\s*\{[^}]*?(\w*(?:Intro|Lead|Description|Hint))\b[^}]*\}/);
    if (m && !/(Legal|Notice|Error|Source)$/.test(m[2])) add(out, `N8|<FanHeading> then <${m[1]}> ${m[2]}`);
  }
  for (const t of jsxTags(c, 'FanHelpTip')) {
    const text = t.children.trim();
    if (text && !/[{<]/.test(text) && text.length > 60) add(out, `N8|FanHelpTip ${text.length}자 ${short(text, 30)}`);
  }
  // N9
  if (/^apps\/web\/(app\/|features\/.+\/ui\/)/.test(file)) for (const m of c.matchAll(MOCK)) add(out, `N9|${m[1]}`);
  // N11
  if (!fanUi) {
    for (const name of ['FanAction', 'Link']) {
      for (const t of jsxTags(c, name)) {
        const a = t.attrs;
        if (name === 'Link') { if (!/\bhref\b|\{\.\.\./.test(a)) add(out, `N11|<Link> without href`); continue; }
        const live = /\bhref\b|\bonClick\b|type=["']submit["']|\bform=|\{\.\.\./.test(a);
        if (!live) add(out, `N11|<FanAction> without href/onClick`);
        if (/\bdisabled\b/.test(a) && !/data-disabled-reason|\btitle=|aria-describedby/.test(a)) add(out, 'N11|disabled without reason');
      }
    }
  }
  // N15
  if (!fanUi) {
    for (const m of c.matchAll(new RegExp(UI_LIB.source, 'g'))) add(out, `N15|import ${m[1]}`);
    for (const m of c.matchAll(/role=["'](dialog|alertdialog)["']/g)) add(out, `N15|role="${m[1]}"`);
  }
  // N21: 화면 파일의 <section> 은 data-block
  if (!fanUi && SCREEN(file)) for (const t of jsxTags(c, 'section')) if (!/\bdata-block\b|\{\.\.\./.test(t.attrs)) add(out, 'N21|<section> without data-block');
  // N22: 목록 행 data-row (FanRow 를 바로 감싸면 면제)
  if (!fanUi && /\.tsx$/.test(file)) for (const t of jsxTags(c, 'li')) if (!/\bdata-row\b|\{\.\.\./.test(t.attrs) && !/^\s*<FanRow\b/.test(t.children)) add(out, 'N22|<li> without data-row');
  // N23: 상대 시간·dateStyle medium
  for (const m of c.matchAll(/\b(formatRelativeTime|RelativeTime)\b|dateStyle:\s*["']medium["']/g)) add(out, `N23|${m[1] ?? 'dateStyle: "medium"'}`);
  // N24: 버튼 안 화살표
  for (const m of c.matchAll(/trailingIcon=\{\s*<(ArrowRight|ChevronRight|MoveRight)\b/g)) add(out, `N24|trailingIcon <${m[1]}>`);
  // N31: 섹션 머리 알약·아이콘 행동 — 제목 닫는 태그 바로 뒤의 행동 요소
  if (!fanUi) {
    const tagsByName = {};
    const oldActions = [];
    const analysis = n31SectionAnalysis(code, file);
    const scopedActions = new Map([...analysis.actions].map(([offset, action]) => [stripComments(code.slice(0, offset)).length, action]));
    for (const m of c.matchAll(SECTION_HEAD_ACTION)) {
      const name = m[1];
      const start = m.index + m[0].length - name.length - 1;
      const tag = (tagsByName[name] ??= jsxTags(c, name)).find((t) => t.index === start);
      if (!tag) continue;
      const attrs = tag.attrs;
      const scoped = scopedActions.get(start);
      if (!scoped) continue;
      if ((name === 'FanAction' && !/variant=\{?["']text["']/.test(attrs))
        || scoped.hasIcon || headActionHasStyle(attrs, c, file, read, m[0], name)) {
        add(out, `N31|<${name}> after a heading`);
        oldActions.push(start);
      }
    }
    // Preserve existing baseline keys and avoid counting the same inline action
    // twice. The legacy regex scans stripped text; map the AST offset to it.
    for (const hit of analysis.arrows) {
      if (!oldActions.includes(stripComments(code.slice(0, hit.actionOffset)).length)) add(out, `N31|<${hit.action}> contains ${hit.icon}`);
    }
  }
  // N25: lucide 직접 import·strokeWidth
  if (!fanUi && /from\s+['"]lucide-react['"]/.test(c)) add(out, 'N25|import lucide-react');
  for (const m of c.matchAll(/strokeWidth=\{?\s*["']?([\d.]+)/g)) if (m[1] !== '1.5') add(out, `N25|strokeWidth ${m[1]}`);
  // N16
  const mi = c.match(new RegExp(MOTION_IMPORT.source));
  if (mi) {
    if (!MOTION_ALLOW.test(file)) add(out, `N16|import ${mi[1]}`);
    if (/motion|framer-motion/.test(mi[1]) && !NOT_NEEDING_MOTION_CHECK.test(c)) add(out, 'N7|motion without useReducedMotion');
  }
  return out;
}

const ROUTE_PAGE_BANNED = /\/(profile-edit|edit-profile|profile\/edit|quiz\/start|points\/history|exchange\/confirm|language|select-language)\/page\.tsx$/;

// 파일 목록에서만 보이는 규칙: N10(라우트 시험 짝), N14(작은 흐름 페이지).
export function scanNTreeFiles(files) {
  const out = new Map(); // 파일 -> Map
  const set = new Set(files);
  const hit = (f, key) => { if (!out.has(f)) out.set(f, new Map()); add(out.get(f), key); };
  for (const f of files) {
    if (/^apps\/web\/app\/api\/.+\/route\.ts$/.test(f)) {
      const dir = f.slice(0, f.lastIndexOf('/') + 1);
      const has = [...set].some((o) => o.startsWith(dir) && /\.contract\.test\.ts$/.test(o.slice(dir.length)) && !o.slice(dir.length).includes('/'));
      if (!has) hit(f, 'N10|route without *.contract.test.ts');
    }
    if (ROUTE_PAGE_BANNED.test(f) && !/\/my\/wallet\//.test(f)) hit(f, 'N14|small flow as a page');
  }
  return out;
}
export function scanNFile(file, text, read) {
  let m = new Map();
  if (/\.css$/.test(file)) m = scanNCss(text, file);
  else if (/\.tsx?$/.test(file)) m = scanNTs(text, file, read);
  else return m;
  for (const [k, n] of scanPurple(text, file)) add(m, k, n);
  if (/\.css$/.test(file)) for (const [k, n] of scanDarkCapsule(text, file, postcss)) add(m, k, n);
  return m;
}

// 전체 스캔: 파일마다 결과를 모으고 전역 MotionConfig 가 있으면 파일별 Motion 시험을 면제한다.
export function scanNAll(allFiles, read) {
  const out = new Map();
  const files = allFiles.filter(nEligible);
  let globalMotionConfig = false;
  for (const f of files) {
    if (!/\.tsx?$/.test(f)) continue;
    const t = read(f);
    if (t && /<MotionConfig\b[^>]*reducedMotion=["']user["']/.test(t)) globalMotionConfig = true;
  }
  for (const f of files) {
    const m = scanNFile(f, read(f), (path) => allFiles.includes(path) ? read(path) : null);
    if (globalMotionConfig) for (const k of [...m.keys()]) if (k === 'N7|motion without useReducedMotion') m.delete(k);
    if (m.size) out.set(f, m);
  }
  for (const [f, m] of scanNTreeFiles(allFiles)) {
    if (!out.has(f)) out.set(f, new Map());
    for (const [k, n] of m) add(out.get(f), k, n);
  }
  return out;
}
