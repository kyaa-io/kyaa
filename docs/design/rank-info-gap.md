# 홈 랭킹 정보 비교

**현재 범위 — supervisor 00:25:** 이 브랜치는 데이터/API만 마무리한다. RANK-REDESIGN(한 카드 안 팬 5행·크리에이터 5행, 탭 없음, 하트·포인트 한 행)은 별도 목업 승인 후 구현한다. 아래 최초 화면 요구와 기존 변경 이력은 비교 근거이며 새 화면 승인이나 완료를 뜻하지 않는다. 이번 추가 커밋에는 화면 컴포넌트·CSS 변경이 없다.

기준: `cec5a6d9f`의 구현, 지정된 Telegram 발췌 파일 전체 48행. 아래 기본 상태와 줄 번호는 변경 전 기준이다. 2026-11-10 리뷰 결정에 따라 해석을 정정했다. 대표 발언과 별도 구현 지시·구현자의 해석을 구분하며, 신규와 팬 찐팬 수의 정의는 사용자 확인이 필요하다.

| requirement (원문·시각) | currently there / partial / missing | evidence file:line | what to do |
| --- | --- | --- | --- |
| 찐팬·크리에이터 양쪽 찐팬 수 — 11-08 00:02 “1. 찐팬 순위 2. 크리에이터 순위: 찐팬규모, 하트수 등”; 11:11 “팬 수 하나만 X; 팔로워/좋아요/하트 구분” | partial | `apps/web/features/rankings/ui/ranking-rows.tsx:202`; `supabase/migrations/20261220010000_home_ranking_metrics.sql:244` | 크리에이터의 기존 찐팬 수 유지. 팬은 하트를 보유한 공개 집계 대상 크리에이터 수를 같은 집계에서 제공. 일반 팔로워 수와 혼용하지 않음. |
| 양쪽 하트 — 11-08 00:02 “찐팬규모, 하트수 등”; 20:57 “하트만으로는 하루 사이 변동 없음 → 다른 것도 같이” | partial | `apps/web/features/rankings/ui/ranking-rows.tsx:208`; `apps/web/features/rankings/ui/ranking-rows.tsx:232` | 지표 선택과 관계없이 두 탭 모두 하트와 찐팬 수를 함께 표시. 기존 정렬 지표는 유지. |
| 실제 비교 기간·지표를 표시한 증감(+n), 0도 표시 — 11-08 18:36 “실시간성·집계 정보”; 20:57 “다른 것도 같이” | partial | `apps/web/features/rankings/ui/ranking-rows.tsx:184`; `supabase/migrations/20261220010000_home_ranking_metrics.sql:178`; `supabase/migrations/20261220010000_home_ranking_metrics.sql:215` | 현재 집계일 직전 7일 범위에서 존재하는 가장 오래된 스냅샷과 비교한다. weekGainDays=7일 때만 7일, 3이면 3일 등 실제 일수를 표시한다. 기간 다음에 정렬 지표의 기존 하트 아이콘/P/찐팬 표기와 +n·+0·음수·—를 화면에 함께 표시한다. 달력상의 이번 주로 표현하지 않는다. |
| 순위 옆 ▲n / ▼n, 변동 없으면 —, 항상 표시 — 11-08 00:02 “위아래 순위변동폭”; 11:11 “등락 표시”; 18:36 “등락 표시” | partial | `apps/web/features/rankings/ui/ranking-rows.tsx:177`; `apps/web/features/rankings/ui/rank-delta.tsx:8`; `supabase/migrations/20261220010000_home_ranking_metrics.sql:206` | 기존 전일 비교 유지. 등락을 순위 다음으로 이동하고 문자 표시. 신규 태그와 등락 칸 분리. |
| 방송 상태인 LIVE 빨간 점 — 최초 구현 지시 및 2026-11-10 리뷰 결정(대표의 “라이브처럼”과 별개) | missing | `apps/web/features/rankings/ui/ranking-rows.tsx:190`; `supabase/migrations/20261218010000_group_directory_facts.sql:30` | 공개 live_events와 유효 override의 기존 방송 상태 판정 사용. 크리에이터 본인이 지금 방송 중인 경우에만 표시한다. 팬 행의 최애 방송 점은 제거하고 팬 RPC/API에서도 liveNow를 제외한다. 순위의 동적 변화와 방송 상태를 혼동하지 않는다. |
| 카드 상단 한 줄 집계 시각 — 11-08 18:36 “실시간성·집계 정보” | partial | `apps/web/features/rankings/ui/ranking-rows.tsx:112`; `apps/web/features/rankings/ui/ranking-rows.module.css:3` | computedAt 유지, “오후 11:40 기준” 형식으로 별도 한 줄 표시. 오래된 집계는 날짜도 표시. |
| 최근 진입한 팬·크리에이터 신규 태그 — 11-08 20:57 “다른 것도 같이”; 11-09 00:05 “랭킹 정보구성 꼭 정리” | partial | `apps/web/features/rankings/ui/ranking-rows.tsx:179`; `supabase/migrations/20261220010000_home_ranking_metrics.sql:247` | 전일 기록 없음만으로 신규 판정하지 않음. 기준 스냅샷 이후 최초 진입한 최근 7일 항목을 별도 isNew로 제공. 첫 집계 전체를 신규로 오인하지 않음. |
| 순위 이동 애니메이션·reduced-motion — 11-08 11:11 “순위 변동이 동적으로(라이브처럼). 지금은 스태틱”; 18:36 “순위 등락 움직임” | currently there | `apps/web/features/rankings/ui/ranking-rows.tsx:86`; `apps/web/features/rankings/ui/ranking-rows.tsx:104` | “순위 변동이 동적으로(라이브처럼)”는 행 이동 애니메이션 + 순위 등락 ▲▼ + 카드 상단 집계 시각으로 충족한다. 방송 LIVE 표시 요구로 해석하지 않는다. 기존 transform 이동·reduced-motion을 유지하며 라이브러리를 추가하지 않는다. |
| 390 한 카드·1440 두 카드, 양쪽 동일한 한 줄 행, 지정 정보 순서 — 11-08 20:57 “랭킹 정보구성·배열은 레퍼런스 참고”; 11-09 00:05 “랭킹 정보구성 꼭 정리” | partial | `apps/web/features/rankings/ui/home-ranking-card.module.css:14`; `apps/web/features/rankings/ui/ranking-rows.module.css:7` | 카드 분기 유지. 홈만 순위·등락 / 아바타·이름·LIVE / 찐팬·하트·주간 증감으로 통일. 전체 순위 화면의 기존 부가정보 보존. |
| 서버 집계·cron 없는 dev·교체/권한/rollback — 11-08 18:36 “집계 정보” 및 이번 작업 기술 조건 | partial | `supabase/migrations/20261220010000_home_ranking_metrics.sql:277`; `supabase/migrations/20261220010000_home_ranking_metrics.sql:337` | 기존 on-demand 스냅샷 재사용. 새 스냅샷·cron 불필요. 20261220110000 범위의 pg_get_functiondef 교체, SHAPE/OWNER_GAP·has_table_privilege 검증 및 역교체 rollback 추가. |
| 비로그인 공개 범위·회원 ID 비노출·닉네임/아바타 노출 규칙 — 이번 작업 기술 조건; 11-08 11:11 “정보를 적절히 제공” | currently there | `apps/web/server/rankings/routes.ts:189`; `apps/web/server/rankings/routes.ts:198`; `supabase/migrations/20261220010000_home_ranking_metrics.sql:200` | 기존 5행 제한·차단/제재 필터·공개 닉네임/캐릭터·응답 허용 필드 유지. 새 값도 ID 없이 제공. |
| 400/700/800·회색 채움 없음·문자 ›·도우미 문구 없음·12언어 — 11-09 00:05 “랭킹 정보구성 꼭 정리” 및 이번 작업 UI 조건 | partial | `apps/web/features/rankings/ui/home-ranking-card.tsx:94`; `apps/web/features/rankings/ui/ranking-rows.module.css:1`; `apps/web/i18n/catalogs/features__rankings__ui__rankings-copy.ts:1` | 공통 토큰 유지, 화살표를 ›로 교체, 신규/시각/LIVE 접근성 번역 12언어 반영. DESIGN.md에 홈 행 변경 기록. |
| scoped vitest·design-lint·DB 정렬/등락/주간/0/—·clean migration chain·로컬 커밋 — 이번 작업 검증 조건 | missing (이번 변경 검증 전) | `supabase/tests/home_ranking_metrics.sql:1`; `scripts/verify-clean-migration-chain.sh:1` | 관련 테스트 확장·실행. design-lint 규칙 수정 금지, 차단 시 중단·보고. build/full tsc/deps 복사/캡처/푸시 없음. |
| 레퍼런스 조사 — 11-08 11:11 “리더보드 정보는 다른 팬덤 앱 선행 리서치”; 20:57 “랭킹 정보구성·배열은 레퍼런스 참고” | not done (미수행) | 지정 Telegram 발췌 파일 `bug-report-human-nov.md:15`, `:24`; 이 작업의 외부 레퍼런스 검토 자료 없음 | 기존 코드와 지정된 구현 조건을 대조·구현했으나 다른 팬덤 앱의 실제 화면·동작을 조사하지 않았다. 따라서 레퍼런스 요구를 완료로 처리하지 않는다. |
| 신규의 구체적 정의 — “이전 기준 집계 이후 최근 7일 안 최초 등장” | 구현 해석·사용자 확인 필요 | `supabase/migrations/20261220110000_home_ranking_info.sql:26` (`home_ranking_recent_entry`) | 현 구현은 보존된 스냅샷에서 처음 등장한 날을 기준으로 하며, 첫 집계 전체는 신규가 아니다. 대표 원문에서 이 기간·기준이 확정된 것은 아니므로 사용자 확인 필요. 이번 수정에서 계산은 유지한다. |
| 팬 행 찐팬 수의 구체적 정의 — “하트를 보유한 집계 대상 크리에이터 수” | 구현 해석·사용자 확인 필요 | `supabase/migrations/20261220110000_home_ranking_info.sql:44` (`jjinfan_count`) | 크리에이터 행의 찐팬 인원과 다른 의미다. 팬 행을 이 관계 수로 해석한 것은 구현자의 선택이며 대표 확정 정의가 아니다. 사용자 확인 필요. 이번 수정에서 계산은 유지한다. |
| 정렬과 무관하게 한 행에서 하트·포인트 동시 제공 — supervisor 00:25 “both values come back regardless of sort order” | 기존 partial → 팬 응답 구현 | `supabase/migrations/20261220110001_home_ranking_response_fields.sql`; `apps/web/server/rankings/routes.ts:192`, `:202`; `supabase/tests/home_ranking_info.sql` | 팬은 같은 날짜 fan_points 스냅샷을 연결한다. points 정렬·hearts 정렬 모두 hearts/points 제공, me도 동일. 집계 완료 후 포인트 없는 팬은 0, 해당 날짜 포인트 집계 자체가 없으면 null. 크리에이터 points는 기존 집계가 정의되지 않아 null로 명시하며 정의 확인 필요. |
| RANK-REDESIGN 화면 — supervisor 00:25 “one card holding 5 fan rows and 5 creator rows, no tabs, hearts and points on the same row” | 별도 목업 범위·미구현 | supervisor 범위 변경; 기존 `home-ranking-card.tsx`·`ranking-rows.tsx` | 목업 승인 전 대규모 레이아웃 변경 금지. 이 추가 커밋은 화면 배치를 변경하지 않는다. 기존 C10 하트 아이콘·실제 텍스트 검사·크리에이터 전체 보기 상단 한 개 검사는 유지한다. |

캡처와 실제 390/1440 시각 검수는 별도 담당자 범위다.

## 첫 커밋 구현과 인계 (2d7f298f7)

- 홈만 공통 한 줄 행으로 변경했다. 기존 정렬 지표·5행·반응형 카드 분기·이동 애니메이션을 유지했다. `/rankings`의 등급·최애 부가정보 행은 보존했다.
- 기존 스냅샷에 `jjinfan_count`와 조회 인덱스를 추가했다. 새 테이블·cron은 없다. 기존 RPC의 소유자·ACL을 보존하는 문자열 교체이며, `liveNow`와 `isNew`만 공개 응답에 추가한다. 팬 `fans`는 본인이 하트를 보유한 집계 대상 크리에이터 수다.
- 최종 검사: scoped Vitest 11 files / 83 tests passed. 일본어 짧은 지표명 보정 뒤 홈 테스트 1 file / 29 tests passed. design-lint `no new violations`(기존 count-only warnings 유지), scoped ESLint exit 0. clean migration chain 501개 및 정렬·등락·주간 증감·0/null·LIVE/override/보관 제외·노출·일반 소유자·cron 없는 재적용·rollback 왕복 통과.
- 초기 테스트의 이전 UI 기대값/응답 허용 필드와 LIVE fixture 필수 필드(URL·해시·보관 사유)를 현재 계약에 맞게 보완했다. 실패/성공 로그는 `work/rank-info/`에 보존했다.
- 캡처·390/1440 실제 화면·실제 LIVE·dev/운영 DB는 이 작업에서 확인하지 않았다. `release-notes/2026-11-09-home-rank-info.json`의 `images`는 별도 캡처 담당자가 실제 검수한 이미지로 연결해야 한다. 배포나 운영 반영 완료를 뜻하지 않는다.
- `next build`, full tsc, `deps --copy`, 푸시를 실행하지 않았다. `scripts/design-lint*`는 수정하지 않았다.


## 2026-11-10 리뷰 반영

- 팬 행의 LIVE를 제거하고 방송 LIVE 점은 크리에이터에게만 표시한다. 순위의 동적인 느낌은 행 이동·▲▼·집계 시각이 담당한다.
- 증감 앞에 `weekGainDays`의 실제 일수와 기존 하트 아이콘/P/찐팬 표기를 표시한다. 최초 집계처럼 비교 기록이 없으면 일수를 추측하지 않는다. 접근성 이름뿐 아니라 기간·증감의 실제 텍스트와 하트 아이콘 존재를 테스트한다.
- 카드 상단 집계 시각 한 줄은 유지한다. 등락 전용 비분홍 상승·하락 토큰이 없어 홈 ▲▼는 `--color-ink`를 사용한다. 메달 순위·신규·증감도 중립 색, 내 순위/로그인 면은 흰색이다. 분홍 표현은 팬/크리에이터 선택 탭과 기존 하트 자산 두 역할에 한정(정렬 지표 탭은 중립 색)하며 아이콘 필터나 새 색은 추가하지 않는다.
- 행 사이에 `--color-line` 1px 선을 추가한다. 행 높이와 이동 좌표를 바꾸지 않는 선이다. 데스크톱 크리에이터의 전체 보기는 상단 한 개만 남기고 팬 카드의 하단 내 순위/로그인과 모바일의 하단 링크는 유지한다.
- 새 마이그레이션 없이 기존 집계의 실제 비교 기간(1·3·7일/기록 없음)을 DB 테스트로 보강한다. 원래 범위대로 캡처·build·full tsc·푸시는 하지 않는다.
- 리뷰 반영 검증: scoped Vitest `Test Files 11 passed (11)`, `Tests 88 passed (88)`; design-lint `no new violations`; scoped ESLint exit 0. DB `PASS rank info: actual comparison periods null/1/3/7 days`, 기존 정렬·등락·권한·LIVE·rollback 검사와 501개 clean migration chain 통과. 중간 자동 갱신 테스트는 한 차례 실패했고 해당 로직 변경 없이 재실행에서 통과했다. 로그는 `work/rank-info-review/`에 보존했다.


## supervisor 00:25 데이터/API 인계

- 팬: `rank`, `score`, `hearts`, `points`, `fans`, `delta`, `weekGain`, `isNew`, `nickname`, `characterId`, `tier`, `isMe`, `favorite`. `liveNow`는 RPC와 HTTP 응답 모두 제외한다. 기존 프로필 노출·차단·제재 필터 및 비로그인 5행 제한을 유지한다.
- 크리에이터: `rank`, `score`, `hearts`, `points`, `fans`, `delta`, `weekGain`, `isNew`, `liveNow`, `slug`, `name`, `imageUrl`, `challenge`. `points: null`은 기존 크리에이터 포인트 집계가 없다는 뜻이다. 본인 계정 포인트나 팬 포인트 합계로 임의 해석하지 않으며 정의 확인이 필요하다.
- 공통 응답 상단: `metric`, `day`, `today`, `previousDay`, `state`, `computedAt`, `failedAt`, `comparable`, `weekGainDays`, `period`, `closesAt`, `fetchedAt`, `rows`. 팬 응답에는 로그인한 본인의 `me`도 있다(비로그인 null). `builtDay`는 서버의 새로고침 판단용 RPC 필드이며 HTTP로 보내지 않는다.
- `score`, `delta`, `weekGain`은 선택한 정렬 지표 기준. `delta > 0`은 ▲, `< 0`은 ▼, `0` 또는 `null`은 —로 표시한다. `weekGainDays`는 직전 7일 안 가장 오래된 기록과 실제로 떨어진 날짜 수(1~7), 비교 기록이 없으면 null이다. `weekGain: 0`과 `weekGain: null`을 구분한다. `computedAt`은 같은 스냅샷 집계 시각이다.
- `20261220110001_home_ranking_response_fields.sql`과 동명 rollback을 추가한다. 기존 20261220110000 migration은 수정하지 않는다. 새 스냅샷·cron 없이 pg_get_functiondef 교체와 SHAPE/OWNER_GAP·has_table_privilege 검사를 사용한다. 되돌릴 때 110001 다음 110000 순서로 실행한다.
- API 테스트는 두 정렬의 동시 값·실제 비교 기간·비로그인 회원 식별자 비노출·팬 LIVE 제거를 검증한다. DB 테스트는 0/null 구분·스냅샷 일관성·서로 다른 정렬 및 지표별 증감·기존 등락/신규/방송 판정과 두 migration rollback/reapply를 검증한다.

- 이번 데이터/API 검증: scoped Vitest 11 files / 92 tests passed, design-lint `no new violations`, scoped ESLint exit 0, DB·clean migration chain exit 0. 기존 C10 하트 아이콘 및 상단 전체 보기 검사 포함. DB 테스트의 옛 응답 키 기대값과 임시 fixture 함수 참조를 수정한 뒤 통과했다. 로그는 `work/rank-data-scope/`에 보존했다. 기존 스크립트 출력의 `migrationsApplied: 501`은 구현상 public 테이블 수이며 migration 파일 개수를 뜻하지 않는다.
