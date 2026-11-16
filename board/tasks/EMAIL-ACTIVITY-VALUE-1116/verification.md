# EMAIL-ACTIVITY-VALUE-1116 로컬 검증

기준: 30006026ad0a5331ec8d403168f1638fc5cbee88. 운영 접속·push 없음.

- 웹 범위 48개, 워커 46개 PASS. 웹/워커 tsc PASS.
- 실제 DB: `supabase/tests/activity_email.sql`, `email_unsubscribe.sql` PASS. 활동 꺼짐→3등급 메일 자격 탈락·계획 메일 0행, 사이트 알림 유지. 없는 선호행은 실제 계획에서 켜짐.
- `local-copy-tier-tests.sql`: 같은 회원의 활동 꺼짐에도 benefit_won·live_10m 실제 최외곽 자격 true 및 실제 발송 계획 메일행 생성, 선호행 없음 실제 자격 true. 모두 rollback. 메일 서비스에는 전송하지 않음.
- 실제 route handler→실제 DB RPC 통합 1 PASS: 원클릭 종류/채널 불변, 옛 1등급 토큰, preference 거절, 주소 변경 거절. 토큰 위조·만료·다른 키·서로 다른 회원 binding은 범위 단위 및 SQL 테스트로 확인.
- migration 적용→rollback→재적용 PASS. 새 migration에는 기존 행 유무나 함수 본문 문자열을 조회해 바꾸는 동적 재정의가 없으며, 빈 선호 표에서도 기본 true를 사용함.
- **미완료 검증**: 빈 DB 전체 재생은 로컬 기존 기반에 `group_room_context` 함수가 없어 선행 20261221000000에서 중단. 이 환경의 kyaa-t3에는 devdb-probe 명령이 없고 호출하면 `command not found: t3`; 요청된 PASS 줄을 얻지 못함. 전체 재생/probe 통과로 보고하지 않음.
- design-lint: no new violations. deployment notices 단위 시험 PASS. 배포 공지는 작성했으며 전송하지 않음.

## DESIGN.md 준수표

| 역할/소유자 | 실제 확인 | 판정 |
|---|---|---|
| 제목 FanHeading / globals | h1 26px, 기존 800 역할 | 준수 |
| 행 FanText item | 기존 16px 항목 역할, 이름만 교체 | 준수 |
| 경고 FanText meta | 기존 경고 그대로, Email 행만 | 준수 |
| 행동 FanAction | 기존 primary/neutral·최소 터치 높이 유지 | 준수 |
| 간격·색·구성 | 기존 page.module.css·FocusFlowFrame 유지, 두 행 | 준수 |
| 언어·접근성 | ko/en 390·1440 직접 화면 확인, form label 이름·버튼 유지, 가로 넘침 없음 | 준수 |
| 이미지 | 기존 공통 로고 유지, 신규 콘텐츠 이미지 없음 | 해당 변경 없음 |

4장의 `local-example-*.png`는 **로컬 예시 데이터 화면**이다. 실제 회원·운영 화면이 아니다. 합성 서명 토큰은 가상의 알림 ID이며 실제 사용자에 연결되지 않는다. 각각 직접 확인해 회원 정보가 없고 두 행과 경고가 잘리는 곳이 없음을 확인했다. 전역 `/Users/jewel/.codex/instructions/ui-projects/byus.md`는 이 Mac에 없어 checkout DESIGN.md와 기존 공통 부품을 기준으로 검수했다.

변경 TS/TSX 14개 파일 lsp_diagnostics: diagnosticCount=0. eslint 대상 3개 파일: 0건.

## 운영 반영 순서 (이번 작업에서는 실행하지 않음)

빈 DB 재생과 제공되지 않은 devdb-probe PASS를 먼저 확보한다. 승인 후 migration을 적용하고 웹과 워커를 같은 변경으로 배포한다. DB가 먼저 priority를 주고 새 RPC를 제공해야 한다. 메일 전체를 이미 끈 회원의 동의는 복구하지 않는다. 운영 승격 및 자동 안내는 기존 배포 절차로 확인한다.
