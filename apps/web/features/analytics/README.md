# kyaa 외부 링크 측정

일반 외부 링크의 UTM과 클릭 집계를 공통 기능으로 사용한다. 특정 브랜드만을 위한 기능이 아니다.

## 링크 작성

`app/layout.tsx`의 `OutboundLinkTracker`가 HTTP(S) 외부 앵커를 초기 렌더와 동적 삽입 때 처리한다. 정상적인 `<a href>` 또는 `FanAction external`을 사용하면 기본 적용된다. 새 창, 링크 복사에도 장식된 주소가 남는다. 서버 리다이렉트에는 `decorateOutboundUrl`을 사용한다. 기존 Banksy 리다이렉트와 LIVE 시청 이동도 이 함수를 사용하며 기존 전용 클릭 집계는 유지한다.

- 누락된 값만 추가: `utm_source=kyaa`, `utm_medium=referral`, `utm_campaign=<공개 맥락 또는 kyaa>`, `utm_content=<위치>.<종류>`.
- 기존 UTM과 쿼리·해시의 원문 바이트는 보존한다.
- 게시된 프로필의 DTO에서만 `data-outbound-campaign={slug}`를 표시한다. 현재 주소와 일치하는 marker를 사용하고, 그 외에는 고정 공개 목록 또는 `kyaa`로 제한한다.
- `data-outbound-placement`: `fanpage_hero`, `header`, `footer`, `content`.
- `data-outbound-kind`: `ticket`, `website`, `social`, `external`. 앵커 또는 부모 요소에 지정한다. 자유 입력 문구로 종류를 추정하지 않는다.

인증·결제 단계·서명·다운로드 URL은 변경하지 않는다. `download`, 알려진 민감 호스트·경로·쿼리 키는 자동 제외한다. 임의의 서명 URL을 모두 판별할 수는 없으므로 개인별 수령 주소나 새로운 인증/결제 링크에는 `data-outbound-tracking="off"`를 명시한다. 이 속성은 UTM과 클릭 수집 모두 끈다. 관리자·로그인·계정 연결 등 민감 화면도 제외한다. OAuth SDK·iframe·`window.location`을 전역으로 가로채지 않는다.

## 수집과 조회

일반 click(키보드 Enter 포함)과 가운데 버튼 auxclick을 `outbound_link_click`으로 전송한다. 익명 탭 세션을 기존 `/api/events` 경로로 보내고, 서버에서 해시한 뒤 이벤트 원장에 저장한다. source는 `web.outbound`, 모든 회원·콘텐츠 UUID 필드는 비운다. 속성은 `destinationHost`, `campaign`, `placement`, `linkKind` 네 개만 허용한다. 원본 URL·query·hash·링크 문구는 저장하지 않는다.

`/admin/traffic`의 외부 링크 집계에서 UTC 오늘을 포함한 최근 7·30·90일의 클릭 수와 세션 수를 확인한다. `GET /api/admin/analytics/outbound`는 기존 관리자 인증과 DB 관리자 검증 후 집계만 반환한다. 목적지·맥락·위치·종류별 상위 100개 조합을 표시하며, 전체 합계는 100개 제한과 무관하다. 브라우저 세션은 사람 수가 아니며 행별 세션 수를 더하면 중복될 수 있다. Banksy/LIVE의 기존 내부 리다이렉트 클릭은 각각 기존 전용 집계에 남는다.

전송은 keepalive를 사용하지만 네트워크·차단 확장·저장소 제한에 따라 누락될 수 있다. 전송 실패가 이동을 막지 않는다. 컨텍스트 메뉴 새 탭과 복사는 UTM만 보장하며 클릭으로 집계하지 않는다. 외부 구매 완료나 외부 사이트 내부의 UTM 보존은 제휴 측 연동 없이는 확인하지 못한다.

## 운영 순서와 검증

`20261011102000_profile_ticket_links.sql`, `20261011103000_outbound_link_analytics.sql`을 앱보다 먼저 적용한다. 앞선 브랜드 마이그레이션 두 개가 선행되어야 한다. 예매 URL은 CMS의 `ticketUrl`로 등록한다. 비어 있으면 버튼을 표시하지 않는다. 런앤뮤직 공식 개인참가 버튼의 목적지는 `https://wgrw.raceplan.co.kr/entryperson`이며 2026-10-11 실제 브라우저에서 UTM 포함 로드를 확인했다.

검증 대상은 원문 주소 보존, 민감 링크·개인 데이터 제외, 동적/SPA 링크 갱신, 키보드·가운데 클릭 중복 방지, 익명 이벤트 스키마·권한·재시도, 집계·관리자 권한과 실제 화면이다. 변경 시 관련 웹 테스트와 `supabase/tests/outbound_link_analytics.sql`을 사용한다.

## 유입 후 회원 전환

`/admin/traffic`의 유입 후 회원 전환은 같은 7·30·90일 선택을 사용한다. UTC 오늘을 포함한 선택 기간 안에서 회원별 첫 식별 유입을 채널과 첫 화면 유형으로 묶고, 그 시점 이후부터 조회 시점까지 기록된 `account_created`, `profile_completed`, `reservation_completed`, `benefit_entered`의 `server.commit_projection`만 각각 집계한다. 이전 기간에 방문한 회원도 포함하므로 신규 회원 수가 아니며, Passport·출석·예약을 순서대로 거쳐야 하는 퍼널도 아니다. 동일 회원의 중복 이벤트·재전송은 각 지표에서 한 번만 센다. 공개 선물 목록·상세 화면은 기존 `benefit` 유형으로 수집한다.

`GET /api/admin/analytics/acquisition`은 기존 관리자 인증 후 두 관리자 식별자를 DB에서 다시 확인한다. `read_admin_acquisition_analytics`는 service_role만 실행할 수 있으며 원장 직접 읽기 권한을 추가하지 않는다. 응답은 `private, no-store`이며 허용된 채널·화면 유형과 집계값만 반환한다. 1~4명인 값은 기존 `SMALL_COHORT_LT_5` 규칙으로 숨기고, 숨긴 행을 역산할 수 있는 해당 전체 합계도 숨긴다. 0명은 실제 0으로 표시한다.

익명 세션을 회원과 연결하거나 검색어를 회원 전환에 귀속하지 않는다. 페이지·유입 사이트별 방문은 기존 방문 통계를, 검색어별 노출·클릭은 Search Console을 사용한다. 수집 차단·누락이나 서버 측 측정 실패가 있을 수 있어 이 집계는 업무 원장을 대체하지 않는다. `20261018082738_acquisition_conversion_analytics.sql`을 앱보다 먼저 적용하며, 관련 웹 테스트와 `supabase/tests/acquisition_conversion_analytics.sql`로 권한·기간·중복·완료 조건·비공개 규칙을 검증한다.
