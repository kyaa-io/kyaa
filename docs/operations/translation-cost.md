# 자동 번역 비용 (측정과 절감)

## 번역 경로 측정 (코드 기준, 2026-11-11)

번역 제공자는 하나다: **Google Cloud Translation v2, `model: nmt`** (`apps/web/server/content-translation/google-translate.ts`). LLM(OpenAI/Anthropic) 호출은 없다. 비용은 글자 수 과금(공시 단가 약 $20 / 100만 자, NMT 기준 근사)이며 호출당 고정비는 없다.

| 호출 경로 | 호출 시점 | 대상 | 캐시 (변경 전) | 캐시 키 (변경 전) |
|---|---|---|---|---|
| `POST /api/display-translations` (`display-route.ts`) | 화면에 보일 때(IntersectionObserver) 1회, 또는 버튼 | 공지·SNS 수집글·일정·알림·퀴즈·라이브·혜택 등 `TranslatedText`/`useAutomaticTranslation(texts)` 전부 | DB `display_translations` + 브라우저 메모리(탭 내 200건) | **요청자별**(사용자 id 또는 `guest:날짜:IP`의 HMAC) + 배열 전체 JSON의 sha256 + 로케일. TTL 게스트 24시간 / 회원 30일 |
| `POST /api/content-translations` (`fan-posts/routes.ts`, `translate`) | 로그인 독자가 게시글·댓글을 볼 때 | `fan_post`·댓글 등 저장된 대상 | DB `content_translations`(전 독자 공유) | 대상 id + 수정 revision + 원문 해시 + 원문/대상 로케일 + slot. 원문이 바뀌면 자동 무효화 |

- 렌더마다 호출하지 않는다. 클라이언트가 화면 진입 시 1회, 같은 키는 탭 내 메모리로 중복 제거한다.
- 언어 감지: 클라이언트 `shouldOfferTranslation`(문자 스크립트 비율 + `franc-min`)으로 같은 언어면 요청 자체를 하지 않는다. 제공자의 `detectedSourceLanguage`는 응답에 있으나 저장만 하고 재사용하지 않았다.
- 배치: 제공자 호출은 최대 128건/20,000자를 한 요청으로 보낼 수 있으며, `texts` 배열 한 번에 하나의 제공자 요청이다. 게시글 title/body도 한 요청.
- 한도: 회원 일 10,000자, 전체 일 20,000자·월 200,000자, 분당 10회(`reserve_display_translation_request`).

### 낭비 지점
`display_translations`는 **요청자별** 캐시라서 같은 공지·SNS 글을 서로 다른 N명(또는 N개 IP/일)이 보면 N번 번역하고 N번 글자 수를 쓴다. 인기 글 하나(길이 L자)를 서로 다른 N명이 보면 대략 `N × L`자 과금 + 전체 일/월 한도 소진이 빨라진다. (게스트는 날짜·IP로 키가 바뀌어 같은 사람도 하루마다 재번역.) 저장된 대상 경로(`content_translations`)는 이미 공유 캐시라 낭비가 없다.

## 변경: 공유 번역 캐시 (`shared_translation_cache`)

- 키: `sha256(정규화한 원문)` + 대상 로케일 + `translator_version`. 정규화 = NFC, 줄바꿈 LF, 앞뒤 공백 제거. 원문이 바뀌면 해시가 달라져 자동 재번역된다. 제공자나 설정을 바꾸면 `TRANSLATOR_VERSION`을 올린다.
- 요청자와 무관하게 공유한다. 한 번 번역한 문장은 모든 독자가 재사용한다. 먼저 저장된 값이 유지된다(동시 미스 시 덮어쓰기 없음).
- 호출 자체를 생략: 이모지·숫자·URL만 있는 글, 문자가 2자 미만인 글, 이미 대상 언어인 글. 제공자가 "이미 대상 언어"로 감지한 글은 원문을 그대로 두고 그 사실을 캐시에 저장해 다시 보내지 않는다.
- 한 페이지의 `texts`에서 캐시에 없는 것만 한 번의 제공자 요청으로 보낸다(중복 문장 제거). 글자 수 한도도 미스한 글자만 센다.
- 실패(제공자·한도·저장소)는 원문을 200으로 돌려준다(`fallback: true`). 클라이언트가 같은 키 응답을 보관하므로 재시도 폭주가 없다. 번역은 소스/CMS 필드에 쓰지 않는다.
- 권한: 테이블은 RLS 활성, `anon`/`authenticated`의 모든 권한 회수, `service_role`만 읽고 쓴다(`read_/save_shared_translations`도 동일). 180일 지난 행은 저장 시 정리한다.

## 기대 효과
- 인기 글을 서로 다른 N명이 볼 때 제공자 호출·과금: `N × L` → `1 × L`(최초 1회). 예: N=1,000, L=300자 → 30만 자 → 300자(**약 99.9% 감소**, 같은 로케일 기준. 로케일 수만큼 곱해짐).
- 일/월 한도 소진 감소로 정상 번역이 한도 때문에 막히는 일이 줄어든다.
- 위 수치는 코드 구조에서 추정한 값이며 운영 로그로 측정한 값이 아니다. 배포 후 `display_translation_requests`의 일별 `character_count` 합계로 비교한다.

## 검증
- 단위: `apps/web/server/content-translation/display-route.test.ts` (같은 문장 두 요청 1회 번역, 수정 시 재번역, 같은 언어/이모지/숫자/URL/짧은 글 생략, 실패 시 원문, 미스만 배치).
- SQL: `supabase/tests/shared_translation_cache.sql` (anon/authenticated 쓰기·읽기 거부, RLS, 첫 값 유지, 해시/로케일/버전 분리).
