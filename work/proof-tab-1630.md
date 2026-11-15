# PROOF-TAB-1630

NOW: 증빙은 certification_submissions와 비공개 certification-proofs에 저장된다. read_proof_board는 approved AND publish_consent=true인 fan_posts(category=proof)만 공개한다. 기존 /c/[slug]/proofs 하단에 공개 목록이 있었다.

## 구현
- 팬페이지 게시판 바로 다음 인증 탭, 공통 FanTabs/FanAction/FanNumber/EarnBadge 재사용.
- 캡처 원본 비율의 이미지 피드, 본문은 피드에서 숨김. 신고·차단 유지.
- 상단: 활성 덕질 정책 rules.proof.points + 노란 P 아이콘 + 큰 숫자. 고정 예시값 없음.
- 카드: 해당 submission의 dukjil_action_log.points. 지급 기록 없으면 배지 숨김. 현재 정책을 과거 지급액으로 사용하지 않음.
- 기존 제출·심사·공개 동의 재사용, 개인정보 가림 안내.
- MIGRATION: supabase/migrations/20261222163000_proof_board_reward_points.sql 미적용. 기존 migration 수정 없음.
- decisions-by-screen.md 및 DESIGN.md에 대표 16:45 결정 기록.

## 검증 (2026-11-11)
- deps --copy 절차로 작업 전용 APFS 복제. 공유 의존성 변경 없이 실행. package-lock 변경 없음.
- 정확한 기준 main: f46034455c28492b4204fdc686a3e37f5c05a75a (작업 시작 때 로컬 main).
- main 전체 소스 스냅샷과 변경본을 같은 작업 전용 의존성으로 tsc --noEmit --incremental false 실행: 양쪽 exit 0, 기존 오류 0 / 신규 오류 0. 앞선 공유 의존성 환경의 오류는 복구 후 재현 안 됨.
- 기능/API/네비게이션/공개 SQL 계약 및 메모리 조회 시험: 총 172개 통과(중복 제외, 7개 파일).
- 공개 조건: migration의 실제 page SELECT를 SQLite 메모리에서 실행. PostgreSQL namespace/cast/함수 호출만 호환 처리. 승인 상태 5종 × 동의 null/false/true 및 동의 철회 확인. approved AND true만 1건, 나머지 0건.
- PostgreSQL에 migration 적용·실행하지 않음. SQLite 결과를 PostgreSQL 운영 검증으로 표현하지 않음.
- localhost:3000 공용 preview를 확인했으나 인증 탭/인증하기가 없어 이 브랜치 화면이 아님. 변경된 390/1440 화면·카드 이미지·정렬·상호작용 캡처 미확인. 무관한 캡처를 release note에 첨부하지 않음.
- 개별 Next 서버·DB 적용·gate·push·배포 실행 없음.

## 근거 로그
- /tmp/proof-tests-recovered.log: proofs UI/navigation/API/SQL contract, 88 pass.
- /tmp/proof-fixed-tests.log: celebrity-fan-page 73 pass (함께 실행된 다른 두 파일의 실패는 후속 수정 및 아래 시험으로 해소).
- /tmp/proof-frame-visibility-final.log: group frame + memory visibility 11 pass.
- /tmp/proof-types-head-clean.log, /tmp/proof-types-main-clean.log: 양쪽 exit 0.
