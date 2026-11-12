# API 5xx 로그

운영 ALB 경보 `AlbErrorsAlarm`(`HTTPCode_Target_5XX_Count`)이 오면, 웹 컨테이너 로그에서 어느 경로가 5xx를 냈는지 찾습니다.

## 남는 내용

웹 서버(`apps/web/instrumentation.ts`)는 상태 코드가 500 이상인 응답마다 JSON 한 줄을 남깁니다.

```json
{"event":"http_5xx","route":"/api/groups/[groupId]/wallet","method":"POST","status":500,"source":"thrown","errorName":"TypeError","errorCode":"23505","digest":"1234567","requestId":"Root=1-67891233-abcdef012345678912345678"}
```

| 필드 | 뜻 |
| --- | --- |
| `route` | 실제 경로 대신 라우트 템플릿입니다. 템플릿을 찾지 못하면 `(unmatched)`이며 원래 경로는 남기지 않습니다. |
| `source` | `thrown`: 핸들러가 오류를 던졌습니다(Next `onRequestError`). `response`: 핸들러가 직접 5xx를 돌려줬습니다(예: 의존 서비스 장애 503). |
| `errorName`·`errorCode` | 던져진 오류의 이름과 짧은 코드입니다(예: Postgres `23505`, PostgREST `PGRST116`). 오류 메시지는 남기지 않습니다. |
| `digest` | Next가 같은 오류에 붙인 digest입니다. 같은 시각의 Next 오류 스택 로그와 맞춰 볼 때 씁니다. |
| `requestId` | ALB가 붙인 `X-Amzn-Trace-Id`입니다(없으면 `x-request-id`, 둘 다 없으면 `null`). ALB 접근 로그의 `trace_id`와 같은 값입니다. |

회원 식별자, 쿼리, 요청·응답 본문, 헤더, 토큰은 남기지 않습니다.

라우트 템플릿은 빌드 결과의 `.next/routes-manifest.json`에서 찾습니다. 화면(page) 경로의 5xx도 같은 형식으로 남습니다.

## 로그 위치

- 운영: `byus-prod-platform-WebLogs-JE1K9bG99c9z` (서울)
- dev: `aws logs describe-log-groups --profile kyaa-readonly --query 'logGroups[?contains(logGroupName, `dev-platform-WebLogs`)].logGroupName'`

## 느린 요청 로그 (`http_slow`)

5xx가 아닌 응답이 500ms 이상 걸리면 같은 로그 그룹에 한 줄을 남깁니다. 평소 p95를 만드는 느린 경로를 찾는 용도입니다.

```json
{"event":"http_slow","route":"/community","method":"GET","status":200,"durationMs":812,"rsc":true,"requestId":"Root=1-67891233-abcdef012345678912345678"}
```

경로 템플릿·메서드·상태·소요 ms·`rsc`(화면 이동·prefetch 요청 여부)·요청 ID만 남기고 쿼리·식별자·헤더·토큰은 남기지 않습니다. 5xx 응답은 위 `http_5xx` 줄만 남습니다. 소요 시간은 요청을 받은 때부터 응답 전송이 끝날 때까지라 스트리밍 응답은 전송 시간을 포함합니다.

느린 요청 상위 경로 (24시간):

```
filter event = "http_slow"
| stats count(*) as slow, pct(durationMs, 50) as p50, pct(durationMs, 95) as p95, max(durationMs) as mx by route, rsc
| sort slow desc
| limit 10
```

## Logs Insights 쿼리

5xx가 많은 경로 상위 10개:

```
fields @timestamp, route, method, status
| filter event = "http_5xx"
| stats count(*) as errors by route, method, status
| sort errors desc
| limit 10
```

API 경로만, 오류 종류까지:

```
filter event = "http_5xx" and route like /^\/api\//
| stats count(*) as errors, latest(@timestamp) as last by route, source, errorName, errorCode
| sort errors desc
| limit 10
```

명령줄에서 지난 1시간:

```sh
aws logs start-query --profile kyaa-readonly \
  --log-group-name byus-prod-platform-WebLogs-JE1K9bG99c9z \
  --start-time $(( $(date +%s) - 3600 )) --end-time $(date +%s) \
  --query-string 'filter event = "http_5xx" | stats count(*) as errors by route, method, status | sort errors desc | limit 10'
# 출력된 queryId로 결과 조회
aws logs get-query-results --profile kyaa-readonly --query-id <queryId>
```

## 로그가 없을 때

- 경보는 왔는데 `http_5xx` 줄이 없으면 앱이 응답을 끝내지 못한 경우입니다. 컨테이너 재시작·메모리 부족·연결 끊김이 원인일 수 있습니다. ECS 작업 중지 사유와 ALB 접근 로그를 확인합니다.
- ALB가 직접 만든 502·503·504(`HTTPCode_ELB_5XX_Count`)는 앱에 도달하지 않았으므로 이 로그에 남지 않습니다.
