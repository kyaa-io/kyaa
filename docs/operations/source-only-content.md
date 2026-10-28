# 외부 콘텐츠 원문 보존

외부 콘텐츠는 **원문 그대로 수집·저장·표시**한다. 화면 언어가 달라도 외부에서 가져온 제목과 본문은 번역하지 않는다. 수집 자동화와 기존 초안 복구도 원문 보존 계약을 따른다.

현재 CMS 공지와 일부 LIVE 제목에는 외부 출처를 구분하는 필드가 없어 표시 번역에서 외부 원문만 분리하지 못한다. 이 경로는 출처 정보가 연결되기 전까지 원문 표시가 보장되지 않는다.

## 수집·등록 계약

- 원문 URL과 실제 출처에서 읽은 제목·캡션을 증거와 함께 실행 디렉터리에 보존한다. 메타 description의 좋아요·댓글 수, 계정명·게시일 래퍼를 작성자의 캡션으로 가져오지 않는다.
- 새 제목·요약·홍보 문구·장면 설명을 만들지 않는다. 이모지·해시태그·본문 줄바꿈과 언어를 보존한다. 원문 제목이나 캡션을 확보하지 못했거나 비어 있으면 신규 항목을 보류한다.
- CMS는 ko/en 두 항목을 요구하므로 둘 모두 같은 원문을 저장한다. 제목은 원제 또는 캡션의 첫 비어 있지 않은 줄에서 앞부분을 연속으로 최대 160자 발췌한다. 전체 제목·캡션은 본문에 남긴다.
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

## 2026-10-18 경로 조사와 수정

| 경로 | 확인한 동작·조치 |
| --- | --- |
| Instagram provider·최근 활동·사진/영상 패널 | 원문 caption을 전달한다. caption이 없을 때 원문 계정 식별자를 사용한다. |
| YouTube uploads | API의 원제 그대로 전달한다. |
| CHZZK community·통합 피드 | 원문 content/text를 그대로 전달한다. 사진만 있는 글에 생성하던 번역 제목을 제거했다. 상세 제목은 플랫폼 식별 라벨을 사용한다. |
| 공식 CMS 사진 추출 | 이미지 alt를 제목으로 사용하던 경로를 공지 제목으로 변경했다. 과거 잘못 저장한 공지 제목·본문은 이 코드 수정만으로 정정되지 않는다. |
| TikTok/YouTube/Instagram 관측 LIVE | 원제가 없을 때 만들던 한국어·영어 문장을 제거했다. 확보된 원문 계정/채널 식별자를 사용한다. |
| CHZZK LIVE | 원제가 없을 때 생성하던 제목을 제거했다. 원문 채널명 또는 채널 ID를 사용한다. |
| 모바일 공용 공지·피드 RPC | 저장된 제목·본문을 읽는다. 웹의 CMS 원문 저장 규칙을 함께 적용하며 원문 응답은 유지한다. 이 저장소에는 네이티브 클라이언트 소스가 없다. |
| 매일 SNS 자동화 | `byus-ego-content-daily`의 ko/en 재작성 지시를 원문 복사·공통 함수 사용·재조회 대조로 교체했다. |
| 주간 LIVE 자동화 | `byus-live`에도 수집한 제목·설명·근거의 번역·재작성 금지를 명시했다. 기존 일정 처리 계약은 유지한다. |

기존 LIVE 제목의 160자 저장 제한은 연속된 원문 발췌로 유지한다. 이미 저장된 생성 문구의 범위와 원문 확보 상태는 `work/source-only-content-20261018/`에 별도로 기록한다. 과거 증거 파일을 덮어쓰지 않는다.
