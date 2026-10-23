# 위나·창하 포토카드 수령 구성

2026-10-23 사용자 지시에 따라 위나는 최애 멤버 한 명의 화이트·파스텔 2장, 창하는 서로 다른 분위기 3장으로 구성한다. 기존 컬렉션 전체 지급 안내를 대체한다. 로컬 구현과 검증을 마쳤으며 운영 배포·업로드·등록은 실행하지 않았다.

## 준비한 묶음

| 위나 멤버 | 화이트 | 파스텔 |
| --- | --- | --- |
| 아야 (AYA) | W05-05 | W05-06 |
| 도아 (DOA) | W05-01 | W05-08 |
| 희 (HEE) | W05-07 | W05-02 |
| 원이 (WONY) | W05-03 | W05-04 |

멤버 대응은 Telegram KYAA TEAM의 10월 21일 18:39 앨범과 18:40 원문 설명 `도아.원이.아야.희`를 확인했다. 비공개 원문 캡처는 로컬 작업 증거에만 보존한다. 상세 파일 대응은 전달 패키지의 `evidence/member-mapping.json`에 있다.

창하는 고정된 4묶음 중 하나를 무작위 배정한다. 준비용 A는 03·05·11, B는 04·06·12, C는 07·09·10, D는 01·02·08이며 12장을 한 번씩 사용한다. 사용자가 묶음을 고르는 화면은 제공하지 않는다.

## 수령과 접근

- 기존 응원 참여 수령 권한을 사용한다. 로그인만으로 새 권한을 만들지 않는다.
- `GET /api/photocard-collections/[id]/claim`은 현재 상태만 읽는다. `POST`만 최초 선택을 확정한다.
- 위나는 멤버 선택 후 2장을 받는다. 창하는 받기 버튼을 누르면 3장을 배정받는다. 수령 권한 행을 잠가 동시 요청·중복 요청에도 최초 묶음을 유지한다.
- 네 묶음 모두 정확히 2장 또는 3장으로 준비되어야 새 수령을 허용한다. 원본 경로는 응답하지 않는다.
- 확정한 묶음만 기존 개인별 워터마크 이미지 경로로 열 수 있다. 다른 묶음과 다른 회원의 권한은 허용하지 않는다. 신규 테이블 직접 접근과 수령 함수 실행은 서비스 역할로 제한한다.
- 한번 받은 묶음은 다른 묶음의 준비 상태나 이후 이벤트 종료로 재배정하지 않는다. 수령 권한이 취소되면 열람을 차단한다.
- 다른 컬렉션의 기존 전체 지급 방식은 유지한다. 이미지가 없는 전체 지급 컬렉션은 준비 중으로 표시한다.

## 검증 근거

격리 브랜치 `codex/photocard-claim-20261023`에서 Node 24와 PostgreSQL 17로 확인했다. 로컬 증거는 원본 checkout의 `work/photocard-claim-20261023/`에 보존한다.

| 검사 | 결과·근거 |
| --- | --- |
| 수령 UI·API·기존 이미지 인증·응원 API | 관련 5개 파일 76개 테스트 통과, `focused-tests.log` |
| DB | 전체 마이그레이션, 기존 업그레이드·추첨, 묶음 접근 제어·동시 수령 통과, `sql-verification.log` |
| 실제 브라우저 | 28개 검사 통과, `browser/browser-verification.json` |
| 화면 | 두 아티스트 각각 390px·1440px 선택·수령 화면 직접 검수. 2:3 이미지, 넘침, 키보드, 초점 복귀, 접근성 검사 통과 |
| 언어 | 지원 11개 언어의 멤버 선택 화면을 두 너비에서 확인 |
| 타입·린트 | `npm run typecheck`, 변경 TS·TSX·MJS 파일 ESLint 통과 |

브라우저 검증은 실제 앱 컴포넌트에 로컬 예시 회원·수령 API와 검수용 워터마크 이미지를 연결했다. SQL/API 로직은 별도 검사했다. Aside에서도 멤버 선택·수령·열람을 확인했다. 운영 회원의 실제 수령 성공을 뜻하지 않는다.

재현 명령:

```sh
npm run test:web -- --run features/fanpage/ui/cheer-event-photocard.test.tsx server/photocards/routes.test.ts server/photocards/claims.test.ts 'app/api/photocard-collections/[id]/claim/route.test.ts' server/fanpage/cheer-event-routes.test.ts
BYUS_CLEAN_DB_UPGRADE_MIGRATION=20261129024000_wave_stage_rewards.sql BYUS_CLEAN_DB_UPGRADE_BEFORE_FILE=supabase/tests/wave_stage_upgrade_before.sql BYUS_CLEAN_DB_UPGRADE_AFTER_FILE=supabase/tests/wave_stage_upgrade_after.sql BYUS_CLEAN_DB_ASSERTION_FILE=supabase/tests/photocard_bundle_claims_all.sql BYUS_CLEAN_DB_SHELL_ASSERTION_FILE=supabase/tests/photocard_bundle_claims_concurrency.sh bash scripts/verify-clean-migration-chain.sh
KYAA_WAVE_LOCAL_URL=http://127.0.0.1:4199 node apps/web/e2e/kyaa-wave-local/photocards-run.mjs
```

브라우저 실행 전 기존 로컬 harness를 `KYAA_PHOTOCARD_QA_DIR`에 전달 패키지의 `qa/` 절대 경로를 지정해 시작한다. 검증 스크립트는 외부 원본이나 운영 API를 호출하지 않는다.

## 운영 반영 순서와 전달물

1. 마이그레이션 `20261129043000_photocard_bundle_claims.sql`을 적용한다.
2. 수령 API와 화면을 배포한다.
3. 전달 패키지의 `delivery.mjs --dry-run`으로 운영 계약을 확인한다.
4. 승인된 운영 작업에서 `delivery.mjs --publish`로 비공개 업로드·해시 검증·원자적 등록을 수행한다. SQL 단독 실행은 저장 파일 내용 검증을 생략하므로 사용하지 않는다.
5. 권한 있는 실제 회원으로 최초 수령과 재접속 시 같은 묶음 유지 여부를 확인한다.

패키지는 원본 checkout의 `outputs/photocard-delivery-20261023/` 및 같은 이름의 ZIP에 있다. 승인 원본 20장과 파생 이미지의 기존 해시·이미지 검수 근거는 재사용했으며 원본을 다시 생성하지 않았다. 운영 사전 점검은 새 계약 미반영 상태를 감지해 차단되었고 업로드는 시작하지 않았다.
