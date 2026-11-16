# 자체 팬 세션 발급 스위치 (`FAN_SESSION_ISSUE`)

팬 로그인 뒤 서버가 자체 세션 쿠키(`__Host-kyaa-fan-session`)를 발급하는 기능을 끄고 켜는 비상 스위치다. 코드는 `apps/web/app/api/auth/fan-session/route.ts`의 `process.env.FAN_SESSION_ISSUE !== "off"` 한 곳에서만 읽는다.

| 값 | 동작 |
| --- | --- |
| 없음 / `on` | 발급한다 (기본값) |
| `off` | 발급하지 않는다. 클라이언트는 이전처럼 Privy 토큰만 쓴다 |

배포 설정에는 `on`·`off`만 쓸 수 있다. 다른 값(`OFF`, `true`, 빈 문자열 등)은 `scripts/aws-platform-deploy.mjs` 검증에서 실패하므로 배포되지 않는다.

## 설정이 저장된 곳

- 원본은 GitHub Environment 변수 **`AWS_PLATFORM_CONFIG_JSON`** 이다. 저장소 `kyaa-io/kyaa`의 Environment `dev`, `prod`에 각각 있고, `environment` 스택 전체 설정(`runtimeEnvironment` 포함)이 JSON 한 덩어리로 들어 있다 (`infrastructure/aws/platform/ci-setup.md`, `.github/workflows/aws-platform.yml`).
- 배포할 때 `scripts/aws-release.mjs`가 이 값에 `RELEASE_SHA` 등을 덧붙여 `validateConfig`를 통과시킨 뒤 ECS 태스크 환경 변수로 넣는다. 저장소 파일에는 실제 값이 없다.
- 변수 값만 바꿔서는 실행 중인 서버가 바뀌지 않는다. 새 배포(태스크 교체)가 있어야 적용된다.
- 이 JSON에는 계정 ID·ARN은 있지만 비밀 값은 없다. 그래도 꺼낸 파일은 작업 뒤 지운다.

## 끄기 (비상)

운영 값을 바꾸는 절차다. 이 문서를 쓴 작업에서는 실제 운영 값을 바꾸지 않았다.

1. 현재 값을 받아 백업하고 `FAN_SESSION_ISSUE`만 추가한다.
   ```sh
   gh variable get AWS_PLATFORM_CONFIG_JSON --env prod --repo kyaa-io/kyaa > prod-config.before.json
   jq '.runtimeEnvironment.FAN_SESSION_ISSUE = "off"' prod-config.before.json > prod-config.after.json
   diff prod-config.before.json prod-config.after.json   # FAN_SESSION_ISSUE 한 줄만 달라야 한다
   gh variable set AWS_PLATFORM_CONFIG_JSON --env prod --repo kyaa-io/kyaa < prod-config.after.json
   ```
2. 지금 운영 중인 버전 그대로 다시 배포한다. 운영에 떠 있는 `RELEASE_SHA`(`https://kyaa.io/api/health/live`)와 같은 커밋의 성공한 dev 실행 ID를 `source_run_id`로 쓴다.
   ```sh
   gh workflow run aws-platform.yml --ref main -f environment=prod -f source_run_id=<운영과 같은 SHA의 dev 실행 ID>
   ```
   같은 버전 재배포는 `ci-setup.md`의 기존 수동 `prod` 실행 절차다. 다른 커밋의 실행 ID를 넣으면 코드가 함께 바뀌므로 넣지 않는다.
3. 배포가 끝나고 ECS가 안정될 때까지 기다린다(워크플로 결과가 완료 근거다).

DEV는 같은 방식으로 `--env dev`를 쓰고, 배포는 `-f environment=dev`(또는 main 푸시)로 한다. DEV는 `AUTH_PROVIDER=cognito`, 운영은 `privy`라서 Privy 경로 자체는 DEV에서 확인할 수 없다. 스위치의 응답은 인증 방식보다 먼저 판단하므로 DEV에서도 확인된다.

## 확인 방법

토큰 없이 확인한다. 로그인 정보가 필요 없다.

```sh
curl -si -X POST https://kyaa.io/api/auth/fan-session -H 'origin: https://kyaa.io' -H 'authorization: Bearer x'
```

- `off`: `200`, 본문 `{"session":false}`, `set-cookie: __Host-kyaa-fan-session=; … Max-Age=0`.
- `on`: 가짜 토큰이라 `200`이 아니다(보통 `401`).

브라우저에서는 로그인 뒤 개발자 도구 Application에서 `__Host-kyaa-fan-session` 쿠키가 없고 localStorage `kyaa:fan-session`이 비어 있으면, 보호된 API가 Privy 토큰으로 응답한다는 뜻이다.

## 끄면 클라이언트는 어떻게 되나 (단위 시험으로 확인)

- 교환 응답이 `{session:false}`이면 `fan-session.ts`가 `kyaa:fan-session` 힌트를 쓰지 않거나 지운다.
- 로그인 화면(`privy-root.island.tsx`)은 힌트가 있을 때만 쿠키 표식(`Bearer kyaa-session`)을 보낸다. 힌트가 없으니 모든 요청이 Privy 토큰으로 나간다.
- `watchFanSessionLoss`는 표식을 보낸 요청이 401을 받을 때만 복구한다. 표식이 없으니 401이 와도 아무 일도 하지 않고, 교환 요청도 늘지 않는다.
- 시험: `app/api/auth/fan-session/route.contract.test.ts`(환경 변수 `off`의 응답·쿠키 삭제·Privy와 DB를 부르지 않음), `features/auth/client/fan-session-recovery.test.tsx`(`FAN_SESSION_ISSUE=off` 두 건), `scripts/aws-platform-deploy.test.mjs`(허용 목록·값 검증).
- 이 시험은 Privy를 실제로 호출하지 않는 모의 환경이다. 운영의 Privy 경로는 켜기·끄기 뒤 위 확인 방법과 실제 로그인으로 본다.

## 이미 발급된 쿠키가 있는 상태에서 `off`로 바꾸면

- **쿠키는 계속 받아들인다.** 쿠키를 읽는 쪽(`privy-node-verifier.ts`의 `verify`)은 스위치를 보지 않는다. 쿠키가 만료(발급 후 30일, 최종 Privy 로그인 후 90일)되거나 로그아웃·강제 해제될 때까지 보호된 API는 그 쿠키로 응답한다.
- **갱신은 멈추고 쿠키를 지운다.** 그 브라우저가 페이지에 들어와 갱신을 시도하면 서버가 `{session:false}`와 쿠키 삭제 헤더를 돌려준다. 그 시점부터 그 브라우저는 Privy 토큰만 쓴다. 다시 열지 않은 브라우저의 쿠키는 그때까지 남는다.
- 따라서 `off`는 "새 발급 중지 + 접속하는 브라우저부터 정리"이고, 복사된 쿠키를 즉시 무효로 만들지는 않는다. 쿠키 자체가 문제인 사고(유출 등)에는 `off`만으로 부족하다.

### 제안: 끄면 기존 쿠키도 거절 (구현하지 않음)

쿠키를 읽는 `verify`에서 스위치가 `off`이면 `FanSessionRejectedError`를 던지게 한다. 그러면 쿠키를 든 요청은 즉시 401이 되고, 클라이언트 감시가 한 번 복구해(1분 냉각) Privy 토큰으로 교환하며 `{session:false}`를 받아 힌트를 지운다. 장점은 즉시 차단이고, 비용은 로그인한 사용자마다 첫 요청 하나가 401을 받는 것이다. 사고 대응에서 쿠키 무효화가 필요하다고 판단할 때만 별도 작업으로 한다. 지금 필요하면 `revoke_fan_sessions`(`sessions_valid_after`)로 사용자 단위 무효화가 이미 가능하다.

## 되돌리기 (켜기)

1. `jq '.runtimeEnvironment.FAN_SESSION_ISSUE = "on"'`(또는 `del(.runtimeEnvironment.FAN_SESSION_ISSUE)`)로 값을 바꾸고 `gh variable set`으로 올린다. 백업(`*.before.json`)을 그대로 올려도 된다.
2. 끄기의 2·3단계와 같이 같은 버전을 재배포한다.
3. 확인: 위 `curl`이 `200 {"session":false}`가 아니고, 로그인한 브라우저에서 `kyaa:fan-session` 힌트와 쿠키가 다시 생기는지 본다. 끄는 동안 쿠키가 지워졌으므로 사용자는 다음 방문에 Privy 토큰으로 새 쿠키를 받는다. 다시 로그인할 필요는 없다.

## 이 문서에서 확인하지 못한 것

- 운영·DEV의 실제 `AWS_PLATFORM_CONFIG_JSON`을 읽거나 바꾸지 않았다. 변수 위치와 명령은 저장소 문서·워크플로 기준이다.
- `gh workflow run`의 재배포는 실제로 실행하지 않았다. `source_run_id`의 산출물이 보관 기간 안에 있어야 한다.
- 운영 Privy 경로(`AUTH_PROVIDER=privy`)와 ECS 교체 소요 시간은 확인하지 못했다.
