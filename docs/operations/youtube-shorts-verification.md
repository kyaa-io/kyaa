# YouTube Shorts DEV 검증 인계 (2026-11-16)

기준 커밋: f37b0ac12239e33e2bf90b082a2f3a42a48e77e4.

## 확인한 것
- 분리된 로컬 DB `shorts_yt_1116`에 기존 스키마와 숏폼 선행 migration 4개를 적용한 뒤
  `20261228150000_youtube_shorts_collector.sql` 적용 성공.
- `supabase/tests/youtube_shorts_collector.sql`: 원문 보존, 과거 수집 무시, 수동 행 보존,
  활성 공식 채널 검사, 숨김, 참여·댓글 읽기 차단, anon 접근 차단 통과.
- 실제 로컬 서버 POST `/api/internal/youtube-shorts`: 503 `NOT_CONFIGURED`.
  인증 설정 없는 요청을 거부한 결과이며 수집 성공 증거가 아니다.
- 390/1440 캡처: 임시 로컬 경로에서 실제 HomeShorts 컴포넌트와 정렬 함수를 사용.
  예시 제목·동일한 기존 공개 TikTok 표지를 양 플랫폼에 사용해 배치만 확인했다.
  임시 경로는 제거했다. YouTube 실제 표지·임베드 검증은 미완료다.
  프레임·배치 변경 없음. 동일한 높이, 카드 순서 TikTok/YouTube 교차를 확인했다.

## 감독 제출 / 남은 검증
이 환경에는 `kyaa-t3 devdb-probe` 실행 파일과 AWS 프로필·dev YouTube 키가 없다.
로컬 web 설정에도 키와 SNS 인증 값이 없어 UUSH API 확인과 실제 수집 성공은 미검증이다.
키 부재를 UUSH 실패로 간주하여 전체 업로드 목록으로 바꾸지 않았다.

1. dev 키로 활성 공식 채널의 UUSH `playlistItems.list` 1회 호출을 확인한다.
   API에서 사용할 수 없다면 계획대로 전체 업로드 목록 + 60초 이하 방식으로 바꾼다.
2. `kyaa-t3 devdb-probe`에 새 migration과 `supabase/tests/youtube_shorts_collector.sql`을 제출한다.
   위 로컬 시험은 devdb-probe PASS를 대신하지 않는다.
3. dev에서 SNS 전용 키로 POST하고 수집 행, 원문 제목, 섞인 홈, 실제 세로 표지를 확인한다.
4. mini의 run.py 설치는 감독이 한다. 운영은 SNS 전용 키 활성화(todo 186)와 별도 운영 승인 이후다.

API 계약: YouTube Data API channels.list → playlistItems.list → videos.list.
`search.list`는 사용하지 않는다. UUSH는 공식 API 문서의 보장된 Shorts 분류가 아니다.

공식 계약 확인:
- https://developers.google.com/youtube/v3/docs/videos/list
- https://developers.google.com/youtube/v3/docs/playlistItems/list

범위 vitest: 3 파일 17 시험 통과. 범위 TypeScript 검사: 새 collector·route와 정렬 파일(연결된 타입 포함) `tsc --noEmit` 통과. 전체 TypeScript 검사는 실행 시간이 길어 범위 검사로 검증했다.
