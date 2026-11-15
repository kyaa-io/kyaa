# SNS 수집 배포 경로 인계

S3 업로드 방식을 선택했다. 비밀 JSON 전체를 앱에 전달하는 방식은 앱의 설정 해석과 비밀 노출 범위까지 바꾸므로 제외했다. 기존 ECS 키별 주입, 비밀 이름·값, DEV 기본 명령은 유지한다.

설정에 선택 항목 `templateBucket`을 추가했다. 51,200바이트를 넘는 템플릿은 검증 전에 S3에 올리고 TemplateURL로 검증한다. 배포는 기존 AWS CLI deploy에 `--s3-bucket`과 환경별 prefix를 전달해 CLI의 대용량 TemplateURL 경로를 사용한다. S3 템플릿 한도 1MiB는 유지한다. 작은 템플릿은 기존 인라인 검증을 사용한다. plan 및 execute 없는 deploy는 AWS를 호출하지 않는다. 큰 템플릿의 `validate --aws`는 이제 S3 객체를 기록한다.

## 감독 반영 순서

1. DEV에서 먼저 후보를 통합한다. DEV 설정의 최상위 `templateBucket`에 같은 계정·리전의 기존 비공개 코드 버킷 이름을 지정한다. 버킷은 미리 존재해야 한다. `releases/dev/templates/<stack>/` 아래 PutObject/GetObject와 필요한 KMS 권한을 확인한다. 기존 ci-role의 CodeBucketArn 권한 경로와 일치시킨다. CloudFormation 실행 역할을 지정했다면 해당 역할도 읽을 수 있어야 한다.
2. DEV에서 기존 배포와 대용량 템플릿 경로를 검증한다. 이번 작업은 로컬 시험만 했으므로 실제 S3 권한·암호화·버킷 리전은 감독이 확인해야 한다.
3. 운영 승인 후에만 운영 설정 백업을 보존하고 prod의 기존 코드 버킷을 `templateBucket`에 지정한다. `runtimeSecretKeys`에 SNS_INGEST_SECRET 이름을 추가한다. 기존 byus/prod/web 비밀은 생성·수정하지 않는다. 운영 prefix는 releases/prod/templates/<stack>/이다.
4. 승인된 운영 배포 절차로 반영하고 정확한 배포 버전, ECS 키 주입과 수집 요청 성공, 갤러리·숏폼 갱신을 확인한다. 그 후 mini 수집 대상을 prod만으로 전환한다. DEV는 필요할 때 데이터 이관만 한다.

## 되돌리기

실패 시 수집 대상을 먼저 바꾸지 않는다. 운영 설정을 보관한 43키 설정으로 돌리고 이전 정상 이미지·배포 절차로 복구한다. 큰 템플릿을 유지한 채 templateBucket만 제거하면 다시 배포가 막힌다. 코드까지 되돌릴 때도 먼저 템플릿이 51,200바이트 이하인지 확인한다. 비밀 저장소의 키와 값은 그대로 둔다. S3 템플릿 객체는 조사·복구 근거이므로 즉시 삭제하지 않는다.

## 검증

`node --test scripts/aws-platform-deploy.test.mjs scripts/aws-release.test.mjs`: 46개 통과. DEV·PROD 각각 가짜 비밀 키 64개(긴 키 이름으로 51,200바이트 초과)를 렌더하고 무실행 배포 명령, S3 업로드·TemplateURL 검증, 계정 소유자 전달, 버킷 누락 차단을 확인했다. 작은 DEV 템플릿의 기존 경로도 확인했다. 실제 AWS 호출은 하지 않았다.

추가 workflow 시험은 로컬 js-yaml 의존성이 없어 실행하지 못했다. workflow 자체는 변경하지 않았다. scripts/aws-release.mjs는 설정을 복제한 뒤 공통 validateConfig를 호출하므로 새 선택 항목이 배포까지 보존된다. 실제 AWS CLI 업로드·IAM 성공은 이번 로컬 계약 시험의 범위 밖이다.
