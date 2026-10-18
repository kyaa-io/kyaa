# 공개 팬 제안과 신청곡

방송 상세의 `팬 제안` 링크는 `/live/[slug]/suggestions`로 이동한다. 새 화면에서 제출한 질문·응원·신청곡은 공개 안내 후 해당 방송의 공개 범위 안에서 보인다. 기존 미선정 제출은 소급 공개하지 않는다. 선정·숨김은 기존 관리자 권한을 사용한다.

## 운영 설정과 적용 순서

1. Spotify 개발자 계정의 이메일을 인증하고 Premium 구독을 활성화한 뒤 Web API 앱을 만든다. 2026-10-19 개발자 대시보드에서 무료 계정의 Web API 선택이 차단되는 것을 확인했다. Vercel의 kyaa 프로젝트에 서버 전용 `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`을 설정한다. 앱의 Client Credentials를 사용하며 팬의 Spotify 로그인은 필요하지 않다.
2. `20261129008000_live_song_requests.sql`을 웹보다 먼저 적용하고 PostgREST 스키마 캐시를 갱신한다. 앞선 `20261129007000`까지 적용된 환경을 기준으로 한다.
3. 인증된 테스트 계정과 접수 중인 방송에서 실제 한국어 검색 결과를 확인한 뒤 웹을 배포한다. 비밀 키·토큰·검색 원문은 로그나 캡처에 넣지 않는다.

검색은 한국 시장의 곡을 최대 10개 반환한다. 사용자는 곡명·가수명을 직접 입력하고 YouTube 영상 링크를 덧붙일 수 있다. 공급자 인증 실패·검색 실패·호출 제한은 직접 입력을 막지 않는다. 인증이 없으면 Spotify 검색은 사용할 수 없다.

## 계약과 보존

- 새 클라이언트는 제출·조회·관리자 검토 요청에 `contract=songs-v1`을 보낸다. 구형 요청에는 기존 JSON 형태와 질문·응원 목록만 반환한다.
- 새 공개 목록은 작성 시각과 ID로 페이지를 나눈다. 기존 목록은 선정 시각 순서를 유지한다.
- 곡 메타데이터와 공개 여부도 중복 요청 비교에 포함한다. 동일 키로 내용을 바꾸면 충돌한다. 접수 마감·회원 조건·종류별 활성 제출 한 개·시간당 제출 제한은 기존 규칙을 유지한다.
- 검색은 활성 계정과 접수 권한을 확인하고 사용자별 분당 30회로 제한한다. 검색어는 저장하지 않는다.
- 저장한 검색 결과는 제한된 사용자 입력 스냅샷이다. Spotify ID·링크·이미지 호스트를 검사하며, 제출 시 외부 URL을 가져오거나 인증된 원문임을 보증하지 않는다. 곡명·아티스트·앨범명은 자동 번역하지 않는다.
- 숨김·삭제·차단·회원 권한 상실 시 곡 정보도 본문과 함께 가린다. 공통 신고 처리로 신청곡도 숨길 수 있다.

## 검증

`npm run test --workspace @byus/web -- features/live-submissions server/schedules components/admin/live-submission-manager.test.tsx features/schedules/domain/participation.test.ts`

`node apps/web/e2e/live-suggestions-local/run.mjs`

브라우저 검사는 실제 페이지와 스타일에 합성 계정·검색·제출 응답을 사용한다. Spotify 문서의 공개 예시 이미지를 쓰며 실제 신청이나 실연동 검색을 의미하지 않는다. SQL 검사는 `supabase/tests/fan_web_participation.sql`에 포함된 `live_song_requests.sql`과 기존 동시성 검사를 실행한다. 실제 공급자 검색은 운영 인증 설정 후 별도로 확인한다.

웹 롤백 시 기존 제출 기능을 계속 사용할 수 있다. 새 신청곡 행과 DB 변경을 삭제하지 않는다.
