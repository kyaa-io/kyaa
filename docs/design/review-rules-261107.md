# 검수 규칙 N1~N19·F1~F12 실행법 (261107-2)

규칙 원문은 보드의 `reports/doc-261107-2-review-rules.md` 2절(기계 규칙)과 4절(기능 계약)이다. 이 문서는 그 규칙을 저장소에서 어떻게 돌리는지만 적는다. 다음 피드백 묶음도 같은 명령을 쓴다.

## 한눈에

| 층 | 규칙 | 명령 | 앱 필요 | 실패 기준 |
|---|---|---|---|---|
| 정적 린트 | N1 N3 N4 N6 N7 N8 N9 N10 N11 N14 N15 N16 | `node scripts/design-lint.mjs` | 아니오 | 기준선(`scripts/design-lint-baseline.json`)보다 늘면 실패. 집계로 내린 갈래는 경고만 |
| 단위 계약 | N5 N13 N17 N18 | `npm run test:qc --workspace @byus/web` | 아니오 | 없는 컴포넌트는 "미구현"으로 실패, 구현이 합쳐지면 초록이어야 한다 |
| 실행 계약 | N2 N12 N19, F1~F12 | `npm run test:qe --workspace @byus/web` | 예(로컬 앱) | 하나라도 어기면 실패. 로그인 필요 부분은 상태 파일이 없으면 건너뛰고 이유를 출력 |

N15·N16·N7(CSS) 같은 규칙은 `components/fan-ui/` 안을 보지 않는 기존 린트와 달리 fan-ui까지 훑는다(`design-lint-n-rules.mjs`가 전체 목록을 직접 본다).

## 정적 린트

```
node scripts/design-lint.mjs                # 기준선 비교(기본). 새 위반만 실패, 종료 코드 1
node scripts/design-lint.mjs --all --report out.json   # 현재 위반 수 보고
node --test scripts/design-lint.test.mjs    # 규칙마다 빨강·통과 시험(게이트가 도는 파일)
```

- 구현: `scripts/design-lint-n-rules.mjs`(규칙 정의 `RULES_N`, 실행 시험 위치 `N_CONTRACTS`), 연결은 `scripts/design-lint.mjs`. 시험은 `scripts/design-lint-n-rules.test.mjs`.
- 규칙은 파일 안 "규칙|세부" 개수로 센다. 줄 번호는 보지 않으므로 줄이 밀려도 위반이 늘지 않는다.
- 집계로 내린 갈래와 이유
  - N3 원시 `<header>`: 카드·팝오버 안 머리와 화면 머리를 정규식으로 못 가른다. `identityHeader`·`GroupIdentityHeader` 사용은 그대로 실패.
  - N11 `disabled` 사유 표시: 대기 중 잠금처럼 사유가 자명한 곳이 많다. `href`·`onClick` 없는 `FanAction`·`Link`는 그대로 실패.
- N10은 프록시 라우트를 정규식으로 가리지 못해 기존 라우트 전체가 기준선에 들어 있다. 새 `route.ts`는 같은 폴더에 `*.contract.test.ts`가 있어야 통과한다.
- N15는 규칙 원문의 `@radix-ui` 외에 지금 쓰는 `@base-ui`와 수동 `role="dialog"`도 fan-ui 밖에서 막는다. 기존 사용은 기준선이다.
- 예외는 규칙 대상 줄 위에 `/* design-lint-disable N4 */`(히어로 배너 1곳 용).
- `--base <sha>` 방식(기준선 파일이 없을 때)은 N10·N14(파일 목록 규칙)를 보지 않는다. 기준선 방식이 기본이다.

### 기준선 다시 만들기

다른 묶음이 화면을 크게 바꾼 뒤(합침 뒤) 한 번만 실행하고, 줄어든 숫자만 커밋한다.

```
node scripts/design-lint.mjs --update-baseline
```

## 단위 계약 (N5 N13 N17 N18)

```
npm run test:qc --workspace @byus/web
```

- 파일 `apps/web/q-contract/n-contract.qc.tsx`, 설정 `apps/web/vitest.qc.config.ts`. 이름이 `*.qc.tsx`라 기본 `vitest run`에는 들어가지 않는다.
- 아직 없는 `FanCollapsible`(`components/fan-ui/fan-collapsible`)과 `FanHeaderStatus`(`components/fan-shell/fan-header-status`)는 "미구현" 메시지로 실패한다. 구현 묶음의 props 이름이 다르면 파일 위쪽 `PROPS` 한 곳만 고친다.
- N18은 `GroupPresence`(접속 띠)가 지금 0값도 그려서 실패한다. 값이 모두 0이면 칸이 없어야 한다.

## 실행 계약 (N2 N12 N19, F1~F12)

앱을 따로 띄운다. 로그인은 3000 포트에서만 되므로 주소창은 3000으로 두고 연결만 자기 포트로 보낸다.

```
~/.local/share/kyaa-t3/kyaa-t3 localdev-port "$PWD" 3840
cd apps/web
Q_BASE_URL=http://localhost:3000 Q_MAP_TO=127.0.0.1:3840 \
  Q_STATE=$HOME/.kyaa-dev-test-accounts/dev-fan-3.local3000.json \
  npm run test:qe -- [파일이름 또는 -g "F7"] [--project=chromium-390]
~/.local/share/kyaa-t3/kyaa-t3 localdev-stop 3840
```

- 환경 변수: `Q_BASE_URL`, `Q_MAP_TO`, `Q_STATE`(없거나 만료면 로그인 필요 부분을 건너뜀), `Q_ALLOW_WRITE=1`(F3의 저장 시험처럼 로컬 DB에 쓰는 시험), `Q_UPDATE_SNAPSHOT=1`(F12 기준 갱신).
- 파일: `apps/web/e2e-q/n-runtime.q.spec.ts`(N2 N12 N19), `f-contracts.q.spec.ts`(F1~F12), 공용 `q-fixtures.ts`, 설정 `playwright.q.config.ts`. 390·1440 두 화면 폭으로 돈다.
- DB 비교(F2 F3)는 `PGHOST=127.0.0.1 PGPORT=55433 PGUSER=localsuper` 기본값의 `psql`을 쓴다. 이 DB는 일꾼끼리 공유한다.
- F12 기준(`e2e-q/f12-stan-labels.<프로젝트>.snapshot.json`(화면 폭마다 하나))은 영어 `Stan` 변경 전 화면의 12개 언어 덕질 라벨이다. 영어를 뺀 11개 언어가 이 값과 같아야 한다.

### 로그인 없이 못 보는 부분

로그인이 필요한 시험은 `Q_STATE`가 없거나 `/api/me/summary`가 200이 아니면 "건너뜀"으로 출력한다. 건너뛴 시험은 통과가 아니다.

- F3 저장(대댓글·사진 업로드), F4(헤더 온도), F9 후반(완료 → 지급 → 내역 → 다음 미션), F10의 로그인 사용자 분기.
- F3 중 기본 비밀방 생성은 시험을 아직 쓰지 않았다(비밀방 생성 경로 확인 필요).
- F5는 비로그인 화면의 단추만 누른다. 611개 전수는 `scripts/button-qa-sweep.mjs`가 맡는다.

## 규칙을 더하거나 고칠 때

1. 정적 규칙: `design-lint-n-rules.mjs`에 판정을 더하고 `RULES_N`에 설명·심각도를 적은 뒤 `design-lint-n-rules.test.mjs`의 `CASES`에 빨강·통과 입력을 넣는다.
2. 실행으로만 볼 수 있는 규칙: `N_CONTRACTS`에 파일과 방법을 적고, 시험 이름이 규칙 ID로 시작하게 한다(`N19: ...`). 이름 규칙은 린트 시험이 검사한다.
3. 오탐이 크면 `countDecl`로 갈래만 집계로 내리고 이유를 `note`에 쓴다.

## 기준 커밋(cdf0951ba) 결과 — 합침 뒤 같은 명령으로 비교한다

로컬 앱(합성 데이터, 로그인 없음)에서 본 값이다. 로그인 필요 부분은 못 봤다.

| 층 | 초록 | 빨강(현재 코드가 계약을 어김) | 건너뜀 |
|---|---|---|---|
| 정적 린트 | N1 N3 N4 N6 N7 N8 N9 N10 N11 N14 N15 N16 (기준선 대비 새 위반 0) | - | - |
| 단위 계약 | N13(2) | N5 미구현, N17(3) 미구현, N18 접속 띠가 0값도 그림 | - |
| 실행 계약 | N12, N19(390), F6, F7, F8(390), F10, F5(390) | N2 보조 버튼·탭·카드 값이 탭마다 다름, N19(1440) 언어 선택이 보이지 않음, F1 홈에 랭킹 없음, F2 조회수 null, F3 댓글 ⋯ 메뉴 없음, F8(1440), F11 원문 보기 없음, F12 영어 Stan 아님, F5(1440) 콘솔에 hydration 불일치 | F4, F9 후반(로그인) |
