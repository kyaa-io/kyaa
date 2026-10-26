# 팬페이지 자동 등록

팬페이지를 처음 공개하면 DB에 등록 작업을 남긴다. 초안 저장과 페이지 공개는 체인 응답을 기다리지 않는다. 과거 페이지를 일괄 등록하거나 재공개만으로 새 작업을 만들지 않는다.

전용 작업기는 등록 거래를 서명·저장한 뒤 전송한다. 재시작이나 응답 유실 때 같은 거래를 조회·재전송한다. 성공 영수증을 확인하면 좋아요를 허용하고, 최종 확정 후 나머지 활동의 기존 확인 조건을 충족한다. 최종 확정 전 좋아요 허용 기록은 마지막 정상 확인에서 10분이 지나면 만료된다. 작업기를 중지해도 미확정 허용 기록이 영구히 남지 않는다.

등록을 예약한 뒤 공개를 중지해도 이미 승인한 거래의 확인은 계속한다. 공개를 중지하거나 보관한 페이지에 새 좋아요를 발급하지 않는 기존 조건은 유지한다. 주소·소유자·거래 내용은 바꾸지 않는다.

## 운영 구성

- Lambda: `byus-creator-registration-worker-{environment}`, 동시 실행 1, 1분 주기.
- Secret: `byus/creator-registration/{environment}`. 일반 웹·민팅 작업기의 IAM 역할에는 이 secret 권한을 부여하지 않는다.
- Secret 필드: `POSTGREST_URL`, `POSTGREST_SERVICE_TOKEN`, `GIWA_RPC_URL`, `CREATOR_REGISTRATION_PRIVATE_KEY`, `EXPECTED_REGISTRAR_ADDRESS`, `REGISTRY_DEPLOYMENT_BLOCK`.
- JWT role: `creator_registration_worker`. `byus_postgrest`에 해당 NOLOGIN role만 부여한다. 웹의 `service_role`은 등록 영수증·최종 확정 RPC를 실행할 수 없다. JWT 만료 전에 전용 secret의 토큰만 갱신하고 서명 키는 유지한다.
- 현재 registry 배포 블록은 `35969517`, chain ID는 `91342`다. 배포 거래 `0x5b8e347561c3175810fa482338cbd94ea199b9bf5acb20a415d5088235a8fec8`의 최초 `RegistrarChanged` 이벤트와 코드 해시로 확인했다.

신규 등록은 과거 로그를 검색하지 않는다. 기존 등록 복구는 최대 10,000블록씩 조회하고 한 번에 최대 10구간을 처리한다. 조회 제한·시간 부족 시 DB에 저장한 위치부터 다음 실행에서 이어간다. 영수증과 최종 확정 대기는 실패 횟수를 소모하지 않는다. 미해결 거래는 재시도 횟수를 소진해도 삭제하거나 새 nonce로 대체하지 않는다.

## 배포와 권한 이전

`scripts/deploy-aws-creator-registration-worker.mjs`는 `--dry-run`과 `--deploy` 모두 계정 `996702758024`, 서울 리전, 해당 환경의 VPC·역할·secret을 확인한다. `--deploy`도 작업기와 스케줄을 **비활성 상태로** 배포한다. 기존 관리자 개인 키를 서버로 옮기지 않는다.

```sh
AWS_PROFILE=jewel-sallylab EXPECTED_AWS_ACCOUNT_ID=996702758024 \
  node scripts/deploy-aws-creator-registration-worker.mjs prod --dry-run
```

DB 마이그레이션 소유자는 기존 `postgres`다. RDS의 이 역할에는 CREATEROLE이 없으므로, DB 관리자가 `creator_registration_worker NOLOGIN`을 먼저 만들고 migration을 적용한다. 역할에 LOGIN·SUPERUSER·BYPASSRLS·CREATEROLE을 주지 않는다. 모든 기존 서비스 역할의 표 접근과 영수증 RPC 실행 거부를 실제 PostgREST로 검증한 뒤 활성화한다.

온체인 등록 권한은 하나의 registrar에만 있다. 전용 계정으로 옮기는 변경은 기존 Timelock의 172800초 대기를 따른다. 다음 도구는 현재 권한과 지연 시간을 읽고 정확한 예약·실행 내용을 만든다. 서명·송금·예약은 하지 않는다.

```sh
node scripts/prepare-creator-registration-handoff.mjs \
  --new-registrar <DEDICATED_ADDRESS> --out <PRIVATE_MANIFEST_PATH>
```

권한 이전 예약과 실행은 승인된 manifest hash를 사용한다. 실행 후 registry의 registrar·코드·Hub 연결, 전용 키의 공개 주소·수수료 잔액, DB 전용 JWT, 배포 코드 해시를 다시 확인한다. 그때만 Lambda의 `CREATOR_REGISTRATION_WORKER_ENABLED=true`와 전용 EventBridge 규칙을 활성화한다. 이벤트는 `{ "source": "byus.creator-registration-cron", "environment": "prod" }`다. 예약만 된 상태를 자동 등록 활성화 완료로 보고하지 않는다.

중지할 때는 전용 EventBridge 규칙과 작업기를 끈다. 큐·서명된 거래·영수증 이력은 삭제하지 않는다. 재개 전 미해결 nonce와 현재 registrar를 확인한다. 자동 수수료 교체는 제공하지 않는다.

## 수동 LIVE·WAVE 등록

권한 이전 후에는 기존 CLI에 AWS 옵션을 지정한다. CLI는 전용 작업기의 같은 큐에 요청하고 개인 키를 읽거나 별도로 서명하지 않는다. 먼저 승인된 SSM 포트 포워딩과 RDS CA 파일을 준비한다.

```sh
node scripts/register-giwa-campaign.mjs prepare \
  --aws-profile jewel-sallylab --local-port 15633 --ssl-root-cert <RDS_CA_PATH> \
  --manifest <PRIVATE_MANIFEST_PATH> --campaign <LIVE_UUID>

node scripts/register-giwa-campaign.mjs execute \
  --aws-profile jewel-sallylab --local-port 15633 --ssl-root-cert <RDS_CA_PATH> \
  --manifest <PRIVATE_MANIFEST_PATH> --approved-hash <MANIFEST_HASH>

node scripts/register-giwa-campaign.mjs finalize \
  --aws-profile jewel-sallylab --local-port 15633 --ssl-root-cert <RDS_CA_PATH> --job <JOB_UUID>
```

WAVE는 `--campaign` 대신 `--wave-event kyaa-wave-2026`을 사용한다. `execute`는 중복 요청에도 같은 작업을 반환하며, `finalize`는 상태를 읽는다. 최종 확정 기록은 작업기가 반영한다. 기존 키체인 방식은 이전 registrar 권한이 남아 있는 환경만을 위한 경로다.
