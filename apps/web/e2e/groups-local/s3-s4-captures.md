# S3·S4 브라우저 검증

`node apps/web/e2e/groups-local/server.mjs`로 로컬 하니스를 시작한 뒤 `apps/web`에서 `node e2e/groups-local/s3-s4-capture.mjs`를 실행합니다. 제품 컴포넌트와 CSS를 사용하며 API 응답은 공개 가능한 합성 예시입니다. 운영 회원이나 운영 게시글 화면이 아닙니다.

Hot 예시 화면은 `hotFixture=1`로 기간별 3·7·10건을 표시합니다. 캡처는 `release-notes/images/2026-11-13-hot-{today,month}-{390,1440}.png`와 `2026-11-12-hot-period-{390,1440}.png`입니다. 차단 목록 예시 화면은 `s3Preview=1`로 한 명의 예시 팬을 표시하며, `2026-11-13-blocked-{390,1440}.png`에 있습니다. 스크립트는 기간별 응답 건수·실제 행·두 칩의 동일한 닫힌 chevron·차단 해제 후 빈 목록을 확인합니다.
