# AWS 플랫폼 배포 계약

이 디렉터리는 기존 리소스를 삭제하거나 DNS를 변경하지 않는 새 CloudFormation 스택이다. 실제 계정·인증서·이미지·시크릿을 지정한 뒤 배포할 수 있으며, 코드 작성이나 로컬 검증이 AWS 배포 완료를 뜻하지 않는다. 기존 Supabase·Privy·Vercel·Lambda는 이 스택의 생성·갱신으로 전환되지 않는다.

## 스택과 순서

| 파일 / kind | 리전 | 단위 | 생성하는 리소스 |
| --- | --- | --- | --- |
| `network.json` / `network` | 서울 `ap-northeast-2` | prod 전용 1개, nonprod 공유 1개 | 2AZ VPC, public/app/isolated DB 서브넷, prod NAT 2개·nonprod NAT 1개, 외부/내부 HTTPS ALB, S3 gateway endpoint |
| `edge-security.json` / `edge-security` | 버지니아 `us-east-1` | dev/staging/prod 각각 | CloudFront용 WAF 공통 관리 규칙·IP 요청량 제한 |
| `environment.json` / `environment` | 서울 `ap-northeast-2` | dev/staging/prod 각각 | ECS/Fargate, 각 환경의 ALB 규칙/대상 그룹, S3 버킷 2개, CloudFront, Cognito, SNS/CloudWatch; RDS/PostgREST 선택 |

계정 ID는 기본값이 없다. 현재 승인된 대상은 모든 환경에서 Sallylab `996702758024`다. `ProductionAccountId`와 `NonproductionAccountId`에 같은 계정을 명시하되 prod와 nonprod VPC/스택 및 환경별 IAM·DB·버킷·시크릿을 분리한다. 배포 CLI는 지정 profile의 STS 실제 계정을 확인하고 다른 계정이면 중단한다. 프로덕션 계정에 기존 서비스가 있다는 이유로 계정 역할을 추정하지 않는다. 직접 `aws cloudformation deploy`를 실행하면 CLI의 계정·네트워크·이미지 검증을 건너뛰므로 아래 스크립트를 사용한다. 계정의 IAM/SCP 통제는 별도 운영 권한 정책이다.

1. 각 계정에 기존 ECR 저장소, 서울 ALB 인증서, `us-east-1` CloudFront 인증서, 실행 설정 JSON 시크릿을 확보한다. 도메인 검증·DNS 소유권 확인은 먼저 끝낸다.
2. 읽기 전용 inventory에서 실제 VPC·ALB·ECR·RDS·인증서·hosted zone·CloudFront origin-facing managed prefix list ID를 확인한다. 시크릿 본문·사용자·객체 목록은 조회하지 않는다.
3. `network`를 해당 계정 서울에 한 번 배포한다. prod 네트워크와 nonprod 네트워크는 서로 다른 스택/VPC다. dev·staging은 같은 `NetworkStackName`을 사용한다.
4. 환경별 `edge-security`를 같은 계정 `us-east-1`에 배포하고 `WebAclArn` 출력을 환경 설정으로 전달한다. 리전 간 CloudFormation export를 사용하지 않는다.
5. `environment`를 서울에 배포한다. dev·staging의 `ListenerPriority`는 각각 달라야 한다. 초기 `EnableDatabase=false`, `EnablePostgrest=false`를 유지한다.
6. 출력한 origin ALB DNS, 내부 ALB DNS, CloudFront DNS를 확인한 뒤 DNS 레코드를 별도 작업으로 준비한다. 현재 운영 웹 도메인의 DNS를 바꾸는 단계는 포함하지 않는다. origin DNS가 먼저 ALB를 가리켜야 CloudFront 경유 요청이 성공한다.

네트워크에는 기존 ECR이나 ACM을 새로 만들거나 인증서를 발급하는 기능이 없다. 세 환경과 prod/nonprod 역할은 설정값과 배포 전 STS 확인으로 명시한다.

## 설정 파일

자격 증명 값을 저장소나 CLI 인수에 쓰지 않는다. 구성 파일은 `work/` 등 로컬 작업 경로에 만들고, 실제 식별자를 사용한다. 아래는 형식 설명이며 가짜 운영 설정 파일은 제공하지 않는다.

| 최상위 키 | 내용 |
| --- | --- |
| `kind` | `network`, `edge-security`, `environment` 중 하나 |
| `environment` | `dev`, `staging`, `prod` 중 하나. 공유 nonprod network는 dev 또는 staging을 지정 |
| `region` | network/environment: `ap-northeast-2`; edge-security: `us-east-1` |
| `accountId` | 실제 대상 12자리 계정 ID |
| `profile` | 해당 계정의 기존 AWS CLI profile. 기본 profile 추론 없음 |
| `stackName` | 명시적 새 스택명 |
| `parameters` | 아래 CloudFormation 파라미터 이름→문자열/숫자 객체. 리스트는 쉼표로 구분한 문자열 |
| `runtimeEnvironment` | environment 전용. 아래 허용한 공개 설정만 문자열로 지정 |
| `runtimeSecretKeys` | environment 전용. 기존 runtime JSON 시크릿에서 ECS에 주입할 키 이름 배열. 기본 필수 키 3개를 포함하고 필요한 기존 앱 키를 추가 |

모든 템플릿에는 `ProductionAccountId`, `NonproductionAccountId`가 필요하다. 나머지 파라미터의 정확한 형식·기본값은 각 JSON의 `Parameters`가 기준이다. 알 수 없는 파라미터와 설정 키는 렌더 단계에서 거절한다.

| kind | 필수 추가 파라미터 | 선택 파라미터 |
| --- | --- | --- |
| network | `NetworkTier` (`prod`/`nonprod`), `AlbCertificateArn`, `CloudFrontPrefixListId` | `VpcCidr` (기본 `10.40.0.0/16`, 필요하면 별도 사설 대역 지정) |
| edge-security | `Environment` | 없음 |
| environment | `Environment`, `NetworkStackName`, `WebImageUri`, `WebDomainName`, `OriginDomainName`, `InternalApiDomainName`, `CloudFrontCertificateArn`, `WebAclArn`, `RuntimeConfigSecretArn`, `ListenerPriority`, `WebCallbackUrls`, `WebLogoutUrls`, `MobileCallbackUrls`, `MobileLogoutUrls` | `WebDomainAliases`, `EnableDatabase`, `EnablePostgrest`, `PostgrestImageUri`, `PostgrestSecretArn`, `PostgresEngineVersion`, `SecretKmsKeyArn`, `AlarmEmail`, `Route53HostedZoneId` |

`WebImageUri`와 활성화한 `PostgrestImageUri`는 대상 계정의 서울 ECR `repository@sha256:64자리해시`가 필수다. `latest`나 변경 가능한 태그를 받지 않는다. x86_64 Linux 이미지여야 하며 컨테이너 UID/GID `1001:1001`로 실행할 수 있어야 한다. ECR/시크릿 메타데이터의 존재는 `validate --aws`와 `deploy --execute`가 읽기 전용으로 확인한다. 시크릿 내용·키 존재·실제 x86 아키텍처는 이 메타데이터 검증만으로 보장되지 않으므로 이미지 CI와 스테이징 부팅 검증이 필요하다.

`AlbCertificateArn`은 **서울** 인증서이며 각 환경의 `OriginDomainName`과 `InternalApiDomainName`을 포함해야 한다. 공유 nonprod ALB에는 dev·staging의 이름을 모두 포함하는 기존 인증서를 지정한다. `CloudFrontCertificateArn`은 **us-east-1**의 발급 완료(ISSUED) 인증서이며 실제 viewer 도메인 전체를 포함해야 한다. `WebDomainAliases`는 선택적인 쉼표 구분 목록이다. 미지정·빈 문자열이면 기존 `WebDomainName` 하나를 사용한다. 지정하면 canonical `WebDomainName`을 포함하고, 소문자 DNS 이름만 중복 없이 입력한다. 주소 scheme·경로·포트·wildcard·빈 항목은 거부한다. 운영의 네 도메인은 `WebDomainName=kyaa.io`, `WebDomainAliases=kyaa.io,www.kyaa.io,byus.kr,www.byus.kr`로 지정한다. `--aws` 검증은 us-east-1에서 인증서를 조회하고 모든 별칭의 SAN coverage를 확인하며, wildcard는 한 단계 하위 이름만 인정한다. CI release role bootstrap에도 해당 환경의 실제 `CloudFrontCertificateArn`을 전달한다. IAM은 이 인증서 하나의 `acm:DescribeCertificate`만 허용한다. 세 도메인은 서로 달라야 한다. environment 스택 이름은 CloudFront 리소스 이름 제한에 맞춰 최대 48자다. 웹 별칭과 origin/internal API 도메인도 겹치지 않아야 한다. 공개 origin은 외부 ALB, 내부 API 이름은 VPC에서 해석되는 private hosted zone의 내부 ALB 주소를 가리킨다. Route53 파라미터는 출력용이며 레코드를 생성하지 않는다.

## 명령

```sh
# 기본 동작: 로컬 렌더와 배포 명령 출력. AWS 호출/리소스 변경 없음.
node scripts/aws-platform-deploy.mjs --config "$PLATFORM_CONFIG"
node scripts/aws-platform-deploy.mjs plan --config "$PLATFORM_CONFIG" --out "$PLATFORM_OUTPUT"

# 로컬 검사: 별도 설치한 cfn-lint 경로를 지정할 수 있다.
node scripts/aws-platform-deploy.mjs validate --config "$PLATFORM_CONFIG" --cfn-lint "$CFN_LINT"

# STS/CloudFormation/연결 리소스 메타데이터만 읽는 검증
node scripts/aws-platform-deploy.mjs validate --config "$PLATFORM_CONFIG" --aws

# profile/계정/환경을 같은 설정에서 읽는다. 출력에는 자격 증명 본문이 없다.
node scripts/aws-platform-deploy.mjs inventory --config "$PLATFORM_CONFIG"

# --execute가 없으면 plan과 같은 출력만 한다.
node scripts/aws-platform-deploy.mjs deploy --config "$PLATFORM_CONFIG"
# 아래 명령만 실제 생성/갱신. 배포 종료 결과까지 기다리고 실패 시 nonzero 반환.
node scripts/aws-platform-deploy.mjs deploy --config "$PLATFORM_CONFIG" --execute

node --test scripts/aws-platform-deploy.test.mjs
cfn-lint infrastructure/aws/platform/network.json infrastructure/aws/platform/environment.json infrastructure/aws/platform/edge-security.json
```

`$PLATFORM_CONFIG` 등은 호출자가 준비한 실제 로컬 파일/실행 경로를 뜻한다. 렌더 결과는 기본 `work/aws-platform/<stackName>/`에 쓰고 파일 권한을 새 파일 기준 `0600`으로 설정한다. 템플릿은 AWS inline 51,200바이트 제한 이내로 압축한다. 파라미터 JSON에는 자격 증명 **값**이 없어야 한다. 기본 plan은 파일 생성만 하고 STS까지 호출하지 않으므로 실제 계정 접근 확인은 `--aws` 또는 `--execute`로 구분한다. inventory는 동일한 완성 구성으로 실행하는 읽기 전용 진단이다.

`cfn-lint` 메타데이터 제외는 `W6001`(네트워크 출력의 의도한 재출력), `W1030`(비활성 PostgREST의 빈 선택 ARN을 IAM 스키마가 분기 없이 검사) 두 경고다. 활성 분기의 ARN은 CloudFormation Rules·파라미터 정규식·CLI·계약 테스트로 확인한다. 다른 오류와 경고를 무시하지 않는다.

## 런타임 연결

web 컨테이너는 `HOSTING_PROVIDER=aws`, `APP_ENV=<환경>`, `APP_URL=https://<WebDomainName>`, `PORT=3000`, `HOSTNAME=0.0.0.0`, `NODE_ENV=production`을 받는다. AWS에서는 공개 설정을 이미지 빌드에 넣지 않고 실행 시 지정한다. `LEGACY_DOMAIN_REDIRECT_STATUS`는 기존 proxy 계약의 `307`·`308`만 공개 runtime 값으로 허용한다. 비활성화는 이 변수를 생략하며 문자열 `disabled`를 넣지 않는다. 운영 source의 기존 byus.kr 리다이렉트는 `308`로 유지한다. 별칭을 추가해도 `APP_URL`은 canonical `WebDomainName`으로 유지하며, OAuth callback·cookie·인증의 origin 정책은 앱의 기존 계약을 따른다.

`runtimeEnvironment` 필수 키는 `PRIVY_APP_ID`, `PRIVY_APP_ENVIRONMENT` (`development`/`production`), `BYUS_DATA_ENVIRONMENT` (`development`/`production`)다. dev·staging은 development, prod는 production으로 검증한다. 나머지 공개 허용 키는 다음과 같다.

- `PRIVY_APPLE_LOGIN_ENABLED`, `PRIVY_TEST_ACCOUNT_LOGIN_ENABLED`, `WEB_PUSH_VAPID_PUBLIC_KEY`
- `GIWA_CHAIN_ID`, `GIWA_RPC_URL`, `GIWA_EXPLORER_URL`, `BYUS_PASSPORT_CONTRACT_ADDRESS`, `BYUS_STAMP_CONTRACT_ADDRESS`, `BYUS_RELAYER_ADDRESS`
- `KAKAO_OAUTH_MODE`, `KAKAO_CLIENT_ID`, `KAKAO_REDIRECT_URI`, `KAKAO_ALIMTALK_ENROLLMENT_ENABLED`, `PHONE_SMS_ENROLLMENT_MODE`, `PHONE_SMS_SENDER`, `CHZZK_LIVE_ENABLED`
- `POSTGREST_URL` (활성화 시 `http://127.0.0.1:3001` 고정)

현재 web 환경 검사에서 요구하는 GIWA·계약주소 등도 실제 설정으로 제공해야 한다. 플랫폼 스크립트는 주소·RPC·OAuth 공급자 값을 추측하지 않고, 기존 앱 검증을 대체하지 않는다. `NEXT_PUBLIC_*`, AWS 정적 액세스 키, 임의 환경 변수, 공개 map의 비밀 값 주입을 허용하지 않는다.

`RuntimeConfigSecretArn`은 기존 JSON 시크릿을 참조한다. 필수 `runtimeSecretKeys`는 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PRIVY_APP_SECRET`이며 필요한 기존 선택 키(예: 이메일·SMS·Kakao·Telegram 자격 증명)는 이름만 추가한다. ECS는 `secretArn:JSON_KEY::`로 각 키를 주입한다. `POSTGREST_SERVICE_TOKEN`은 PostgREST 활성화 때 추가해야 한다. 기존 Google/Apple/Privy 자격 증명은 호출자가 제공하는 기존 시크릿·설정을 그대로 사용하며 새 값을 만들지 않는다. Cognito Google/Apple identity provider의 미확인 매핑·자격 증명은 이 템플릿에 자동 생성하지 않는다.

IAM execution role은 해당 ECR 저장소 pull, 해당 로그 그룹 쓰기, 참조한 runtime/PostgREST 시크릿 읽기만 허용한다. ECR 인증 토큰만 AWS API 요구에 따라 `Resource=*`다. task role에는 자기 환경 assets/proofs 버킷 객체와 bucket list 권한만 있고 시크릿 전체 조회 권한이나 정적 AWS 키를 주지 않는다. 기존 시크릿이 고객 관리 KMS 키를 사용하면 그 키를 `SecretKmsKeyArn`으로 명시하고 키 정책도 execution role을 허용해야 한다. 두 시크릿은 같은 지정 CMK 또는 AWS 기본 키를 사용해야 한다. 다른 CMK를 임의로 넓혀 허용하지 않는다.

실행 역할은 시크릿을 부팅 시 주입한다. 시크릿 회전 뒤에는 새 ECS 태스크 배포가 필요하다. `SecretString`/RDS master password를 CloudFormation 파라미터나 로그에 넣지 않는다.

## 헬스체크·네트워크

| 경로/포트 | 용도 | 접근 |
| --- | --- | --- |
| web `3000` `/api/health/live` | 프로세스 생존, 외부 DB의 일시 장애가 태스크 전체 교체를 유발하지 않음 | 외부 ALB SG만 task SG로 진입 |
| web `/api/health/ready` | 읽기 전용 DB 준비 상태 | 실제 배포 검증에서 따로 확인 |
| PostgREST `3001` | REST API | web는 같은 태스크 localhost; worker는 VPC 내부 ALB의 HTTPS hostname |
| PostgREST admin `3002` `/ready` | 내부 ALB의 DB 준비 상태 확인 | 내부 ALB SG만 접근 |
| RDS `5432` | PostgreSQL TLS (`rds.force_ssl=1`) | 해당 환경 task SG만 기본 허용 |

외부 ALB는 CloudFront origin-facing managed prefix list의 443만 받는다. ALB의 이름별 규칙은 `OriginDomainName`만 라우팅하며, 알 수 없는 이름은 404를 반환한다. 환경별로 자동 생성한 48자 Secrets Manager 시크릿을 CloudFront의 `X-Byus-Origin-Verify` custom header와 ALB listener 조건이 함께 참조한다. ALB는 올바른 host와 비밀 header를 모두 확인해 다른 고객의 CloudFront를 통한 origin 우회를 막는다. 값은 설정 파일이나 출력에 남기지 않는다. AWS의 distribution/rule 설정 조회 권한을 가진 운영자는 실제 header를 볼 수 있으므로 그 권한도 제한한다. 이 시크릿은 Retain이며 CloudFormation 배포 권한에 생성·조회 권한이 필요하다. 회전 시에는 CloudFront와 ALB의 새 값 수용 순서를 별도 검증한다. 내부 ALB는 VPC CIDR의 443만 받고, public IP 없는 app 서브넷의 태스크에 전달한다. ECS awsvpc 모드에서 web·sidecar는 같은 ENI/SG를 공유하므로 컨테이너별 SG가 아니라 **포트별 출발 SG 제한**으로 분리한다. worker를 연결하려면 VPC 서브넷/보안 그룹을 따로 구성하고 내부 DNS를 사용할 수 있어야 한다. 기존 Lambda를 자동으로 VPC에 넣지 않는다.

prod 서비스는 1vCPU/2GiB 태스크 2개를 2AZ에 분산하고 minHealthy 100%, max 200%, 자동 rollback circuit breaker를 사용한다. dev·staging은 각 0.5vCPU/1GiB 태스크 1개다. nonprod NAT 1개 장애 시 dev·staging 외부 통신이 동시에 끊길 수 있으며 교차 AZ NAT 통신 비용도 발생한다. DB 서브넷에는 인터넷/NAT 기본 경로가 없다.

## CloudFront·스토리지

동적 요청은 TTL min/default/max를 모두 0으로 지정하고 모든 메서드·쿠키·쿼리·Authorization을 origin으로 전달한다. `Host`만 origin 도메인으로 재작성해 서울 ALB 인증서와 맞춘다. `APP_URL`이 브라우저의 정식 도메인이며 서버 절대 URL·쿠키·OAuth 콜백은 이 값을 사용해야 한다. Next 서버 액션을 사용한다면 browser origin과 origin host 차이도 앱 설정에서 검증해야 한다. viewer-request CloudFront Function은 클라이언트가 넣은 `X-Forwarded-Host`를 실제 viewer `Host`로 덮어쓴다. 앱이 서버 액션의 browser origin을 확인할 수 있게 하되 위조된 전달 헤더는 신뢰하지 않는다.

1년 캐시 경로는 `/_next/static/*`와 `/public-assets/immutable/*`뿐이다. HTML·API·`/_next/image`·그 외 `/public-assets/*`는 저장하지 않는다. CloudFront 오류 응답 캐시 TTL도 0이다. 공개 assets 버킷도 S3 public access를 전부 차단하고 OAC 배포 ARN을 제한해 `public-assets/*` 객체만 읽게 한다. `public-assets/immutable/`에는 이름에 콘텐츠 해시를 넣은 변경하지 않는 객체만 업로드해야 한다. 나머지 키나 private proofs 버킷은 CloudFront origin으로 공개하지 않는다. 두 버킷 모두 암호화·버전 관리·TLS 강제·삭제 시 Retain을 적용한다. 앱의 기존 업로드/다운로드 URL은 이 스택을 생성해도 자동 전환되지 않는다.

정책 근거: AWS [origin request policy](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/origin-request-understand-origin-request-policy.html), [관리형 모든 viewer header 전달 정책](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-origin-request-policies.html). 쿠키·인증 전달과 캐시를 분리해 로그인 응답을 공유 캐시에 저장하지 않는다.

## RDS·Cognito·후속 전환

`EnableDatabase=true`이면 PostgreSQL 17을 생성한다. 운영은 `db.t4g.medium`, Multi-AZ standby, gp3 50GB(최대 200GB 자동 증설), 암호화, 14일 PITR, 삭제 보호다. nonprod는 각 `db.t4g.small`, Single-AZ, 20GB(최대 100GB), 7일 PITR이다. logical replication을 위해 `rds.logical_replication=1`, replication slots/wal senders 각 10, logical workers 4, worker processes 8을 설정한다. 이 항목들은 RDS PG17의 static 파라미터이므로 기존 인스턴스에 적용하면 재부팅이 필요하고, 새 생성에서는 최초 기동에 적용한다. 실제 워커 여유·메모리·이관 부하는 별도 rehearsal로 확인한다. 오류 파라미터 로깅 길이는 0이다. minor는 AWS 기본 17 계열 또는 명시한 `17.x`를 사용하고 자동 minor 업그레이드만 허용한다. RDS 관리 master secret ARN만 출력한다. 앱에는 master secret을 주지 않으며, 최소 권한 DB role·스키마·데이터·JWT를 준비한 뒤 별도 PostgREST 시크릿을 제공한다. DB의 삭제/교체는 Snapshot을 남긴다. prod 삭제 보호를 끄는 것은 별도 명시적인 운영 변경이다.

[PostgREST admin server 공식 계약](https://docs.postgrest.org/en/stable/references/admin_server.html)의 별도 `/ready` 경로를 사용한다. `EnablePostgrest=true`는 RDS 생성과 독립적이다. 기존에 준비한 private PostgreSQL에 붙일 수도 있지만 DB URI는 검증된 TLS 연결이어야 한다. 별도 JSON 시크릿의 키는 `PGRST_DB_URI`, `PGRST_JWT_SECRET`, `PGRST_DB_SCHEMAS`, `PGRST_DB_ANON_ROLE`다. 일반 앱이 DB superuser를 사용하지 않도록 역할·RPC·JWT 권한은 DB 이관 단계에서 준비해야 한다. 플랫폼은 데이터 이관, replication, writer fence, cutover, 기존 JWT 호환을 구현하거나 성공으로 간주하지 않는다. DB 전환은 root의 별도 실행 절차를 따른다.

Cognito는 환경마다 새 pool·secret 없는 web/mobile client·hosted login domain을 생성한다. 클라이언트는 authorization code flow만 허용하며 앱은 PKCE S256을 사용해야 한다. 이 생성만으로 로그인 제공자·기존 계정·지갑을 옮기지 않는다. 기존 Google/Apple 공급자와 사용자의 Privy 지갑을 유지하며, Cognito provider 설정·이메일 발송·앱 PKCE 연결·계정 linking 검증은 인증 이관 단계의 선행 조건이다. 실제 콜백과 로그아웃 URL을 입력하고 로그인 전환 전 그 URL을 검증한다.

SNS email 구독은 선택이며 수신자가 확인해야 활성화된다. CloudWatch는 ECS CPU/메모리, ALB healthy count/5xx, 선택 DB CPU/남은 저장 공간을 감시한다. healthy count 데이터가 없을 때도 경보를 발생시킨다. WAF 공통 규칙과 rate limit은 새 환경의 실제 업로드·OAuth·봇 패턴으로 확인한 뒤 운영 유입을 전환해야 한다. 경보 생성과 실제 알림 수신 성공은 별도 검증이다.

PostgREST 이미지는 `Dockerfile.postgrest.aws`와 `buildspec-postgrest.yml`로 별도 생성하고 ECR digest로 고정한다. 공식 PostgREST 14.18 이미지와 AWS 공개 RDS CA bundle을 포함하며 UID 1001로 실행한다. `PGRST_DB_URI`에는 `sslmode=verify-full&sslrootcert=/etc/ssl/certs/rds-ca-bundle.crt`를 지정한다. CA 원본은 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem 이며, 인증서를 갱신할 때 AWS 원문·해시·실제 TLS 연결을 다시 확인한다.
