# 임시 private DMS 합성 fixture

고객 DB `byus`·Supabase에는 이 도구로 endpoint/task를 만들 수 없다. 계정 996702758024, profile jewel-sallylab, 서울, 현재 prod RDS hostname, prod APP subnet 두 개, 별도 DB/LOGIN 두 개와 세 합성 표만 고정한다. 원래 fence/enable/remote-LSN guard는 변경하지 않는다. 이 검증은 실제 고객 이관 승인이나 운영 컷오버 증거를 대신하지 않는다.

## 고정 계약과 사전 준비

- DB/LOGIN: `byus_dms_fixture_source`, `byus_dms_fixture_target`. 기존 RDS의 별도 DB 두 개다. public 앱 표를 만들거나 읽지 않는다.
- fixture schema: `byus_dms_fixture`. owners/records/barriers 세 표만 **explicit** selection한다. `_`를 wildcard로 해석하는 include는 사용하지 않는다. stored generated_fingerprint 한 컬럼은 전송에서 제외하고 같은 식을 가진 target이 계산한다.
- Secrets Manager: `byus/prod/dms-fixture/source-…`, `target-…`의 서로 다른 실제 ARN. JSON은 host/port/username/password만 포함하고 host는 고정 RDS hostname, port5432, username은 해당 전용 LOGIN이다. 비밀번호는 DMS가 제한하는 문자(`;.:+{}*&,%\`)를 피한 충분한 길이의 값으로 root가 준비한다. AWS 관리형 aws/secretsmanager 키를 사용한다.
- source는 fixture SELECT/소유권과 rds_replication만 부여한다. NOINHERIT LOGIN이면 PostgreSQL17 membership의 `INHERIT TRUE`가 해당 rds_replication에 필요할 수 있다. root가 실제 temporary-slot probe로 확인한다. CaptureDdls=false이므로 DMS DDL-trigger 설치는 요청하지 않는다. target에는 root가 `GRANT SET ON PARAMETER session_replication_role`만 부여하고 rds_superuser를 주지 않는다. 앱 역할과 글로벌 parameter group은 바꾸지 않는다.
- 해당 DB의 CONNECT PUBLIC을 제거하고 해당 LOGIN/byus_admin만 연결하도록 root가 준비한다. role 부여가 다른 DB의 ACL을 바꾼다는 의미는 아니다. endpoint DB명·schema·secret LOGIN 검증은 항상 유지한다.
- root가 RDS의 실제 issuer CA **한 개**를 DMS ImportCertificate로 등록한다. global-bundle 전체를 아무 확인 없이 import하지 않는다. source/target은 같은 RDS지만 모두 verify-full과 실제 CertificateArn을 사용한다. endpoint TestConnection 성공 전 task를 만들거나 시작하지 않는다.

config JSON의 필수 키는 `accountId`, `region`, `profile`, `sourceSecretArn`, `targetSecretArn`, `certificateArn` 여섯 개다. 계정/리전/profile은 위 고정 값이어야 한다. 비밀번호·접속 URL·임의 DB명·host·task override는 config에 넣지 않는다. root 실행 시 SecretString을 자식 프로세스 응답에서 메모리로만 검증하며 파일/로그/argv/stdout에 출력하지 않는다. 에이전트 검증에서는 실제 비밀 값을 읽지 않았다.

## root 실행 순서

1. 두 DB/LOGIN/제한 권한·비밀·CA를 준비한다. 각 DB에서 **해당 이름의 owner current_user**로 schema.sql을 한 번 실행한다. source에서만 seed.sql을 실행한다. 비어 있는 target에서는 target-prepare.sql을 실행해 복제 중에만 identity를 BY DEFAULT로 허용한다. fixture SQL은 DB/role과 PG17을 검사하고 기존 schema가 있으면 덮어쓰거나 삭제하지 않는다.
2. `node scripts/aws-dms-fixture.mjs plan --config "$DMS_FIXTURE_CONFIG" --out "$DMS_FIXTURE_OUT"`으로 검토할 endpoint JSON과 CFN parameters.json을 만든다. 기본은 모든 action에서 dry-run이며 AWS CLI조차 부르지 않는다.
3. root가 infrastructure.json을 byus-prod-dms-fixture 스택으로 배포한다. 파라미터는 SourceSecretArn/TargetSecretArn 두 개뿐이다. CAPABILITY_NAMED_IAM이 필요하다. DMS3.6.1/dms.t3.medium/50GB/private/single-AZ이며 VPC·APP subnet 두 개·DB SG는 확인된 실제 리소스 값으로 고정했다. NAT로 AWS API443에 나가며 DB5432는 지정 SG만 허용한다.
4. 스택 완료 뒤 아래 각 action을 root가 실행한다. `--execute`가 없는 같은 명령은 local plan만 만든다.

```sh
node scripts/aws-dms-fixture.mjs create-endpoints --config "$DMS_FIXTURE_CONFIG" --out "$DMS_FIXTURE_OUT" --execute
node scripts/aws-dms-fixture.mjs test-connections --config "$DMS_FIXTURE_CONFIG" --out "$DMS_FIXTURE_OUT" --execute
node scripts/aws-dms-fixture.mjs status --config "$DMS_FIXTURE_CONFIG" --out "$DMS_FIXTURE_OUT" --execute
# 두 endpoint가 successful일 때만 아래가 허용된다.
node scripts/aws-dms-fixture.mjs create-task --config "$DMS_FIXTURE_CONFIG" --out "$DMS_FIXTURE_OUT" --execute
node scripts/aws-dms-fixture.mjs start --config "$DMS_FIXTURE_CONFIG" --out "$DMS_FIXTURE_OUT" --execute
```

기존 endpoint/task를 발견하면 실제 DB·secret·SSL·mapping·핵심 task 설정이 동일한지 검사한다. start는 새 ready task에만 허용하고 resume/reload를 자동 실행하지 않는다. status는 상태·표 통계만 출력하며 provider failure 원문·checkpoint·비밀은 출력하지 않는다. 상태 보기는 진행 진단이며 성공 판정은 아니다.

5. source/target에서 snapshot.sql 결과를 각각 비공개 JSON 파일로 보존한다. initial barrier가 target에 있고 identityDefinition만 source=a/target=d인지 별도로 확인하고 **나머지 양쪽 JSON이 완전히 같아야** 초기 적재가 통과한다. NULL/LOB/enum/UUID/배열/78자리 numeric와 무제한 numeric의 정확한 text 표현·identity값·stored generated 결과가 해시에 포함된다.
6. source에서 cdc.sql을 실행한다. committed insert/update, rollback, 마지막 별도 committed barrier를 포함한다. target의 cdc-complete barrier, rollbackAbsent/foreignKeysValid/generationValid, source identityDefinition=a/target=d를 확인하고 각 표 행 수와 해시를 source와 정확히 비교한다. pending0·readLSN·단순 running 상태로 이 비교를 생략하지 않는다.
7. 위 두 단계가 실제로 통과한 뒤에만 source에서 oversize-lob.sql을 실행한다. 2MiB bytea가 commit되고 실제 task가 실패해야 한다. 실제 failure 원인을 root가 fixture CloudWatch log에서 확인하여 LOB truncation인지 증거를 남긴다. 다른 오류로 실패한 것을 LOB 차단 성공으로 세지 않는다. task가 계속 진행하거나 잘린 데이터가 적용되면 실패다. 중지/실패 상태를 확인한 후 target-finalize.sql로 시퀀스와 GENERATED ALWAYS를 복원하고, 저장한 CDC snapshot과 target의 전체 JSON을 다시 대조한다.

## 설정과 지원 경계

TargetTablePrepMode=DO_NOTHING, MaxFullLoadSubTasks=1, BatchApply=false, parallel load/apply=0, LimitedSizeLobMode=true/LobMaxSize=1024 **KB**(1MiB), FullLobMode=false다. source FailTasksOnLobTruncation=true이고 data/truncation/table/apply 오류는 STOP_TASK, recoverable 재시도는0이다. DDL capture와 target DDL 처리는 껐다. target은 loadUsingCSV=false로 명시적 열 목록 INSERT를 사용한다. GENERATED ALWAYS는 DMS INSERT를 거부하므로 target의 해당 열만 복제 중 BY DEFAULT로 전환하고, 종료 뒤 원래 ALWAYS 정의를 복원한다. source 자동 할당 1001/1002가 target에서 그대로 남아야 한다. DMS가 sequence를 이관한다고 가정하지 않는다.

무제한 numeric은 양쪽 endpoint에서 mapUnboundedNumericAsString=true를 요청하지만, 공식 문서에 기본28,6 및 CDC 정밀도 제한 경고가 있어 통과를 보장하지 않는다. 78자리 고정 numeric과 40자리 정수+20자리 소수를 초기/CDC에서 실증하며 값이 바뀌거나 task가 실패하면 그대로 차단한다. generated 컬럼 제외는 원래 target 계산식을 보존한 특정 컬럼 하나에만 적용하며, NUMERIC/identity/enum 오류를 무시하거나 dummy로 바꾸지 않는다.

## 정리

root가 task를 중지하고 stopped/failed를 확인한 뒤 그 **fixture task 하나와 두 endpoint**를 삭제한다. fixture DB가 만든 slot의 실제 이름·database를 확인해 그 slot만 삭제한다. 고객 slot이나 기존 native guard는 만지지 않는다. 이후 CFN 스택을 삭제하면 private instance/subnet group/SG·RDS 추가 ingress·전용 secret role과 이번에 만든 DMS VPC/log 역할이 삭제된다. dms-vpc-role과 dms-cloudwatch-logs-role은 계정 공용 이름이며 준비 시 존재하지 않음을 확인했다. 다른 DMS 작업이 이를 사용하기 시작했다면 스택 삭제 전에 소유권을 별도 정리한다. 이 스택을 지우기 전에 task/endpoint부터 제거해 참조를 남기지 않는다. 합성 DB/LOGIN/비밀·import CA는 root가 정확한 리소스를 확인한 뒤 정리하고, Mac의 비공개 증거는 보존한다. 임시 instance·NAT·로그 비용은 정리할 때까지 발생한다.

## 검증과 공식 근거

`node --test scripts/aws-dms-fixture.test.mjs infrastructure/aws/database/dms-fixture/sql.test.mjs`와 cfn-lint를 사용한다. 로컬 PG 검사는 합성 SQL의 의미와 크기·권한·거부 조건을 확인한다. 실제 DMS 복제·TLS 연결·2MiB task 실패 결과로 표현하지 않는다.

- [PostgreSQL source 설정·타입/정밀도 제한](https://docs.aws.amazon.com/dms/latest/userguide/CHAP_Source.PostgreSQL.html)
- [PostgreSQL target FK·sequence 및 DO_NOTHING](https://docs.aws.amazon.com/dms/latest/userguide/CHAP_Target.PostgreSQL.html)
- [DMS target metadata 및 LOB 단위](https://docs.aws.amazon.com/dms/latest/userguide/CHAP_Tasks.CustomizingTasks.TaskSettings.TargetMetadata.html)
- [오류별 STOP_TASK 정책](https://docs.aws.amazon.com/dms/latest/userguide/CHAP_Tasks.CustomizingTasks.TaskSettings.ErrorHandling.html)
- [Secrets Manager 인증·regional service principal](https://docs.aws.amazon.com/dms/latest/userguide/security_iam_secretsmanager.html)
- [명시적인 단일 표 선택](https://docs.aws.amazon.com/dms/latest/userguide/CHAP_Tasks.CustomizingTasks.TableMapping.SelectionTransformation.Selections.html)
- [PostgreSQL 버전 지원](https://docs.aws.amazon.com/dms/latest/userguide/CHAP_Introduction.Sources.html)

- [Generated 열의 COPY 오류와 loadUsingCSV=false 공식 해결 방법](https://aws.amazon.com/blogs/database/migrate-generated-columns-to-postgresql-using-aws-database-migration-service/)
