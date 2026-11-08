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

## 화면 조회·퍼널 이벤트 (20261219010000)

`/admin/traffic`의 방문 통계는 Vercel Web Analytics 대신 원장의 `page_view`를 읽는다(운영이 AWS라 Vercel 분석은 렌더되지 않았다). Vercel 분석 패키지와 `VERCEL_ANALYTICS_*` 조회 경로는 제거했다.

- `page_view`(브라우저, `PageViewTracker`): 경로가 바뀔 때 1건. 로그인 상태면 회원 소유, 아니면 익명 탭 세션 소유로 기록한다(내부 집계용, 외부 전송 없음, 관리자 화면은 집계만). 속성은 `pageKind`(열거형 화면 종류), `entry`(탭 세션 첫 화면), `channel`(첫 화면만, 이후 `internal`), `device`, `browser`, `os` 여섯 개뿐이다. 경로·슬러그·쿼리·해시·참조 주소는 보내지 않는다. 관리자·운영자·크리에이터 도구·인증 경로는 세지 않는다. **방문(세션)은 `entry=true` 1건**이고, 첫 화면 표시는 sessionStorage에 남아 로그인 뒤에도 유지되므로 보던 탭에서 로그인해도 방문은 1번이다. 익명 세션과 회원은 연결하지 않는다.
- `share_completed`(브라우저, `recordShareCompleted`): 공유 시트 완료나 링크 복사 성공 뒤 1건. `method`(native/copy)와 `contentType`(post/notice/passport/jjinfan/share_proof)만. 로그인 상태면 회원 소유로 기록해 첫 활동에 들어간다.
- 서버 기록(`server.commit_projection`, 업무 행의 id로 멱등): `fan_verification_started`(퀴즈 시작), `fan_verification_submitted`(`outcome`·`reason`=none/score_below_pass·`score`), `daily_checkin_completed`(`streak`), `post_created`(`category`, `board`=fan/group: 팬게시판과 모임 글), `comment_created`(`reply`), `cheer_completed`(응원 글, 답글 제외, 회원·크리에이터·KST 일 단위 1건). DB가 업무 행의 존재·소유자·값을 다시 확인하므로 위조 기록은 거부된다. 기록 실패나 1초 넘는 잠금 대기는 이벤트만 건너뛰고 업무 쓰기를 막지 않는다.
- 상한: `/api/events`는 엣지가 넣은 클라이언트 IP(`x-byus-client-ip`, 해시로만 전달)당 분당 60건, `page_view`는 소유자(탭 세션 또는 회원)당 KST 하루 500건. 넘으면 204로 조용히 버린다.
- GA4 이름 대응은 `domain/funnel-event.ts`의 `GA4_EVENT_NAME`(funnel-audit `ga4-plan.md` 6절)을 따른다.

`read_admin_web_traffic`·`read_admin_funnel_analytics`는 service_role만 실행하며 관리자를 DB에서 다시 확인한다. 퍼널 4단계는 같은 UTC 기간의 단계별 수이고 한 코호트를 따라간 전환이 아니다: 방문 세션(`page_view` 세션), 가입(`app_users` 생성), 첫 팬 인증(회원의 첫 패스포트 발급), 첫 활동(출석·팬게시판 글·모임 글·댓글·응원·로그인 공유 중 회원의 첫 기록). 보조 지표 `visitedMembers`는 기간 안에 로그인 상태로 방문한 회원 중 같은 기간에 가입·첫 인증·첫 활동한 수다. 방문 세션 수집이 기간 중간에 시작됐으면 가입/방문 비율은 표시하지 않는다. 검증: `supabase/tests/funnel_events.sql`, 비슈퍼 적용 `supabase/tests/funnel_nonsuper_apply.sh`(dev의 byus_admin 형태, 소유 함수의 FORCE RLS 읽기), `features/analytics/domain/funnel-*.test.ts`, `server/admin/web-analytics-route.test.ts`.
