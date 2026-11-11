# 외부 콘텐츠 원문 보존

외부 콘텐츠는 **원문 그대로 수집·저장**한다. 2026-10-26 승인(AGENTS.md)에 따라 화면에서는 선택 언어의 번역을 원문과 분리해 표시할 수 있고, 원문 보기를 제공한다. 번역이 실패하면 원문을 표시하며 번역 결과는 수집 원문이나 CMS 원문 필드를 덮어쓰지 않는다. 수집 자동화와 기존 초안 복구도 원문 보존 계약을 따른다.

현재 CMS 공지와 LIVE 제목에는 외부 출처를 구분하는 필드가 없다(2026-11-05 결정: 출처 필드는 추가하지 않는다). 따라서 외부·내부 글을 가리지 않고 번역이 적용될 수 있다. 공지 상세는 제목과 본문이 하나의 번역/원문 토글을 따르고, LIVE 상세(이벤트 제목·미션 머리말 제목)에는 제목 옆 원문 토글이 있다. 목록·카드의 제목은 토글 없이 번역 시 `title` 속성으로만 원문이 보이므로 원문 확인은 상세에서 한다. 번역 표시는 원문 데이터와 별도 상태이며 실패 시 원문이 남는다는 점만 자동 테스트로 보장된다.

## 수집·등록 계약

- 원문 URL과 실제 출처에서 읽은 제목·캡션을 증거와 함께 실행 디렉터리에 보존한다. 메타 description의 좋아요·댓글 수, 계정명·게시일 래퍼를 작성자의 캡션으로 가져오지 않는다.
- 새 제목·요약·홍보 문구·장면 설명을 만들지 않는다. 이모지·해시태그·본문 줄바꿈과 언어를 보존한다. 원문 제목이나 캡션을 확보하지 못했거나 비어 있으면 신규 항목을 보류한다.
- CMS는 ko/en 두 항목을 요구하므로 둘 모두 같은 원문을 저장한다. 제목은 원제 또는 캡션의 첫 비어 있지 않은 줄에서 앞부분을 연속으로 최대 160자 발췌한다. 전체 제목·캡션은 본문에 남긴다.
- 원문 캡션이 없는 사진 글은 제목과 대체 설명에 원문 계정 식별자(`@계정`)만 둔다. 사진 카드는 이 제목이나 빈 캡션을 글 줄로 만들지 않고, 제목·메타 줄 없이 사진만 그린다. 다른 제목이 있는 카드는 그대로다.
- 사진 대체 설명도 같은 원문 발췌를 사용한다. 사진의 옷·행동·장소를 추측하지 않는다. 대체 설명을 카드 제목으로 승격하지 않는다.
- 원문 링크는 원문 URL로 표시한다. 플랫폼·날짜·방송 상태 같은 앱 메타정보는 서비스 정보로 구분하며 작성자가 쓴 문장처럼 섞지 않는다.
- 기존 내부 게시물·운영 공지의 작성 기능, 앱 안내 번역과 사용자 글 번역은 별도 기능이다.

## 자동화가 사용하는 공통 함수

`apps/web/server/notice/source-only-content.ts`의 함수를 필수로 사용한다. Node 24에서 다음처럼 불러올 수 있다.

```js
import { buildSourceOnlyLocalizations, assertSourceOnlyLocalizations }
  from './apps/web/server/notice/source-only-content.ts';

const input = {
  source: { url: originalUrl, title: originalTitle, text: originalCaption },
  images: uploadedImages.map(({ src, width, height }) => ({ src, width, height })),
};
const localizations = buildSourceOnlyLocalizations(input);
assertSourceOnlyLocalizations(input, localizations);
// CMS 재조회 결과의 body_json을 body로 매핑한 뒤 다시 대조한다.
assertSourceOnlyLocalizations(input, cmsReadbackLocalizations);
```

이미지를 아직 업로드하지 않은 초안도 같은 함수에 `images: []`를 전달한다. 본문·제목을 따로 작성한 임시 문구를 먼저 저장하지 않는다. 함수는 제목·원문이 없는 입력, 비 HTTPS/인증정보 포함 원문 URL, 임의 alt 필드, 재조회 결과의 번역·변경을 거절한다. 원문을 실제 출처에서 확보했는지는 수집 작업이 증거로 확인해야 하며 문자열 대조만으로 진위를 판정하지 않는다.

`work/ego-content-refresh-20261014/publish-cms.mjs`, `work/ego-content-refresh/runs/20261017-103057/cms-drafts.mjs`와 과거 `spec`·`payload`는 당시 작업 증거다. 원문 외 문구를 생성하므로 현재 자동화의 등록기로 재사용하지 않는다. 기존 초안을 복구할 때도 원문부터 다시 대조한다.

## 기계 수집 경로 (`POST /api/internal/sns-ingest`)

브라우저 관리자 세션 없이 공식 Instagram·TikTok 게시물을 등록하는 경로다. 전용 비밀 `SNS_INGEST_SECRET`(32자 이상, `CRON_SECRET`과 별개)이 없으면 503으로 꺼진다.

- 입력은 원문뿐이다: `celebritySlug`, `platform`, 게시물마다 `sourceId`·`sourceUrl`·`sourcePublishedAt`·`text`·`images[{url}]`(최대 2). 제목·본문·대체 설명 필드는 받지 않는다(400). 캡션 없는 사진 글의 제목 `@계정`은 서버가 CMS 등록 계정 URL에서 만든다.
- 서버가 `buildSourceOnlyLocalizations`로 만들어 초안 저장 → 이미지 저장 → 재조회 결과를 `assertSourceOnlyLocalizations`로 대조하고, 같을 때만 공개한다. 대조·이미지 실패는 비공개 초안으로 남긴다.
- CMS에 등록된 활성 공식 계정 URL과 게시물 URL의 핸들이 같아야 한다. 게시물 URL은 핸들이 들어간 형태(`instagram.com/<계정>/p/<코드>/`, `tiktok.com/@<계정>/video/<ID>`)만 받는다.
- slug는 `<platform>-<sha256(sourceId) 앞 16자>`다. 같은 slug의 공개 글은 `duplicate`, 한 번이라도 공개됐거나 관리자가 만든 글은 `blocked`로 두고 바꾸지 않는다. 이 수집 경로가 만든 기록(sns_ingest_posts)이 있고 SQL 복구 조건을 충족하는 같은 slug의 미공개 artist_post 초안만 원문으로 다시 쓴다.
- 사진이 있는 글은 저장·원문 대조 후 held / PHOTO_REVIEW_REQUIRED 초안으로 남긴다. 사람이 사진별 화면 검수를 마친 뒤 기존 CMS 경로로 공개한다. 글만 있는 게시물은 원문 대조를 통과하면 자동 공개한다.
- 이미지는 `cdninstagram.com`·`fbcdn.net`·`tiktokcdn*.com`에서만 리디렉션 없이 받아 WebP로 저장하고 `/api/public/notice-media/<id>`로 공개 글일 때만 보인다.
- HTTP 요청별 서버 실행당 공개 시도 5건 (여러 요청·플랫폼 합산 상한은 아님), 30일 지난 게시물 제외. 인증·입력·등록 출처 검사를 통과해 시작한 실행은 `sns_ingest_runs`, 출처별 마지막 시도·성공·오류는 `sns_ingest_sources`, 글 생성·복구·공개는 `audit_logs`(`notice.sns_ingest.*`)에 남는다.
- 매시 `telegram-alerts` 정비(`maintain_telegram_alerts`)가 24시간 넘게 성공하지 못한 출처를 하루 한 번 `sns_ingest_stale`로 알린다. 한 번도 호출되지 않은 출처는 기록이 없어 알리지 않는다.

## 2026-10-18 경로 조사와 수정

| 경로 | 확인한 동작·조치 |
| --- | --- |
| Instagram provider·최근 활동·사진/영상 패널 | 원문 caption을 전달한다. caption이 없을 때 원문 계정 식별자를 사용한다. 사진/영상 패널의 사진 카드는 caption이 없으면 글 줄을 뺀다(2026-11-07). |
| YouTube uploads | API의 원제 그대로 전달한다. |
| CHZZK community·통합 피드 | 원문 content/text를 그대로 전달한다. 사진만 있는 글에 생성하던 번역 제목을 제거했다. 상세 제목은 플랫폼 식별 라벨을 사용한다. |
| 공식 CMS 사진 추출 | 이미지 alt를 제목으로 사용하던 경로를 공지 제목으로 변경했다. 과거 잘못 저장한 공지 제목·본문은 이 코드 수정만으로 정정되지 않는다. |
| TikTok/YouTube/Instagram 관측 LIVE | 원제가 없을 때 만들던 한국어·영어 문장을 제거했다. 확보된 원문 계정/채널 식별자를 사용한다. |
| CHZZK LIVE | 원제가 없을 때 생성하던 제목을 제거했다. 원문 채널명 또는 채널 ID를 사용한다. |
| 모바일 공용 공지·피드 RPC | 저장된 제목·본문을 읽는다. 웹의 CMS 원문 저장 규칙을 함께 적용하며 원문 응답은 유지한다. 이 저장소에는 네이티브 클라이언트 소스가 없다. |
| 매일 SNS 자동화 | `byus-ego-content-daily`의 ko/en 재작성 지시를 원문 복사·공통 함수 사용·재조회 대조로 교체했다. |
| 주간 LIVE 자동화 | `byus-live`에도 수집한 제목·설명·근거의 번역·재작성 금지를 명시했다. 기존 일정 처리 계약은 유지한다. |
| 홈 공지(`/admin/home-notices`) | kyaa가 쓰는 내부 글이 기본이다. 외부 원문을 옮길 때만 원문 URL·원제·캡션 원문·원문 화면이나 HTML·확보 시각을 `work/home-notice-source-<YYYYMMDD>-<slug>/`에 남기고, `buildSourceOnlyLocalizations` 결과를 그대로 초안 저장한 뒤 `/api/admin/home-notices` 재조회 본문을 `assertSourceOnlyLocalizations`로 대조해 통과한 경우에만 발행한다. 원문을 확보하지 못하면 싣지 않는다. |

기존 LIVE 제목의 160자 저장 제한은 연속된 원문 발췌로 유지한다. 이미 저장된 생성 문구의 범위와 원문 확보 상태는 `work/source-only-content-20261018/`에 별도로 기록한다. 과거 증거 파일을 덮어쓰지 않는다.

인증·입력·미등록 출처 거절은 서버 로그의 `sns_ingest_rejected`에 코드·HTTP 상태만 기록한다. 요청 본문·URL·인증 헤더·비밀값은 기록하지 않는다. 이 거절 로그는 DB 실행 기록과 별개다.
