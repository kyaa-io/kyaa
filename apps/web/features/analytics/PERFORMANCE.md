# AWS 성능 계측

`HOSTING_PROVIDER=aws`에서만 `AwsPerformanceTelemetry`와 `/api/analytics/performance`를 사용한다. 기존 `/api/events` 원장이나 회원 데이터와 연결하지 않는다. 서버의 JSON stdout은 기존 ECS CloudWatch 로그로 수집한다. 별도 저장소·외부 분석 SDK·환경 변수는 추가하지 않는다. Origin 검증은 기존 `requireSameAppOrigin`과 `runtimeEnvironment`를 재사용한다. AWS에서는 런타임 `APP_URL`을 기준으로 신뢰하는 HTTPS 전달 호스트와 운영 별칭을 확인하며, 스테이징은 설정된 Origin만 허용한다.

## 브라우저 지표

`next/web-vitals`의 `useReportWebVitals`로 CLS·FCP·FID·INP·LCP·TTFB를 받는다. 문서마다 10%를 무작위 선택하고 최대 10건을 시도한다. 초기 주소와 전송 시점의 현재 주소가 모두 기존 `isPublicTelemetryPath`의 공개 경로여야 한다. SPA 이동 뒤 수치는 처음 문서를 연 화면 종류로 분류하므로 개별 SPA 화면 성능으로 해석하지 않는다.

전송 필드는 `name`, `value`, `routeKind`뿐이다. 화면 종류는 `home`, `public-list`, `public-detail`, `public-info` 중 하나다. URL·쿼리·해시·페이지/회원/세션 식별자·PerformanceEntry·오류 내용은 전송하지 않는다. fetch는 `credentials: omit`, `referrerPolicy: no-referrer`를 사용하고 실패는 무시한다. 서버는 같은 Origin과 JSON을 요구하며 실제 본문을 512바이트로 제한한다. 수치는 유한한 0~3,600,000, CLS는 0~100만 허용한다. 추가 필드와 임의 문자열은 거절한다. 인증 없이 받은 수치는 브라우저가 임의로 만들 수 있으므로 업무 집계나 접근 제어의 근거로 쓰지 않는다.

stdout 예: `{"event":"web_vital","name":"LCP","value":1200,"routeKind":"home"}`. CLS를 제외한 단위는 ms다. 샘플링·미지원 브라우저·전송 실패에 따른 누락이 있어 방문자 수로 해석하지 않는다.

## 홈 조회 시간

`measureHomeQuery(label, () => repository.query())`는 기존 Promise의 반환값과 오류를 그대로 유지한다. `celebrities`, `celebrityLives`, `homeBanners`, `elinaRaffles`만 label로 허용하며 요청별 각 조회 완료 시 stdout에 한 건 기록한다. 조회 결과·오류 원문·요청 정보는 기록하지 않는다. 로거가 실패해도 조회 결과는 바뀌지 않는다. 이 시간은 서버에서 각 조회를 기다린 시간이며 브라우저 렌더링 시간이나 전체 홈 응답 시간과 다르다.

stdout 예: `{"event":"home_query","name":"homeBanners","durationMs":42,"outcome":"success"}`. 실패는 `outcome: error`다. 기존 CloudWatch Logs Insights에서 `event = "web_vital"` 또는 `event = "home_query"`로 필터한 뒤 이름별 건수·평균·백분위수를 조회한다. 필터는 기존 서비스 로그 그룹에서 사용하며 새 로그 전달 경로는 만들지 않는다.
