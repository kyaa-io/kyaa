# 등급 규칙 확인 — 2026-11-12

결론: **부분 적용** — 세부 숫자는 코드와 mini의 로컬 dev DB에서 실제 계산·표시에 적용된다. 세부 숫자별 별도 혜택은 확인되지 않았으며, 현재 원격 dev DB 상태는 미확인이다.

## 확인 범위와 원본

- 운영 DB 접근 없음. 회원 행·식별자·비밀 값 조회/기록 없음.
- 2026-11-12 12:42 KST에 mini 로컬 PostgreSQL `127.0.0.1:55433/byus`를 `default_transaction_read_only=on`으로 조회했다.
- 이 DB는 원격 dev의 현재 연결이 아니다. `~/.local/share/kyaa-t3/localdev/setup-mini.sh`에 따라 MacBook에서 복사한 dev dump를 복원하고 로컬 마이그레이션을 추가 적용한 개발 DB다. `dump/dev.dump` 파일 시각은 2026-11-06 15:39이며 `dump/base.sha`는 `1b887f060da614d279089e63fd8fa0561c08753e`다. `applied.sha`에 20261220051000까지 등급 보정 적용이 기록돼 있다.
- 이 mini에는 AWS 프로필과 dev DB 접속 환경 변수가 없었다. 원격 dev RDS에 접속하거나 현재 원격 상태를 검증했다고 표현하지 않는다.
- 사용자 결정: `~/kyaa/board/decisions-by-screen.md`의 11/12 12:35 MY / 패스포트 절. 안내 페이지·등급 오른쪽 i·모달 이동 요청이며 보상 정책 변경 승인은 아니다.

## 활성 정책과 획득 조건

읽기 전용 쿼리 `select policy_version from public.reward_policy_activation` 결과는 **3**이다. `reward_policy_tier_stages where policy_version=3 order by stage_rank`에서 11개 행을 확인했다.

| 등급 | 신규 획득 조건 |
| --- | --- |
| 브론즈 | 초기 등급 |
| 실버 1 | 하트가 0일 때 채운 스탬프 칸 3개 이상 |
| 실버 2 | 하트가 0일 때 채운 스탬프 칸 6개 이상 |
| 골드 1 | 하트 1개 이상 |
| 골드 2 | 하트 8개 이상 |
| 골드 3 | 하트 11개 이상 |
| 플래티넘 1 | 하트 14개 이상 |
| 플래티넘 2 | 하트 17개 이상 |
| 플래티넘 3 | 하트 20개 이상 |
| 플래티넘 4 | 하트 24개 이상 |
| 다이아몬드 | 하트 28개 이상 |

- 하트는 해당 크리에이터의 `creator_heart_ledger` 중 `source_type=passport_page_claim` 합계와 `fan_heart_conversions.hearts` 합계다. 포인트 수를 하트처럼 세지 않는다.
- 스탬프 조건은 `passport_page_slots.stamp_id is not null` 칸 수다. 단순 방문 횟수나 포인트가 아니다.
- `passport_v3_tier`는 policy_version>=3인 기존 `fan_level_events.current_level`의 최고 큰 등급도 보존한다. 표는 신규 획득 조건이며, 기존 기록 보존 때문에 모든 회원의 표시 등급을 현재 하트 수만으로 역산할 수 없다.
- `get_fan_passport_stage`는 하트의 세부 단계와 보존된 큰 등급의 1단계 중 높은 것을 고른다. 하트 0·실버·6칸 이상이면 실버 2다.
- 브론즈·다이아몬드는 숫자를 생략하고, 실버·골드·플래티넘은 숫자를 표시한다(`features/rewards/domain/fan-stage.ts:fanStageLabel`). 골드는 1~3, 실버는 1~2, 플래티넘은 1~4다.

코드 근거: `supabase/migrations/20261210134000_heart_tier_v3.sql`의 정책 3 행과 `passport_hearts`, `passport_v3_tier`, `get_fan_passport_stage`; `20261220050000_fan_stage_next_step.sql`의 스탬프/하트 단위; `20261220051000_fan_tier_label_same_source.sql`의 MY·패스포트 라벨과 세부 단계 같은 출처 보정. DB의 두 등급 함수 정의도 읽어 코드와 대조했다.

## 혜택: 공개 가능한 확정 범위

- 세부 숫자별 별도 지급·할인·응모 우대는 확인되지 않았다. 안내에 만들지 않는다.
- `select version,status,rules #> '{actions,tier_bonus}' from public.dukjil_policy_versions` 결과: **v1 active / tier_bonus 없음**, **v2 draft / 실버 30P·골드 100P·플래티넘 300P·다이아몬드 500P**. 따라서 로컬 확인 범위에서 이 보너스는 현재 적용 혜택이 아니다. 페이지 혜택 칸에서 제외한다.
- `20261220034000_b3_tier_bonus.sql`은 활성 덕질 정책에 tier_bonus가 있을 때만 크리에이터별·큰 등급별 최초 1회 보상을 만든다. 세부 숫자 승급마다 지급하지 않는다. 정책 개시 전 이미 달성한 등급은 소급 지급하지 않으며 계정 지급 가능 여부도 검사한다. 코드 존재만으로 지급 중이라고 판단하지 않는다.
- 비밀방은 세부 단계와 찐팬 타이틀을 검사하는 DB 로직이 있지만 `apps/web/features/groups/secret-room-config.ts`에서 `SECRET_ROOMS_ENABLED=false`다. 지금 이용 가능한 등급 혜택으로 약속하지 않는다.
- 그 외 상품·할인·독점 콘텐츠·우선 응모 혜택은 근거 없음. 미정 혜택 칸은 생략하고 보고한다.

## 재확인용 조회 (개인 데이터 없음)

```sql
begin read only;
select policy_version from public.reward_policy_activation;
select stage_key, tier_name, subdivision, stage_rank, minimum_score
from public.reward_policy_tier_stages where policy_version=3 order by stage_rank;
select version, status, rules #> '{actions,tier_bonus}' as tier_bonus
from public.dukjil_policy_versions order by version;
select pg_get_functiondef('public.passport_v3_tier(uuid,uuid,integer)'::regprocedure);
select pg_get_functiondef('public.get_fan_passport_stage(uuid,uuid)'::regprocedure);
rollback;
```

원격 dev 반영 상태까지 확정하려면 승인된 dev 접속 경로에서 위 정책·함수 조회를 다시 대조해야 한다. 이 문서의 로컬 결과를 원격 dev 또는 운영 확인으로 바꾸어 쓰지 않는다.
