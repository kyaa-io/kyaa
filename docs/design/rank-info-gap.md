# 홈 랭킹 정보 비교

기준: `cec5a6d9f`의 구현, 지정된 Telegram 발췌 파일 전체 48행. 아래 상태는 변경 전이다. 대표 발언의 구체적인 구현 조건은 이번 작업 지시로 확정한다.

| requirement (원문·시각) | currently there / partial / missing | evidence file:line | what to do |
| --- | --- | --- | --- |
| 찐팬·크리에이터 양쪽 찐팬 수 — 11-08 00:02 “1. 찐팬 순위 2. 크리에이터 순위: 찐팬규모, 하트수 등”; 11:11 “팬 수 하나만 X; 팔로워/좋아요/하트 구분” | partial | `apps/web/features/rankings/ui/ranking-rows.tsx:202`; `supabase/migrations/20261220010000_home_ranking_metrics.sql:244` | 크리에이터의 기존 찐팬 수 유지. 팬은 하트를 보유한 공개 집계 대상 크리에이터 수를 같은 집계에서 제공. 일반 팔로워 수와 혼용하지 않음. |
| 양쪽 하트 — 11-08 00:02 “찐팬규모, 하트수 등”; 20:57 “하트만으로는 하루 사이 변동 없음 → 다른 것도 같이” | partial | `apps/web/features/rankings/ui/ranking-rows.tsx:208`; `apps/web/features/rankings/ui/ranking-rows.tsx:232` | 지표 선택과 관계없이 두 탭 모두 하트와 찐팬 수를 함께 표시. 기존 정렬 지표는 유지. |
| 이번 주 증감(+n), 0도 표시 — 11-08 18:36 “실시간성·집계 정보”; 20:57 “다른 것도 같이” | partial | `apps/web/features/rankings/ui/ranking-rows.tsx:184`; `supabase/migrations/20261220010000_home_ranking_metrics.sql:178`; `supabase/migrations/20261220010000_home_ranking_metrics.sql:215` | 기존 최근 7일 스냅샷 증감을 재사용. +0·음수·비교 자료 없음(—)도 숨기지 않음. |
| 순위 옆 ▲n / ▼n, 변동 없으면 —, 항상 표시 — 11-08 00:02 “위아래 순위변동폭”; 11:11 “등락 표시”; 18:36 “등락 표시” | partial | `apps/web/features/rankings/ui/ranking-rows.tsx:177`; `apps/web/features/rankings/ui/rank-delta.tsx:8`; `supabase/migrations/20261220010000_home_ranking_metrics.sql:206` | 기존 전일 비교 유지. 등락을 순위 다음으로 이동하고 문자 표시. 신규 태그와 등락 칸 분리. |
| 기존 LIVE 소스로 빨간 점 — 11-08 11:11 “동적으로(라이브처럼)”; 18:36 “실시간성” | missing | `apps/web/features/rankings/ui/ranking-rows.tsx:190`; `supabase/migrations/20261218010000_group_directory_facts.sql:30` | 공개 live_events와 유효 override의 기존 상태 판정 사용. 팬 행은 공개 최애의 LIVE이며 접근성 이름에 대상을 명시. |
| 카드 상단 한 줄 집계 시각 — 11-08 18:36 “실시간성·집계 정보” | partial | `apps/web/features/rankings/ui/ranking-rows.tsx:112`; `apps/web/features/rankings/ui/ranking-rows.module.css:3` | computedAt 유지, “오후 11:40 기준” 형식으로 별도 한 줄 표시. 오래된 집계는 날짜도 표시. |
| 최근 진입한 팬·크리에이터 신규 태그 — 11-08 20:57 “다른 것도 같이”; 11-09 00:05 “랭킹 정보구성 꼭 정리” | partial | `apps/web/features/rankings/ui/ranking-rows.tsx:179`; `supabase/migrations/20261220010000_home_ranking_metrics.sql:247` | 전일 기록 없음만으로 신규 판정하지 않음. 기준 스냅샷 이후 최초 진입한 최근 7일 항목을 별도 isNew로 제공. 첫 집계 전체를 신규로 오인하지 않음. |
| 순위 이동 애니메이션·reduced-motion — 11-08 11:11 “순위 변동이 동적으로(라이브처럼). 지금은 스태틱”; 18:36 “순위 등락 움직임” | currently there | `apps/web/features/rankings/ui/ranking-rows.tsx:86`; `apps/web/features/rankings/ui/ranking-rows.tsx:104` | 기존 transform 기반 이동·reduced-motion 유지. 라이브러리 추가 없음. |
| 390 한 카드·1440 두 카드, 양쪽 동일한 한 줄 행, 지정 정보 순서 — 11-08 20:57 “랭킹 정보구성·배열은 레퍼런스 참고”; 11-09 00:05 “랭킹 정보구성 꼭 정리” | partial | `apps/web/features/rankings/ui/home-ranking-card.module.css:14`; `apps/web/features/rankings/ui/ranking-rows.module.css:7` | 카드 분기 유지. 홈만 순위·등락 / 아바타·이름·LIVE / 찐팬·하트·주간 증감으로 통일. 전체 순위 화면의 기존 부가정보 보존. |
| 서버 집계·cron 없는 dev·교체/권한/rollback — 11-08 18:36 “집계 정보” 및 이번 작업 기술 조건 | partial | `supabase/migrations/20261220010000_home_ranking_metrics.sql:277`; `supabase/migrations/20261220010000_home_ranking_metrics.sql:337` | 기존 on-demand 스냅샷 재사용. 새 스냅샷·cron 불필요. 20261220110000 범위의 pg_get_functiondef 교체, SHAPE/OWNER_GAP·has_table_privilege 검증 및 역교체 rollback 추가. |
| 비로그인 공개 범위·회원 ID 비노출·닉네임/아바타 노출 규칙 — 이번 작업 기술 조건; 11-08 11:11 “정보를 적절히 제공” | currently there | `apps/web/server/rankings/routes.ts:189`; `apps/web/server/rankings/routes.ts:198`; `supabase/migrations/20261220010000_home_ranking_metrics.sql:200` | 기존 5행 제한·차단/제재 필터·공개 닉네임/캐릭터·응답 허용 필드 유지. 새 값도 ID 없이 제공. |
| 400/700/800·회색 채움 없음·문자 ›·도우미 문구 없음·12언어 — 11-09 00:05 “랭킹 정보구성 꼭 정리” 및 이번 작업 UI 조건 | partial | `apps/web/features/rankings/ui/home-ranking-card.tsx:94`; `apps/web/features/rankings/ui/ranking-rows.module.css:1`; `apps/web/i18n/catalogs/features__rankings__ui__rankings-copy.ts:1` | 공통 토큰 유지, 화살표를 ›로 교체, 신규/시각/LIVE 접근성 번역 12언어 반영. DESIGN.md에 홈 행 변경 기록. |
| scoped vitest·design-lint·DB 정렬/등락/주간/0/—·clean migration chain·로컬 커밋 — 이번 작업 검증 조건 | missing (이번 변경 검증 전) | `supabase/tests/home_ranking_metrics.sql:1`; `scripts/verify-clean-migration-chain.sh:1` | 관련 테스트 확장·실행. design-lint 규칙 수정 금지, 차단 시 중단·보고. build/full tsc/deps 복사/캡처/푸시 없음. |

원문에 있는 타 앱 리서치는 이번 작업에서 확정한 정보 순서·지표를 새 설계 조사로 확대하지 않는다. 캡처와 실제 390/1440 시각 검수는 별도 담당자 범위다.

## 구현과 인계

- 홈만 공통 한 줄 행으로 변경했다. 기존 정렬 지표·5행·반응형 카드 분기·이동 애니메이션을 유지했다. `/rankings`의 등급·최애 부가정보 행은 보존했다.
- 기존 스냅샷에 `jjinfan_count`와 조회 인덱스를 추가했다. 새 테이블·cron은 없다. 기존 RPC의 소유자·ACL을 보존하는 문자열 교체이며, `liveNow`와 `isNew`만 공개 응답에 추가한다. 팬 `fans`는 본인이 하트를 보유한 집계 대상 크리에이터 수다.
- 최종 검사: scoped Vitest 11 files / 83 tests passed. 일본어 짧은 지표명 보정 뒤 홈 테스트 1 file / 29 tests passed. design-lint `no new violations`(기존 count-only warnings 유지), scoped ESLint exit 0. clean migration chain 501개 및 정렬·등락·주간 증감·0/null·LIVE/override/보관 제외·노출·일반 소유자·cron 없는 재적용·rollback 왕복 통과.
- 초기 테스트의 이전 UI 기대값/응답 허용 필드와 LIVE fixture 필수 필드(URL·해시·보관 사유)를 현재 계약에 맞게 보완했다. 실패/성공 로그는 `work/rank-info/`에 보존했다.
- 캡처·390/1440 실제 화면·실제 LIVE·dev/운영 DB는 이 작업에서 확인하지 않았다. `release-notes/2026-11-09-home-rank-info.json`의 `images`는 별도 캡처 담당자가 실제 검수한 이미지로 연결해야 한다. 배포나 운영 반영 완료를 뜻하지 않는다.
- `next build`, full tsc, `deps --copy`, 푸시를 실행하지 않았다. `scripts/design-lint*`는 수정하지 않았다.
