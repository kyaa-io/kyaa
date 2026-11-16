# 판정: 고친 뒤

2026-11-17 Codex 교차 검토. 기준 ae204abfd (worker acb55a66d 포함). 운영 실행 불가: 아래 실제 발송 예약 한도를 고치고 재검증해야 한다. DEV 리허설 불가라는 기존 승인 조건도 해소되지 않았다. 운영·체인 발행·자금 이동·푸시 없음.

## 높음 — 실제 발송 예약 500건 조건 불충족 (#865·867)

`20261229000000`의 run_community_stamp_recovery는 enqueued_day로 제한한다. admit_fan_action_dispatch는 공유 1000건만 확인한다. 임시 DB에서 전날 큐 투입분 500건(미예약)과 당일 1건을 준비한 뒤 501건 전부를 같은 UTC 날짜에 실제 admission 함수로 예약했다. CAP_VIOLATION_REPRODUCED=501, 신규용 잔여=499. 날짜 변경은 recovery_items.enqueued_day fixture에만 적용했고 예약 테이블을 조작하지 않았다. 기존 시험의 마지막 슬롯 검사는 이 조건을 증명하지 않는다.

`supabase/tests/dukjil_stamps_dispatch_cap_counterexample.sql`은 **결함 재현 시험**이다. 통과는 인수 성공이 아니라 위반 확인이다. 수정 필요: 정책 잠금 아래 실제 예약의 복구 건수를 별도로 세어 최대 500을 강제하고 재예약·서명 거래 복구의 기존 멱등성을 보존할 것. 이 검토에서는 요청 1의 보류 해제만 수정했다.

## 높음 — 보류 200건이 정상 도장을 가림 (#868·870): 수정

수정 전 임시 DB에서 미등록 200건 뒤 정상 1건을 두 번 해제해도 연결되지 않는 오류를 재현했다 (`DUKJIL_NATIVE_TEST: healthy stamp behind 200 held stamps`). 새 migration `20261229001000`은 준비 조건을 LIMIT 전에 적용하고 enqueue 실패 시 5분 재시도 시각을 남긴다. 잠금 뒤 원문·등록 검증과 기존 잠금 순서를 유지한다. SKIP LOCKED를 추가하지 않았다.

수정 후 미등록 200건 뒤 정상 건, 동일 creator의 반복 실패 200건 뒤 정상 건(2회 이내), 세 번째 재호출의 credential 1개, 실패 항목 credential 0개를 확인했다. DB 시험의 중복 0은 발행 요청 중복 기준이며 실제 체인 발행 수를 측정한 것은 아니다. 기존 경쟁 시험도 `1 1 12 12 12 3 3` 통과. released=0은 보류 없음이 아니다. 미등록·경로 비활성·재시도 대기 건을 계속 관찰해야 한다. 준비 조건 함수의 행별 조회 비용은 발생하며 운영 규모의 실행 계획·지연은 미측정이다.

## 나머지 검토

- Migration: lock_timeout=5s지만 SET LOCAL은 트랜잭션 내부에서만 유효하다. 기준 문구 개수를 검사해 DRIFT 예외를 던진다. 전체 원자성은 실행 래퍼의 트랜잭션에 의존한다. 일반 clean replay는 autocommit여서 SET LOCAL 경고가 났다. 이를 운영 원자성 증거로 쓰면 안 된다. 기존 DEV dry-run 실패·변경 0은 이전 작업자의 기록이며 이번에 DEV에 접속하지 않았다.
- 되돌리기: 기존 rollback은 명시적 BEGIN과 5초 잠금 제한, 신규 보류·복구/해제 함수 중지를 수행한다. legacy를 되살리거나 기존 연결을 삭제하지 않는다. 이미 큐에 들어간 것·체인은 취소하지 않는다. 새 retry 열은 남아도 중지에 영향 없다. rollback 실행 뒤 새 도장 보류와 해제·복구 함수 중지 확인: ROLLBACK_STOP_OK.
- Legacy 이중 발행: enqueue에서 도장·원 작업을 잠그고 원 작업 상태·서명과 기존 credential 연결을 확인한다. legacy_job_id 연결은 퇴역 설정을 꺼도 claim에서 제외된다. 기존 SQL 시험과 동시 복구 시험을 재실행해 통과했다.
- 매핑: daily_checkin→10, first_comment→8, 명시된 15종→12. worker action-domain의 dukjilCommunityStampKinds와 SQL allowlist가 일치하며 kind 접두어·binding 2·recipient·issuance key·MINT 단일 Stamp를 검증한다. 기존 share/first_clip 경로는 유지한다. 이번에는 worker 전체 시험/체인 포크를 재실행하지 않았다.
- 등록: hold helper는 fan_action_verified_creators를 요구하고 confirmed 좋아요 예외를 사용하지 않는다. 기존 SQL의 confirmed 보류와 verified 해제 검사를 재실행해 통과했다.
- Manifest: 동일 상태·동일 cutoff 재실행은 동일 hash와 행 수를 보존한다. 복구 뒤에는 ALREADY_LINKED 분류로 hash가 바뀔 수 있으므로 “같은 cutoff면 언제나 같은 hash”라는 runbook 표현은 좁혀야 한다. 기존 연결 재사용·동시 복구 멱등 시험 통과. 같은 hash의 daily_cap 변경은 적용되지 않는다.
- 비용: 제공된 과거 receipt의 951533×1000290+328 wei = 약 0.000000951809 ETH, 2049×0.00000095 = 0.00194655 ETH, 2배 = 0.0038931 ETH로 산술은 맞다. 현재 가스/잔고를 확인한 것이 아니며 잔고 충분 보장은 할 수 없다. 이번 구현은 native writer이므로 MIGRATOR 송금은 필요 조건이 아니다. 1M 가스 상한 여유가 작다는 기존 주의와 실제 설정 확인은 유효하다.

## 재실행

```sh
BYUS_CLEAN_DB_PORT=55493 BYUS_CLEAN_DB_SHELL_ASSERTION_FILE="$PWD/supabase/tests/dukjil_stamps_xreview.sh" bash scripts/verify-clean-migration-chain.sh
```

일회용 클러스터의 Unix socket만 사용한다. `onchain-stamps-xreview/`에는 사용자 지시에 따라 board 단계 SQL의 동일 사본·SHA256과 fixture 치환 sequence를 보관했다. 가드를 변경하지 않았다. sequence는 임시 byus DB에서 preflight→manifest→첫 10→일별→동일 날짜 재실행을 수행한다. 이 검증은 DEV worker/영수증 리허설을 대신하지 않는다.

최종 실행 결과: clean replay 성공(540 public tables), STARVATION_OK, DUKJIL_NATIVE_ONCHAIN_OK, CAP_VIOLATION_REPRODUCED=501, DUKJIL_NATIVE_RACE_OK=1 1 12 12 12 3 3, ROLLBACK_STOP_OK. 단계 SQL 결과 enqueued=10→10→0, failed=0, 연결 도장 20개. UTC 예약일 2026-11-16(한국 11-17). 임시 DB는 종료·삭제했다.
