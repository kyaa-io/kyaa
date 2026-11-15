# KYAA 래플 — 11/11 17:15 확정안 반영

원본: `~/.local/share/kyaa-t3/board/tasks/signup-event/raffle-sns-preview.html`. HTML의 SNS 게시 문구·금액·인원·참여 순서를 직접 읽었다. 이 문서는 기존 신규 가입 이벤트 설계를 대체한다.

이름은 **KYAA 래플**, 총 **US$400 · 17명**이다. 경품은 **$100 × 1명 · $50 × 2명 · $25 × 4명 · $10 × 10명**이다. 신규 가입자 한정은 해제했다. 참여는 **KYAA에서 응모 → Fan Passport 받기 → 커뮤니티 가입**이며 가산 활동은 **댓글·출석 체크**다. 공유 클릭·추천 가입·글 작성 가산은 없다.

## 단일 응모 주소와 UTM

전용 짧은 경로는 `/s/raffle` 하나다. Instagram 프로필/스토리·Facebook·Threads 모두 이 경로를 사용하고 UTM의 채널만 구분한다. `raffleChannelHref`가 생성하며 고정 공개 값만 사용한다. 회원 ID·댓글 ID·추천 토큰은 넣지 않는다.

- Instagram: `/s/raffle?utm_source=instagram&utm_medium=social&utm_campaign=kyaa-raffle-202611&utm_content=content.social`
- Facebook: `/s/raffle?utm_source=facebook&utm_medium=social&utm_campaign=kyaa-raffle-202611&utm_content=content.social`
- Threads: `/s/raffle?utm_source=threads&utm_medium=social&utm_campaign=kyaa-raffle-202611&utm_content=content.social`

원본 UTM을 공통 추적기가 보존하는 analytics README 계약을 따른다. `/s/raffle`은 기존 유입 분류의 benefit에 연결했으며 공통 page_view 수집을 재사용한다. UTM은 유입 측정이며 응모 가산 증거가 아니다. 공유 보너스 API는 로컬 410, 운영 404다. 이전 로컬 전용 신규 가입/추천 페이지는 제거했다. 기존 공유 패스포트의 /s/[token]은 32자리 hex만 받으므로 정적 /s/raffle과 충돌하지 않는다.

## 참여·원장

응모 API는 기존 회원 인증으로 확인한 회원만 로컬 파일에 기록한다. 클라이언트가 보낸 회원 ID·패스포트 여부·가입 여부는 사용하지 않는다. 같은 회원이 다시 눌러도 최초 응모 시각 한 건을 보존한다. 회원의 가입 날짜는 추첨 자격에 사용하지 않는다. Fan Passport는 기존 `fan_passports`의 issued 기록, 커뮤니티 가입은 기존 `group_memberships` 기록으로 확인한다. 특정 커뮤니티 ID가 지정되지 않아 현재 가입한 커뮤니티가 한 곳 이상이면 충족한다. 이전에 받은 패스포트·기존 가입도 인정한다.

응모·패스포트·커뮤니티 가입을 모두 갖춘 회원만 후보가 되며 기본 1회다. 기존 세션 성공·출석 성공·댓글 성공·커뮤니티 가입 성공 이후에 원본을 SELECT해 로컬 상태를 갱신한다. 응모 확인 버튼도 현재 상태를 다시 읽는다. 활동은 응모 이후·기간 내 댓글과 출석만 반영한다. 댓글은 팬 게시판 댓글과 모임 댓글, 출석은 group_creator_attendance다. 원본 ID로 중복을 막고 삭제·숨김 댓글은 재동기화 시 제외한다. 기존 지갑·광고·운영 럭키드로우의 비활성 조건은 그대로다.

## 설정

`policy`는 local.example.json과 `rafflePolicySchema`의 설정이다.

- 마감 기본: `2026-11-30T23:59:59.999+09:00`, 시간대 기본 `Asia/Seoul`.
- 가산 기본: 댓글 1개 +1, 출석 체크 1회 +1.
- `dailyCaps.comment`, `dailyCaps.attendance`: 해당 시간대의 하루에 반영하는 **원본 기록 수** 상한. 0이면 해당 가산 중지, null이면 로컬 초안에서 상한 없음. 승인된 숫자가 없어 임의의 상한을 정하지 않았다.
- 시작은 기존 회차 초안의 11/11 00:00 KST를 유지하며 가입 자격 기준으로 쓰지 않는다.

마감 시각·시간대·가산 수치·상한은 화면에 표시하지 않는다. 화면은 시안대로 **11월 30일 마감**만 표시한다. 관리자 입력은 위 설정을 바꿀 수 있으며 활동 갱신은 현재 설정을 보존한다.

## 관리자·홈·공지

홈의 기존 배너 슬롯에서 로컬 플래그가 켜지면 KYAA 래플 배너를 표시한다. 본문과 행동은 FanHeading·FanText·FanAction을 쓴다. 공지는 notice-draft.json 한 건이며 게시하지 않았다. `/admin/signup-event`는 응모자 CSV와 **17명 추첨 명단** CSV를 제공한다. 추첨 결과에는 확정 경품 금액을 인원별로 배정한다. 원본 회원 식별자·이메일·전화·지갑은 내보내지 않는다. 기존 관리자 Google·활성 회원·allowlist·역할 검사를 로컬 파일/감사에 유지한다. viewer의 추첨·가져오기는 거부한다.

로컬 추첨은 기존 SQL과 같은 지수 가중 순위 방식이며 현재 로컬 스냅샷을 대상으로 한다. 영속 SQL 추첨 영수증·운영 당첨 확정·상품 지급을 실행하지 않는다.

## 실행 경계·검증

서버 `KYAA_SIGNUP_EVENT_LOCAL=1`과 홈 `NEXT_PUBLIC_KYAA_SIGNUP_EVENT_LOCAL=1`은 이전 로컬 플래그를 재사용한다. production에서는 항상 비활성이다. `KYAA_SIGNUP_EVENT_SNAPSHOT`은 저장소 밖 로컬 파일을 가리키며 빈 local.example.json 형태로 초기화한다. 관리자 파일은 `KYAA_SIGNUP_EVENT_ADMIN_FILE`로 지정하고 저장소에 넣지 않는다. 기존 소스 모양을 받는 관리자 PUT도 유지하며 local-store의 잠금·원자적 교체·원본 충돌 보호를 사용한다.

공유 byus/prod/dev DB에 쓰지 않았고 새 코드의 원격 동작은 SELECT뿐이다. 운영 데이터·SQL 실행·push·localdev 시작·공용 3000 변경은 하지 않는다. post.sql은 DDL 초안이며 ROLLBACK으로 끝난다.

공용 미리보기 `/s/raffle` 확인 결과는 현재 **404**였다. 새 로컬 코드가 공용 checkout에 반영되지 않아 변경 후 실화면은 미검증이며 정적 렌더링 시험으로 이를 대신 통과 처리하지 않는다. 감독의 공용 반영 후 390/1440 화면과 응모 동선을 확인해야 한다.

검증 기록

래플 핵심 11파일 23시험, 세션·댓글·유입 관련 회귀 5파일 118시험, TypeScript 검사 통과. 회귀 묶음은 일부 겹치므로 합산하지 않는다. design-lint 신규 위반 없음. 별도로 확대한 creator-navigation 검사 64개 중 기존 app/i 미예약 1건 실패는 기준 HEAD에도 있는 경로와 변경하지 않은 예약 목록의 문제이며 이번 작업에서 수정하지 않았다.
