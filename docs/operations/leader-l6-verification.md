# LEADER-L6 구현·검증 기록

전용 격리 worktree의 브랜치 `t3/leader-l6-1113`. 기준 `origin/main`의 `4849f1cd6`. 공유 checkout 변경·push 없음.

## 구현 범위

기존 모임 래플에 무료 1회/응모권 방식, 시작 시각, 가입 이후 활동 조건(팬페이지 출석·취미 모임 방문, 승인 미션, 글·댓글)을 연결했다. 무료 응모는 금액 1·원장 없음·인당 1행으로 제한하며, 기존 경품 신청·재고 예약 경로에도 같은 입력을 전달한다. 승인 전·시작 전·조건 미달·중복 응모를 서버에서 막는다. 회원에게만 가린 당첨자 이름을 제공하고 추첨 후 현재 회원인 응모자에게 결과 알림을 보낸다. 기존 당첨 알림을 유지하고 알림 본문에는 경품명만 넣는다. 알림 설정·탈퇴 후 링크 권한도 검사한다.

L7의 kyaa 경품 카탈로그·예산 설정과 L5의 유효 인원 집계는 별도 작업이다. L6는 해당 값을 하드코딩하지 않는다. 조건 기본값(출석/방문 3, 미션 1, 글·댓글 1)은 개설 폼의 `conditionOptions` 한 곳에 두고 선택 후 변경할 수 있다. 감독 승인 `FanPrint Gift` 예외는 DESIGN.md에 기록했으며, 존재하지 않는 카탈로그를 L6에서 임의로 만들지 않았다.

마이그레이션 `20261227006001_group_raffle_conditions.sql`은 지정 하한보다 크고 끝 네 자리가 6001이다. PostgreSQL/PLpgSQL 파싱을 통과했으며 생성되는 경품 연결 함수의 교체 결과도 정적으로 파싱했다. **감독 11/13 지시에 따라 실제 DB 적용·SQL 회귀 시험·동시성 시험은 dev에서 감독이 진행한다. 로컬 DB 검증 성공으로 표현하지 않는다.**

## 브라우저 확인

기존 `apps/web/e2e/groups-local/server.mjs`와 새 `leader-raffle-fixture.ts`로 실제 제품 컴포넌트·CSS를 렌더했다. `GROUPS_LOCAL_PORT=3196 node apps/web/e2e/groups-local/server.mjs`. 예시 모임/가린 이름/잔액만 사용했고 외부 서비스·실제 회원 정보·인증 키를 사용하지 않았다.

- 개설: `/pages/groups/e9200000-0000-4000-8000-000000000003/manage?section=raffles&leaderL6=create&locale=ko`
- 참여·결과: `/pages/groups/e9200000-0000-4000-8000-000000000003/raffles/e9200000-0000-4000-8000-000000000003?leaderL6=ready&locale=ko`. `ready` 대신 `unmet`, `pending`, `result`로 각 상태 확인.
- 390/1440에서 가로 넘침 없음, 브라우저 런타임 오류 없음. 개설·참여 primary 폭 320, 높이 390에서 44 / 1440에서 48. 변경한 제목 역할 26, 구역 제목 18. 기존 관리 셸·헤더는 보존했다.
- 조건 충족/잔액 0: 응모 버튼 활성, 확인창은 무료 1회·응모 횟수이며 응모권 차감 문구 없음. 예시 응모 요청과 접수 상태 확인.
- 조건 미충족: 방문 2/3 행이 미충족, 응모 버튼 비활성. 승인 대기에서도 비활성. 결과는 김*/이*만 표시되고 응모 버튼 비활성.
- 날짜 입력의 AM/PM이 잘리던 160px 폭을 수정하고 모바일에서 라벨과 값이 별도 줄로 표시되는 것을 재확인했다. 비어 있는 이미지 칸을 제거했고 이미지 원본·크롭·기존 이미지 표시 규칙은 변경하지 않았다.
- 캡처 6장: `release-notes/images/2026-11-13-leader-l6-{create,entry,result}-{390,1440}.png`. 공개 가능한 로컬 예시 화면으로 직접 검수했다. 모바일 긴 개설 폼은 전체 입력 확인을 위해 세로 1350, 참여 화면은 1100으로 캡처했다.

## 자동 검증 및 검토

- 관련 Vitest: `npm run test:web -- features/group-raffle server/group-raffle server/notification/notification-repository.test.ts features/notification/domain`
- 전체 웹 타입: `npm run typecheck --workspace @byus/web`
- 디자인: `npm run design-lint` (기준선 수정 없이 새 위반 없음)
- 변경 형식: `git diff --check`
- 독립 코드 검토: 무료/원장 일관성·재시도·경품·조건·승인/추첨 제한·가린 결과·회원 및 알림 설정/권한을 검토해 승인. 생략된 시작 시각의 마감 후 재시도도 기존 처리 결과를 복구하도록 수정하고 회귀 시험을 추가했다.

누락 의존성 및 jose 타입 오류는 오래된 공유 node_modules 연결을 이 worktree 전용 `npm ci --ignore-scripts --no-audit --no-fund` 설치로 교체해 해소했다. 의존성 선언/잠금 파일이나 무관한 인증 테스트는 변경하지 않았다. 진단 MCP는 연결 종료 상태라 전체 tsc로 검증했다. 전역 UI 지침의 옛 경로와 대체 경로는 사용 불가하여 저장소 AGENTS.md가 정한 DESIGN.md 기준을 적용했다.

최종 결과: Vitest 9개 파일·101건 통과, 전체 tsc 종료 0, design-lint 새 위반 없음. 독립 캡처 검수에서 결과 카드 패딩 누락을 발견하여 이미지 전용 CSS로 범위를 제한했고, 390/1440 결과 캡처를 다시 만들었다. 결과 카드 패딩 24px와 가로 넘침 없음/오류 없음 재확인. 기존 공통 SourceStatePanel의 24px를 복구했으며 별도 카드 패딩을 임의로 만들지 않았다.

캡처의 390/1440 표기는 브라우저 CSS viewport다. T3 캡처 도구는 모바일 PNG를 배율 2로 저장하고 PC PNG를 1280px로 축소 저장한다. 위 치수 측정은 축소 PNG의 픽셀이 아니라 실제 브라우저 viewport에서 측정했다.
