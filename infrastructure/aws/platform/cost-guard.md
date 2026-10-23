# 비용 확인과 단계별 기동

월 50만~100만 원은 사용자 목표이며 이 구성의 확정 견적이 아니다. 서울·us-east-1의 실제 단가, 트래픽, 환율, 부가세를 넣어 AWS Pricing Calculator에서 확인한 뒤 유입을 전환한다. 계정 분리로 생기는 비용을 각각 확인하고 합산한다. 이 문서는 계산 항목과 수량을 빠뜨리지 않기 위한 기준이며, 예산을 넘으면 서비스를 임의 축소하거나 운영 리소스를 삭제하지 않는다.

## 기본 구성의 수량

| 항목 | prod | dev+staging | 합계/추가 과금 |
| --- | --- | --- | --- |
| ECS Fargate x86 Linux | 1vCPU/2GiB × 2태스크 | 0.5vCPU/1GiB × 환경당 1태스크 | 상시 3vCPU/6GiB, 4태스크. rolling update 때 각각 최대 2배 |
| NAT gateway | AZ별 2개 | 공유 1개 | 3개 × 시간 + 처리 GB + nonprod 교차 AZ 통신 |
| 외부 ALB | 1개 | 공유 1개 | 2개 × 시간 + 각각 LCU |
| 내부 ALB | 1개 | 공유 1개 | 2개 × 시간 + 각각 LCU. PostgREST 비활성 상태에서도 네트워크 스택에 존재 |
| 공인 IPv4 | NAT 2개 + 외부 ALB 최소 2개 | NAT 1개 + 외부 ALB 최소 2개 | 최소 7개 주소 × 시간. ALB 확장·기존 리소스에 따라 더 많음 |
| CloudFront | 배포 1개 | 배포 2개 | HTTPS 요청·지역별 전송 GB·무효화·viewer-request Function 실행. 동적 응답 TTL 0이므로 origin 요청량도 계산 |
| WAF | WebACL 1개 | WebACL 2개 | ACL/규칙·처리 요청 수. 관리형 규칙별 별도 과금 여부 확인 |
| S3 | assets/proofs 각 1개 | 환경마다 각 1개 | 총 6버킷의 실제 GB·요청·전송·버전. 업로드 객체와 이전 버전을 함께 계산 |
| Cognito | pool 1개 | pool 2개 | MAU, 실제 tier, 이메일/SMS 인증 비용. 기존 Privy 비용은 별도 유지 |
| CloudWatch/SNS | 각 환경 | 각 환경 | Container Insights, 로그 수집·보관, 지표/경보, 이메일/알림 요청 |
| Secrets Manager/KMS/ECR | 참조/사용하는 실제 수량 | 참조/사용하는 실제 수량 | 환경별 origin 검증 시크릿을 포함한 시크릿 수/읽기·CMK·이미지 저장/스캔. 기존 시크릿도 전체 운영비에 합산 |
| Route53/ACM | 기존 계정 리소스 | 기존 계정 리소스 | public/private zone·질의·선택 인증서 비용. 무료라고 일괄 가정하지 않음 |

Fargate 임시 디스크는 기본 20GiB를 사용한다. 현재 추가 디스크·Spot·서비스 자동 증설·정적 용량 예약은 설정하지 않았다. 예상 순서는 **필수 기본 구성 + 실사용 처리량 + 선택 DB + 기존 병행 비용 + 세금**이다. NAT 처리량에 ECR pull·외부 API·Supabase 접속이 포함되고, S3 gateway endpoint를 통한 서울 S3 통신은 별도로 구분한다. 일부 CloudFront origin 전송 비용이 면제되더라도 모든 외부/교차 AZ 전송을 무료로 계산하지 않는다.

## RDS를 켤 때 추가되는 비용

기본 `EnableDatabase=false`이므로 RDS 비용은 없다. RDS를 세 환경에 모두 생성하면 다음을 추가한다.

- prod: `db.t4g.medium` Multi-AZ primary/standby 인스턴스 시간, gp3 50GB의 Multi-AZ 요율, 14일 PITR·초과 백업·스냅샷·전송 비용. T 계열 burst credit 비용도 확인한다.
- dev/staging: 환경마다 `db.t4g.small` Single-AZ 시간, gp3 20GB, 7일 PITR·백업·스냅샷.
- 스토리지 자동 증설 상한은 prod 200GB, dev/staging 각각 100GB이다. 자동 축소는 없고 증설 뒤 비용이 계속 발생한다. prod Multi-AZ의 요율을 단일 인스턴스 저장 용량 가격으로 계산하지 않는다.
- PostgREST sidecar는 같은 Fargate task 예산을 나눠 사용한다. 별도 무료 컴퓨트가 생기는 것이 아니며 부하에 따라 기존 1vCPU/2GiB 한계를 검증한다. 내부 ALB 비용은 sidecar가 꺼져도 이미 발생한다.

## 전환 전 확인

1. 계정별 Cost Explorer/Cost and Usage의 기존 Lambda·SES·S3·KMS·ECR·IPv4 비용과 현재 Supabase·Vercel·Privy 비용을 함께 적는다. 이전 서비스를 종료하기 전 병행 기간을 별도 계산한다.
2. AWS Budgets 또는 기존 비용 경보를 계정별로 설정하고 실제 수신을 확인한다. 이 템플릿은 청구 예산 리소스나 자동 중지 동작을 만들지 않는다. CloudWatch의 서비스 장애 경보는 청구 예산 경보를 대신하지 않는다.
3. 시간 단가를 월 기준 시간(예: 730시간)에 곱하고 예상 GB/요청/LCU/MAU를 추가한다. 실제 월 길이·일시 배포 surge·VAT·환율을 조정한다. us-east-1 WAF/ACM 항목도 누락하지 않는다.
4. 초기에는 RDS/PostgREST를 끄고 Supabase를 유지한다. 스테이징에서 자원·DB·스토리지 전환을 각각 확인한다. 비용 절감을 이유로 prod 2AZ/NAT2/Multi-AZ·암호화·백업을 임의로 제거하지 않는다.
5. 스택을 지워도 Retain S3·Cognito·로그·origin 검증 시크릿과 DB 최종 스냅샷은 남는다. 남은 저장소 비용을 확인하고, 실제 보존 데이터의 삭제는 별도 승인·보존 정책으로 처리한다.

이 문서에는 확인하지 않은 월 비용이나 절감률을 확정값으로 적지 않는다. 실제 견적과 계정 청구 검증은 배포 전 입력이 준비된 후 남는 작업이다.
