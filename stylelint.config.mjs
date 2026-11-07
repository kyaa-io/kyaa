// 디자인 토큰 린트(이행 모드). 위반 판정은 scripts/design-lint.mjs 가 기준 커밋과 비교해서 한다.
// 토큰 원본: apps/web/app/globals.css (--color-*, --space-*, --radius-*, --fan-*-size).
const keep = [
  '/^(0|auto|inherit|initial|unset|revert|none|normal|transparent|currentColor|currentcolor)$/',
  '/^-?\\d*\\.?\\d+(%|vw|vh|dvh|svh|lvh|vmin|vmax|fr)$/',
  '/^-?0(px|rem|em)?$/',
];

const space = ['padding', 'margin', 'gap', 'row-gap', 'column-gap'].flatMap((p) => [p, `${p}-top`, `${p}-right`, `${p}-bottom`, `${p}-left`, `${p}-inline`, `${p}-block`, `${p}-inline-start`, `${p}-inline-end`, `${p}-block-start`, `${p}-block-end`]);

// 우회 범위(규칙은 바꾸지 않음): ignoreFunctions 때문에 calc()/min() 안의 원시 px 와, 모듈 안에서 직접 정의한 --지역변수 값은 strict-value 가 보지 않는다.
export default {
  plugins: ['stylelint-declaration-strict-value'],
  ignoreFiles: ['**/node_modules/**', 'apps/web/app/globals.css', '**/e2e/**', '**/.next/**'],
  rules: {
    // 색: 토큰(var(--color-*)) 대신 원시 색 표기를 쓰지 않는다.
    'color-no-hex': true,
    'color-named': 'never',
    'function-disallowed-list': ['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color'],
    // 글자 크기·굵기·자간·반경·간격(T1·T3 포함): 토큰 var() 만 허용(0·auto·% 같은 값은 허용).
    'scale-unlimited/declaration-strict-value': [
      ['font-size', 'font-weight', 'letter-spacing', 'border-radius', 'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius', ...space],
      { ignoreValues: keep, ignoreFunctions: true, disableFix: true, message: 'Use a design token (var(--space-*), var(--radius-*), var(--fan-*-size|weight|tracking)) instead of "${value}" for "${property}".' },
    ],
  },
};
