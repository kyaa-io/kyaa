# DEPLOY-SPEED-INT-2102 통합

원격 kyaa-mini/t3/deploy-speed-1448은 fetch 당시 f9cd164b09032281d40acea1fe45e907899c3268이며 origin/main에 이미 포함됐다. 요청된 캐시 이동과 이 계획서는 원격에 없어 통합 브랜치에서 보완했다. 충돌 없음.

DEV Next 캐시 저장을 배포, 준비 상태 검증, 증거 업로드 뒤로 이동하고 timeout-minutes: 2와 continue-on-error: true를 적용한다. 캐시 저장은 배포 시작을 막지 않는다. main 푸시 및 운영 실행은 하지 않는다.

## 추가 인수 기준 — Codex #174/#175

판정: 미보장. live=200·ready=503 후보 태스크가 기존 정상 태스크를 모두 교체하기 전에 차단된다고 현재 코드로 보장할 수 없다.

infrastructure/aws/platform/environment.json의 WebTargetGroup.HealthCheckPath는 /api/health/live다. Service.DeploymentConfiguration은 MinimumHealthyPercent=100, MaximumPercent=200 및 DeploymentCircuitBreaker Enable=true/Rollback=true지만, 이 건강 판정에 web /api/health/ready가 연결되지 않는다. PostgrestTargetGroup의 /ready는 별도 서비스 대상 검사로 web 준비 상태와 다르다. .github/workflows/aws-platform.yml은 CloudFormation 배포 뒤 aws-release.mjs verify를 실행하므로 사후 준비 상태 검증 실패가 기존 정상 태스크의 사전 보존을 보장하지 않는다.

제안: 후보 태스크별 readiness를 ECS 교체 승인 건강 판정에 연결하거나, 별도 후보 target group을 검증한 후 트래픽을 전환하는 배포 방식을 적용한다. 공유 DB의 일시 장애와 후보 이미지 결함을 구분하는 정책을 먼저 정해야 한다. 이번 캐시 변경에 운영 헬스 정책 변경은 포함하지 않는다. 실제 장애 주입·운영 상태 조회는 수행하지 않았다.

## 로컬 검증

`node --test scripts/aws-release-workflow.test.mjs scripts/aws-release-target-health.test.mjs scripts/aws-platform-deploy.test.mjs`: 47/47 통과. 캐시 저장이 verify와 마지막 증거 업로드 뒤에 위치하며 2분 제한을 갖는지 회귀 검사 추가. TypeScript는 lockfile의 5.9.3 사용. `git diff --check` 통과. actionlint는 설치되어 있지 않아 생략. 운영 실행 및 원격 푸시 없음.
