# CI 실행 범위와 확인 근거

2026-10-28 조사 및 개선. 첫 입력 범위·설치 개선은 `316ff3c1b`로 main에 푸시했고 해당 커밋의 자동 실행 시작을 확인했다. 아래 병렬화의 실제 단축률은 아직 측정하지 않았다.

## 확인한 비용

| 실행 | 관찰 | 조치 |
| --- | --- | --- |
| [Backend security 40634762467](https://github.com/kyaa-io/kyaa/actions/runs/40634762467) | 전체 약 12분. 15개 SQL 검증 단계가 351초 소요 | 입력이 같은 SQL 검증만 조건부 실행 |
| [Fan design system 40631926900](https://github.com/kyaa-io/kyaa/actions/runs/40631926900) | 전체 약 15분. 웹 변경마다 공통 UI와 여러 브라우저 시나리오 실행 | 공통 컴포넌트·스타일의 영향 범위를 아직 분리하지 않았으므로 검사 유지 |
| [AWS release 40633350594](https://github.com/kyaa-io/kyaa/actions/runs/40633350594) | 대기 포함 약 18분 35초. 작업 시작 후 약 15분 10초 중 이미지 빌드 418초, 배포 334초 | 의존성 다운로드 캐시와 설치 스크립트 생략 적용. 이미지 빌드·실제 반영 확인 유지 |
| [Deployment notices 40636645396](https://github.com/kyaa-io/kyaa/actions/runs/40636645396) | 전체 약 90초 중 의존성 설치 67초. 안전성 테스트는 1초 미만 | 캐시·설치 개선 적용, 테스트 유지 |

351초는 위 실행에서 조건부로 전환한 단계의 소요 시간 합계다. 변경 후 절감 시간이나 절감률을 실측한 값은 아니다. 서로 병렬 실행되는 워크플로의 시간을 합산해 배포 지연이라고 해석하지 않는다.

## 실행 규칙

- `scripts/ci-test-scope.mjs`는 확인된 웹 소스·문서·변경 안내만 바뀐 경우 15개 DB 검증 단계를 생략한다. 웹 루트 설정, 의존성, SQL, 검증 스크립트, 워커, 알 수 없는 경로는 전체 검사 대상이다.
- PR은 공통 조상부터 PR head까지, push는 before부터 after까지 모든 커밋을 비교한다. rename은 삭제·추가 양쪽을 확인한다. 수동 실행, 빈 변경, 잘못된 SHA, 이력 부족과 Git 오류는 전체 검사로 처리한다.
- API 권한 검사, 타입 검사, 워커 검사, Anvil 통합, 계약 저장 구조 검사는 그대로 실행한다. 뒤쪽 배포 도구 검사도 PostgreSQL을 사용하므로 PostgreSQL 설치를 생략하지 않는다.
- 같은 PR의 이전 검증 job만 취소한다. main push와 수동 실행은 실행 ID별로 분리한다. AWS 배포, 승인된 승격, 실제 알림 job과 전송 대기열은 취소 대상으로 바꾸지 않는다.
- AWS·안내 검증의 호스트 설치는 `npm ci --ignore-scripts` 뒤 `npm run security:patch`를 명시 실행한다. 실제 서비스 이미지의 Docker 설치와 네이티브 실행 확인은 유지한다.
- 의존성 감사는 신규 취약점 공지가 코드 변경 없이도 발생할 수 있어 기존 실행 범위를 유지한다. PR과 main의 검사도 서로 다른 통합 코드일 수 있어 통째로 중복 취급하지 않는다.
- 현재 checkout에는 실행되는 Git hook이 없고 sample hook만 있다. 새 로컬 hook이나 필수 전체 검사를 추가하지 않았다.

## 검증과 후속 확인

`node --test scripts/ci-test-scope.test.mjs scripts/aws-release*.test.mjs scripts/deployment-notices.test.mjs scripts/aws-approved-promotion.test.mjs`

선택기 검증은 실제 임시 Git 저장소로 여러 커밋 push, PR 분기, rename·삭제, shallow history, 오류 시 전체 실행을 확인한다. 변경한 설치 방식은 별도 빈 의존성 트리에서 설치·보안 패치·실제 cron 두 진입점 번들링으로 확인했다. 기존 SQL 테스트 본문과 DB 실행 격리는 변경하지 않았다.

원격 반영 후 웹 소스만 변경한 실행에서 15개 단계만 생략되는지, SQL·워커 변경과 수동 실행에서는 모두 실행되는지 확인한다. DB 검증이 향후 웹 소스를 직접 읽게 되면 선택기의 입력 범위와 테스트도 함께 수정한다.

설정 근거: [GitHub job concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency), [npm ci의 ignore-scripts](https://docs.npmjs.com/cli/v11/commands/npm-ci/).

## 직렬 검사 병렬화

첫 개선은 SQL 변경이 있는 작업의 긴 실행을 줄이지 못한다. 모든 DB 검사가 필요하기 때문이다. 후속 변경은 테스트 자체를 없애지 않고 실행 순서를 분리한다.

- 백엔드: API·워커 검사, DB 3그룹, 블록체인 검사를 별도 runner에서 실행한다. DB는 공통 권한·알림 4개, 긴 LIVE 검사 1개, 나머지 이벤트 검사 10개로 나눈다. 각 runner가 의존성·보안 패치·필요한 워커 빌드·PostgreSQL을 직접 준비한다.
- UI: 단위 검사, Wave 프로그램, RUNMUSIC, 나머지 레이아웃·복구 검사 등 4그룹으로 실행한다. 브라우저 설치는 브라우저 그룹에만 적용하고 캡처 업로드는 생성한 runner에 남긴다.
- 기존 `security-boundaries`, `shared-ui-contracts` check 이름은 최종 집계 job으로 유지한다. 실패·취소·예상 밖 생략은 성공으로 통과하지 않는다. DB 생략은 범위 판별 성공, `database=false`, DB job 생략이 모두 확인된 경우만 허용한다. matrix의 `fail-fast`는 꺼서 다른 그룹의 검사·증거를 중단하지 않는다.
- 같은 PR의 이전 실행 취소를 해당 검증 workflow 전체에 적용해 오래된 병렬 그룹이 남지 않게 한다. AWS 배포·운영 승격·알림 대기열은 바꾸지 않는다.

저장한 기존 실행의 단계 시간을 새 그룹에 배치하면 백엔드 약 12분은 약 5분, UI 실행 약 12분은 약 5~6분의 최장 경로가 된다. 큐 대기·runner 성능·다운로드 변동을 제외한 추정이며 실제 결과가 아니다. 실행 머신이 동시에 더 필요하고 반복 준비 비용 때문에 총 runner 사용 시간은 늘 수 있다. 워크플로 간 공유 의존성 캐시·빌드 산출물 전달까지 새로 도입하지는 않았다.

검증: `node --test scripts/ci-test-scope.test.mjs scripts/ci-workflows.test.mjs`. 원래 백엔드 34개·UI 11개 실행 명령과 작업 디렉터리의 보존을 대조했고, 집계 shell을 실패·취소·생략 조합으로 직접 실행해 확인한다. 실제 DB·브라우저 테스트 내용은 바꾸지 않았으므로 기존 성공 근거를 재사용한다.

일반 푸시는 정확한 커밋의 자동 실행 시작까지 확인한다. 완료 확인을 요청받은 경우에만 끝까지 확인하며, 별도 커밋의 배포는 실제 선행 조건이 없으면 기다리지 않는다. 변경 없는 상태를 짧게 반복 조회하거나 재분석하지 않는다.
