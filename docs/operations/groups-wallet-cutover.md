# 모임 공통 지갑 전환·복구 절차

이 문서는 실행 절차이며 운영 적용 기록이 아니다. 운영 SQL 실행·배포·gate 변경은 이 문서 작성 과정에서 수행하지 않았다. 앱 출시는 범위 밖이지만 기존 앱·구 웹·결제 webhook·worker가 호출하는 DB 쓰기 경로는 전환 대상이다.

## 1. 고정 계약과 전환 상태

기존 `fan_ticket_ledger`와 `mobile_fan_economy_ledger`를 그대로 사용한다. 공통 잔액은 사용자별 ticket / fan_point / support_voucher의 **모든 Creator 행과 공통(NULL Creator) 행의 amount 합계**다. 예전 Creator별 `resulting_balance`를 합산하지 않는다. 하트 100P, 응모권 100P, 광고 없음. 공통 출석은 KST 하루 10P, 연속 7일마다 추가 20P이며 기존 도장·XP를 재발급하지 않는다.

`20261201020000_group_wallet.sql`은 `enabled=false`, `write_fenced=true`, 증거·출석 시작일 미설정으로 확장만 한다. 운영 전환 row는 API에서 수정할 수 없다.

| 상태 | `KYAA_GROUPS_ENABLED` | DB enabled / write_fenced | 의미 |
|---|---|---|---|
| 확장·기존 운영 | false | false / true | 새 모임 UI 숨김. **기존 지갑 쓰기는 아직 동작한다.** |
| writer 정지·배출 | false | false / true | 별도 운영 진입 차단과 worker 배출이 필요하다. 위 DB row만으로 정지되지 않는다. |
| 전환 후 대사 | false | true / true | 공통 잔액 읽기·복구 확인, 공통 자산 쓰기 차단 |
| 공개 운영 | true | true / false | 검증한 동일 SHA의 UI·API·worker와 공통 지갑 사용 |
| 장애 격리 | false | true / true | 전환을 유지한 채 쓰기만 중단하고 복구 |

`KYAA_GROUPS_ENABLED`는 서버가 `GroupsReleaseProvider`에 전달하는 실제 flag다. 별도의 `NEXT_PUBLIC_*` flag를 가정하지 않는다. `/api/me/wallet/*`의 최종 경제 gate는 DB row다. UI 숨김이 기존 API나 앱의 소비를 중단시키지는 않는다.

`rewards_start_on`은 서버 KST 기준이며 새 wallet 응답의 `rewardsStartOn`에 표시된다. **기존 Creator 출석이 이미 가능한 당일로 소급하지 않고 다음 KST 날짜부터 시작**한다. 전환 당일의 기존 지급과 새 지급이 겹치지 않게 한다. 시작 전 UI 출석 비활성 및 서버 `GROUP_WALLET_REWARDS_NOT_STARTED`를 확인한다. 시험을 위해 운영 날짜를 앞당기지 않는다.

## 2. 실행 전에 보존할 근거

실행별 비공개 `work/.../cutover/`에 아래를 보존한다. 비밀 값·원본 구매 토큰·회원 명단을 안내나 공개 로그에 넣지 않는다.

- 승인된 40자리 source SHA, main/dev 실행 ID, web/media 이미지 digest, worker ZIP digest, 실제 web `RELEASE_SHA`와 worker 실행 버전, 현재 flag·스케줄 소유자와 복구할 원래 설정.
- 정확한 AWS account/region, RDS identifier/resource ID, database OID/session user/server address/port, 적용 migration 목록·파일 SHA. SQL과 실행 대상 식별을 묶는다.
- 기존 writer inventory: 현재 web task, 구 origin, 앱용 RPC, 결제 검증·환불 callback/재처리, 인증·초대·LIVE 보상, 수정 지급, 추첨·캡슐·취소환불, worker/cron/관리자 진입점별 코드 SHA·DB 함수·정지/배출 결과.
- 아래 read-only snapshot 두 번, catalog audit, 로컬 SQL/동시성 검증 로그, 미완료 요청 복구 결과, 재개 이후의 허용된 점검 거래와 실제 delta.

공통 잔액에 paid_vote / free_vote / `mobile_store_paid_ticket_ledger`를 더하지 않는다. 이들은 Creator·구매 단위 권리를 유지한다. pending 구매, refund_review lot, 원래 환불 단계와 취소 tombstone을 그대로 보존한다.

### 재사용하는 검증 파일

- `scripts/groups-wallet-cutover-snapshot.sql`: repeatable-read/read-only. 사용자별 amount 합계 hash·합계·음수/overflow 수, 기존 영수증·취소·구매/환불/paid 원장 fingerprint. 200 전에도 실행할 수 있으며 새 nullable `group_policy_version`만 fingerprint 투영에서 제외한다. 비어 있는 테이블은 `fingerprints`에 나타나지 않으며, 없는 테이블은 SQL 오류가 된다.
- `scripts/groups-wallet-cutover-audit.sql`: 200 이후 read-only. release row, 알려진 legacy guard의 실제 함수 본문 hash/검사, 직접 원장 INSERT 함수 목록, private mint ACL, 다른 세션의 미완료 transaction을 출력한다. SQL 원문·사용자 식별자는 출력하지 않는다.

`unguardedPresentRoutines=0`, `privateMintAclLeaks=0`은 필요한 부분 검사다. `absentLegacyNames`는 실제 배포 DB에서 함수가 원래 없는지 확인한다. 함수명/문자열 검색만으로 모든 동적 SQL·외부 writer가 안전하다고 승인하지 않는다. audit는 항상 `manualSourceAndDeploymentReviewRequired=true`를 출력하며 `legacy_writers_verified`를 자동 설정하지 않는다.

대사는 writer 정지 중 **fingerprints 전체, assets 전체, paidVotes 전체가 동일**해야 한다. 전환 자체는 금액/구매 권리를 생성·차감하지 않는다. 이후 실제 점검 거래를 시작하면 append·잔액 변경이 정상일 수 있으므로 거래별 delta와 원래 request key로 설명한다. 이 시점의 전체 hash 차이를 임의로 무시하거나 잔액을 0으로 보정하지 않는다.

## 3. AWS 배포와 DB 실행 경로

[기존 플랫폼 승격 절차](../../infrastructure/aws/platform/ci-setup.md#build-once-promote-and-announce)를 사용한다. main push의 정확한 dev 실행 ID가 나오면 이미 승인된 운영 릴리스는 아래 예약을 기존 방식으로 등록한다. 이 문서의 작성·검증에서는 실행하지 않는다.

```sh
gh workflow run aws-approved-promotion.yml --ref main \
  -f source_run_id=DEV_RUN_ID -f expected_sha=FULL_APPROVED_SHA
```

예약 수락은 운영 성공이 아니다. 기존 workflow의 artifact 검증·직렬 배포·ECS 안정화·정확한 image/RELEASE_SHA·readiness/live 검증을 사용한다. `https://kyaa.io/api/health/live`가 해당 SHA인지 기록한다. 기존 자동 배포 안내를 중복 전송하지 않는다.

현재 저장소의 `aws-db-migrate.mjs` CLI는 전체 DB 이관용 `audit/plan/status/verify/...` 명령만 제공한다. **그 CLI의 `enable`은 지갑 flag 변경 명령이 아니다.** 임의 SQL용 CLI가 있다고 가정하거나 전체 AWS DB 이관을 다시 실행하지 않는다.

실제 운영 SQL 실행 진입점은 릴리스 담당자가 확정·기록해야 한다. 재사용 가능한 기존 port는 `scripts/aws-db-migrate.mjs`의 `Database.open`, `identity`, `verifyIdentity`, `run`이다. 이미 검토된 config와 migration role을 사용한다. DMS target SQL tunnel이면 기존 계약대로 SSM session 증거 hash, instance ID, remote RDS host:5432, local port를 검사하고 TLS verify-full과 endpoint identity를 유지한다. pooler나 앱 service credential로 대체하지 않는다.

아래는 **read-only 파일 실행 예시**다. 새 운영 runner를 설치하지 않는다. 승인된 checkout 루트에서 실행하며 config/환경 변수는 기존 비공개 설정을 이용한다. 이 예시를 작성했다고 실제 연결·IAM·SQL 실행이 검증된 것은 아니다.

```sh
export GROUPS_CUTOVER_CONFIG=/absolute/private/reviewed-config.json
export GROUPS_CUTOVER_OUTPUT=/absolute/private/cutover/snapshot-before.json
node --input-type=module <<'JS'
import { readFile, writeFile } from 'node:fs/promises';
import { Database, validateConfig, verifyIdentity } from './scripts/aws-db-migrate.mjs';
const config = validateConfig(JSON.parse(await readFile(process.env.GROUPS_CUTOVER_CONFIG, 'utf8')));
const db = await Database.open(config, 'target');
try {
  verifyIdentity(config.target.identity, db.identity());
  const evidence = db.run(await readFile('scripts/groups-wallet-cutover-snapshot.sql', 'utf8'), {timeout:125000});
  await writeFile(process.env.GROUPS_CUTOVER_OUTPUT, JSON.stringify(evidence,null,2)+'\n', {mode:0o600,flag:'wx'});
} finally { await db.close(); }
JS
```

catalog audit는 파일명·출력명만 바꿔 같은 port를 사용한다. SQL mutation은 위 read-only 예시를 임의로 바꿔 실행하는 대신 대상 식별·검토된 SQL·실행 결과가 남는 확정 port에서 수행한다. migration 이력에 이미 있는 SQL을 재실행하지 않는다. backdated pending version이 있으면 현 원격 이력 뒤에 적용하는 실제 순서까지 `verify-clean-migration-chain.sh`의 `BYUS_CLEAN_DB_MIGRATION_ORDER_FILE`로 검증한다.

## 4. 정지·배출·guard 확인

1. 기존 UI/API/앱·관리자·callback 소비/지급 진입을 기존 운영 경계에서 정지한다. 결제 검증 요청·환불 알림은 보존 가능한 기존 intake/재처리 경로로 유지하며, 성공 응답을 가장하거나 pending receipt를 삭제하지 않는다. 현재 checkout에는 이 모든 writer를 끄는 단일 지갑 전용 명령이 없다. 실제 진입점별 정지 근거가 필요하다.
2. notification runtime은 `runGroupRafflesDueOnce`뿐 아니라 기존 Run&Music/추첨 reminder/여러 알림 큐를 함께 실행한다. `NOTIFICATION_EXTERNAL_MODE=disabled`만으로 group raffle 작업을 멈췄다고 판단하지 않는다. 기존 notification Lambda의 `NOTIFICATION_WORKER_ENABLED=false`, 별도 maintenance Lambda의 `BENEFIT_MAINTENANCE_ENABLED=false`를 실제 deployed 설정과 대조한다. [기존 배포 스크립트](../../scripts/deploy-aws-notification-worker.sh)를 재사용한다면 현재 bundle/SHA와 모든 기존 환경·VPC 설정을 보존한다. flag만 바꾸려다가 미검증 bundle을 함께 올리지 않는다.
3. 이미 실행된 Lambda/task·수동 SQL·앱 요청은 flag 변경만으로 종료되지 않는다. 실제 timeout/lease, 로그의 tick 종료, CloudWatch 동시 실행, DB transaction 종료를 확인한다. 현재 스크립트의 notification timeout은 300초, maintenance는 120초지만 **배포된 값**을 사용한다. 새 요청을 막고 정상 완료·실패/재시도 상태를 보존하여 배출한다. 처리 중 금전 transaction을 강제 종료하거나 큐/receipt를 삭제하지 않는다.
4. 기존 AWS cron owner/retirement 증거는 [One cron owner](../../infrastructure/aws/platform/ci-setup.md#one-cron-owner)를 따른다. 이미 폐기한 Supabase/Edge/구 Vercel writer를 재활성화하지 않는다. 작업과 무관한 전체 cron 이관을 다시 하지 않는다.
5. 확장 migration을 적용하고 아직 gate는 열지 않는다. read-only audit의 `activeApplicationTransactions`에서 점검 세션을 제외한 모든 애플리케이션 transaction이 배출됐는지 역할·applicationName으로 확인한다. 다른 운영 점검 세션은 근거를 분류하며, age만으로 자동 종료하지 않는다. `canObserveAllSessions=true` 권한 관찰과 실제 배포 역할 목록을 함께 확인한다. 다른 세션을 볼 권한이 없으면 배출을 확인한 것으로 처리하지 않는다.

### 실제 lock 감사 계약

200의 29개 single-owner 함수명 목록과 배포 DB의 전체 overload를 대조한다. 이 경로는 기존 request/campaign/Creator lock 전에 `group_wallet_legacy_lock(owner)`를 호출해야 한다. `fan_web_lock_active_user`와 두 원장 BEFORE INSERT sequence trigger가 table-triggered producer를 함께 포괄한다.

- 일반 쓰기: shared `group-wallet:campaign-barrier` → `group-wallet:owner:<uuid>` → 기존 요청/캠페인 lock.
- 초대의 세 입구 `submit_owned_quiz_attempt`, `submit_owned_quiz_attempt_fw_f5930695`, `redeem_community_stamp_invite`: exclusive barrier → 정렬된 invitee/inviter account → 기존 lock. reciprocal 초대 경합 회귀를 유지한다.
- legacy `cancel_admin_benefit_campaign`: exclusive barrier → 정렬된 참가자 account → campaign. 400의 refund-only lock으로 정지 회원의 원래 권리도 반환한다.
- 새 추첨·캡슐·미션은 동일 wallet primitive를 사용한다. 취소는 `group_wallet_refund`의 positive ticket 반환 경로이고, 비활성 계정의 새 debit은 허용하지 않는다. 함수 ACL로 private helper를 직접 호출할 수 없어야 한다.

실제 `pg_get_functiondef` hash·호출 graph·direct writer inventory를 승인 SHA의 200/400/500 및 후속 wrapper와 대조한다. 새/구 worker가 원장을 직접 UPDATE/DELETE하거나 별도 잔액 캐시로 소비하지 않는지도 확인한다. 문서의 목록만으로 배포되지 않은 구 코드나 새 동적 writer의 감사가 끝난 것은 아니다.

## 5. 활성화와 공개

writer가 배출된 상태에서 첫 financial snapshot을 저장한다. migration 후 snapshot과 비교하여 기존 원장·영수증·pending/held 권리가 동일하고 음수/overflow/invalidLots가 0인지 확인한다. 코드/실행/대사/guard audit를 하나의 최종 증거 manifest로 보존하고 그 **실제 파일 바이트 SHA-256**을 계산한다. 임의의 64자리 성공 표식을 넣지 않는다.

아래는 검토할 mutation SQL의 형태다. placeholder를 확정된 값으로 바꾸고 영향 행이 정확히 1개인지 확인한다. 표준 timeout 안에 lock을 얻지 못하면 정지·배출 상태를 재확인하며 성공으로 취급하지 않는다.

```sql
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
select pg_advisory_xact_lock(hashtextextended('group-wallet:campaign-barrier',0));
select * from public.group_wallet_release where singleton for update;
update public.group_wallet_release
set enabled=true,write_fenced=true,legacy_writers_verified=true,
    migration_evidence_sha256='ACTUAL_REVIEWED_EVIDENCE_SHA256',
    rewards_start_on='CONFIRMED_NEXT_KST_DATE'::date
where singleton and enabled=false
returning *;
commit;
```

처음 `enabled=false` 동안 시작된 legacy transaction은 shared barrier를 얻지 않았을 수 있다. **위 advisory lock만으로 사전 배출을 대신할 수 없다.** 활성화 직전 외부 진입 차단과 transaction 배출을 확인한다.

enabled=true/write_fenced=true에서 다시 snapshot·audit를 저장한다. 재배포된 정확한 SHA와 UI flag, legacy writer hash가 일치하고 금융 대사가 같아야 한다. 본인 계정 read와 기존 request 복구는 사용하되 쓰기는 아직 시작하지 않는다. old request는 기존 Creator·operation 문맥에서 원래 응답을 복구한다. `status=legacy,requiresOriginalContext=true`를 unknown으로 바꿔 새 API에서 재실행하지 않는다.

검증 후 같은 barrier와 release row lock 아래에서 `write_fenced=false`만 변경한다. `enabled=true`, 증거 hash·시작일이 검토값인지 조건으로 묶고 RETURNING 1행을 확인한다. 이때부터 사용된 기존 Creator provenance 행도 공통 경제의 기록이다. 새/구 writer를 순서 있게 재개하고 정확한 SHA의 `KYAA_GROUPS_ENABLED=true` UI를 연다.

출석 시작 전에는 exchange/지원/응모의 승인된 점검 거래로 요청 복구를 확인한다. request key를 보존하고 첫 성공·응답 소실 후 같은 key·서로 다른 key의 잔액/원장 행 수를 대조한다. 운영 회원·실제 경품에 임의 참여시키지 않는다. 날짜가 오기 전 출석 지급은 미검증으로 남기고 서버/화면의 시작 전 차단만 확인한다.

재개 뒤 worker의 실제 tick 결과에서 `groupRaffles`가 rejected인지 확인한다. `process_due_group_raffles`는 disabled/fenced이면 0을 반환하므로 0 처리 자체를 성공한 추첨 운영의 증거로 쓰지 않는다. notification 전송 접수와 수신, 추첨 확정과 경품 전달을 구분한다.

## 6. 실패 복구

첫 조치는 외부 진입/UI를 닫고 **enabled=true를 유지한 write fence**다. shared writer가 끝난 뒤 exclusive barrier를 얻어 설정하므로 이미 진행 중인 debit을 중간 상태로 만들지 않는다.

```sql
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
select pg_advisory_xact_lock(hashtextextended('group-wallet:campaign-barrier',0));
update public.group_wallet_release set write_fenced=true where singleton and enabled=true returning *;
commit;
```

- **활성화 전 실패:** 기존 writer 정지를 유지하고 migration·대사 오류를 수정한다. additive schema와 원본 기록을 보존한다. 적용 여부가 불명확한 SQL을 다시 실행하기 전에 이력·결과를 확인한다.
- **활성화 후 금융 쓰기 0건을 입증한 경우:** 정지 상태의 baseline·현재 snapshot/receipt/요청 흔적이 모두 같을 때만 검토한 원래 gate/코드 조합으로 되돌릴 수 있다. `celebrity_id IS NULL` 행 0개만으로는 부족하다. enabled 상태의 legacy 경로도 기존 Creator 행에 공통 잔액 기준 기록을 남길 수 있다.
- **공통 경제의 첫 쓰기 이후:** `enabled=false`로 내리거나 옛 함수·스키마·DB snapshot으로 단순 복구하지 않는다. Creator별 reader로 돌아가면 공통 debit을 잃거나 같은 자산을 다시 소비할 수 있다. enabled=true/fenced=true로 기록을 보존하고 호환되는 코드로 roll-forward한다.
- **lost response/timeout:** 먼저 request receipt·capsule 결과·legacy 취소 기록을 조회한다. 기존 key로 재조회/재시도하고 새 key로 보상 거래를 만들지 않는다. 원장 UPDATE/DELETE나 임의 credit으로 맞추지 않는다.
- **취소·정지 계정:** 기존 refund-only 경로에서 entry 소유자·원래 차감량을 확인하여 한 번 반환한다. worker 재개 시 같은 취소 key의 재처리와 held/pending 구매·환불 권리를 함께 대조한다. 미확정 거래를 성공 처리하거나 조용히 제외하지 않는다.

복구 후에는 새 대사·guard·배포 SHA 증거를 남긴 뒤 fence 해제를 재검토한다. 기존 실패 로그/manifest/원래 요청 키는 보존한다.

## 7. 검증 근거와 남는 운영 확인

로컬 검증은 기존 `scripts/verify-clean-migration-chain.sh`를 재사용한다. `group_wallet.sql`, `group_wallet_concurrency.sh`, `group_wallet_cross_feature_concurrency.sh`, `group_activities.sql`, `group_capsule.sql`, `group_raffles.sql`을 영향 범위에 맞게 실행한다. 교차기능 fixture는 폐기용 Unix-socket `byus_clean` 전용이며 운영에서 실행하지 않는다.

이번 read-only 산출물은 `supabase/tests/group_wallet_cutover_verify.sh`로 폐기 DB에서 JSON 형식·guard 관찰·pending/held fixture·fence 전후 financial fingerprint 불변을 확인한다. 통과 로그는 실제 실행 결과와 함께 기록한다. clean replay 출력의 `migrationsApplied`는 현재 스크립트에서 public 테이블 수이므로 migration 개수로 쓰지 않는다.

운영 완료에는 실제 SQL port/권한·RDS identity, writer 정지/배출, 원격 이력과 pending SQL 적용 순서, 운영 금융 대사, 정확한 SHA/flag 조합, webhook·worker 재개, 실제 점검 요청 복구 근거가 필요하다. 로컬 통과나 이 runbook 존재만으로 이 항목을 완료 처리하지 않는다.

### 2026-11-02 읽기 전용 접속 확인
기존 `byus-prod-temporary-db-access` SSM 인스턴스를 이용한 TLS verify-full 터널로 현재 운영 DB 식별을 확인했다. RDS resource ID `db-CQM4L5NQYWC4FFO7D27DR26TCU`, database `byus`, session user `byus_admin`, server `10.40.2.210:5432`, PostgreSQL `170009`, recovery=false였다. `group_pages`는 아직 없고 `supabase_migrations.schema_migrations`도 없다. 따라서 운영 적용을 기존 Supabase migration ledger에 등록됐다고 보고하면 안 된다.
현재 read-only snapshot은 `work/kyaa-groups-production-20261101/prod-readonly-preflight-snapshot.log`에 별도 보존했다. 쓰기 차단 전 사전 조사이므로 최종 전환 대사로 재사용하지 않는다. 운영 SQL 변경은 아직 실행하지 않았다. 실제 실행 시 현재 인스턴스/세션/리소스 ID를 다시 확인하고 SQL 파일 SHA와 transaction 결과를 함께 기록한다.

### 최애 운영 복구와 모임 dev 전용 운영

운영 UI 복구에는 `prod` 환경의 `KYAA_GROUPS_ENABLED=false`를 사용하고, `dev`는 `true`를 유지한다. 모임·캡슐·추첨과 새 wallet API가 모두 404로 닫힌 것을 확인한다. 진행 중인 추첨·미지급 경품·미완료 요청이 있으면 먼저 기존 권리의 처리 경로를 보존해야 한다.

공통 원장은 유지한다. `enabled=true`, `write_fenced=false`, 전환 증거 해시와 기존 기록을 변경하지 않는다. **새 wallet API가 차단된 배포를 확인한 뒤에만** 운영 `rewards_start_on='infinity'::date`로 새 출석 시작을 미룬다. 기존 Creator 출석은 기존 정책대로 지급되며 새 공통 출석은 `REWARDS_NOT_STARTED`로 차단된다. dev의 시작 날짜는 변경하지 않는다. API를 먼저 닫는 이유는 `infinity`가 wallet 응답의 ISO 날짜 계약에 맞지 않기 때문이다.

재출시 순서는 운영 `rewards_start_on`을 승인된 다음 KST 날짜의 **유한 ISO 날짜로 복구**, 응답 계약 확인, 마지막으로 운영 UI flag 활성화다. 무기한 날짜인 채 flag를 켜지 않는다. 재검증 fixture는 `supabase/tests/groups_release_rollback.sql`이며 폐기용 로컬 DB에서만 실행한다. 이 절차는 화면 노출 복구이며 과거 DB 스냅샷 복원이 아니다.

### 댓글 권한과 모임 공개 상태 맞추기

`20261208064000_group_content_release.sql`은 기존 모임 권한을 유지하는 `enabled=true`로 설치한다. `group_content_release`는 지갑·보상 설정과 독립이며 브라우저/API 역할은 읽거나 변경할 수 없다. 운영자가 `KYAA_GROUPS_ENABLED`와 함께 관리한다.

- 모임을 내릴 때: 먼저 모임 API가 404인 배포를 확인한 뒤 `update public.group_content_release set enabled=false where singleton returning enabled;`를 적용한다. 기존 공개 글·공지 댓글은 활성 계정으로, 회원 전용 콘텐츠는 기존 발급 패스포트 기준으로 접근한다. 그룹 가입·탈퇴 기록과 지갑 원장은 변경하지 않는다.
- 다시 공개할 때: 기존 보상 시작일 복구 절차를 수행하고, `group_content_release.enabled=true`를 적용해 가입/탈퇴·비공개 콘텐츠 차단을 검증한 뒤 `KYAA_GROUPS_ENABLED=true` 배포를 공개한다. dev는 두 설정 모두 true로 유지한다.
- 행 누락은 권한 완화로 취급하지 않는다. 설치된 기본 모임 가입 정책을 유지하며, 비활성화는 명시적 false에서만 동작한다. `supabase/tests/groups_content_release.sql`이 공개 댓글·답글·중복 재시도와 패스포트/계정 경계를 검사한다.
