# dev·staging 운영시간

`nonprod-hours.json`은 별도 선택 스택이다. 기존 scheduled-workers는 업무 작업만 예약하며 ECS/RDS 가동시간 예약은 없었다. 이 스택의 기본값은 모든 예약 비활성이다. `Environment`는 dev·staging만 허용하고, production은 입력할 수 없다.

계정은 Sallylab 996702758024, 리전은 서울로 검증한다. 실제 `ClusterName`·`ServiceName`을 입력하며 IAM은 이 두 이름으로 만든 정확한 ECS service ARN만 UpdateService 할 수 있다. RDS는 `EnableDatabaseSchedules=true`일 때 명시한 `DatabaseInstanceIdentifier` 하나만 StartDBInstance/StopDBInstance할 수 있다. 두 자원 모두 `Environment=<dev 또는 staging>` 태그 조건을 충족해야 한다. 태그가 없거나 prod이면 거부된다. 환경 스택은 Service/Database에 이 태그를 붙인다. 관리자가 생산 자원을 비운영 태그로 잘못 바꾸면 이 보호가 약화되므로 실제 대상 ARN과 태그를 활성화 전에 확인한다.

`EnableSchedules=true`로 켜면 Asia/Seoul 평일에 다음 API 작업을 수행한다.

| 시각 | 작업 |
| --- | --- |
| 08:45 | RDS 시작(옵션) |
| 09:00 | ECS desiredCount=1 |
| 19:00 | ECS desiredCount=0 |
| 19:15 | RDS 정지(옵션) |

DB를 15분 먼저 시작하지만 ready 상태를 기다리는 오케스트레이터는 아니다. RDS 시작이 오래 걸리면 09시 웹 DB 요청이 일시 실패할 수 있다. 운영 활성화 전에 실제 시작 시간을 확인한다. API 실패는 최대 15분 동안 재시도하며, 그 뒤 암호화한 DLQ에 14일 보관한다. `AlarmTopicArn`에 기존 운영 SNS ARN을 연결하면 DLQ 발생을 알린다. 비워 두면 CloudWatch alarm만 생성되므로 별도 관찰이 필요하다. API 호출 성공은 DB ready나 웹 건강 상태를 보장하지 않는다.

22영업일 기준 웹은 약 220시간, DB는 준비·종료 여유를 포함해 약 231시간이다. 실제 월별 평일 수와 장애·수동 시작·배포에 따라 달라진다. 220시간은 비용 추정이며 강제 사용량 한도가 아니다. 이 스택은 워커나 외부 작업을 중지하지 않는다. 비운영 DB를 사용하는 예약 워커가 운영시간 밖에 실행되지 않도록 기존 워커 스케줄과 함께 맞춰야 한다.

NAT Gateway, 외부·내부 ALB, IPv4 주소, RDS/S3 저장공간·백업 및 보관 로그는 계속 존재하며 24시간 요금이 발생할 수 있다. ECS/RDS를 정지해도 이 비용이 사라지지 않는다. RDS는 정지 상태를 최대 7일 유지하고 자동 재시작하므로 장기 휴무에는 다시 시작된 상태와 비용을 확인한다. 스케줄을 비활성화하거나 스택을 삭제해도 현재 자원 상태를 자동으로 복구하거나 정지하지 않는다. 환경 스택 배포가 ECS desiredCount=1을 다시 설정하거나 다른 자동 확장이 설정되면 예약 시간 밖에도 가동할 수 있다.

검증은 `node --test infrastructure/aws/platform/nonprod-hours.test.mjs`와 cfn-lint, AWS 읽기 전용 ValidateTemplate으로 수행한다. 스택 생성·태그 변경·실제 시작/정지 동작은 별도 승인 실행이며 로컬 테스트로 완료했다고 보지 않는다.
