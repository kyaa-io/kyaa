설치하려면 사용자가 할 일(IAM 적용 승인 등): ci-role.json의 함수별 3개 권한 추가를 검토·승인해 별도로 적용하고, 이 로컬 커밋의 main 통합·push를 승인해야 합니다. 감독 패치는 별도 검토·설치가 필요합니다.

11/13 패치를 현재 origin/main에 재정비했습니다. DEV와 운영 모두 승격 기록의 sourceSha를 git archive하고 해당 lockfile로 npm ci 후 네 worker를 빌드합니다. IAM 변경은 제안 diff이며 적용하지 않았습니다. 코드 갱신만 수행하며 환경변수·스케줄·동시성은 변경하지 않습니다. 비활성은 WORKER_ENABLED 등 설정의 비활성을 뜻합니다. Lambda 서비스 State가 Active가 아니면 안전하게 실패합니다.

계정, ARN, nodejs24.x, arm64, Zip, index.handler, State, LastUpdateStatus, RevisionId를 확인합니다. GetFunction으로 받은 이전 ZIP의 SHA256을 확인해 백업하고 revision 조건으로 갱신합니다. 갱신 후 코드 해시와 정렬한 환경변수 해시를 확인합니다. BUILD_COMMIT 환경변수도 보존하므로 코드 출처는 sourceSha와 codeSha256 출력으로 확인해야 합니다.

네 함수의 갱신은 원자적이지 않습니다. 중간 실패 시 앞서 성공한 함수와 이미 승격된 웹은 그대로 남으며 GitHub 성공 배포 기록은 생성하지 않습니다. 타임아웃은 갱신이 실제 완료됐을 수도 있으므로 재시도 전에 코드 해시를 확인해야 합니다. worker-rollback artifact는 실패 때에도 업로드하며 함수별 backup.zip과 receipt.json을 보존합니다. 원본 환경변수나 다운로드 서명 URL은 저장하지 않습니다.

되돌리기: 실패한 실행의 artifact에서 함수별 receipt와 backup.zip을 내려받고 ZIP SHA256(base64)이 previousCodeSha256과 같은지 확인합니다. 현재 GetFunctionConfiguration으로 계정·ARN·런타임·핸들러·상태·환경 해시를 다시 확인하고 현재 RevisionId로 update-function-code --function-name <함수> --revision-id <현재값> --zip-file fileb://<backup.zip>을 실행합니다. function-updated-v2 후 코드 해시가 previousCodeSha256이고 환경 해시가 복구 직전과 같은지 확인합니다. 성공한 함수들을 역순으로 처리하며 웹 복구는 기존 승격 절차로 따로 수행합니다. 기존 receipt의 revision을 복구에 재사용하지 않습니다.

감독 연결 제안: 11/13 supervisor.patch와 hooks/lambda_drift.py를 현 설치본에 dry-run·검토한 뒤 별도 설치합니다. 이번에는 설치하거나 stall-check를 실행하지 않았습니다. stall-check에서 kyaa-t3 lambda-drift를 60초 예산으로 호출하고 운영 health SHA와 승격 receipt의 sourceSha/함수 코드 해시를 비교합니다. BUILD_COMMIT 불일치나 LastModified가 해당 승격보다 오래되면 조사 플래그를 표시하되, 환경변수 BUILD_COMMIT은 code-only 배포에서 유지되고 LastModified는 SHA가 아니므로 이것만으로 코드 drift를 확정하지 않습니다. 조회 거절·시간 초과·receipt 누락은 UNKNOWN 플래그입니다. 자동 복구는 하지 않습니다.

감독 RULEBOOK 한 줄: 운영·DEV 승격은 웹과 4개 worker의 동일 sourceSha 검증 및 환경·비활성 보존 receipt가 있어야 완료이며, lambda-drift의 DRIFT/UNKNOWN은 stall-check 플래그로 남기고 부분 성공 시 백업을 확인한다.

배포 도구만 변경하므로 release note는 추가하지 않았습니다. 실제 AWS 접속, IAM 적용, push, 감독 설치는 하지 않았습니다.

검증 결과: 신규 fake AWS 주입 시험 9/9, 기존 platform 36/36 통과. 전체 release/platform 190개 중 188 통과·1 skip·1 실패였으며, 실패는 신규 rollback artifact의 rerun 설정 누락이었습니다. 실행 attempt별 artifact 이름과 overwrite 설정으로 수정 후 관련 workflow/worker 26/26 통과했습니다. 최초 의존성 누락은 npm ci로 해결했습니다. 로컬 Node 25.9.0과 CI Node 24 차이는 남아 있습니다. package.json/package-lock.json에 타입 패키지 추가 변경이 나타났으며 작업 범위 밖이라 커밋에 포함하지 않았습니다.
