# SIGNUP-EVENT-1540 로컬 인계

가입 범위는 2026-11-11 00:00 이상, 11-25 00:00 미만 KST다. 상품과 당첨 인원은 미확정이다. 상품은 `상품 확정 전`으로 유지한다.

## 구현한 로컬 경로

- `source-adapter.ts`: 기존 `app_users`와 `fan_action_occurrences`의 원본 필드 모양을 받아 자동 응모 후보로 투영한다. 기간 내 회원당 기본 1회다. 가입/출석/글을 수동 응모 버튼으로 바꾸지 않는다.
- 활동 원장의 `(source_namespace, canonical_source_key)` 중복을 제거하며 출석·글에 연결할 namespace는 명시 입력한다. 다른 종류의 활동을 글로 추측하지 않는다.
- 공유는 서버 검증을 마친 클릭·경유 가입 기록만 받는다. 가입 추천은 적격 신규 회원 존재 확인, 자기 추천 제외, 추천받은 회원 단위 중복 제거를 적용한다. 일반 분석 클라이언트 이벤트를 지급 증거로 사용하지 않는다.
- 추가 배수는 `draftWeights` 필수 입력이다. 운영 기본값은 없다. 빈 파일 예제의 0은 추가 지급 중지를 뜻하며 승인된 배수가 아니다. 시험에 쓰는 1·2·3은 합산·중복 검증 입력이다.
- `/signup-event`: 기간·자동 응모·활동·미확정 상품을 보여주는 로컬 페이지다. 홈 배너는 별도 로컬 공개 플래그가 있을 때만 보인다. 공지 1건은 `notice-draft.json`이며 게시하지 않았다.
- `/admin/signup-event`: 관리자 내보내기 화면. 당첨 인원은 기본값 없이 필수 입력한다.
- `/api/admin/signup-event` GET: 기간 가입자의 마스킹 CSV. POST: 명시적 당첨 인원과 요청 UUID를 받아 로컬 가중 추첨 CSV. 참가/당첨 CSV의 회원 별칭은 일치한다. 이메일·전화·지갑·원본 회원 ID는 제외한다.
- 기존 추첨의 `-ln(uniform)/weight` 순위 방식을 로컬에서 사용한다. 기존 SQL 추첨의 영속 영수증·상품 지급·공개를 실행하지 않는다. 동일 스냅샷과 동일 요청 UUID는 같은 결과다. 스냅샷 변경을 가로지르는 영속 추첨 영수증은 만들지 않으므로 확정 추첨 재시도로 사용하지 않는다. 로컬 결과는 운영 당첨 확정이 아니다.
- 관리자 인증은 기존 `authorizeAdminSession`의 검증된 Google 계정·활성 회원·allowlist·역할 검사와 감사 실패 시 차단을 유지한다. 신원/allowlist/감사는 로컬 파일이다. 공유 DB 감사 쓰기를 호출하지 않는다. viewer는 추첨 불가다.

## 로컬 입력 계약

별도 서버를 시작하거나 공용 3000 설정을 바꾸지 않았다. 해당 기능을 통합할 수 있는 공용 미리보기 담당자가 아래 플래그를 적용해야 화면에서 확인할 수 있다.

- 서버: `KYAA_SIGNUP_EVENT_LOCAL=1`, `NODE_ENV`는 production 제외.
- 홈: `NEXT_PUBLIC_KYAA_SIGNUP_EVENT_LOCAL=1`.
- 데이터: `KYAA_SIGNUP_EVENT_SNAPSHOT` 절대경로. `local.example.json`은 원본 모양의 빈 예제다. 실회원 데이터를 저장소에 넣지 않는다. 정규화된 users/actions/draftWeights 형식도 지원한다.
- 관리자: `KYAA_SIGNUP_EVENT_ADMIN_FILE`에 로컬 users(id/privyUserId/verifiedEmail/status)와 admins(id/email/role/active). 인증 토큰은 기존 Privy 검증기를 통과해야 한다. 이 개인 파일과 `.audit.jsonl`은 저장소 밖에 둔다.
- POST 본문: `{ "quantity": <확정하거나 시험할 인원>, "requestId": <UUID> }`. 상품·인원 기본값 없음.

## 적용 범위와 남은 통합

기존 세션 동기화 성공 후, attend_creator 성공 후, save_fan_post/save_fan_post_rich 성공 후에 로컬 투영 갱신을 연결했다. 원본 가입 시각과 group_creator_attendance/fan_posts 원본 ID·생성 시각을 SELECT하고 로컬 파일에만 기록한다. 로그인 시 과거 기록도 재수집하며 페이지 단위로 읽는다. 기존 원격 RPC·권한 검증은 보존했다. 로컬 투영 실패는 원래 활동을 실패로 바꾸지 않고 오류를 기록하며 다음 로그인에서 재수집한다.

공유 버튼은 로그인 후 서버 발급 링크를 만든다. 공유 링크 GET은 서버 발급 토큰과 방문자 쿠키로 클릭을 중복 제거하고 첫 링크 귀속 쿠키를 보존한다. 가입 투영 시 링크 생성 이후 가입한 회원만 추천 증거로 연결한다. 자기 추천은 제외한다. 쿠키 삭제/자동화에 의한 클릭 조작 방어는 로컬 구현의 한계이며 운영 지급에 사용하지 않는다. 운영 활성화 전 별도 검증이 필요하다. 로컬 스냅샷에 draftWeights를 명시하고 초기화해야 자동 갱신을 시작한다. 관리자 PUT으로 원본 형식 기록을 수입할 수도 있다. PUT은 viewer를 거부하고 로컬 파일 배타 잠금·원자적 교체·기존 가입 시각 변조 거부를 적용한다.

기존 럭키드로우 준비 중, 지갑·광고 비활성은 유지한다. `post.sql`은 격리된 증거 원장 DDL 초안이며 ROLLBACK으로 끝난다. 운영 회차·상품·배너·공지는 넣지 않는다.

검증: deps --copy로 의존성 준비. 핵심 기간·중복·소스 투영·추첨·마스킹·운영 차단·관리자 권한 시험 실행. 공용 3000 `/signup-event`는 preview_open에서 표시 불가/다운로드 응답이어서 실화면 검수 미완료다. localdev 시작·공용 설정 변경·gate·push는 하지 않았다.


## 현재 검증 근거

- deps --copy 완료.
- 기간/중복/원본 투영/공유 링크→클릭→가입/관리자 권한/CSV/기존 세션 회귀 시험 통과. 직접 DB 호출은 mock이며 파일 쓰기 시험은 격리된 임시 디렉터리만 사용한다.
- 원본 갱신 시험은 가짜 SELECT 클라이언트로 가입·출석·글과 재시도 중복을 확인했다.
- `npm exec --workspace @byus/web -- tsc --noEmit --incremental false --pretty false` 통과.
- 기존 세션·출석·글 경로와 화면 렌더링을 묶은 회귀 시험 104개 통과. 이벤트 핵심 시험과 갱신/공유/로컬 저장 시험도 통과했다. 이 묶음은 일부 겹치므로 합산하지 않는다.
- 공용 브라우저의 실화면은 미확인이다. 공용 3000을 수정하지 않았고 미리보기 오류 탭은 닫았다.
- 초기 커밋 `9662de223`은 당시 gate 금지에 따라 `KYAA_T3_SKIP_PRECOMMIT=1`로 pre-commit을 우회했다. 후속 lint 수정 커밋은 감독 요청에 따라 design-lint와 정상 pre-commit을 실행한다. push는 하지 않는다.

## 11/11 감독 lint 수정

본문은 FanText, 홈 배너는 FanAction을 사용한다. 화면 CSS의 글자 크기·행간·굵기와 버튼 소유 토큰 참조를 제거했다. 공유 동작 모듈은 공유 상태·네이티브 공유를 다루는 sharing으로 정리했으며 버튼은 기존 FanAction을 유지한다. 관리자 API 시험을 contract 이름으로 맞추고 공유 API의 운영 차단·인증 실패·검증된 소유자 계약 시험을 추가했다. design-lint 신규 위반 0, 관련 4파일 9시험 통과.
