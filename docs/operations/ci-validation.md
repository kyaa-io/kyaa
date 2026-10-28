# CI 실행 범위와 확인 근거

2026-10-28 조사 및 로컬 개선. 원격 푸시와 변경 후 GitHub 실행 시간은 아직 확인하지 않았다.

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
