# CHEMI-W0 수정 결과 — 2026-11-18

기준 2690a9b32 위의 전용 수정 가지 t3/chemi-w0-branch-fix. push 없음.
한국어 케미 수정, DESIGN 탭 추가 예외·간격·소유자 기록. 본문 빈 상태 유지.
다른 언어는 기존 copy.ts 영어 메뉴 유지 규칙에 따라 Chemi 유지. 현재 지원 언어는 러시아어 포함 12개. 기획서 시트 01 원본은 checkout에 없어 직접 대조하지 못함.
반려 근거는 인접 t3-chemi-w0-branch-review/CHEMI-W0/branch-review.md 및 board/tasks/CHEMI-W0/qa/on-390.png 확인.

Vitest 지정 3파일 40개 통과(qa/fix/vitest.log).
kyaa-cds-typecheck 현재 apps/web 경로 지정: 종료 1. 아래 3개 오류 유지(qa/fix/typecheck.log).
- apps/web/components/fan-ui/top-layer.test.tsx:9 TS2322: matches 모형이 DOM 타입 predicate 계약과 불일치.
- apps/web/vitest.setup.ts:55 TS2420: TestIntersectionObserver의 scrollMargin 누락.
- apps/web/vitest.setup.ts:70 TS2345: scrollMargin 누락으로 this를 IntersectionObserver에 전달할 수 없음.
두 파일은 2690a9b32 부모부터 현재까지 diff 없음. 요청대로 수정하지 않음. 기준 커밋 별도 실행은 하지 않음.

CHEMI_TAB=true, KYAA_GROUPS_ENABLED=true, AUTH_PROVIDER=cognito 실제 로컬 Next 화면 390×844·1440×900 캡처 직접 확인. 한국어 케미 활성, 빈 본문, 가로 넘침 없음. 탭 너비 78/110px. 글자 잘림·겹침 없이 기존 간격·색 유지. 개발 도구 버튼만 캡처에서 숨김. qa/fix/browser.log 및 on-390.png·on-1440.png 참조.
운영 화면 아님. 백엔드 환경 미설정으로 부가 API 오류가 있어 로그인·실데이터 검증 제외. 다른 언어 화면 전체는 미검증. T3 브라우저 연결 두 번 실패 후 Playwright 사용.
