# RDS 대상 전용 portability

## DMS 최종 storage 동기화

DMS 경로는 source의 `storage.buckets`와 `storage.objects`를 별도로 차단한다. 일반 API 역할의 상속·replica 우회 권한과 활성 복제 경로를 먼저 검사하고, 행 트리거가 잡은 공유 잠금이 해제된 뒤 fence 상태를 바꾼다. `TRIGGER` 권한만 가진 source 운영자에게 불필요한 테이블 쓰기 권한을 요구하지 않는다.

대상의 `byus_storage_migrator`는 S3 objects·delete outbox·migration provenance 세 표에만 접근한다. 파일 전송 전에 `_byus_migration.begin_storage_import()`로 잠금을 잡으며, 앱 역할은 이 함수를 호출하거나 import 역할을 상속할 수 없다. barrier 단계는 진행 중인 import를 기다려 `imports_open=false`로 닫고, import 역할을 NOLOGIN으로 바꾼 뒤 남은 세션이 없는지 확인한다.

그 뒤 실제 source fence를 다시 확인하고 legacy storage 두 표를 한 transaction에서 갱신한다. bucket 키는 유지하고 object ID·경로 변경과 삭제를 반영하며, JSON 숫자는 문자열 snapshot으로 전달해 정밀도를 보존한다. 두 표의 seal은 이 transaction 안에서만 잠시 해제하고 다시 ALWAYS로 설정한다. 기존 object 참조 FK, S3 metadata의 고아 참조, 최종 shape·행 수·canonical SHA256 불일치는 전체 transaction을 rollback한다. 이 단계가 성공해야 source barrier를 발행한다.

최종 storage receipt는 source/target identity·catalog·source fence·import 폐쇄 시각·세 S3 표의 정확한 지문과 실제 blob 검증 결과를 묶는다. import 폐쇄 전에 만든 증거는 사용할 수 없다. 대상의 첫 앱 쓰기 후에는 source 단순 재개를 계속 거부한다.

2026-10-24 검증: PostgreSQL의 비소유자 fence·in-flight import 잠금·NOLOGIN·첫 쓰기 보호, metadata 갱신 실패의 rollback과 기존 고아 참조 거부를 로컬 fixture에서 확인했다. 실제 Supabase에서는 고유 테스트 경로에 NORMAL 행 트리거를 설치해 사전 발급 signed upload와 서비스 권한의 생성·수정·삭제가 거부되고 파일 bytes·전체 metadata가 유지되는지 확인했으며, 테스트 경로와 트리거를 정리했다. 이는 전역 source fence나 전체 300초 cutover 완료 증거가 아니다. 비공개 증거는 원본 checkout의 `work/aws-migration-20261023/`에 보존한다.

이 SQL은 원본 Supabase에 적용하지 않는다. `legacy-storage.sql`·`seal-legacy-storage.sql`·`retire-supabase-operations.sql`은 `auth/cron/net/vault` 플랫폼 스키마를 감지하면 중단한다. 실제 RDS 실행에는 기존 DB 도구의 계정·환경·서버 identity 확인과 변경 승인이 먼저 필요하다. 로컬 성공을 실제 운영 이관 완료로 표현하지 않는다.

## 실제 소스 확인

`source-portability-inventory.sql`은 고객 행이나 Vault 값 없이 컬럼/권한/함수 지문, storage projection count/SHA256, 폐기 함수의 SQL·cron 의존만 조회한다. root가 2026-10-23에 Management API로 실행한 결과는 원본 checkout의 `work/aws-migration-20261023/source-portability-inventory.json`에 0600으로 보존했다. 결과 wrapper의 `rows[0].jsonb_build_object`가 실제 inventory다.

확인한 소스는 PostgreSQL 17.6이며 legacy storage에는 buckets 6행, objects 260행이 있다. 아래 세 함수는 앱/worker 호출이 없고 실제 소스의 `pg_depend`·public routine body·cron command 참조도 없다.

- `public.configure_byus_queue_maintenance(text,text)`
- `public.configure_byus_worker_invocation(text,text,text)`
- `public.get_infrastructure_health()`

설정 함수의 남은 저장소 호출부는 기존 Supabase 전용 `configure-supabase-*.sh` 두 스크립트다. AWS Scheduler/Lambda 대체를 사용한 이후 이 스크립트를 RDS에 호출하지 않는다. health 함수를 성공을 반환하는 가짜 함수로 바꾸지 않고, 대상에서만 `DROP ... RESTRICT`로 폐기한다. SQL에는 남은 public routine 참조 검사도 있고 catalog 의존이 있으면 DROP 자체가 실패한다. 원본 함수는 보존한다.

실제 소스는 향후 Cognito/S3 migration까지 포함한 로컬 전체 replay와 동일하지 않다. 실제 dump 이후 승인된 pending SQL을 대상에 적용하고 **실제 양쪽 catalog에서** port 지문을 생성해야 한다. 로컬 rehearsal manifest를 운영 DB identity에 재사용할 수 없다.

## 대상 복원 순서

1. `bootstrap.sql`로 실제 pgcrypto/btree_gist와 필요한 최소 역할을 준비한다. 기존 함수 owner·BYPASSRLS·GRANT 권한을 지원하는지는 실제 RDS에서 확인한다. 지원하지 않는 Supabase extension을 만들거나 무시하지 않는다.
2. `legacy-storage.sql`로 실제 메타데이터를 수입할 두 projection 테이블을 만든다. 이 시점의 빈 테이블은 준비 상태가 아니다.
3. `storage-export.sql` 결과를 원본에서 **비공개 0600 파일**로 받는다. 이 쿼리는 object 경로·metadata를 포함하므로 콘솔·로그·Git에 출력하지 않는다. 값과 UUID를 보존해 buckets/objects projection을 수입한다. 실제 column type은 소스 inventory로 확인하며 임의 기본 행·위조 metadata를 추가하지 않는다.
4. 검토한 app-schema dump를 복원한다. 새 PG17의 `public` 기본 스키마를 유지하고 archive의 `SCHEMA - public` 생성 항목만 제외해 기본 PUBLIC USAGE를 잃지 않게 한다. legacy `mobile_email_login_bindings_supabase_user_id_fkey` 하나만 정확한 이름으로 제외한다. 전체 FK·ACL·owner를 제거하지 않는다.
5. 승인된 pending application migrations와 실제 `apps/web/server/auth/cognito/rds-legacy-overrides.sql`을 적용한다. Cognito credential import·본인 검증·원본 Auth 정지/토큰 만료는 별도 실행 조건이다.
6. `retire-supabase-operations.sql`을 대상에만 적용한다. 기존 app 표의 초기 데이터는 native logical replication이 복사한다. 로컬 full-data dump rehearsal에서는 native apply와 같은 replica trigger context로 복사하며, 실제 RDS에서 검증 없이 일반 trigger를 꺼두는 절차로 해석하지 않는다.
7. `seal-legacy-storage.sql`을 적용한다. 모든 I/U/D/TRUNCATE를 원본 import owner에게도 거부하는 ALWAYS trigger와 app-role DML/CREATE 금지 ACL을 설치한다. 기존 SECURITY DEFINER 함수 owner에게만 schema usage와 metadata SELECT를 준다.
8. audit의 source/target count·SHA256를 확인하고 객체별 정확 지문 및 실제 import/enforcement 검증 파일 해시로 port manifest를 승인한다.

이 projection은 기존 public SQL이 읽는 bucket 설정과 object metadata를 보존한다. Storage API·auth.users·cron·Vault·HTTP 함수를 복제하지 않는다. `reserve_s3_storage_object`·공개 미리보기·계정 삭제 등은 실제 snapshot 테이블을 읽으며, 새 저장·삭제·tombstone은 실제 S3 metadata/outbox 계약을 사용한다. 이미 있는 blob의 S3 복사와 앱 URL 전환은 별도 검증으로 남으며, DB metadata 복사로 파일 복사를 완료했다고 보지 않는다.

## manifest와 차단 기준

기존 `objects`의 source/target fingerprint·근거 파일 hash 규칙은 유지한다. `portability-contract.json`은 임의의 DDL 변경 대신 허용한 정확한 함수/표/제외 FK 목록을 기록한다. 소스/대상 object hash 차이는 해당 목록과 실제 검증에 근거해 개별 검토한다. auth/storage/extension 전체를 포괄적으로 skip하지 않는다.

실제 legacy metadata를 보존하는 경우 port manifest에 `legacyStorage`를 추가한다.

- `sourceProjectionFingerprint`: audit `source.storageInventory.projection`의 SHA256. buckets/objects 각각의 실제 count와 canonical JSON SHA256를 포함한다.
- `targetInventoryFingerprint`: 대상 `storageInventory` 전체 SHA256. 정확한 데이터 projection, 테이블 owner/ACL, guard 지문, app writer 권한을 모두 묶는다.
- `evidenceSha256`: 서로 다른 실제 metadata import 증거와 readonly enforcement 증거 파일 두 개 이상을 참조한다. 기존 manifest `evidence`의 실제 파일 hash 검사도 그대로 수행한다.
- `references`: storage를 읽는 각 public routine/view/표의 정확한 `kind`, `key`, source/target fingerprint. 같은 지문이더라도 이 제한된 provider 보존 계약을 명시한다.

readiness는 실제 source/target projection의 count·SHA256가 같아야 이 예외를 허용한다. target에는 두 metadata 테이블과 지정 readonly guard 외의 Storage API 모사 객체가 없어야 한다. guard는 정의한 무조건 예외 body와 동일해야 하며 ALWAYS/statement/IUDTRUNCATE 조건을 모두 갖춰야 한다. app-role의 DML·CREATE·테이블/guard owner 상속도 차단한다. 빈 shim, 변경된 행, disabled trigger, 성공을 반환하는 guard 또는 추가 Storage API 함수는 통과하지 않는다. auth/cron/net/vault 참조는 이 계약으로 허용되지 않는다.

ACL 지문은 NULL ACL을 PostgreSQL `acldefault`로 확장하고 `aclexplode`의 grantor/grantee/privilege/GRANT OPTION을 정렬한다. explicit owner 기본권한과 NULL 기본권한의 표현 차이만 동일하게 처리하며 실제 권한·grantor·grant option 차이는 유지한다.

## 재현 검증

```sh
node --test infrastructure/aws/database/portability.test.mjs
node --test scripts/aws-db-migrate.test.mjs
```

첫 검증은 기존 clean-replay harness로 모든 repository migration을 적용한 **소스 전용 Supabase test surface**를 만들고, 별도 standalone PG17 DB에는 실제 extension과 app dump, 수입한 합성 metadata, 대상 전용 SQL만 적용한다. 대상에는 auth/cron/net/vault schema나 pg_net/Vault shim이 없다. auth bridge, email compatibility, S3 SQL 테스트를 대상에서 실행하고 owner·replica mode의 metadata DML 거부, 기본 public usage 보존, ACL 의미 비교와 실제 권한 변화 탐지, empty metadata/disabled guard 거부를 확인한다.

산출물은 `work/aws-db-portability/report.json`, `reviewed-port-manifest.json`, source/target audit, metadata import/enforcement 증거다. `private-*` 파일에는 dump나 metadata가 있으므로 0600으로 보존하고 공개하지 않는다. 이 자동 테스트의 데이터는 합성 fixture이며 운영 회원 전체·실제 객체가 복사됐다는 증거가 아니다. 원본 source의 IPv4 direct endpoint와 공식 CA를 사용한 TLS verify-full 읽기 전용 연결은 2026-10-23 확인했다. live native replication·실 RDS 역할 권한·실 blob 복사·최종 writer drain은 미검증이다. 보고서의 native readiness blockers를 운영 실행 전에 해소해야 한다.

PG17 dump를 다시 해석하면 `participation_current_sources`의 UNION 후속 세 분기 상수에만 `AS text`가 붙는다. 로컬 검증은 이 뷰에서 해당 세 문자열의 정확한 치환 외에 변경이 없는지와 출력 컬럼 이름·형식을 확인하고, 양쪽 정의 SHA256 및 객체 지문을 별도 증거로 남긴다. 다른 뷰나 표현식에는 이 예외를 적용하지 않는다. 제약조건은 PostgreSQL의 pretty deparse를 사용해 의미 없는 중첩 AND 괄호 차이를 제거하며 실제 SQL·ACL 변경은 계속 검출한다.


## 실제 소스 스키마 리허설 — 2026-10-23

실제 Supabase PostgreSQL 17.6 direct IPv4에서 모든 연결에 `default_transaction_read_only=on`과 공식 CA·hostname을 사용하는 `sslmode=verify-full`을 적용했다. public schema-only custom dump, migration version 목록, catalog/role/default ACL과 실제 storage projection만 조회했다. auth credential·고객 테이블 행·Vault 값은 내보내지 않았으며 소스의 역할·권한·publication·slot·Auth를 변경하지 않았다.

원본 checkout `work/aws-migration-20261023/database-live-portability/`의 파일은 모두 0600이며 directory는 0700이다. dump와 storage projection에는 비공개 정의·경로가 있으므로 로그·Git에 공개하지 않는다. `private-collect-*.mjs`는 사용한 읽기 전용 수집 명령을 보존하며 비밀번호 값은 포함하지 않는다. `source-session.json`은 실제 TLS 및 read-only 설정 증거다.

```sh
node infrastructure/aws/database/live-portability-rehearsal.mjs /절대경로/database-live-portability
```

이 명령은 저장된 증거만 읽고 외부 DB에 연결하지 않는다. 새 Unix-socket 전용 PG17 cluster를 만들고 실제 소스 DB owner와 필요한 역할을 반영한다. 소스 전체 DB의 Superuser 권한을 흉내 내지 않으며, 기존 `supabase_admin` 이름은 default ACL 재현을 위한 NOLOGIN 역할로만 만든다. 임시 cluster는 종료 후 제거하고 원본 증거를 보존한다.

실제 소스 version 355개를 기준으로 미적용인 Cognito identity/email compatibility, auth 경로 보호, S3, webhook migration 5개만 로컬 대상에 적용했다. public 364개 표·1,339개 함수의 실제 정의를 복원한 뒤 대상은 379개 표·1,368개 함수다. 실제 storage objects 260개의 count와 canonical hash가 일치하며 metadata owner·replica-mode 쓰기도 거부한다. Cognito 두 SQL, S3, webhook SQL 검사는 실제 owner 이름의 **non-superuser postgres** 세션에서 통과했고 fixture transaction은 rollback해 app_users는 계속 0행이다.

public 스키마로 제한한 pg_dump는 전역 default ACL을 제외한다. 실제 소스에는 postgres 소유의 미래 함수에 대한 PUBLIC EXECUTE를 제거한 전역 default ACL이 있다. 이를 누락하면 새 함수 권한이 넓어지므로 `default-privileges.mjs`가 검증한 실제 전역 함수 권한만 `reviewed-global-default-acls.sql`로 렌더하고 복원한다. grantor가 owner와 다르거나 다른 객체 종류의 전역 권한을 발견하면 차단한다. public 범위 default ACL과 전역 default ACL의 owner/grantor/grantee/권한/GRANT OPTION이 모두 원본과 같아야 통과한다. 실제 RDS에서도 이 전역 권한을 **pending SQL보다 먼저** 적용하고 확인한다.

catalog는 세션 UTC/pg_catalog search_path로 표현을 고정해 동일한 timestamptz 상수나 extension 함수의 표시 차이를 제거한다. 실제 dump 복원 차이는 승인한 Auth FK 하나와 위의 정확한 UNION alias 뷰 하나뿐임을 확인한다. local-port-manifest.json은 각 객체의 실제 양쪽 지문, source/target DB identity, 실행 SQL·metadata import/seal/권한 검증 파일 hash를 기록한다. 새 대상에만 생기는 storage 참조는 동일한 지문의 명시적 신규 객체 승인도 함께 있어야 허용된다. 이 local identity의 manifest를 실제 RDS에 재사용할 수 없다.

`report.json`과 `node24-live-rehearsal.log`가 실제 소스 정의 검증 결과이며 `node24-tests.log`에는 관련 12개 테스트 통과 기록이 있다. 이는 고객 행 전체 복사, 실제 RDS 역할·권한, 논리복제, blob 복사 또는 컷오버 완료를 의미하지 않는다. 수집은 운영 DDL freeze나 하나의 공통 snapshot을 잡지 않았으므로 이식 호환성 증거로만 사용하고, 실제 실행에서는 freeze와 동일 snapshot/최종 catalog·metadata 재검증이 필요하다.
