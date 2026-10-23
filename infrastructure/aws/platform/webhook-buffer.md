# 웹훅 보관과 재생

`webhook-buffer.json`은 서울 Sallylab 계정의 환경별 FIFO 큐와 DLQ, 버전 관리된 비공개 S3, KMS 키 및 전용 DB 재생 Lambda를 구성한다. `EnableReplay=false`가 기본이며 웹의 `WEBHOOK_BUFFER_ENABLED`도 별도로 명시해야 한다. 스택 생성만으로 앱이나 DB 쓰기를 켜지 않는다.

환경 스택의 `WebhookBufferStackName`에 이 스택 이름을 입력하면 기존 ECS TaskRole에 해당 큐 SendMessage, 해당 환경 envelope/receipt 쓰기와 receipt 읽기만 추가된다. 웹 runtime에는 outputs의 `QueueUrl`, `BucketName`, `KmsKeyArn`을 각각 `WEBHOOK_BUFFER_QUEUE_URL`, `WEBHOOK_BUFFER_BUCKET`, `WEBHOOK_BUFFER_KMS_KEY_ID`로 주입한다. `APP_ENV`가 환경과 같아야 한다. Instagram 키 일치 검증용 `WEBHOOK_BUFFER_INSTAGRAM_SECRET_SHA256`는 기존 키의 실제 SHA256를 생산자에만 설정한다.

Lambda 코드는 별도 검증된 ZIP을 버전 관리된 CodeBucket/CodeKey/CodeObjectVersion으로 공급한다. 실제 entry `apps/web/server/webhook-intake/consumer.ts`를 Node24 CJS `index.handler`로 번들하고 AWS SDK S3/SecretsManager는 포함한다. `pg@8.23.1`은 external로 두고 ZIP root의 node_modules에 실제 의존성을 포함한다. root에 package.json과 공식 RDS global-bundle.pem도 필요하다. 이 템플릿은 ZIP을 만들거나 검증되지 않은 코드를 업로드하지 않는다.

`DatabaseSecretSuffix`에는 실제 ARN의 `byus/<환경>/webhook-replay-` 뒤 부분(마지막 6자리 ARN suffix 포함)을 입력한다. 계정·리전·환경은 스택이 직접 조합하므로 다른 환경 비밀을 전달할 수 없다. JSON은 host, port=5432, database, username=byus_webhook_replay, password로 구성한다. DB LOGIN 역할은 NOLOGIN `webhook_replay_executor`만 상속하고 직접 표 권한을 갖지 않는다. AWS 관리형 Secrets Manager 키를 사용한다. 별도 고객 관리 비밀 키를 사용할 때는 해당 키의 최소 decrypt 권한을 따로 검토해야 한다. private subnet 두 개를 전달하고 S3/Secrets Manager 접근에 필요한 기존 NAT 또는 VPC endpoints를 확인한다. Lambda DB 연결은 전용 SG에서 RDS 5432만 허용한다.

재생은 DB 원본 fence, target write-enable, 모든 writer 배포 revision 확인을 마친 뒤 승인된 cutover 도구에서만 활성화한다. 기본 disabled mapping은 배포 도중 fence된 DB를 두드리지 않는다. FIFO 배치 1, 부분 실패 응답, DB inbox 중복 제거로 재시도를 처리한다. Lambda 30초에 큐 visibility 180초이며 다섯 번 실패하면 DLQ로 이동한다. DLQ CloudWatch alarm을 운영 알림에 연결하고, 원인을 확인한 후 수동 redrive한다. 큐와 DLQ는 14일 보관하며 S3 current/noncurrent 객체에는 자동 만료를 적용하지 않는다. 소비자는 envelope 삭제 권한이 없다. 큐 보관 기한을 넘긴 미처리 이벤트도 S3 원본에서 복구할 수 있도록 처리 결과와 보관 객체를 함께 관리한다.

KMS·버킷은 Retain이며 스택 삭제가 보관 자료를 없애지 않는다. S3 versioning, 요청별 SSE-KMS, TLS deny와 block-public-access가 적용된다. 생산자와 소비자 권한은 경로로 분리하며 소비자는 DB commit 후 receipt만 기록한다. 인프라 배포·장애 복구·실제 클라우드 연결은 로컬 검사로 입증되지 않는다.

Cognito 두 pool은 기본 COGNITO_DEFAULT 메일 발송이다. SES 운영 발송 승인과 identity 검증 뒤 환경 스택에 `CognitoSesIdentityArn`(서울)과 `CognitoSesFromEmail`을 함께 명시하면 DEVELOPER 발송으로 전환한다. 이 설정 자체가 SES sandbox 해제나 도메인 검증을 수행하지 않는다.
