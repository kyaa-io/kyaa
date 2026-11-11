# SNS 수집기 (초안)

브라우저가 필요한 Instagram(연결 안 한 계정)·TikTok 공식 게시물을 LLM 없이 수집해
`POST /api/internal/sns-ingest`로 보낸다. 게시물은 서버가 만든다. 계약은
`docs/operations/source-only-content.md`의 "기계 수집 경로"를 따른다.

- `collect-core.mjs`: 페이지 데이터에서 원문 필드(게시물 ID, URL, 게시 시각, 캡션, 이미지 URL 최대 2개)만 꺼낸다. 메타 description은 쓰지 않는다. 제목·본문·대체 설명은 보내지 않는다.
- `collect.aside.mjs`: `aside repl --file`로 도는 실행 파일. 페이지마다 새 탭을 열고 닫는다. 사용자 탭은 쓰지 않는다. **Aside REPL의 `openTab`/`tab.evaluate`/`closeTab` 형태는 아직 실제로 확인하지 않았다.** 첫 실행 전에 이 파일의 `browser.read`만 실제 API에 맞춘다.
- 로그인 화면이면 그 출처를 `BLOCKED_LOGIN`, 게시물 목록이나 본문 데이터를 못 읽으면 `STRUCTURE_CHANGED`로 보낸다. 서버는 이를 실패 실행으로 기록하고, 24시간 성공이 없으면 텔레그램 알림을 낸다.

시험: `node --test tools/sns-collect/collect-core.test.mjs`

## 별도 영상 표지 (GALLERY-THUMB-1535)

영상 페이지에서 확보한 원본 표지는 `videoThumbnail: { url }`로 전송한다. 사진 본문용 `images`에 영상 표지를 넣지 않는다. 서버가 기존 CDN 허용 목록·다운로더·이미지 검증을 적용한 뒤 `mobile-media/sns-ingest/...`에 원본 표지와 작은 표지를 저장한다. 표지 저장 뒤에도 기존 이미지 검토 보류(`held / PHOTO_REVIEW_REQUIRED`)를 유지한다. 저장 실패는 `held / IMAGE_FAILED`이며 원문 본문을 바꾸지 않는다. 기존 게시물 duplicate를 재수집해서 덮어쓰지 않는다.

기존 영상 보완은 감독 전용이다. `node scripts/plan-video-thumbnail-backfill.mjs manifest.json`은 네트워크·DB·S3 쓰기가 없는 dry-run이다. JSON 배열의 각 행에 `noticeId`, `platform`, `sourceUrl`, 선택 `thumbnailUrl`을 넣는다. 누락된 표지를 임의로 만들지 않는다. 실제 복사·등록과 post SQL 검토 절차는 `work/gallery-thumb-1535/backfill-post.sql`을 따른다. 새 마이그레이션 두 개와 SNS ingest 선행 마이그레이션이 모두 필요하다.
