# SIGNUP-RAFFLE-DEV #22

DB 응모/행동 저장, 서비스 전용 원본 행동 검증, RLS, 마스킹 CSV, 서버 플래그 기본 off 및 dev 배포 설정 on을 준비했다. 홈 기존 배너 시스템과 12개 언어 상세를 연결했다. 운영 DB·게이트·푸시는 실행하지 않았다.

사용자 결정 필요: 마감 시각/시간대(기존 2026-11-30 23:59:59.999 Asia/Seoul 유지), 확률 반영 기준(기존 댓글/출석 각각 1 유지), 하루 상한(각 null 유지).

검증: npm run typecheck, npm run design-lint 통과. 관련 backend Vitest 21개, 홈 Vitest 16개, 배포 설정 node test 33개 통과. 임시 PostgreSQL 528개 migration 체인 및 signup_raffle.sql 실검증 통과. 501개 행동 snapshot·본인 범위·삭제 반영·권한·멱등성 포함. 독립 검토에서 찾은 offset 조회 경합은 단일 SQL snapshot으로 수정.

로그: work/signup-raffle/{typecheck,design-lint,home-test,migration-rpc}.log. UI 캡처는 실제 컴포넌트 로컬 fixture이며 guest auth/API stub. 실제 dev 로그인/DB 통합·배포 검증은 아니다. 서버 플래그는 다음 dev 배포 때 적용되며 이 작업에서 배포하지 않았다.

UI: 12언어 × 390/768/1440 × 상세/배너 72조합 검증 통과. 390/1440 캡처 4장 직접 확인 및 release note 포함. 독립 미적 점수 평가는 미실행. sloplint 기존 stamp FAIL 1개 동일, 신규 FAIL 0. fixture 서버/브라우저 정리 완료.
