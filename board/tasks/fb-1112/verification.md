# 검증 — 2026-11-12

## 구현과 사실
- 정책·조건·혜택 조사: `tier-facts.md`. 로컬 dev DB만 읽기 전용 조회. 원격 dev 현재 상태 미확인. 운영 DB 접근 없음.
- 세부 숫자 결론은 **부분 적용**: 로컬 dev의 계산·표시는 적용, 원격 현재 상태 미확인. 세부 숫자별 별도 혜택은 없으며 활성 덕질 정책에 등급 보너스도 없어 혜택 칸 생략.
- `/notices/tier-guide`, 12개 언어, 승인 ink-v1 배지 + Codex imagegen 보조 이미지.
- MY/팬 활동 기록의 공통 정보 버튼 → FanDialog → 언어 유지 상세 이동.

## 통과한 확인
- `cd apps/web && ../../node_modules/.bin/vitest run features/rewards/ui/tier-guide.test.tsx features/rewards/ui/fan-tier-journey.test.tsx`: **2 files, 18 tests passed**.
- `node scripts/design-lint.mjs`: **no new violations**. 새 글자는 FanText/FanHeading, 아이콘은 FanIcon/FanIconButton을 사용. 검사 baseline 변경 없음.
- `git diff --check`: 통과.
- 실제 컴포넌트 Vite fixture: `node apps/web/e2e/tier-guide-local/server.mjs`.
- `node apps/web/e2e/tier-guide-local/capture.mjs`: 12언어 × 390/1440 = 24회. 11단계, 이미지 로드, 가로 넘침 없음, 런타임 오류 없음. `browser-results.json`.
- `node apps/web/e2e/tier-guide-local/flow.mjs`: 390/1440 MY 실제 카드와 팬 등급 여정 각각 정보 버튼 열기·Escape 닫기·트리거 초점 복귀·안내 이동 확인. `flow-results.json`.
- Axe WCAG2A/AA·2.1AA: 안내 전체 및 열린 모달 390/1440 위반 0. 실제 정보 버튼 44×44, 닫기/주 행동 치수는 `accessibility-results.json`.
- hero 원본 1200×800와 실제 358×238.67 / 552×368 자연 비율 대조. 왜곡·잘림·빈 띠 없음. 390/1440 안내·MY/활동·열린 모달 6장을 직접 확인.

## 남은 검증 한계 — 통과로 보고하지 않음
- `npm run typecheck` 실행: **실패**. 공용 설치 의존성의 `@radix-ui/react-popover`, `detect-gpu` 누락 및 기존 onchain 파일의 viem 타입 불일치 등 50건. 변경한 tier-guide 파일 진단은 없음. 전체 타입검사 통과는 주장하지 않는다.
- 관련 MY 전체 테스트도 실행했으나 공용 node_modules의 Base UI가 다른 checkout의 React를 가져오는 중복 React 문제로 28건 실패했다. 별도 runner 설정으로 해결하려던 임시 설정은 제거했다. 제품 코드나 기존 테스트를 우회·수정하지 않았다.
- Hallmark sloplint 설치 파일을 mini에서 찾지 못해 미실행. design-lint 통과와 별도로 미검증이다.
- 공유 T3 browser `preview_status`가 available=false여서 로컬 Playwright로 실제 브라우저 검수했다. 캡처는 예시 데이터와 제품 컴포넌트를 사용한 로컬 검증이며 운영/원격 dev 화면이 아니다.

## 미적 검수
- Claude 독립 검토에서 11단계 정합성·이미지 자연 비율·정보 버튼·모달 구조를 확인했다. 중간 77→83→85점으로 통과선에 미달해 지적을 반영했다. 독립 검토 점수를 최종 통과 점수로 바꾸어 쓰지 않는다.
- 마지막 85점 검토 뒤 수정: 조건 열 시작선을 모든 등급에서 동일하게 맞춤, 세부 숫자와 조건 간격을 좁힘, 정책 본문을 그림 아래로 옮겨 PC 두 열 높이 균형 회복, 어절 보존, 20px Info와 44px 터치 유지, 실버·플래티넘 묶음에 기존 연분홍 토큰 표면 적용.
- 최종 작성자 직접 검수: 질서 24/25, 마감 23/25, 색 18/20, 표현력 17/20, 내용 9/10 = **91/100**. 독립 재채점이 아니라 작성자 판정이다. A3+ 설치 부재·원격 화면 접근 한계는 위와 같다.
- 기준 좌표: 1440 그림 x160–712, 조건 표 x728–1280. 390 콘텐츠 x16–374. 5개 큰 등급 안에 11개 세부 조건을 묶어 세로 목록을 압축했다. 모든 조건 본문은 같은 시작선이며 단위는 실제 정책 이해를 위해 각 조건에 보존한다.
