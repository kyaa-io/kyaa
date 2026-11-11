# SNS 수집기 (초안)

브라우저가 필요한 Instagram(연결 안 한 계정)·TikTok 공식 게시물을 LLM 없이 수집해
`POST /api/internal/sns-ingest`로 보낸다. 게시물은 서버가 만든다. 계약은
`docs/operations/source-only-content.md`의 "기계 수집 경로"를 따른다.

- `collect-core.mjs`: 페이지 데이터에서 원문 필드(게시물 ID, URL, 게시 시각, 캡션, 이미지 URL 최대 2개)만 꺼낸다. 메타 description은 쓰지 않는다. 제목·본문·대체 설명은 보내지 않는다.
- `collect.aside.mjs`: `aside repl --file`로 도는 실행 파일. 페이지마다 새 탭을 열고 닫는다. 사용자 탭은 쓰지 않는다. **Aside REPL의 `openTab`/`tab.evaluate`/`closeTab` 형태는 아직 실제로 확인하지 않았다.** 첫 실행 전에 이 파일의 `browser.read`만 실제 API에 맞춘다.
- 로그인 화면이면 그 출처를 `BLOCKED_LOGIN`, 게시물 목록이나 본문 데이터를 못 읽으면 `STRUCTURE_CHANGED`로 보낸다. 서버는 이를 실패 실행으로 기록하고, 24시간 성공이 없으면 텔레그램 알림을 낸다.

시험: `node --test tools/sns-collect/collect-core.test.mjs`
