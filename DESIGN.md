---
id: '03'
slug: '03-fan-pulse-spectrum'
name: 'Fan Pulse Spectrum'
family: 'core'
palette: 'single-gradient-highlight'
font: 'pretendard'
source: "live rendered page"
observed-at: "2026-07-20"
ui-contract-updated: "2026-11-09"
theme: "light-only"
ui-font: "Pretendard Variable"
base-spacing: "4px"
radius-scale: "12px / 8px / pill"
---

# 에이전트용 핵심 규칙 (2026-11-09 기준, 브리프 v1.1)

## 게이트 A~E 확정 (사용자 "권장대로" 2026-11-09 15:52)

A2 버튼 반경 8·높이 390 44 / 1024+ 48 · B2 칩 36·14/700·반경 8 · C2 h1 26/800·h2 18/700(`FanHeading`이 태그로 정함, 폭에 따라 바뀌지 않음) · D2 페이지 전체 빈 상태도 한 줄 78 · E3 도움말 물음표 → `자세히 ›`. 시안: `board/tasks/ds-sweep/a/gate-preview/`. 화면 CSS가 직접 쓰는 옛 값(`--fan-heading-size(-wide)` 20/24, 48 고정 버튼, 12 반경 칩)은 화면 치환 묶음에서 맞춘다.

## 사용자 규칙 4개 (DS-SWEEP, 2026-11-09 — 모든 화면 작업의 전제)

1. **4차 배치 유지.** 화면 구성(블록 순서·개수·문구, 홈·헤더/셸·390 탭바·덕질·패스포트·모임·MY·글 상세·팬페이지)은 4차 55f260fd7 배치를 따른다. 디자인 시스템 정리는 면 색·굵기(400/700/800)·반경·그림자·호버 게이트만 바꾼다. 묶음마다 390 세로 총 높이 전후 차 ≤ 8px(빈 상태 축소분 제외), 블록 제목 배열 동일.
2. **회색 채움 0(예외 없음, 감독 결정 2026-11-09 11:34).** 칩·레일·띠·카드·아이콘 타일·자리표시·스켈레톤·게이지 바탕 어디에도 무채색 면을 쓰지 않는다. 면은 흰색(`--color-surface`) 또는 핑크 틴트(`--color-accent-soft`)만. 호버·눌림 = `--color-accent-soft` 틴트 또는 `scale(.97)`, 호버는 `@media (hover: hover) and (pointer: fine)` 안에서만. 메뉴·탭 하이라이트 = 핑크 틴트 면 + 핑크 글자. 비활성 = 불투명도만(면 색 불변). 자리표시·게이지 바탕·시트 손잡이 = 핑크 틴트(`--color-accent-soft`/`-line`) 또는 헤어라인 원. 선·테두리는 `--color-line`(oklch 90%) 헤어라인만(면이 아니다). 회색 측정은 `lab()`·`oklch()`·`color-mix()`를 rgb로 환산해 센다. `--color-soft`는 정적 면에 쓰지 않는다(치환 뒤 삭제 예정).
3. **블록 높이 고정(사용자 2026-11-09 11:02).** 데이터가 없어도 UI가 달라지면 안 된다. 목록형 블록은 설계 행 수로 고정하고 빈 행은 흐린 자리표시로 채운다. 블록 높이는 보통·적음·0건에서 같다(측정 0px 차). 블록을 숨기는 것은 설계에서 명시한 경우만이다.
4. **헤더 동결.** 헤더·390 탭바의 요소 구성(K3·L11)은 바꾸지 않는다. 색·면 채움·굵기만 바꿀 수 있고, 글자 잘림은 어느 폭에서도 금지(360~1440 7폭에서 `scrollWidth > clientWidth` 0).

### 헤더 상태 캡슐 접기 (2026-11-09 사용자 요청)

- 로그인 상태 캡슐은 기본 접힘: 등급 아이콘 · 하트 수 · P 잔액. 최애 이름과 개별 링크를 펼친 패널로 옮겨 헤더 길이를 줄인다. 위 헤더 동결 규칙의 이번 요청 범위 예외이며, 헤더 그리드·탭 배치는 유지한다.
- `fan-header-status.tsx`와 전용 CSS가 값을, 공용 `components/fan-ui/header-popover.tsx`와 전용 CSS가 팝오버를 소유한다. 사용자 라이브러리 선택에 따라 이 래퍼에는 `@radix-ui/react-popover@1.3.1`을 사용한다(Base UI 전용 규칙의 이 작업 한정 예외). 버튼 높이는 `--fan-action-primary-height`(44/48), 버튼·패널 반경은 `--radius-action`(8), 행 최소 높이는 48, 흰 면·핑크 상호작용·700 굵기. 패널은 폭 280, 화면 좌우 최소 16, 긴 번역·이름은 줄바꿈한다.
- 클릭/키보드로 최애 바꾸기 · 등급 안내 · 덕질 행을 연다. Esc는 닫고 버튼으로 포커스를 돌리며, 바깥 클릭·포커스 이동·계정 전환은 닫는다. 기본 버튼의 Enter/Space·행의 Tab 이동을 유지하고 Radix `data-state`의 CSS 진입·닫힘만 사용하며 reduced-motion에서는 즉시 바뀐다. Motion 라이브러리는 사용하지 않는다. 1만 이상은 축약하고 접근성 이름에는 전체 수치를 둔다.
- 기존 비로그인 최애 고르기 → 로그인 동작을 유지한다. 인증 만료는 회원 수치·등급을 숨기고 로그인으로 안내한다. 12개 언어 적용. 390/1440 실화면·캡처는 통합 시각 검수 담당 확인 전이며 기능 검사와 구분한다.

### 공통 부품 정리 문장 (C16·C17·C18, 2026-11-09)

- **C16 가져오기 경로.** 화면은 `components/fan-ui`의 부품을 파일 경로로 직접 import해도 된다. `components/fan-ui/index.ts`는 이름 목록이며 배럴 import를 강제하지 않는다(번들 분할·tree-shaking 때문, 일관성은 lint가 지킨다).
- **C17 문서 내부 정정.** `FanSurface` 반경은 12(`--radius-card`), `FanNumber md`는 16(`--fan-item-title-size`, 게이트 C 뒤 15), 토스트 z-index는 1100(옛 모달 z 정리 T8 뒤 58). 삭제 예정 토큰은 지금 globals에 **별칭**으로 남은 단계이고 사용처 치환 전이다.
- **C18 칸 높이.** `card-layout.md`의 46px는 행동·준비 칸의 최소 높이이며 값은 `FanAction` primary 높이(390 44·1024+ 48)를 따른다. 칸은 그보다 작지 않다. 숫자 두 개를 한 역할에 따로 적지 않는다.

이 절만 읽고 작업할 수 있다. 아래 "상세 이력"은 근거 기록이며 삭제하지 않는다. 값은 홈·모임·덕질에서 같은 역할이면 같아야 한다. 층 1(이 표) 기준과 층 2(실측: `apps/web/scripts/measure-tab-parity.mjs`)를 함께 본다. "승인"은 아래 상세 이력 줄 또는 공통 소유자에 근거가 있는 값, "후보"는 근거가 약해 사용자 확인이 필요한 값이다.

| 역할 | 기준 값 | 공통 소유자 | 근거 / 상태 |
|---|---|---|---|
| 화면 제목(h1) | 페이지 제목 h1 26/800/1.2(390도 26). 덕질은 헤더 위치명이 제목 역할(h1 srOnly 유지) | `fan-heading.module.css`, `--fan-heading-*` | 2026-11-09 8장 ② R1. 2026-11-06 FIX-2B의 h1=h2 통일은 폐기(h1 ≠ h2) |
| 구역 제목(h2) | 구역 제목 h2 18/700/1.2 | `--fan-section-*`, `fan-heading.module.css`(h2·h3) | 2026-11-09 R1(첫 시선과 8px 차) |
| 본문 | 본문 15(390)·14(768+)/400/1.5, 글 본문·댓글 15 고정 | `--fan-body-size(-wide)`, `--fan-post-body-size` | 2026-11-09 8장 ① |
| 보조 정보 | 메타 12/400 `--color-muted` | `--fan-metadata-size` | 2026-11-09 R1 |
| 카드 외곽 | 카드 12 반경(`--radius-card`), 1px `--color-line`, 그림자 0, 바탕 `--color-surface`(흰 면), 회색 캔버스 면 없음 | `FanSurface` | 2026-11-09 8장 ⑦ R14 |
| 구역 컨테이너(R2) | 한 화면의 같은 역할 구역은 같은 컨테이너를 쓴다. 행 목록(공지·게시글·랭킹·알림)은 `FanSurface appearance="list"` 카드 안에 두고 행이 좌우 16과 구분선을 갖는다(마지막 행 구분선은 카드 선). 사진 격자는 타일이 컨테이너다. 카드 없는 구분선 목록과 카드를 한 화면에 섞지 않는다. 화면별 감사표는 `docs/design/card-consistency-audit.md` | `fan-surface.tsx` | 2026-11-10 사용자 제보 "app 전반 통일성 검토" |
| 강조 버튼 | primary: 단색 `--color-accent`(`--color-page-accent`) 채움 + 흰 글자, 높이 44(390)/48(1024+), 반경 8, 15/700. 게이트 A2 확정(사용자 2026-11-09 15:52): 반경 8(`--radius-action`)·높이 `--fan-action-primary-height`(390 44 / 1024+ 48), 단색 accent·그림자 0·15/700. 같은 반경 8이 neutral·text·danger·service·passport·별 버튼에도 적용된다. 화면 CSS가 직접 쓰는 48 고정·알약 값은 화면 치환 때 맞춘다. 화면당 1개(예외: 럭키드로우 응모 가능 상태에서는 `응모하기` primary·`교환` secondary — 8장 plan ③) | `fan-action.module.css` | 2026-11-09 8장 ②④⑤ |
| 보조 버튼 | secondary: 높이 44, 반경 8, 1px `--color-ink` 선, 15/700 | `fan-action.module.css` | 2026-11-09 R14 |
| 탭/세그먼트(칩) | 밑줄 탭(`underline`) 44 sticky top 56, 15/700, 활성 밑줄 2px accent / 칩 36 반경 8 14/700(`--fan-chip-height`·`--fan-chip-size`, 누르는 영역은 ::after로 44, 게이트 B2 확정 — FanTabs chip·creator-roles 필터·모임 `.chip`), 선택 `--color-accent-soft` + 1px accent / 세그먼트 40 반경 8 | `fan-tabs.tsx` | 2026-11-09 R3·R14 |
| 빈 상태 | 구역 안이든 페이지 전체든 같다(게이트 D2 확정, `scope="page"`·아이콘·설명·행동 슬롯 삭제): 섹션 틀 유지 + 회색 14/400 한 문장(`…이 없습니다`, 느낌표·권유 0), 높이 = 그 자리 행 템플릿(78), 아이콘·일러스트 0. 2026-11-10 R7 개정: 다음 행동은 실제 경로로 가는 링크 하나만 `FanState`의 `action`으로 같은 구역 안에 둔다(채운 상태와 같은 카드 구조·크기 유지, 빈 썸네일은 기본 아바타 이미지). 행동이 필요하면 아래 행 자체(`지난 럭키드로우 ›`, `+ 최애 고르기`)도 허용. 비로그인은 빈 상태가 아니라 잠금(`FanLockedValue`, 화면당 로그인 primary 1) | `fan-state.tsx` | 2026-11-09 R7 + 5장 |
| 오류 | 한 문장 + `다시 시도` 텍스트 1(버튼 모양 아님), 섹션 합산 규칙 유지 | `fan-state.tsx` | 2026-11-09 R7 |
| 2열 화면 폭(덕질·홈) | 컨테이너 1,100 가운데, 본문 733 + 간격 24 + 보조 343(≈2:1). 보조 열 1단계 카드 ≤ 2(다음 행동 카드 1 + 고정 정보 1), 같은 화면군에서 같은 자리. 1열 화면 본문 ≤ 720. 1440 전폭 금지 | `fan-content-container.module.css`, 화면 그리드 | 2026-11-09 R4 |
| 최애 찾기 폭 예외 | `/celebrities`는 콘텐츠와 칩 행에 셸 너비를 사용한다. 카테고리 칩 7개를 한 줄에 표시하기 위한 예외다. | `celebrity-directory.module.css` | 2026-11-10 사용자 피드백 |
| 요소 간격 | 관련 4–8px, 하위 묶음 16px, 큰 구역 32/48px | 화면별 CSS | 승인: DESIGN.md 52행 |
| 덕질 지갑 카드 | **DS-D-DUO R2 5회차 승인(2026-11-10)**: 포인트 타일의 `교환 ›`을 누르면 390 바닥 시트·1024+ 대화상자에 포인트 24/800, `[− N장 +]`(44), `광고 보고 교환하기`(secondary 44)를 표시한다. 한국어 390 시트는 177 높이, 긴 언어는 버튼이 다음 줄 전폭으로 늘어난다. 포인트가 모자라면 타일 교환 진입을 비활성화한다. 시트 안 버튼부터는 B13 그대로: 광고 1회 → N장 교환 1건 → 토스트, 완료 확인창 없음. 기존 최대 장수·광고 세션·재확인·MY 잔액 카드 계약은 유지한다. | `stan-wallet.tsx`, `stan-exchange.tsx` | 사용자 승인 DS-D-DUO R2, B13의 진입 위치만 변경 |
| 덕질 지갑 카드 배치(DS-D) | 2×2: 포인트·응모권 / 스탬프·하트. 1440 타일 360.5×114, 390 타일 173×125, 간격 12. 숫자 18/800·단위 15/700, 라벨 12/400, 글리프는 승인 80px WebP를 40px로 표시한다. 포인트 게이지+교환, 응모권 내 응모 링크, 스탬프 9칸 게이지+남은 칸 안내·미션북 받기 링크. 하트 타일은 값만 표시한다. 스탬프는 현재 페이지 기준이며 9/9라도 미션북에서 받아야 하트가 들어온다. 이미 받은 페이지는 0/9. 공통 숫자 토큰과 다른 18px은 주요 강조를 럭키드로우에 모으기 위한 승인 예외다. | `stan-wallet.tsx`, `stan-wallet.module.css` | DS-D-DUO R2 §6·f1440.js·f390.js |
| 덕질 시안 적용 | DS-D-DUO R2: 머리 → 럭키드로우 → 내 지갑 → 오늘의 미션 → 오늘의 덕질(연속 출석만) → 찐팬/팬 순위 → 내역. 1440 앞 다섯 블록 733, 레일 343, 간격 24. 390 좌우 16. 블록 사이 32, 레일 카드 사이 12. 머리 커버 96/80, 겹친 프로필 96/56·흰 링 4, 이름 26/800. 등록 hero 이미지를 쓰며 투명 캡슐 프로필만 기존 불투명 기계 poster를 31.4%/31.2% 위치로 크롭한다. 럭키드로우 215/175, B2 원본 모듈 렌더 still 200/108, 응모 가능 수 24/800, primary 48/44 한 곳. 출석은 미션 행 한 곳(secondary), 행 64·lucide 24, 완료 체크. 찐팬 5행·내역 3행은 56, 내역 날짜는 KST YYYY.MM.DD HH:MM. 모든 숫자는 tabular-nums 및 tnum. 긴 번역·실제 제목은 잘라내지 않고 높이를 늘린다. 공통 숫자·행·4차 배치 규칙보다 이 승인 시안의 해당 수치를 우선한다. | `duo-profile.tsx`, `duo-lucky.module.css`, `stan-wallet.module.css`, `fan-missions.module.css` | 사용자 승인 DS-D-DUO R2 5회차, 리뷰 A·B 100·blocker 0 |
| 안내 오버레이(곧 안내) | 16px/400, 12px 반경 상자 | `group-benefits.module.css` `.soonNotice` | 결정 2026-11-06: 본문이 아니라 흐린 미리보기 위 상태 표시라 상자는 유지, 굵기는 본문 400으로. 후보: FanState 전환은 이번에 안 함 |
| 모임·덕질 제목 위 여백 | 모임 상단 바 아래 390 16px / 1440 40px. 덕질은 승인 DUO 커버 시작 y84/y116에 맞춰 현재 셸 기준 16/28px(홈은 히어로라 예외) | `group-benefits.module.css` `.page` padding-top, `groups.module.css` `.page` | 결정 2026-11-06: 모임 값을 기준으로 덕질을 맞춤. 로컬 화면 확인 전, dev 재측정으로 확인 |
| 카드 사이 간격 | 12px | 화면별 CSS | 결정 2026-11-06: 덕질 요약 1440 16px → 12px |
| 모임 필터 칩(1024+) | 390: 12px 반경 칩. 예외: 1024px 이상은 밑줄 탭 유지(원본 계약, :1269) | `groups.module.css` `@media(min-width:1024px)` | 결정 2026-11-06: 사용자가 고른 Pencil 원본의 계약이라 유지. 사용자 승인 없이 뒤집지 않음 |
| 모임 디렉터리 상단·목록(L4·L5) | 상단: 검색 44 + 정렬(600 미만 44 아이콘 버튼, 이상 `기본순 ∨`) 한 줄, 그 아래 칩 36 한 줄(전체·팬페이지 | 취미·브랜드 + 끝 `활동 분야 ∨` 메뉴 칩), 1280+ 한 줄. 목록: 정사각 사진 칸 3열(390, 가로 12·세로 20)·4열(600+)·5열(768+)·`minmax(148px,1fr)`(1024+). 사진 아래 흰 면에 이름 14/700(한 줄 말줄임, 원문 보존)을 표시하며 브랜드 유형과 팬 수는 표시하지 않는다. 취미 유형은 유지한다. 찐팬 100 챌린지 배지는 해당 사진 오른쪽 위에 겹쳐 표시해 카드 높이를 차지하지 않는다. 공개 시각부터 한 달 이내인 팬페이지는 사진 오른쪽 위에 연녹색 바탕·진녹색 글자의 NEW를 표시한다(챌린지와 겹치면 챌린지만 표시). 전체 기본 목록은 팬페이지를 취미·브랜드보다 먼저 표시하며, 팬페이지 안에서는 챌린지 → NEW → 나머지 순이고 각 구간은 팬 수 순이다. 칸은 부모 격자의 2행을 subgrid로 공유해 같은 행의 이름 시작선이 같다. 팬페이지는 크리에이터 승인 정사각 크롭(cover), 취미·브랜드 로고·배너는 contain + 남는 여백은 그 이미지의 흐린 복사본 색(공통 `MediaFill`, 2026-11-10 R5). 목록 칸의 한 화면 높이 유지는 검색·필터·정렬을 쓴 뒤에만 | `group-directory.module.css`, `FanEntityCard size="tile"`, `FanSkeletonRows variant="tile"` | 2026-11-09 피드백 L4·L5(사용자 "벤치마킹 찾아서 수정"): Weverse 아티스트 검색·아티스트 고르기(Mobbin). 근거 `board/tasks/feedback-l/benchmarks/L4.md`, `L5.md`. 11-09 마무리: 360 한국어 칩 줄 한 줄, ru·fr 검색 안내를 짧은 명사구로. 11-09 판정(H3·M1·M2·M3) 뒤 사진 위 띠를 없애고 이름을 사진 아래 흰 면으로(회색 채움·그라데이션 금지 둘 다 지킴). 11-10 사용자 요청으로 팬 수를 숨기고 챌린지 배지를 사진 오른쪽 위로 이동하며 이름은 한 줄 말줄임 |
| 최애 찾기(`/celebrities`) 디렉터리 | 본문 한 열 ≤ 720 가운데. 제목 행(h1 26/800 + `최애 요청`) → 검색 44/48 + 정렬 한 줄 → 칩 36(모바일 가로 스크롤, 데스크톱 줄바꿈; `전체` + 분류, `내 최애` 칩 없음) → `내 최애`(h2 18/700, 로그인하고 패스포트가 있고 검색·분류를 쓰지 않을 때만) → 선택 분류 제목과 개수(전체 선택 시 개수만) 순. 행: 헤어라인 사이 64px, 왼쪽 열 원형 아바타 48(`CreatorAvatar`), 가운데 이름 16/700 + 분류·LIVE 한 줄, 오른쪽 열 48 고정(패스포트 등급 `FanStageTooltip` 또는 `›`). 카드·회색 면 0, 제목 아래 안내 문장 없음, 로딩 행 = 핑크 틴트 | `celebrity-directory.tsx`, `.module.css`, `creator-roles.tsx` | 2026-11-09 사용자 피드백(운영 /celebrities). 벤치마크: Weverse 커뮤니티 찾기(검색 → 칩 한 줄 → 아바타 열·이름+보조 한 줄·오른쪽 고정 열 행, 내 커뮤니티는 별도 레일). 근거 `board/tasks/celebrities-compact/benchmark.png` |
| 홈 선택 칩 | 선택: 분홍 채움 #fff0f6·글자 #ad1457·테두리 #d11b62, 굵기는 비선택과 같음(모임·덕질 `.chip[aria-pressed]`와 같은 값). 비선택 흰 바탕·`--color-line` 테두리, 포커스는 `--color-ink` 윤곽 유지 | `components/fan-ui/creator-roles.module.css:38-43` `CreatorRoleFilterControl`(홈 `guest-home.tsx`, 디렉터리 `celebrity-directory.tsx`) | 2026-11-06 FIX-2C: 승인 이력 없던 검정 채움·흰 글자·650을 모임과 같은 분홍으로 통일(오케스트레이터 결정, 되돌릴 수 있음). 분홍 값은 아직 토큰이 없어 모임 CSS와 같은 값을 직접 씀 |
| 덕질 h1 | 화면에서 숨김(`srOnly`, 문서 구조 유지). 이전: 1440에서 모임과 같은 1360px | `group-benefits-screen.tsx` `<header className={styles.srOnly}>` | 2026-11-06 2차 재검토 M5: 화면 제목과 구역 제목을 가르는 역할 값이 없어 새 값을 만들지 않고 제목을 숨김(오케스트레이터 결정, 아래 "페이지 제목 숨김"). 제목 줄 오른쪽의 "랭킹"·"내역" 링크는 1차에서 없앴고 랭킹 구역의 "전체 보기", 내역 제목 줄의 "전체 보기"로 이동 |
| 홈 구역 제목 위 간격 | 히어로 다음 구역은 `.contentSection { margin-top: var(--fan-section-gap) }`(390 32px, 768+ 48px)라 모임 16/40 기준과 다름 | `components/guest-home.module.css:36` | 사유 기록만(2026-11-06): 히어로 다음 구역의 구역 간격이며 제목 여백이 아님. 모임·덕질 16/40은 상단 바 아래 여백이라 역할이 다름 |
| 월렛 내역 라벨(라이브 참여) | `live_participation` → "활동 참여"(`groupEarningsCopy.kinds.activity`). 라이브 참여는 설문·퀴즈 포함이라 미션이 아님. `group_mission`만 "미션 참여". `groups_pencil_dev_fixture`는 dev 시험 출처라 라벨·동작 없음 | `features/group-wallet/ui/history-label.ts` | 2026-11-06 DESIGN-FIX-5 |
| 다크 모드 | 없음(light-only) | front matter `theme` | 승인 |
| 페이지 머리(팬페이지) | 팬페이지 히어로(6차 적용): 390 높이 ≤ 첫 화면 1/3, 이름 26 + `팬 1.2K · ✓ 가입` 1줄 + 버튼 1 + SNS 줄, 이미지 반경 12 | `fan-page-header` | 2026-11-09 8장 block ④(6차) |
| 별 버튼 | 높이 36, 반경 8, 12/700 | `fan-star-action` | 2026-11-09 R14 |
| 유형·공지·인증 태그 | 상태 배지 `FanTag` 높이 20 알약 11/700(현재 코드 22·12/700, 크기는 이번에 안 바꿈), 팬페이지·인증 태그는 `--color-accent-soft`/`-ink`(강조색 1 안), 모임·취미(`neutral`)·공지는 흰 면 + 1px `--color-line` + muted 글자(회색 면 금지, DS-SWEEP 2026-11-09) | `fan-tag` | 2026-11-09 R14 |
| 페이지 카드·행 | 목표: `FanRow notice`(78, 사실 ≥ 2). **5차 보류**, 현재 소유자 = `FanEntityCard` | `fan-entity-card`(현재) | 2026-11-09 R5·R18. `FanRow`는 아직 없다(C15) |
| 게시판 목록 행 | 목표: `FanRow notice` 78. **5차 보류**, 현재 소유자 = `FanPostRow` | `fan-post-row`(현재) | 2026-11-09 R5. `FanRow`는 아직 없다(C15) |
| 로딩 | `FanSkeleton`만 쓴다. `불러오는 중` 글자와 `FanState kind="loading"`을 쓰지 않는다. 비로그인의 내 값 자리는 로딩이 아니라 `FanLockedValue`·`FanLockedRows`다. 스켈레톤은 실제 내용과 같은 자리·크기(로딩 전후 높이 차 0), 150ms 안에 값이 오거나 캐시가 있으면 그리지 않는다. 구역 제목은 실제 글자로 둔다. 캘린더는 날짜 칸을 바로 그리고 일정만 채운다. 바탕 = 핑크 틴트 `--color-accent-soft`, 면은 고정하고 불투명도만 1 ↔ .5로 1.2초 숨 쉰다(회색 shimmer·`background-position` 이동 금지), 움직임 줄이기에서는 150ms 뒤 한 번 나타나고 멈춤 | `components/fan-ui/fan-skeleton.tsx` | 2026-11-07 [15][33] |
| 상단 고정·캐시 | 페이지 머리·접속 띠·탭은 라우트 레이아웃의 `GroupPageFrame`이 그린다(재마운트·재요청 없음). 집계 응답은 60초 캐시 + `fetchedAt` 노출, 포커스 복귀 재조회 | `use-group-resource.ts` | 2026-11-09 R21 |
| 화면 밀림 금지 | 검색·필터·정렬·탭은 자기보다 위의 영역을 없애거나 만들지 않는다. 다시 불러올 때 이전 목록 유지, 스켈레톤은 첫 로딩만. 빈 상태 높이 = 행 템플릿(78). 쿼리만 바뀌는 이동은 `scroll:false` | 화면별 | 2026-11-09 R7 |
| 즉시 반응 | 탭·필터는 누른 즉시 선택 모양(100ms 이하), 본문 150ms 안. 좋아요·가입·댓글은 먼저 반영하고 실패하면 되돌린다. 포인트·스탬프·좋아요 변경은 응답 뒤 400ms 안에 같은 DOM 노드(`data-metric-id`) 숫자 카운트, 토스트 1줄 `+20P · 스탬프 1`(설명 줄 0), 문서 요청·라우트 재로딩·골격 0 | `reward-celebration`, `post-reactions` | 2026-11-09 R11 |
| 포인트 뱃지 | `+20P` 글자 15/700 잉크색(코인 아이콘 없음, 노랑 배지 폐기), 행의 오른쪽 열에만. `EarnBadge corner`·`EarnRemaining` 폐기(남은 횟수는 `0/3`) | `earn-badge.tsx` | 2026-11-09 8장 ⑥ + 5장 |
| 간격 | 4·8·12·16·20·24·32·40·48·64(`--space-*`)만 쓴다. 아이콘↔글자 4, 같은 줄 작은 요소 8, 이미지↔글자와 카드 사이 12, 하위 묶음 16, 탭↔본문 24, 구역 32/48 | `app/globals.css:37-46` | 2026-11-07 [18]("디자인 시스템적으로 통일된 간격") |
| 프레임 아래로 옮긴 알림 | 추첨 결과 안내(`RaffleResultsNotice`)와 Banksy 배너는 머리 위가 아니라 탭 아래 본문 첫 자리에 둔다. 값을 읽은 뒤 머리 위에 생기면 머리가 밀리기 때문이다(S1). 팬 등급(`CreatorFanGrade`)은 로그인했고 패스포트가 있을 때만 SNS 앞에 둔다 | `components/celebrity-fan-page.tsx`, `features/groups/ui/group-page-frame.tsx` | 2026-11-07 A0 구현 결정 [14][23] |
| 헤드리스 프리미티브 | Base UI(`@base-ui/react` 1.6.0)만. Radix를 들이지 않는다. 화면은 프리미티브를 직접 부르지 않고 `components/fan-ui`의 래퍼를 쓴다 | `components/fan-ui/index.ts` | 261107-2 감독 결정 ①(같은 역할 라이브러리를 둘 두지 않음). design-lint N15(@radix-ui 금지, fail), N15b(fan-ui 밖 `@base-ui/react`·수동 `role="dialog"` 집계, 치환 진행 중) |
| 모달 `FanDialog` | 폭 360/480/640, 390은 전폭-32, 반경 12, `--shadow-overlay`, 백드롭 유지 | `fan-dialog.tsx` | 2026-11-09 R14·R15 |
| 바텀시트 `FanSheet` | 390 바닥(위 모서리 12, 최대 85dvh, 안전 영역), 1024+ 오른쪽 서랍(폭 420) | `fan-dialog.tsx` | 2026-11-09 R14 |
| 드롭다운 `FanMenu` | 항목 48, 15/700, 반경 12, 1px 선, `--shadow-overlay`, 열림·닫힘 150ms | `fan-menu` | 2026-11-09 R5 |
| 툴팁·도움말 | `FanTooltip`은 아이콘 이름표만(문장 0). `HelpHint` 폐기. 물음표(?) 도움말은 쓰지 않는다 — `FanHelpTip`은 게이트 E3(2026-11-09)에 따라 `자세히 ›` 글자 13/700 accent-ink 트리거(터치는 바닥 시트, 마우스는 말풍선)로 남아 모임 디렉터리·패스포트 퀴즈 두 곳에 쓴다. 설명이 필요하면 `data-explains` 회색 12px 한 문장(설정·알림·번역 화면만, ≤ 2/화면) 또는 `자세히 ›` → `FanDialog sm` 한 문장 / `/guide/dukjil` | `fan-tooltip` | 2026-11-09 R6 |
| 접기 `FanCollapsible` | 머리 = 64(미션) 또는 48(메뉴) 규격(`FanRow`는 5차 보류, 소유자 없음), 오른쪽 `9개 +465P ˅`, 체브론 150ms, 패널 200ms. 닫힌 내용은 `inert`·남겨 둠, `persistKey` 세션 유지 | `fan-collapsible` | 2026-11-09 R5·R15 |
| 숫자 `FanNumber`·게이지 `FanGauge` | hero 44/48/800(화면당 1) · 2단계 24/800(카드 안, `lg`·`xl`) · 라벨-값 16/700(`md`, 지금 `--fan-item-title-size` 16. 15는 게이트 C 뒤). `tabular-nums`·폭 예약. 게이지 = 2px 막대(`size="line"`, 미션·챌린지, 폭 160/240·480) 또는 9칸 segments, 숫자는 막대 밖 12 | `fan-number.tsx` | 2026-11-09 R1 + 5장 |
| 숫자 칩 `FanCount` | 헤더·탭바는 점 `FanDot`(8px 빨강, `FanRow`와 무관), 숫자는 알림함 안 `읽지 않음 N`만. 섹션 머리 카운터는 12 muted `9개` | `fan-count-chip`, `fan-dot` | 2026-11-09 8장 ⑩ R9 |
| 토스트 `FanToast` | 루트 레이아웃에 하나. 사용자 지정 참고에 따라 분홍 `--color-accent`→보라 `#6042d5` 그라데이션, 흰 글자와 상태별 아이콘·닫기. 제목과 선택 설명을 표시하며 `--shadow-overlay`, 반경 12 유지 | `fan-toast` | 2026-11-10 로컬 참고 화면 |
| 버튼 변형 | `danger`(모달 안 확인만), `secondary`(= `neutral`), `size="sm"`(36, 누르는 영역 44). `trailingIcon` 화살표(`ArrowRight`) 금지 — 이동은 `FanRow`의 `›`만. `service`·`passport` 그라데이션 테두리 변형 폐기(남은 호출은 secondary 모양) | `fan-action.tsx` | 2026-11-09 R16·8장 ⑤ |
| 연출 범위(Motion) | `motion`은 보상·미션 완료·출석 연출에만. + 럭키드로우 idle(`features/lucky-draw/`) 허용 경로, 스탬프 연출(`stamp-slam`)만 0.9초 예외 | N16 | 2026-11-09 8장 ⑧ R20 |

현재 코드 상태(2026-11-09 design-sync-1, `board/tasks/design-sync/plan-ux.md` 판정): 위 표의 h1 26·h2 18·본문 15·메타 12(게이트 C), 강조 버튼 반경 8·390 높이 44(게이트 A), 칩 36(게이트 B), 페이지 전체 빈 상태(게이트 D), `FanRow`·`LuckyDrawModule`(5차 보류)은 **목표값이며 아직 코드에 없다**. 지금 코드는 h1=h2 20/24, 본문 16, 메타 13, 강조 버튼 알약 48, 칩 44다. 1단계(design-sync-1, 같은 브랜치의 뒤 커밋)로 바뀌는 값: 강조 버튼 단색·그림자 0·700, 굵기 400·700·800, 구역 안 빈 상태 78 한 문장.

측정 주의(2026-11-09): 정적 글꼴 `Pretendard UI 550/650/850` 폐기는 **예정**이다. `globals.css`에 `@font-face` 6개와 `public/fonts/pencil/*.woff`가 남아 있다. 화면 글꼴은 `Pretendard Variable` 1벌이고, 굵기는 400·700·800 토큰으로 읽는다(1단계). r5 측정은 `apps/web/scripts/measure-r3.mjs`(루브릭 r3 U1~U16).

### 검증 절차 — 화면 기준선(층 4)

`apps/web/e2e/screen-baseline/`은 홈·모임·덕질 탭을 390·1440에서 `toHaveScreenshot`(허용 오차 0)으로 비교한다. 로컬 하니스의 고정 합성 데이터와 고정 시각(2026-11-02 KST)을 쓰며 Chromium 전용이다. 회귀 탐지용이며 하니스와 배포 화면의 차이는 제품 결함으로 세지 않는다.
- 실행(`apps/web`에서): `npx playwright test -c e2e/screen-baseline/playwright.config.ts` (약 13초, 하니스 서버 자동 기동·종료)
- 기준선 갱신(디자인 변경이 수락된 뒤에만): 같은 명령에 `--update-snapshots`. 갱신된 `e2e/screen-baseline/__screenshots__/darwin/*.png` 6장을 눈으로 확인한 뒤 변경과 함께 커밋한다.
- 기준선은 macOS(darwin) 렌더링 기준이다. 다른 OS에서는 `{platform}` 폴더가 달라 이미지가 없어 실패한다. CI에는 넣지 않는다(Linux 렌더링 차이로 허용 오차 0에서 실패). macOS 로컬의 수정 전후 검사로만 쓴다.

# 디자인 시스템 기준 — 토큰·공통 컴포넌트·연출·숫자 표기 (261107-2)

위 "에이전트용 핵심 규칙" 표의 확장판이다. 기준 커밋 `47e53192a`(bundle/doc-261107). 값의 원본은 `apps/web/app/globals.css`와 `apps/web/components/fan-ui/`이고, 이 절은 그 값을 역할별로 모아 적는다. 문서와 코드가 다르면 코드가 현재 값이므로 이 절을 고친다. 시각 검수 질문(V1~V27)과 평가 루브릭 실행법은 `docs/design/visual-review-261107.md`에 있다.

원칙: 이번 단계는 **구성이 쉽게 이해되고 정돈되는 것**, **숫자·아이콘이 한 번에 읽히는 것**, **누른 동작이 실제로 되는 것**을 목표로 했다. 새 시각 언어를 만들지 않아 기존 값은 그대로 두었고, 화면마다 직접 쓰던 값에만 역할 이름을 붙였다.

## 1. 토큰 (실제 값)

새 코드는 hex·직접 px 대신 토큰을 쓴다(`color-no-hex`, `declaration-strict-value`, T3~T10이 새 위반을 실패시킨다). 표에 없는 값이 필요하면 만들어 쓰지 말고 보고한다.

### 글자 (Pretendard Variable 1벌, 글꼴 지정은 `globals.css`만 — 2026-11-09 8장 ②③)
| 역할 | 390 | 768+ | 굵기 | 줄 높이 | 토큰 |
|---|---|---|---|---|---|
| 핵심 숫자(덕질 잔액, 화면당 1) | 44 | 48 | 800 | 1 | `--fan-hero-number-size(-wide)`, `tabular-nums`, `FanNumber size="hero"` |
| 페이지 제목 h1(+ 히어로 제목) | 26 | 26 | 800 | 1.2 | `--fan-heading-size`, `--fan-heading-weight`, `--fan-heading-leading`, 자간 `--fan-heading-tracking`(-.03em, 26·18에만) |
| 구역 제목 h2 | 18 | 18 | 700 | 1.2 | `--fan-section-size`, `--fan-section-weight` |
| 항목 이름·탭·버튼·라벨-값 행 값 | 15 | 15 | 700 | 1.5(숫자 1) | `--fan-item-title-size/-weight`, `--fan-tab-weight`, `--fan-action-label-size/-weight`, `--fan-number-size`(15) |
| 카드 안 2단계 숫자 | 24 | 24 | 800 | 1 | `--fan-number-size-wide`, `--fan-number-weight`, `FanNumber size="lg"·"xl"` |
| 본문 | 15 | 14 | 400 | 1.5 | `--fan-body-size`(768+에서 `--fan-body-size-wide`로 바뀜), 글 본문·댓글은 15 고정 `--fan-post-body-size` |
| 메타 | 12 | 12 | 400 | 1.4 | `--fan-metadata-size`, 색 `--color-muted` |
| 배지·상태 알약 | 11 | 11 | 700 | 1 | `--fan-badge-size`, 높이 20 |

굵기는 **400·700·800** 세 값만. 글꼴은 `Pretendard Variable` 1벌(`globals.css` body 한 줄)이며 정적 `Pretendard UI 550/650/850` 웹 글꼴은 폐기했다(TTF는 공유 이미지 서버 렌더에만 남음). 모듈 CSS의 `font-family` 선언은 0이 기준이고, 예외는 온체인 주소 표시의 `ui-monospace`. 전역 `body { word-break: keep-all; overflow-wrap: anywhere }`. 영문·숫자도 같은 벌, 숫자는 `tabular-nums`만. 삭제 예정 토큰(1단계는 globals에 별칭으로 남김, 값 동일, 사용처 치환 전): `--fan-description-*`, `--fan-aside-title-*`(사이드 제목 = h2 18/700), `--fan-heading-editorial-weight`, `--fan-personal-section-*`, `--fan-event-catalog-title-size`, `--fan-action-emphasis-size`, `--fan-heading-size-wide`.

### 글자 역할별 짝 (2026-11-10 C2 T0, 제품 책임자 "글자 크기/굵기마다 역할이 있다")
굵기는 역할이 정한다. 700은 구역 제목·카드/행의 주체인 고유 이름·라벨-값의 값·작은 라벨과 글자 링크·버튼/탭/칩/배지(부품이 소유)·섞인 목록 안 공지/고정 행의 제목에만, 800은 화면 제목과 숫자에만 쓴다. 나머지는 400이다. 사람이 쓴 글(팬 글·공식 글·공지·댓글·메시지)의 목록 제목과 본문은 400이며 위계는 크기(행 제목 16 > 메타 13)와 색(ink > muted)으로 만든다. 메타줄은 13/400 muted, 작성자·페이지 링크는 400에 호버 밑줄. 한 행의 700은 최대 하나(글 행 0, 공지 행 제목 1, 항목 행은 이름). 화면 코드는 글자 원시값을 쓰지 않고 `FanText`·`FanHeading`·`FanNumber`·`FanTag`·`FanPostRow`를 쓴다.

| # | 역할 | 크기 | 굵기 | 행간 | 소유 |
|---|---|---|---|---|---|
| 1 | 화면 제목 | `--fan-h1-size` | `--fan-heading-weight`(800) | `--fan-heading-leading` | `FanHeading` h1 |
| 2 | 구역 제목 | `--fan-section-size` | `--fan-section-weight`(700) | `--fan-heading-leading` | `FanHeading` h2·h3 |
| 3 | 항목 이름 | `--fan-item-title-size` | `--fan-item-title-weight`(700) | `--fan-body-leading` | `FanText role="item"` |
| 4 | 글 행 제목 | `--fan-item-title-size` | `--fan-body-weight`(400, 공지 행 700) | `--fan-body-leading` | `FanPostRow`, `FanText role="row-title"` |
| 5 | 본문 | `--fan-body-size` | `--fan-body-weight`(400) | `--fan-body-leading` | `FanText role="body"` |
| 6 | 메타 | `--fan-metadata-size` | `--fan-body-weight`(400) | `--fan-metadata-leading`(1.4) | `FanText role="meta"` |
| 7 | 라벨 | `--fan-metadata-size` | `--fan-item-title-weight`(700) | `--fan-metadata-leading` | `FanText role="label"` |
| 8 | 숫자 | `--fan-number-size` | `--fan-number-weight`(800) | 1 | `FanNumber` |
| 9 | 배지 | `--fan-badge-size` | 부품 소유 | 1 | `FanTag` |

새 토큰은 `--fan-body-weight: 400`과 `--fan-metadata-leading: 1.4` 둘뿐이다. 화면 CSS는 크기·굵기를 위 짝으로만 묶고(T11), 부품 소유 토큰 `--fan-action-*`·`--fan-chip-*`·`--fan-tab-*`·`--fan-badge-*`·`--fan-calendar-*`를 쓰지 않는다. 화면 CSS의 font-size·font-weight·line-height 선언 수는 기준선보다 늘 수 없고 새 파일은 0이다(N33). 글·공지·기사·스레드 목록 행(`<li data-row>`)은 `FanPostRow`로 그린다(N32). T1(원시 font-weight)·T2(원시 line-height)는 이제 새 위반을 실패시킨다.

### 색 (강조 1색 — 2026-11-09 8장 ⑤⑥)
| 역할 | 값 | 토큰 |
|---|---|---|
| 바탕·표면 | 페이지 바탕은 모든 화면 흰색 #fff(`--color-canvas`), 카드는 1px 선으로만 구획. 회색 채움 면은 어디에도 없다(위 사용자 규칙 2). 칩·입력·세그먼트 레일·헤더 상태 캡슐은 흰 면 + 1px `--color-line`, 상태 표현은 `--color-accent-soft` 틴트. `--color-soft`는 `transparent` 별칭으로만 남고(화면 CSS 치환 전), 새로 쓰지 않는다(A1 2026-11-09, 사용자 2026-11-09 00:50 K2·11:16) | `--color-canvas`, `--color-surface`, `--color-accent-soft` |
| 4차 기준선 복원 | 사용자 2026-11-09 00:49~01:05 피드백 K·K3·K4: 화면 구성(홈·헤더/셸·계정 메뉴·390 탭바·덕질·패스포트·모임·MY·글 상세·팬페이지)은 4차 55f260fd7 배치로 되돌린다. 5차에서 남긴 것은 H6 핑크(보라·그라데이션·짙은 회색 캡슐 제거), 흰 페이지 바탕, 화면 구성을 바꾸지 않는 토큰·공통 규칙뿐. 브리프 2.3·결정 ⑦·R2 "첫 뷰포트 블록 4개 이하"와 이 문서의 5차 화면별 배치(홈 5블록·56px 헤더·덕질 지갑 쌍 등)는 **보류** | 기준선 커밋 `t3/home-revert` |
| 글자·보조·선 | oklch 18% / 48% / 90% / 93% | `--color-ink`, `--color-muted`, `--color-line`, `--color-line-subtle` |
| **강조 1색**(primary 채움·선택·활성 밑줄·링크·게이지 채움·하트) | #d11b62 / soft #fff0f6 / line #f4c3d7 / ink #ad1457 | `--color-accent`, `-soft`, `-line`, `-ink` |
| 팬페이지 대표색 | 기본 = `--color-accent`. 페이지 설정값이 이 1토큰만 바꾼다(활성 밑줄·주 버튼·게이지) | `--color-page-accent` |
| 상태색 | 빨강 1 #9f1239(오류·LIVE·알림 점). 성공은 체크 아이콘 + 잉크. 경고·순위 배지 글자 `--color-warning` #7a4206(2026-11-09, 옛 #8a4b08은 자기 30% 틴트 위 4.22:1이라 4.84:1로 어둡게) | `--color-error`, `--color-warning` |
| 비활성 | 공통 부품은 면·글자색을 그대로 두고 불투명도만 `--fan-disabled-opacity`(.4)로 낮춘다(2026-11-09 U-1). 커서 `not-allowed`·`aria-disabled`는 유지. 화면 CSS도 같다: 비활성 규칙에 회색 글자·흰 면·`--color-soft` 바탕을 쓰지 않고 `opacity`만 쓴다(옛 `--fan-action-disabled-*` 토큰은 삭제). 호버·눌림에 위치 이동 0 | `--fan-disabled-opacity` |
| 백드롭 · 포커스 링 | rgb(23 23 26 / 42%) · `--color-ink` 3px/3px | `--color-backdrop`, `--color-focus`, `--focus-width`, `--focus-offset` |
| 폐기 | 3색 그라데이션 `--color-primary-action`(로고 아트 제외), 코인 노랑 `--color-coin(-ink)`(→ lucide `Coins` 선 아이콘 + 잉크 글자), 금박 `--color-foil`(패스포트 삽화는 이미지 안에서만), 보라 `--color-service-ink`(→ `--color-page-accent`), `--color-surface-focus`(→ `--color-soft`), `--color-success`·`--color-warning`(→ 잉크) | 예정: 모두 globals에 남아 있다. `--color-primary-action`은 2026-11-09 design-sync-1에서 삭제(사용처 10파일을 `--color-accent`로 치환, 값 동일). `--color-service-ink`·`--color-surface-focus`는 별칭 단계(값이 accent 계열과 같음), 코인·금박·성공·경고는 원래 값. 사용처 치환 전 |

**H6 색 교체(사용자 지시 2026-11-08, 브리프 규칙 8 개정)**: UI 강조색은 kyaa 핑크 1색(`--color-accent` #d11b62, 흰 글자 대비 5.19:1이라 짙은 변형 없이 버튼에 쓰고, 글자용은 기존 `-ink` #ad1457). 로고 팔레트(#fd48aa 계열)에서 UI 토큰을 따로 늘리지 않았다. **보라는 CSS·TSX의 hex·rgb·hsl·oklch에서 전부 제거**(색상 250~320°·채도 10% 이상, 보랏빛 회색 포함, 로고·그림 아트 파일만 허용)하고 같은 자리를 핑크 토큰으로 바꿨다: 옅은 바탕 → `-soft`, 테두리 → `-line`, 채움·링크 → `-accent`, 짙은 글자 → `-ink`. 보랏빛 회색은 중립 토큰(`--color-soft` 바탕 1단, `--color-line-subtle`·`--color-line` 선, `--color-muted`·`--color-ink` 글자)으로 모았다. 핑크→보라 3색 그라데이션 버튼 50여 곳은 핑크 단색으로 바꿨다. **짙은 회색 채움 캡슐 금지**: 캡슐·칩·배지는 흰 바탕 + 1px 테두리(선택은 핑크 테두리·글자 또는 옅은 핑크 바탕 1단), 진행 막대·행동 버튼·읽지 않음 배지·단계 번호는 `--color-accent`. 기계 검사는 N29(보라 색상값)·N30(짙은 회색 알약), 예외는 Apple 로그인 버튼(브랜드)·영상 위 표시·관리자 설문 번호.

### 간격·반경·터치
| 항목 | 값 | 토큰 |
|---|---|---|
| 간격 | 4·8·12·16·20·24·32·40·48·64 | `--space-1`~`--space-16`. 쓰임은 핵심 규칙 표 "간격" 행 |
| 반경 2단 + 원형 | **12**(카드·다이얼로그·시트·입력·메뉴·토스트·히어로 이미지) · **8**(버튼·칩·탭 칩·배지 상자·아이콘 컨테이너) · 알약(상태 배지 `FanTag`·`✓ 완료`·점에만) · 원형 50%(아바타·선 원 아이콘) | `--radius-card`, `--radius-control`, `--radius-pill`. `--radius-collection`(16)·`--radius-hero`(20) 폐기 예정(globals에 남음, 사용처 치환 전, C1 ②), 10·16·20px 직접값 0은 목표(N27 집계). 현재 `--radius-control`은 12(8은 게이트 A), `--radius-card` 12는 2026-11-09 design-sync-1에서 신설 |
| 최소 터치 | 44 | `--min-target` |
| 강조 버튼 높이 | 44(390) · 48(1024+) | `--fan-action-primary-height` |
| 셸 | 헤더 56 · 컨텍스트 탭바 44 · 390 하단 탭바 56 | `--fan-shell-top`, `--fan-tabbar`, `--fan-bottom-nav-height` |

좌측 액센트 바(`border-left ≥ 3px` 색 선)와 아이콘 뒤 채운 배경(파스텔 사각·원)은 쓰지 않는다.

### 깊이 (8장 ⑦)
카드·행·버튼·탭·헤더는 **그림자 0**(구획은 1px `--color-line`). 오버레이(모달·시트·팝오버·드롭다운·툴팁·토스트)만 1토큰 `--shadow-overlay` = `0 8px 24px rgb(0 0 0 / 8%)`. `--shadow-dialog` 폐기 예정(globals에 남음, 3파일 사용). 유채색 그림자·글로·`filter: blur|drop-shadow`·`backdrop-filter` 0(T6·S2·S3 `fail`, N26 집계).

### 모션 시간과 겹침 순서 (8장 ⑧ "150/200 2단·이징 1종")
| 토큰 | 값 | 대상 |
|---|---|---|
| `--motion-fast` | 150ms(2026-11-09 design-sync-1 신설) | 색·투명도·체브론·탭 선택·메뉴·툴팁 열림·닫힘(나갈 때도 150) |
| `--motion-slow` | 200ms(같은 날 신설) | 접기 패널·시트·다이얼로그·토스트 이동·게이지 채움·페이지 전환 |
| `--motion-easing` | cubic-bezier(.2, 0, 0, 1) | 전부(들어올 때·나갈 때 같은 이징) |
| 연출 예외(`data-motion`) | 랭킹 행 FLIP 240(`--motion-reorder`), 숫자 카운트 400(`--motion-count`), 스탬프 연출 `stamp-slam` 0.9초 + 보상 팝 600(`--motion-reward`), 럭키드로우 idle 2.4~4.0초(`[data-lucky-module]` 안만) | 8장 ⑧ + R18·R20 |
| 폐기 | `--motion-control`(→ fast)·`--motion-layout`(→ slow)·`--motion-exit`(→ fast), 미션 nudge 깜빡임, 숫자 펄스 1.06 | 예정: 세 토큰은 globals에 원래 값(160·240·120ms)으로 남아 있고 사용처 치환 전 |

`--z-*`: 헤더 20 · 하단 내비 30 · 드롭다운 35 · 백드롭 40 · 서랍 45 · 다이얼로그 50 · alertdialog 55 · 토스트 1100(옛 모달 z 100~1000 정리(T8) 뒤 58) · 툴팁 60. z-index는 이 토큰만 쓴다(T8).

## 2. 공통 컴포넌트와 쓰는 경우

가져오는 곳은 `components/fan-ui/index.ts` 하나다. 화면은 `@base-ui/react`를 직접 부르지 않고(N15·N15b), 원시 `<button>`·`<h1>`~`<h3>`·수동 `role="dialog"`를 새로 쓰지 않는다(C1·C2·N15b).

| 컴포넌트 | 쓰는 경우 | 쓰지 않는 경우 |
|---|---|---|
| `FanAction` | 모든 버튼·링크 모양. primary = accent 단색·반경 8·44/48, secondary = 1px 잉크 선·반경 8, `size="sm"` 36, `loading`(라벨 유지 + 대기). 비활성은 준비 기간에 한해 화면당 2(`교환` 포인트 부족·럭키드로우 `다음 주 시작`)까지(8장 plan ④). `service`·`passport` 변형은 폐기(남은 호출은 secondary 모양) | 화면 전체에 primary는 하나(V7). `danger`는 모달 안 확인(삭제·신고)에만 |
| `FanIconButton` | 글자 없는 44px 아이콘 버튼. `FanMenu`·`FanTooltip` 트리거(ref·aria를 DOM에 넘김). `aria-label` 필수 | 글자가 있는 버튼 → `FanAction` |
| `FanDialog` | 화면을 막고 답을 받는 짧은 흐름: 확인·삭제·신고·교환·프로필 수정·언어 선택. `size` sm 360·md 480·lg 640(390은 전폭-32). `alert`는 되돌릴 수 없는 확인(배경 클릭으로 닫히지 않음). `responsive`면 1024 미만에서 시트 | 공유 주소가 필요한 목록·상세 → 페이지(N14). 항목 고르기 → `FanMenu`. 소개 문장은 그리지 않는다(`description`은 화면 판독기 전용) |
| `FanSheet` | 390에서 바닥으로 올라오는 선택·긴 내용·터치 도움말. 1024+는 오른쪽 서랍(폭 420). `snap` content·half·full | 짧은 확인 → `FanDialog`. 드래그로 닫기는 없다(버튼·ESC·백드롭) |
| `FanMenu` | 눌렀을 때 동작 2개 이상 중 고르기: ⋯ 메뉴, 계정, 정렬, 최애 고르기(`FanMenu.Radio`). 위험 항목 `destructive` | 동작이 하나면 버튼. 설명을 담는 곳이 아니다 |
| `FanTooltip` | 글자 없는 아이콘의 이름표. 마우스 호버·포커스만 | 터치에서는 그려지지 않으므로 필요한 정보를 넣지 않는다. `title=` 속성도 쓰지 않는다 |
| `FanHelpTip` · `HelpHint` | **폐기(2026-11-09, R6)**. 설명은 값으로 바꾸거나(라벨-값 메타) 설정류 화면에서만 `data-explains` 한 문장 | 새로 쓰지 않는다 |
| `FanCollapsible` · `FanCollapsibleTrigger` · `FanDisclosure` | 접기. 기본은 닫힘, 오늘 할 것만 `defaultOpen`(N5). `persistKey`로 세션 안 유지. 서버 컴포넌트에서는 `FanDisclosure` | `<details>`를 새로 쓰지 않는다 |
| `FanNumber` · `FanGauge` | 자산 숫자(포인트·응모권·온도)는 `FanNumber`(md 16·lg 24·xl 24→32, `countUp`은 값이 바뀔 때, `pulseOnChange`는 온도). 진행·남은 양은 `FanGauge`(`valueText` 오른쪽 `1/3`, `segments`로 칸 나눔) | 막대 안에 글자를 넣지 않는다 |
| `FanCount` | 알림·댓글 수 같은 숫자 칩. 0이면 그리지 않고 99 넘으면 `99+` | 지갑 잔액(0도 보여야 함) → `FanNumber` |
| `FanTag` | 유형·공지·인증 표시 글자(tone fan·neutral·notice·artist) | 숫자·설명을 넣지 않는다(S9). 성공·대기·실패 색 태그는 아직 없다 |
| `EarnBadge inline` | `+20P` 글자 15/700 잉크, 행 오른쪽 열에만. `corner`·`EarnRemaining`·`EarnActionBadge`는 폐기(남은 횟수는 `0/3`) | 숫자를 화면에 직접 쓰지 않고 카탈로그 값을 읽는다(C9) |
| `FanToast` (`useFanToast`·`showFanToast`) | 서버 응답이 화면에 안 보이는 곳의 결과: 댓글 저장, 업로드 실패, 교환 완료, 미션 지급 실패 | 포인트·도장 지급 성공은 `celebrateReward`(코인 뱃지 + 공통 토스트, 아래 §3-1)가 맡는다. 폼 안 오류는 입력 아래 |
| `FanTabs` | `underline` 44 sticky top 56(페이지·보조 탭), `chip` 36 반경 8(필터), `segment` 40 반경 8(같은 자료 2~3개 보기) | 링크 탭(`href`)은 라우터가 그린다 |
| `FanState` | 빈 상태(`empty`)는 한 문장 전용(`icon`·`actions`·`description` 없음, 타입에서 막음, 높이 78 14/400 회색, 2026-11-09 design-sync-1). 페이지 전체가 빈 화면도 같은 한 줄이다(게이트 D2 확정, `scope="page"` 삭제: `my-raffles-screen`·`fan-history-screen`·`participation-requests`·`notification-center`·`home-ranking-card`; `benefit-recipient-screen`의 세션 요구는 `auth`, 항목 없음은 `error`로 옮김), 오류(`error`)는 한 문장 + `다시 시도` 텍스트, 잠금(`auth`)은 로그인 primary 1 허용 | `kind=\"loading\"`은 쓰지 않는다(C6) |
| `FanSkeleton` · `FanSkeletonRows` | 로딩. 실제 자리·크기와 같게, 구역 제목은 글자로 둔다. 변형 post·entity·member·plain | `불러오는 중` 글자(C5) |
| `FanSurface` | 카드·면의 바탕(1px 선, 반경 `--radius-card` 12. C17 정정: 문서의 "12/16"은 12) | `FanCard`는 만들지 않았다(아래 "설계와 다르게 한 것") |
| `FanRow` (**5차 보류, 아직 없음**) | 목록 행 템플릿. variant `menu` 48·`setting` 65/81·`notice` 78·`transaction` 100/72·`label-value` 56·`mission` 64. `data-row` 자동, 오른쪽 칸 `data-row-end`, 사실 `data-fact`, 메타 `data-meta` | `FanEntityCard`·`FanPostRow`는 `FanRow notice`로 대체 |
| `FanIcon` (신설, B 담당) | lucide 래퍼: `strokeWidth` 1.5, size 16·20·24, `data-icon`·`data-icon-set="lucide"`. 화면은 lucide를 직접 import하지 않는다(N25). 코인·티켓·하트 = `Coins`·`Ticket`·`Heart` | 도장 아트는 아이콘이 아니다(`data-art="stamp"`) |
| `FanDot` (신설, B 담당) | 8px `--color-error` 점(`data-dot`). 헤더·탭바의 새 소식 | 숫자 배지 → 알림함 안 `읽지 않음 N`만 |
| `LuckyDrawModule` (**5차 보류, 아직 없음**) | 현재 소유자 = `StanLucky` | — |
| `FanRewardPop` · `FanRouteTransition` | 보상·미션 완료 연출 래퍼 / 경로가 바뀔 때 본문 전환. 3절 | 이 두 곳 밖에서 `motion`을 부르지 않는다(N16) |

기존 `FanHeading`·`FanPageHeader`·`FanEntityCard`·`FanPostRow`·`FanStarAction`·`FanLockedValue`는 핵심 규칙 표의 각 행을 따른다.

### 어느 것을 쓸까
1. 사용자의 답이 있어야 다음으로 가는가 → `FanDialog`. 390에서 긴 선택이면 `FanSheet`.
2. 짧은 동작 목록인가 → `FanMenu`. 설정값 하나를 고르면 `FanMenu.Radio`.
3. 아이콘 이름이 필요한가 → `FanTooltip`. 설명이 필요하면 값으로 바꿀 수 없는지 먼저 본다(라벨-값 메타). 안 되면 설정류 화면에서만 `data-explains` 한 문장.
4. 눌러 열어 보는 긴 내용인가 → `FanCollapsible`.
5. 결과를 알려야 하는데 그 자리에 보이는 곳이 없는가 → `FanToast`. 입력 바로 옆 오류면 입력 아래 글자.
6. 값이 숫자인가 → `FanNumber`(화면당 핵심 숫자 1개만 `hero`), 진행이면 `FanGauge`(`line` 2px 또는 9칸 segments), 새 소식이면 `FanDot`, 알림함 안 개수만 `FanCount`.
7. 목록의 한 줄인가 → `FanRow`(variant로 높이 고정).

## 3. 연출 규칙

도입: `motion` 14.6.0(`motion/react`의 `LazyMotion`·`m`만). 보상·미션 완료·출석 연출에만 쓰고, 값이 실제로 바뀐 뒤에 내려받는다(별도 청크 114KB, gzip 38KB, 홈·덕질·팬페이지·MY 첫 로드에 없음). 그 밖은 CSS와 Web Animations로 한다. `lottie-web`은 `stamp-press.tsx`에만 남는다(N16).

| 대상 | 연출 | 시간 | 움직임 줄이기 |
|---|---|---|---|
| 페이지 전환 | `FanRouteTransition`: 본문만 opacity 0→1 + y 8→0. 머리·탭·헤더는 밖 | 200(`--motion-slow`) | 없음 |
| 다이얼로그·시트 | 백드롭 + 패널 opacity·이동 | 200 | 연출 없음 |
| 메뉴·툴팁 | opacity + 4px 이동, 닫힘도 같은 시간 | 150 / 150 | 즉시 |
| 접기 | `grid-template-rows 0fr↔1fr` + 체브론 회전 | 200 / 150 | 즉시 |
| 토스트 | opacity + 아래 8px에서 | 200 | 이동 없음 |
| 게이지 채움 | 채움 폭 변화 | 200 | 즉시 |
| 버튼 누름 | 색만 바뀐다(`translateY` 폐기) | 150 | 같음 |
| 탭 선택 | 선택 모양은 바로 | 즉시 | 즉시 |
| 숫자 | `FanNumber countUp` 이전→새 값(펄스 삭제) | 400(연출 예외) | 즉시 |
| 보상 팝 | `FanRewardPop` 1회 | 600(연출 예외) | opacity만 |
| 랭킹 재정렬 | 행 FLIP | 240(`--motion-reorder`, 연출 예외) | 없음 |
| 럭키드로우 idle | 캡슐 `translateY ±4px`·`rotate ±3°` + 불빛 opacity 루프, `[data-lucky-module]` 안만 | 2.4~4.0초 루프 | 정지 프레임 |
| 스켈레톤 | 띠(로딩 중만) | 1.2초 | 정지 |

규칙
- 변환은 `transform`·`opacity`만, 한 번만, 상시 깜빡임·반복 없음. `layoutId` 같은 레이아웃 애니메이션 금지, 항목 50개 이상 목록은 연출 없음.
- 연출 자리는 처음부터 차지해 CLS를 만들지 않는다. 오른쪽 위에 겹치는 `corner` 배지는 변환 때문에 위치가 튀므로 팝하지 않는다.
- 전역 `prefers-reduced-motion` 한 줄 규칙은 **없다**. 모듈마다 `@media (prefers-reduced-motion: reduce)`로 끄고, `animation`을 쓰는 새 CSS는 N7이 분기 없으면 실패시킨다. Motion은 `MotionConfig reducedMotion="user"`로 변환을 끈다.
- 연출은 보상을 *알리기* 위한 것이다. 전면 폭죽·파티클·상시 효과를 더하지 않는다.
- 반복 애니메이션은 럭키드로우 idle과 로딩 스켈레톤만. 글로우·바운스·오버슈트 0. `prefers-reduced-motion`은 모듈별 분기(N7) 유지(2026-11-09).

### 3-1. 4회차 공통 규칙 (261107-2 피드백 C·D, 2026-11-08 합침)

| 대상 | 규칙 | 소유 | 근거 |
|---|---|---|---|
| 지급 연출 (D8) | 서버가 지급을 확정한 뒤 `celebrateReward({ locale, points, stamps, anchor, label })` 하나만 부른다. 누른 요소 위에서 코인 뱃지(`+20`, 코인 20px)가 튀어오르고(앵커가 없으면 화면 가운데), `FanToast` success 제목 `+20P · 스탬프 1`(2026-11-09: 설명 줄 삭제, 제목 1줄만)(지급분만, 0인 쪽은 뺌), 설명은 무엇을 끝냈는지 한 줄(`댓글 미션 완료`)만. 1.2초 안의 지급은 뱃지 하나·토스트 하나로 합친다. reduced-motion은 이동 없이 제자리 표시 후 사라짐. 화면별 자체 토스트·자체 금액 연출을 만들지 않는다. `PointRewardBurst`·`usePointRewardBurst`(도장 수 포함)는 이 함수를 부르는 화면용 훅이다 | `components/fan-ui/reward-celebration.ts`, `point-reward-burst.tsx` | 피드백 D8. C8의 `포인트 +20 · 스탬프 +1` 표기는 토스트를 하나로 합치며 D8 표기와 앱 용어 `도장`으로 통일 |
| 도장 연출 (D3) | 도장이 실제로 찍힌 지급(출석·팬 인증 퀴즈 통과·도장 주는 미션)만 전체 화면 도장(Lottie 0.9초, 최대 360px, 입력 통과·`aria-hidden`)을 먼저 보이고, 끝나면 위 지급 연출을 부른다. 재요청(replay)에는 없음. reduced-motion은 도장 없이 바로 지급 연출 | `features/dukjil/ui/stamp-slam.tsx`(`celebrateStamp`) | 피드백 D3 |
| 업로드 행 (D5) | 글·댓글 첨부 하나당 한 줄, 높이 44 이상, `--color-accent-soft` 바탕(2026-11-09 회색 면 0, U-1: 업로드 행·편집기 도구 호버·링크 입력줄은 회색 대신 옅은 핑크 틴트), 반경 12. 왼쪽 16px 상태 아이콘(진행 스피너 → 완료 체크 `--color-accent` → 실패 `--color-error`), 파일 이름 한 줄 말줄임 + 진행률 숫자(tabular-nums), 행 아래 끝에 3px 진행 막대. 실패 문구만 줄바꿈해 다 보인다. reduced-motion은 스피너 감속·막대 고정 | `components/editor/upload-progress.tsx`, `rich-text.module.css .upload` | 피드백 D5 |
| 최애 값 출처 | 최애는 `fan_profile_public_fields`(MY에서 고른 값) 하나만 읽고 쓴다. 헤더 메뉴의 선택도 `PUT /api/me/social/profile-fields`로 저장하고, 헤더·덕질 상단·홈 최애 카드·프로필 카드가 같은 값을 읽는다. 옛 브라우저 저장값(`kyaa:selected-bias:v1:`)은 최애가 비었을 때 한 번 옮긴 뒤 지운다 | `features/selected-bias/ui/use-selected-bias.ts`, `server/my/my-summary-repository.ts` | 감독 결정(합침 검토 1) |
| 헤더 상태 캡슐 | 로그인 768+ 오른쪽 `[내 상태 캡슐]`은 흰 알약 + 안쪽 1px `--color-line` 헤어라인(회색 면 아님, DS-A1 2026-11-09 시안 31 A). 요소·순서·크기는 동결 | `fan-app-shell.module.css .statusCapsule` |
| 헤더 최애 고르기 칩 | 비로그인 390(<768)은 칩을 그리지 않는다(종·언어만, 4차와 같다). 로그인 상태의 비어 있는 칩은 별만 남기고 aria-label을 둔다. 768~1023·1200 이상은 문구 전체, 1024~1199는 탭이 자리를 써서 별만. 이 문구는 말줄임 없이 온전하게 보이거나 아이콘만 남는다 | `features/selected-bias/ui/selected-bias-chip.module.css` | 2026-11-09 03:25 감독 지적 |
| 홈 랭킹·찐팬 100 카드 (L2) | 390(`.mobilePersonalization`)·1440(`.contextPanel`) 모두 랭킹 카드와 챌린지 카드 사이 16px(Weverse 홈 카드 간격 16 실측). 챌린지 카드가 홈의 강조 판 하나: 바탕 `--color-accent-soft`, 선 `--color-accent-line`, 진행 수 `--color-accent-ink`, 막대 4px(바탕 `--color-accent-line`, 채움 `--color-accent`). 랭킹 카드는 흰 바탕 그대로. 1440 오른쪽 패널의 '미국 팬미팅' 카드는 흰 면 + 1px `--color-line`(분홍 판은 챌린지 하나, 별 무늬 판 없음). 배치 순서는 4차 그대로 | `components/guest-home.module.css`, `features/rankings/ui/home-challenges.module.css` | 2026-11-09 피드백 L2(03:36 "랭킹 잘림·챌린지 간격·하이라이트"), 근거 `board/tasks/feedback-l/benchmarks/L2.md` |
| 팬페이지 모임 홈 출석 바로가기 (L9) | 390~1023 바로가기 `출석 스탬프` 칸의 그림은 ink-v1 `daily-checkin` 도장(원형 테두리 + 달력 체크)을 CSS mask로 `--color-accent` 한 색으로 칠한 40×40(`data-art="stamp"`, 채운 배경 원 없음). lucide `Stamp` 폐기. 옆 `내 패스포트` 칸도 같은 처리: 40px 원 1px `--color-accent` 선(채움 없음) 안 책 20px `--color-accent`. 두 칸 그림 자리 40px로 이름 줄이 같다 | `features/groups/ui/creator-group-home.tsx`, `groups.module.css` `.shortcutStamp` | 2026-11-09 피드백 L9(05:08 "스탬프로 아이콘·라운드를 포인트 컬러로"), 근거 `board/tasks/feedback-l/benchmarks/L9.md` |
| 헤더 오른쪽 아이콘 크기 (L10) | 헤더 오른쪽 묶음의 그림(별·언어·종·메뉴·등급 도장·하트·포인트 코인)은 한 화면에서 한 크기: 768px 이상 24×24(Weverse 헤더 24 실측), 768px 미만은 캡슐 안 그림(등급 도장·하트·코인) 16 하나, 캡슐 밖 그림(언어·종·메뉴) 20 — 캡슐이 182px로 고정이라 최애 이름 폭을 L10 전 이상(360 18→21.7, 390 48→51.7)으로 지킨다(판정 H1). <768 캡슐의 `♥` 앞 점 좌우는 `P` 앞 점과 같은 2px. lucide 선 1.5 하나. 펼침 화살표 16·아바타·누르는 자리 44·캡슐 구성은 그대로(L11 동결). 캡슐 안 하트 숫자는 그림 가운데에 맞춤. **사용자 확인 전 푸시 금지** | `components/fan-shell/fan-app-shell.module.css` 끝, `features/selected-bias/ui/selected-bias-chip.module.css` 끝 | 2026-11-09 피드백 L10(05:17 "아이콘 크기가 서로 다름"), 근거 `board/tasks/feedback-l/benchmarks/L10.md` |
| 미션 행 (D1·F3, 2026-11-09 갱신) | `FanMissionRow` 하나(접힌 머리 `FanMissionFoldRow`). 그리드 `40px │ 1fr │ 96px`(1024+ 120px), 간격 12, 안쪽 12·16, 높이 64. 선 원 40(1px) + lucide 20(`FanIcon`, 매핑은 §4 아이콘) · 제목 15/700 + 같은 줄 `0/3` 12 muted(간격 8) → 4px → 2px 막대(2026-11-10: 폭 상한 없이 이름 아래 남는 폭을 채우고, 오른쪽 `0/3` 숫자 칸은 40 고정이라 행마다 막대 끝이 같다. 바탕 `--color-line`, 채움 accent) · 오른쪽 `+20P` 15/700 잉크 또는 완료 도장(2026-11-10: `stamps/vintage-seal-frame.svg` 마스크를 잉크색으로 칠한 40 원 + 체크, -10도 기울임. 글자는 스크린리더용). 오늘의 덕질 목록은 행이 4개 이상이고 구역 폭이 704 이상이면 2열(열 352+, 오른쪽 칸 트랙 96, 열 사이 1px 세로선, 홀수면 마지막 오른쪽 칸 비움, 읽는 순서는 가로). 접힌 행은 원 자리 없음(제목 x = 16), 오른쪽 `+465P ˅`. 출석도 행 전체 탭(버튼 0). `×N`·스탬프 상자·nudge 없음 | `features/dukjil/ui/fan-mission-row.tsx` | 브리프 v1.1 5장·G3·R5·R17 |
| 모달 위 알림·줄바꿈 | 공통 토스트는 `--z-toast`(1100)로 z-index 모달(옛 화면 100~1000 포함) 위에 있고, 모달이 열려도 `inert`가 되지 않는다. 네이티브 `<dialog>`(showModal)가 열려 있으면 토스트를 그 dialog 안에 그린다. `<body>`로 그리는 모달(`AccessibleOverlay`)은 팬 화면에서 `data-fan-surface`를 받아 한국어 `keep-all` 줄바꿈을 따른다 | `components/fan-ui/fan-toast-viewport.tsx`, `top-layer.ts`, `components/ui/overlay/accessible-overlay.tsx` | 4회차 합침 QA |

## 4. 숫자·아이콘 표기

### 숫자 (S4, 2026-11-09 갱신)
1. 보상은 `+20P` 하나(행 오른쪽 열, 15/700 잉크). 진행은 `0/3`(12 muted) + 2px 막대. `×N`·`N번 남음`·`N명까지` 표기 폐기(N20 유지).
2. **참여 수**(팬 수·좋아요·댓글·조회·하트 합계)는 10,000 이상 `12K`/`1.2M`(소수 1자리, 끝 0 제거; 1만 미만 전체 자릿수 `하트 1,240`). **내 자산**(포인트·응모권·스탬프·하트)·금액은 전체 자릿수. `data-metric="count|asset"`.
3. 0은 잔액·진행에서 보이고(`0 P`·`0/9`), 카운터·배지에서는 숨긴다. `—`는 비로그인 잠금에서만.
4. 단위는 숫자 뒤 한 번(`P`·`장`·`/9`).
5. **날짜 2형식**: 피드·댓글·소식 `11. 08. 13:47`(올해 연도 생략), 거래·공지·알림 `2026.11.08`(+ ` 13:47`). 일정·마감은 `11. 09. 00:00 마감`. **상대 시간(`3분 전`) 폐기**(8장 ⑨), `formatRelativeTime`·`dateStyle: "medium"` 호출 0(N23).
6. 새 소식은 **점**(`FanDot`), 숫자는 알림함 안 `읽지 않음 N`만(8장 ⑩).
7. 투명성: 잔액 옆 내역 진입, 리셋 시각(`/api/me/dukjil/today`의 `resetAt`), 집계 기준·마감(`/api/rankings/home`의 `period`·`closesAt`·`computedAt`), `업데이트 HH:MM`(핵심 규칙 표 "자산 투명성" 행). 홈 랭킹은 오늘(KST) 기준표를 10분마다 다시 쓰므로 `period`는 `day`다.
8. `tabular-nums`·폭 예약 유지.

### 아이콘 (8장 ⑫)
- **UI 아이콘은 lucide 단일 세트, `strokeWidth` 1.5, 16·20·24만**, `FanIcon` 경유(N25). 코인·티켓·하트도 lucide(`Coins`·`Ticket`·`Heart`), 하트만 채움 `--color-accent`. 이모지 0(C10). 기본 Material·Pencil 헤더 아이콘 0.
- 도장 아트(`stamps/ink-v1`)는 아이콘이 아니라 **스탬프 그림**: 패스포트·완료 연출(`stamp-slam`)에서만, `data-art="stamp"`. 미션 행 아이콘은 lucide 매핑(글쓰기 `Pencil`, 댓글 `MessageCircle`, 공유 `Share2`, 공감 `Heart`, 출석 `CalendarCheck`, 초대 `UserPlus`, 인증 `BadgeCheck`, 퀴즈 `HelpCircle`, 라이브 `Radio`, 설문 `ClipboardList`).
- 아이콘 컨테이너는 선 1px 원/사각(채움 0).
- 용어: 한국어 화면은 **`스탬프`**만 쓴다(`도장`·`Stamp` 단독 표기 금지). 영어는 Stamp, 다른 언어는 기존 stamp 번역(덕질 용어 `dkgStamp`). 사용자 결정 2026-11-08 13:05. 약관·계정 삭제 안내·온체인 계약 이름의 `Stamp`는 그대로 둔다.
- 글자 없는 아이콘 버튼에는 `aria-label`과 `FanTooltip`을 둔다.

### 4-2. 문구 규칙 (2026-11-09 신설)
1. 내비·탭·섹션 제목 = 한국어 명사 **2~7자**. 영문 섹션 0. 허용 목록: 제품 식별자 `HOME`·`MY`(8장 ⑪), `LIVE`·`DM`·`QR`, 브랜드명.
2. 버튼 = 동사 2~6자(`교환`·`응모하기`·`팬 순위 보기`). 버튼 안 조건·수단 문구 0(`광고 보고` 0). 화살표 글리프 0.
3. 상태 = 값 + 조건(`응모 가능 3장`·`4개 남음 · 자정 리셋`). 설명형 상태(`지금 N번 가능`) 0.
4. 설명 문장 0(기본 화면). 환율·조건은 라벨-값 행 메타(`100P = 응모권 1장`).
5. 빈 상태·오류 `~습니다`(`진행 중인 럭키드로우가 없습니다`), 토스트·확인 `~요`. 느낌표·`~세요`는 `data-block="banner"` 안만.
6. 가운뎃점은 메타 한 줄(`출처 · 일시`, `기간 · 마감`)에만, 값 2개 이상은 라벨-값 행. 대문자 영문 라벨 0(`text-transform: uppercase` 0).
7. 외부 원문 보존·법률 문구 예외는 `roles/skills/kyaa-copy.md` 그대로. 점검 `scripts/copy-lint.mjs`(5차 B 담당, 이 커밋 기준 미작성).

## 5. 기계 규칙과 실행 명령

```
node scripts/design-lint.mjs                              # 기준선 비교(기본). 새 위반만 실패, 종료 코드 1
node scripts/design-lint.mjs --all --report out.json      # 현재 위반 수 보고
node --test scripts/design-lint.test.mjs scripts/design-lint-rules.test.mjs scripts/design-lint-n-rules.test.mjs   # 규칙마다 빨강·통과
npm run test:qc --workspace @byus/web                     # 단위 계약(N5 N13 N17 N18)
npm run test:qe --workspace @byus/web                     # 실행 계약(N2 N12 N19, F1~F12), 로컬 앱 필요
node apps/web/scripts/measure-r3.mjs --base http://127.0.0.1:3001 --out <dir> [--ids rubric/coverage-r3.json] [--storage <state.json>]   # 루브릭 r3 측정(2026-11-09)
```

**2026-11-09(브리프 v1.1 §5)**: S1은 모든 그라데이션(배경·테두리·마스크·글자·사용자 정의 속성 값, 로고 아트 경로 `*logo*`·`*wordmark*` 제외)으로 넓혔고 T6·T10·N8과 함께 `fail`이다. 신설 `fail`(새 파일·늘어난 개수): **N21** 화면 파일 `<section>`에 `data-block` 없음 · **N22** `<li>`에 `data-row` 없음(`FanRow`를 바로 감싸면 면제) · **N23** `formatRelativeTime`·`RelativeTime`·`dateStyle: "medium"` · **N24** `trailingIcon={<ArrowRight|ChevronRight` · **N25** fan-ui 밖 `lucide-react` import 또는 `strokeWidth` ≠ 1.5. 신설 `count`: **N26** `box-shadow`(none·`--shadow-overlay`·블러 0 링 외) · **N27** `border-radius`(`--radius-card|control|pill`·0·50% 외) · **N28** 정적 `Pretendard UI`. 기준선은 5차 C1 커밋에서 한 번 갱신했다(새 규칙의 기존 위반이 들어감).
실행 계약을 로컬 앱에 붙이는 방법과 기준 커밋 결과는 `docs/design/review-rules-261107.md`에 있다.

**새 위반이면 즉시 실패(`fail`)**: 색 hex·이름·함수·토큰 강제(`color-no-hex`, `color-named`, `function-disallowed-list`, `declaration-strict-value`) · C1 원시 `<button>` · C2 `<h1>`~`<h3>` · C4 인라인 style · C5 로딩 글자 · C6 `FanState loading` · C9 포인트 숫자 하드코딩 · C10 이모지 아이콘 · T3 자간 · T4 calc 안 px · T5 모듈 지역 변수 우회 · T6 그림자 색 · T8 z-index · T10 font-family · S1 새 그라데이션 · S2 흐림 · S3 글로 · S6 grayscale 도장 · S8 한 파일 primary 둘 이상 · S9 태그에 설명 · S12 상투 문구 · S13 근거 없는 숫자 홍보 · N1 화면 파일의 직접 카드·버튼 스타일 · N3 `GroupIdentityHeader` 등 · N4 큰 세로 간격(64px 이상, `min-height` 280 이상) · N6 숫자 역할 토큰 · N7 reduced-motion 분기 없는 `animation` · N8 제목 아래 설명 문장 · N9 모의 데이터 상수 · N10 계약 시험 없는 새 `route.ts` · N11 동작 없는 `FanAction`·`Link` · N14 작은 흐름 라우트 · N15 `@radix-ui`(Base UI로 통일) · N16 허용 파일 밖 `motion`·`lottie-web` · N20 `×N`.

**집계만(`count`, 경고)**: T7·T9 시간·크기 직접값(T1·T2는 2026-11-10부터 실패) · C3 원시 입력 · C7 외부 링크 · C8 로케일 하드코딩 · S4·S5 모양 반복 · S7 소개 문장 키 · S10·S11·S14 · N3 원시 `<header>` · N11 `disabled` 사유 · N15b 화면 쪽 `@base-ui/react`·수동 `role="dialog"`(치환 진행 중).

정규식 규칙은 파일 단위라 화면 단위 결함(구역을 합친 강조 버튼 수, 한 화면의 카드 무게)을 모른다. 통과해도 V 목록과 실제 화면 확인을 대신하지 못한다.

**기준선(`scripts/design-lint-baseline.json`) 다시 만들기**: 다른 묶음의 큰 화면 변경이 합쳐진 뒤 한 번만 `node scripts/design-lint.mjs --update-baseline`을 실행하고, **줄어든 숫자만** 커밋한다. 새 위반을 가리려고 올리지 않는다. 오탐이면 기준선을 올리지 말고 규칙을 고치거나 해당 줄 위에 `/* design-lint-disable N4 */`(N4에 한함, 지금은 히어로 배너 1곳)를 쓴다. 규칙 추가·수정 절차는 `docs/design/review-rules-261107.md` 끝 절.

## 6. 설계와 다르게 한 것

| 설계 | 한 것 | 이유 |
|---|---|---|
| 프리미티브는 Radix | **Base UI 1.6.0** | 이미 설치되어 Menu·Select·Dialog에 쓰이고 있었다. 두 라이브러리를 두면 포커스·포털·z-index 규칙이 둘이 된다. 감독 결정. N15는 `@radix-ui` 금지로 바뀜 |
| 큰 숫자 1440 32px(새 값, 승인 필요) | 768+에서 32px, 390은 24px | 1440 가운데 폭 720 카드에서 24px 숫자는 보조 정보와 구분되지 않는다. 감독 결정. `xl`만 32로 커지고 `lg`는 24 고정 |
| Motion으로 페이지 전환·모달·메뉴·토스트·접기 | Motion은 보상·미션 완료만. 페이지 전환은 Web Animations, 나머지는 CSS | Motion을 첫 로드 JS에 넣지 않으려고(S 구현 기록). 값이 바뀐 뒤에만 내려받아 첫 로드 증가가 홈 +6.1KB로 끝남 |
| 전역 `prefers-reduced-motion` 한 줄 | 모듈마다 분기 + N7 | 이유가 구현 기록에 없다. N7이 분기 없는 새 CSS를 막는다. `design-lint-rules.mjs`의 N7 설명("전역 분기가 있어 집계")은 현재 코드와 맞지 않는 옛 문구이고, 실제로는 `design-lint-n-rules.mjs`의 `fail`이 적용된다(`RULES_N`이 `RULES`를 덮어씀) |
| 버튼 누름 scale .98 | 색만 바뀐다(2026-11-09 design-sync-1): primary `--fan-action-primary-active-bg`(accent-ink #ad1457), neutral·text·service·passport 안쪽 `--fan-action-neutral-active-bg`(`--color-accent-soft` 핑크 틴트, 회색 아님), danger `--fan-action-danger-active-bg`. 이동 0. 비활성·`aria-disabled`에는 그리지 않음 | 3장 '버튼 누름' 규칙에 맞춤. Weverse 공개 웹도 :active 이동이 없다(벤치마크) |
| `FanSheet` 드래그로 닫기(Motion drag) | 넣지 않음 | 버튼·ESC·백드롭으로 닫는다. 이유는 기록에 없다 |
| `FanDialog`를 Base UI Dialog로 교체(2차) | 기존 `AccessibleOverlay`를 안에 유지 | 포커스 가둠·스크롤 잠금·중첩·포커스 복귀가 이미 맞다. 외부 API는 같아 나중에 바꿔도 화면은 그대로 |
| `FanInput`·`FanTextarea`·`FanSelect`·`FanField`, `FanCard` 신설 | **만들지 않음** | 구현되지 않았고 이유 기록도 없다(미완). 원시 입력은 C3 집계로 남고 카드는 `FanSurface`를 쓴다 |
| C4 인라인 style 금지(전 경로) | `app/share/**/route.tsx`(공유 OG 이미지 라우트)만 C4 예외 | OG 이미지는 Satori로 그려 CSS 모듈·변수를 읽지 못하고 인라인 style만 받는다. 예외는 그 경로의 `route.tsx`로만 좁혔다(`design-lint-rules.mjs` `ogImageRoute`, 2026-11-08 오케스트레이터 결정) |
| 홈 랭킹 11~20위를 카드 안에서 펼침(4회차 C3) | 펼치지 않음, `전체 보기`로 리더보드 이동 | 2026-11-08 오케스트레이터 수용(B 구현) |
| 리더보드 `찐팬 순위` 칩을 찐팬 100명 전 비활성 | 비활성으로 두지 않음 | 2026-11-08 오케스트레이터 수용(B 구현) |
| 찐팬 게이지 카드 로딩 골격 | 골격 없음 | 2026-11-08 오케스트레이터 수용(B 구현). 대신 챌린지 있는 페이지의 CLS를 로컬에서 재 0.02 초과면 보고 |
| `FanTag tone="state"`(성공·대기·실패) | 없음 | 구현되지 않음(미완) |
| `FanSkeletonRows` 변형 mission·ranking·wallet | post·entity·member·plain만 | 구현되지 않음(미완). 해당 화면은 plain 사용 |
| `FanState` `loading` 종류 제거 | 타입에 남기되 폐기 표시, 로그인 세션 동기화 한 곳만 사용 | 한 곳이 아직 의존. 새 사용은 C6이 실패시킴 |
| `FanToast`에 Base UI Toast 전부 | 대기열만 첫 로드, 표시부(Base UI Toast)는 화면이 뜬 뒤 지연 로드 | 첫 시도에서 홈 JS가 15.5KB 늘어 분리해 +6.1KB로 줄임. 그 전에 들어온 알림은 대기했다가 순서대로 보임 |
| 좌측 내비 240(브리프 1장 3항) | 5차 미도입, 상단 탭 유지 | 8장 plan ⑤ |
| 참여 수 축약 기준 1,000(브리프) | 10,000(시안 `하트 1,240` 유지) | 시안 우선(design-md-change 못 본 것) |
| 보조 열 367(Weverse) | 343(1,100 − 733 − 24) | 컨테이너 1,100 안 2:1 |
| 홈 랭킹 머리 `이번 주 · 마감`(plan-ux-r5 3.5 ③) | API는 `period: "day"`, `closesAt` = 다음 KST 자정 | 홈 랭킹은 오늘(KST) 기준표를 10분마다 다시 쓰는 하루 단위다. 주 단위로 표기하면 사실과 다르다(2026-11-09 C 담당 판단). 등락 없는 행의 `+N`은 7일 `weekGain`(팬 행은 20261217010000에서 추가) |
| 폐기 토큰 사용처 | **치환하지 않았다**(dev 1ee53b4db 기준 사용처 남음). 4차 복원(694096ef5) 뒤 globals에는 폐기 토큰이 남았고 `service`·`passport` 변형도 알약 그라데이션 테두리 그대로다. 치환은 단계로 한다(`board/tasks/design-sync/plan-ux.md`) | 4차 화면 구성 보존 |
| 토큰 신설: accent·coin·foil·shadow·reward·count·z-toast | 설계 표에 없던 `--color-accent-line`(#f4c3d7)과 `--motion-exit`(120ms)가 더해졌다 | 분홍 연한 선과 나가는 시간에도 이름이 필요했다 |

측정은 `next dev` 로컬 합성 데이터이며 운영 수치가 아니다(번들은 `next build`). 전후 표와 원자료는 보드 `reports/doc-261107-2-s-perf.md`. 덕질 비로그인 CLS 0.42는 기준 커밋부터 있던 값이다(S 변경과 무관).

## 7. 바뀐 옛 규칙

| 옛 규칙 | 지금 | 이유 |
|---|---|---|
| 포인트 배지 `+20P ×3`, `×N`은 남은 횟수 | `+20P` 하나, 횟수는 배지 밖 | ×3이 3배로 읽혔다 |
| `FanState`로 로딩 표시 | `FanSkeleton`·`FanSkeletonRows` | 로딩 행과 모순이었다 |
| 탭은 underline·chip 두 가지 | segment·count·panels 추가 | 홈 랭킹 두 탭과 상태 탭 필요 |
| 모달·메뉴·툴팁이 화면마다 따로 | `FanDialog`·`FanSheet`·`FanMenu`·`FanTooltip`·`FanHelpTip` 하나씩 | 같은 역할은 같은 모양(V16) |
| `<details>`·`aria-expanded`로 접기 | `FanCollapsible` | 닫힌 내용 `inert`, 높이 연출, 세션 유지 |
| 토스트 화면마다 자체 | `FanToast` 하나 | 눌렀으면 반드시 반응 |
| 간격 토큰 4~48 | 4~64(`--space-10` 40, `--space-16` 64 포함) | 실제 토큰과 맞춤. 구역 사이 64px 이상은 N4가 막는다 |
| 페이지 머리 이미지 56/64px | 96(390)·128(768+) | U1 설계(원문 그림 img-01) |
| h1 줄 높이 1.4 | 토큰 `--fan-heading-leading` 1.2 | 2026-11-06 제목 줄 높이 통일(아래 이력). 페이지 머리 이름만 `fan-page-header.module.css` `.name`에 1.4가 남아 있어 정리하지 못했다 |
| 숫자 토큰 390 28px(검수 규칙 N6 문서) | 24px(768+ 32px) | 설계가 24로 정함. 검수 규칙 문서의 28은 옛 값 |
| h1=h2 20/24 850 | h1 26/800 · h2 18/700 | 8장 ② |
| 본문 16 | 15(390)/14(768+) | 8장 ① |
| 정적 글꼴 Pretendard UI 550/650/850 | Variable 1벌 + 굵기 토큰 | 8장 ③ |
| 강조 버튼 알약 그라데이션 48 | 8px 단색 accent 44/48 | 8장 ②④⑤ |
| 코인 노랑 배지 | `+20P` 잉크 글자 | 8장 ⑥ |
| 카드 그림자 | 0(오버레이만 `--shadow-overlay`) | 8장 ⑦ |
| 모션 6토큰(160·240·400·600·120) | 150/200 2단 + 연출 예외 | 8장 ⑧ |
| 상대 시간 | 절대 2형식 | 8장 ⑨ |
| 숫자 배지 | 점 `FanDot` | 8장 ⑩ |
| `FanHelpTip` | 삭제 | R6 |
| 헤더 캡슐(F1) | 아바타 메뉴 첫 행 | 5장 |
| 덕질 6칸 지갑 | 잔액 + 라벨-값 3 | 시안·R1 |
| 1,360 전폭 | 1,100 | R4 |

## 8. 폐기 목록 (2026-11-09, 구현 체크리스트)

| 종류 | 폐기 | 대체 | 상태(5차 C1 `aa9eec628` 기준) |
|---|---|---|---|
| 토큰 | `--color-primary-action`, `--color-coin(-ink)`, `--color-foil`, `--color-service-ink`, `--color-surface-focus`, `--color-success`, `--color-warning`, `--shadow-dialog`, `--radius-collection`, `--radius-hero`, `--motion-control/-layout/-exit`, `--fan-heading-size-wide`, `--fan-heading-editorial-weight`, `--fan-personal-section-*`, `--fan-event-catalog-title-size`, `--fan-aside-title-*`, `--fan-description-*`, `--fan-action-emphasis-size`, `--fan-action-service-height` | §1 새 토큰 | 예정. globals에 남아 있고 사용처 치환 전. 굵기 토큰 7종은 1단계에서 별칭(값 동일), `--color-primary-action`은 1단계에서 삭제 |
| 글꼴 | `@font-face` `Pretendard UI 550/650/850`, `public/fonts/pencil/*.woff`, 모듈 `font-family` 선언 | `globals.css` body 1줄 | 부분: body 글꼴은 Variable 1줄이지만 `@font-face` 6개·`public/fonts/pencil/*.woff`와 e2e 하니스의 `Pretendard UI` 참조가 남아 있다 |
| 컴포넌트 | `FanHelpTip`, `HelpHint`, `EarnBadge corner`, `EarnRemaining`, `EarnActionBadge`, `FanAction service/passport`, `FanEntityCard`·`FanPostRow`(→ `FanRow notice`), `SelectedBiasBar`·헤더 `SelectedBiasChip`(→ 메뉴 행), `GroupHeaderPoints`, `FanLanguageSwitch compact`(헤더), `PencilHeaderIcon`, `MissionArt`(미션 행), `StanLucky` 카드 목록(→ `LuckyDrawModule`), `WalletBalances`·`WalletExchange`(MY), `my-benefit-progress`, 오늘의 덕질 목록(`MyAttendanceList` 덕질 사용분), `relative-time.tsx`·`i18n/relative-time.ts`, 홈 `HomeCommunityPreview`·이벤트 배너, 홈 브랜드 줄·배너 캐러셀 | §2 | 예정(A·B 화면 작업, 5차 보류). `FanAction service/passport`는 아직 알약 그라데이션 테두리(계약 시험 고정) |
| CSS 패턴 | `linear-gradient`(로고 제외), `box-shadow`(오버레이 토큰 외), `border-radius` 10/16/20, `text-transform: uppercase`, `border-left` 액센트 바, 아이콘 뒤 채움 배경, `animation` 반복(모듈·스켈레톤 외), 개별 `keep-all`, `Pretendard UI` 참조 | 토큰·전역 | S1·N26·N27(집계)·N28로 추적. 목표 `Pretendard UI` 참조 0(현재 globals·e2e 하니스에 남음) |
| 문구 키 | 도움말 키(`walletHelpCopy`·`stanHeartHelp` 등), `오늘 N번 남음`·`N명까지`, `Kyaa. Every Fan Moment Counts.`(홈 본문), `모은 포인트 사용하기`(B13에서 삭제: 모임 홈은 `포인트·응모권` 제목 + `내 포인트 보기` 링크). `광고 보고 교환하기`는 B13(2026-11-09 사용자 확정)으로 유지, 폐기 대상 아님 | `/guide/dukjil` 사실 표, `0/3` | A·B |

## 9. Responsive system (2026-11-10, C5 — 일관되고 규칙적이고 객관적이고 계산된 PC↔모바일)

근거: Tailwind·Primer·Android 창 크기 클래스·Every Layout·NN/g·Baymard·WCAG·GOV.UK·Carbon 등 17개 출처와 Weverse·YouTube·Threads·Billboard 실측. 아래 표가 새 작업의 기준이며 기존 값 중 맞는 것은 유지했다. 측정은 `apps/web/scripts/measure-responsive.mjs`(R12).

| # | 규칙 | 값 | 토큰·구현 |
|---|---|---|---|
| R1 | 구간 | <768 / 768–1023 / 1024–1279 / ≥1280, 기준 폭 390 / 768 / 1024 / 1440. 새 CSS는 `48rem`·`64rem`·`80rem`과 범위 문법(`@media (width >= 48rem)`)만 쓴다. 새 `max-width:767px`·`1023px` 쌍 금지 | design-lint **N34**(기존 292곳은 기준선, 줄이기만) |
| R2 | 셸 | 최대 1440(콘텐츠 1360), 바깥 여백 16 / 32 / 32 / 40 | `--shell-max-width`, `--shell-inset`(`globals.css`, 기존 값 유지) |
| R3 | 안쪽 띠 | 읽기 720 · 목록 920 · 전체 1440, 가운데 정렬 | `--band-read/list/full`, `FanContentContainer band="read|list|full"` |
| R4 | 레일 폭 | 288 / 360(≥1024) / 384(≥1280) 셋뿐 | `--rail-narrow/--rail-md/--rail-wide` |
| R5 | 본문+레일 간격 | 24, ≥1280에서 32 | `--col-gap` |
| R6 | 구역 간격 | 32, ≥768에서 48. 카드 간격 12–16 | `--section-gap` |
| R7 | 간격 단계 | 4 8 12 16 20 24 32 40 48 64. 레이아웃 간격은 16 24 32 40 48 64만 | `--space-*` |
| R8 | 본문 줄 길이 | 한국어 경고 >45자·실패 >60자, 라틴 경고 >75·실패 >100(한 줄 제목·행 제외) | R12 측정 |
| R9 | 배치 유형 | ① 본문+레일 ② 같은 무게 목록 쌍: ≥1024에서만 2열, 열 안쪽 폭 ≥320·각 열 ≥5행·DOM 순서=시각 순서·열 최대 400·쌍 ≤840을 목록 띠 안 가운데·머리/첫/끝 행 y 차 ≤1px ③ 카드 격자: 390 1열, 768–1023 2열, ≥1024 3열, 4열은 이미지 카드 ≥1280만, `repeat(auto-fill,minmax(min,1fr))` ④ 단일 목록은 1열 ⑤ 상세 본문 ≤720 + 선택 레일 ⑥ 포커스 흐름 440/760/1120 가운데 | 신규 공통 컴포넌트는 같은 패턴이 3곳 이상일 때만 |
| R10 | 좌우 여백 | 같은 화면의 바깥 좌우 여백 차 ≤2px | R12 측정 |
| R11 | 목록 행 | 이름과 값 사이 빈 간격이 행 폭의 40%를 넘지 않는다(≥1024) | R12 측정 |
| R12 | 측정 | `BASE_URL=https://dev.kyaa.io node apps/web/scripts/measure-responsive.mjs --routes /,/rankings` — 390·1024·1440에서 가로 넘침(scrollWidth>clientWidth)·줄 길이 실패·행 간격·여백 차를 재고 JSON과 요약을 낸다. 공개 경로는 로그인 없이 돈다. 판정 함수는 `responsive-metrics.mjs`(단위 시험 `responsive-metrics.test.ts`) | 종료 코드 1 실패, 2 측정 오류 |

### 현재 코드와 충돌하는 곳 (2026-11-10 조사, 이번 작업에서 고치지 않음)
- **레일 폭 밖의 값**: `components/fan-participation-guide/fan-participation-guide.module.css:53`(580) · `components/us-fanmeetings/us-fanmeetings-page.module.css:446`(400) · `features/benefit/ui/creator-raffles-screen.module.css:9`(350) · `components/admin/group-admin.module.css:60`(320) · `features/group-capsule/capsule.module.css:45,49`(304·320) · `features/group-raffle/raffle.module.css:1`(304) · `features/groups/ui/group-activity-frame.module.css:1`(304) · `features/groups/ui/groups.module.css:147`(312) · `features/community/ui/community.module.css:25,48`(280·260) · `components/notice/notice-detail.module.css:28`(264) · `features/group-wallet/ui/wallet.module.css:33,37`(248·264). 288·360은 R4와 일치(`celebrity-fan-page.module.css:148,152`, `wave-programs.module.css:37`, `groups.module.css:101,114,202`, `wallet.module.css:43,47`).
- **레이아웃 간격이 단계 밖**: `features/group-wallet/ui/wallet.module.css:37`(`gap:56px`), `features/groups/ui/group-mission-screen.module.css:2`(`gap:20px`).
- **띠 폭 밖의 max-width**: `components/service-guide/service-guide-page.module.css:9,84`(760) · `components/notice/notice-detail.module.css:2`(840; 같은 파일 :44는 720) · `components/onchain/onchain-public-page.module.css:21`(820) · `components/admin/runmusic-manager.module.css:1`(1100, 관리자).
- **바깥 여백이 셸과 다름**: `features/group-social/social.module.css:1,8`(`padding … 40px` 고정, 390은 :9에서만 16/24).
- **구간 경계 불일치**: `components/us-fanmeetings/us-fanmeetings-page.module.css:488`(`max-width:1199px`, 경계 1280 아님). 767·1023 쿼리 292곳(N34 기준선 `scripts/design-lint-baseline.json`) 전부가 R1 전환 대상.
- 셸 1440·여백 16/32/40(`globals.css` `--shell-max-width`·`--shell-inset`)은 R2와 일치.

# 상세 이력 (기존 전체 내용, 삭제하지 않음)

## 2026-11-09 핵심 표에서 내린 행 (브리프 v1.1 8장으로 대체됨, 원문 보존)

| 역할 | 기준 값 | 공통 소유자 | 근거 / 상태 |
|---|---|---|---|
| 보조 버튼 선택 상태 | 굵기 800 유지(선택은 색·배경·선으로만 구분) | `components/fan-ui/fan-action.module.css:15` | 결정 2026-11-06: `history-tabs.module.css`의 750 제거 |
| 탭 굵기 | 500 = `--fan-tab-weight` (홈·모임 칩·덕질 `HistoryTabs` 모두 이 토큰). 1440 모임의 반경 0 밑줄 형태는 유지 계약이라 그대로 두고 굵기만 같음 | `app/globals.css`, `creator-roles.module.css`, `groups.module.css` `.chip`, `history-tabs.module.css` | 결정 2026-11-06 DESIGN-FIX-3: 탭 굵기 승인 줄이 없어 기준 화면인 홈 값 500으로 통일(이전 홈 500·모임 400·덕질 600). 되돌릴 수 있음 |
| 강조 버튼 | 48px 알약, 15/800, 안쪽 여백·줄 높이는 `FanAction` 한 값(이전 덕질 8×18/줄 18, 모임 8×16/줄 21) | `components/fan-ui/fan-action.module.css` | 2026-11-06 DESIGN-FIX-3: 모임 화면의 padding·줄 높이 덮어쓰기를 제거해 공통 소유자가 결정 |
| 덕질 구역 제목·내역 | h2 390 20px / 768+ 24px, 굵기 850 (이전 포인트·하트·응모권 24/700, 내역 700) | `group-benefits.module.css` `.srOnly`, `wallet.module.css` `.panel h2` | 2026-11-06 DESIGN-FIX-3: 구역 제목 표 기준으로 통일. 모임 "지금 주목할 페이지"·"모임" 1440 20px은 media 규칙이 기본 규칙보다 앞에 있던 순서 오류여서 768+ 24px로 고침 |
| 홈 "나의 팬 활동" | 다른 홈 구역 제목과 같은 20/850(390), 24/850(768+), 줄 높이 `--fan-heading-leading` (이전 800·1440 20px) | `components/guest-home.module.css` `.signedInGreeting h2` | 2026-11-06 DESIGN-FIX-3 |
| 비로그인 덕질 | 로그인 화면과 같은 구역을 유지한다(`비로그인 화면(전 화면)` 행). 지갑 카드 자산 2칸·다음 단계 2칸의 숫자는 `FanLockedValue`(잠금 4개), 게이지는 0과 실제 규칙 문구(`응모권까지 100P`, `다음 하트까지 9칸`), 행동 자리는 로그인 `FanAction` primary(전폭). 내역은 모든 폭에서 제목 + 잠금 + 같은 카드 외곽의 `FanLockedRows` 3행 | `group-benefits-screen.tsx` `BenefitsWallet`·`BenefitsGuestHistory` | 2026-11-08 피드백 F2: 이전 "내역은 1024px 이상만"을 대체 |
| 덕질 "적립·사용" | 13/500 | 칩 역할(지갑·내 응모 칩과 같은 값) | 사유 기록만(2026-11-06): 구역 제목이 아니라 칩이므로 제목 값과 다르게 두는 것이 맞음 |
| 덕질 활성 탭 | 500(`--fan-tab-weight`, 비활성과 같은 굵기) | 현재 탭은 색(글자 #ad1457, 배경 #fff0f6, 테두리 #d11b62)으로만 구분 | 확인 2026-11-06: `history-tabs.module.css`에 750 선언이 없어 활성 탭 750 예외는 없음. 아래 "내 응모·지갑 상단 탭 쌍"의 750 표기는 지난 값 |
| 사이드 보조 제목(모임 "내 페이지", 모임 상세 "팬 활동"·"응원과 이벤트", 팬 홈 사이드바 카드) | 16/24, `Pretendard UI 650` 굵기 400, font-synthesis none | `groups.module.css` `.discoveryJoined h2`·`.applicationAside h2`·`.hobbyAside h2`, `creator-board-aside.module.css` `.aside h2`, 팬 홈 사이드바(아래 절) | 2026-11-06 DESIGN-FIX-4: 사이드는 구역 제목(20/24)보다 한 단계 낮은 보조 역할이라 16px 유지, 세 곳을 한 역할로 통일. 전: 내 페이지 700/Variable, 응원과 이벤트 UI 850→700 덮어쓰기, 팬 활동 UI 650. 후: 모두 UI 650 16/24. 태그는 `h2`라 스크린리더에는 제목으로 읽힘 |
| 홈 첫 제목 위 간격 | 헤더 하단→h1: 홈 390 40px / 1440 46px, 모임·덕질 390 16px / 1440 40px. 홈은 첫 줄이 브랜드 줄("Kyaa." + 슬로건 + 전체 라이브)이라 구성이 다르고, 디자인 통일의 기준 탭도 홈이다 | `components/guest-home.module.css:33,323` `.shell` padding-top 24px(390)/32px(768+), 나머지 16/14px는 브랜드 줄 래퍼 측정값(코드로 따로 추적하지 않음) | 사유 기록만(2026-11-06 DESIGN-FIX-5B, 값 변경 없음): DESIGN-GAP-11 실측(25aaabca3 전후 동일)과 코드의 `.shell` 값이 맞음 |
| 모임 상세 h1 768~1023 | 24px/1.4/850 (표의 768+ 값). 1024+는 기존 규칙, 768~1023에서 20px로 남던 구간을 `@media(min-width:768px) and (max-width:1023px)`로 24px에 맞춤 | `features/groups/ui/groups.module.css` `.creatorIdentityHeader .identityCopy h1` | 2026-11-06 DESIGN-FIX-5: 820px 실측 20→24px, 로컬 합성 데이터 화면 |
| 모임 캘린더 월 제목 | 1024+ 24px(`--fan-heading-size-wide`, 구역 제목 "일정"과 같은 값), 390~1023 20px. 월 이동 버튼 44px와 선택 월 유지는 그대로 | `features/live/ui/live-calendar-screen.module.css:198`(월 제목), 내장 캘린더 `.embedded:not(.compact) .calendar`(위 여백 84→48px(`--fan-section-gap`), 월 이동 영역 폭 360→320px) | 2026-11-06 DESIGN-FIX-5 M2: 전 1440 28px → 후 24px(제목 폭 256→216px). 월 제목과 이전/다음이 모여 그림과 달력 사이 빈 구간이 36px 줄었음(달력 위 여백 84→48px, 로컬 합성 하니스 1440 캡처에서 이전/다음 44×44 유지 확인). 라이브 캘린더 화면도 같은 컴포넌트라 함께 24px. dev 확인은 푸시 뒤
| 모임 홈 오른쪽 "오늘의 덕질" 제목 | 16/24, `Pretendard UI 650` 굵기 400, font-synthesis none(사이드 보조 제목과 같은 역할) | `features/dukjil/ui/dukjil.module.css` `.tilesHead h2` | 2026-11-06 DESIGN-FIX-5 M1: 전 20px/28px 850 → 후 16/24. 로컬 합성 하니스에 "오늘의 덕질" 카드가 없어 화면 실측은 못 했고 같은 열 사이드 제목 규칙(`groups.module.css:369`)과 같은 값을 넣었음. dev 실측은 푸시 뒤
| 모임 같은 역할 구역 h2 줄 높이 | `--fan-heading-leading`(1.2): 390 20px→24px, 768+ 24px→28.8px. 새 값을 만들지 않음 | `groups.module.css`(`.activityHub>h2`, `.roomsPanel>h2`, `.roomHeading h2`, `.creatorStoriesHeader h2`), `group-rooms.module.css`, `group-home-source.module.css`, `group-collections.module.css`, `group-mission-screen.module.css` `.heading h2` | 2026-11-06 DESIGN-FIX-5 M3: 전 1440 활동 36·비밀방 36·크루 이야기 31·사진/미션 31·게시판/일정 28.8 → 후 28.8 하나. 390 크루 이야기 28·활동 30 → 24(비밀방은 아이콘 줄이라 박스 28 유지). 제목 아래 간격은 전체 28.8 기준으로 활동·비밀방 약 7px, 크루 이야기 약 2px 줄고 390은 4~6px 줄어듦(로컬 합성 하니스 실측)
| 제목 줄 높이 통일(미션 h1·내 응모 h1·게시판/인기글/사진/영상 상세 h2·캘린더 월 제목) | 전부 `--fan-heading-leading`(1.2). 미션 h1은 `--fan-heading-size(-wide)`·850·`--fan-heading-tracking` | `live-mission-screen.module.css:8`, `my-raffles-screen.module.css:4`, `popular-posts.module.css:4,8`, `fan-post-feed.module.css:33`, `creator-media-panel.module.css:88,90`, `creator-video-detail.module.css:6`, `components/fan-calendar/calendar-parts.module.css:2` | 2026-11-06 DESIGN-FINAL-FIX: 미션 h1 전 390 32/700/38.4·1440 48/700/57.6 → 후 20/850/24·24/850/28.8(로컬 하니스). 내 응모 h1 전 줄 높이 normal → 후 24(390)·28.8(1440): 원인은 `FanHeading` personal-page의 `line-height:inherit`(특이도 0,2,0)가 모듈의 `.heading h1`(0,1,1)을 이겨서였고 `.heading > h1[data-fan-heading]`로 올림. 게시판·인기글·사진·영상 상세 h2 전 24/31(390은 20/26) → 후 24/28.8·20/24(영상 상세 댓글 h2는 390 전 20/28 → 후 20/24, FINAL-FIX-2): 24/31 고정의 Pencil 근거는 이 표면들에서 확인되지 않았다고 적었던 이전 기록(24/31 원본은 신고 상태 패널·컬렉션 조회 실패 패널뿐이라고 적음, 아래 해당 절)은 게시판에 대해 틀렸다. `~/Desktop/Developement/byus/work/pen-dev-loop-20261102/reextract-current-002/properties/W0Xri.json`의 `S6jhdi`(팬들의 이야기)와 `l6KPxd`(오늘의 인기글)가 원본에서 24/31이다. 오케스트레이터 결정(되돌릴 수 있음, 2026-11-06 DESIGN-FIX-6): 원본 값이 있어도 역할별 표와 나란한 인기글(`popular-posts.module.css:4,8`)에 맞춰 두 제목을 `--fan-heading-size(-wide)`·`--fan-heading-leading` 토큰으로 통일한다. 게시판 목록 제목(`fan-post-feed.module.css:33` `.compactHeading h2`, "팬들의 이야기"/"글쓰기")은 앞선 수정에서 빠져 있어 전 390 24/31·1440 24/31(767px 이하 재정의 없음, 다른 CSS의 덮어쓰기 없이 이 규칙이 그대로 적용됨, 굵기 400·글꼴 "Pretendard UI 850" 유지) → 후 390 20/24·1440 24/28.8(로컬 합성 하니스 `/nchive?locale=ko&tab=board` 실측, 가로 넘침 없음, 긴 제목은 3줄로 줄바꿈되고 글쓰기 행동은 아래 줄로 내려감, 제목과 글쓰기 행동의 세로 중심 정렬은 한 줄일 때 390·1440 모두 유지). 같은 24/31을 쓰는 다른 표면(`post-attachment-viewer`, `groups.module.css` 등)은 이번에 고치지 않음. 영상 상세 h1 24/32(390 20/28)는 영상 제목이라 페이지 제목 토큰(20/24·24/28.8)과 다른 콘텐츠 제목 역할이며 긴 제목 줄바꿈 때문에 유지(DESIGN.md에 토큰 근거 없음, 사유 기록만, FINAL-FIX-2). 캘린더 월 제목 전 1.3 → 1.2: 44px 버튼은 그리드 `align-items:center`로 정렬되어 줄 높이와 무관해 사유가 성립하지 않아 수정. 공유 컴포넌트라 지갑 출석·셀럽 캘린더 월 제목도 같이 줄 높이만 약 2~3px 줄어듦(크기 불변). 값은 로컬 합성 하니스 실측이며 운영 화면이 아님 |
| 미션 오른쪽 목록 h2 | 20/26 유지 | `group-mission-screen.module.css:2`(`.layout .aside h2`), `:8`(`.layout .rewards h2`) | 사유 기록만(2026-11-06 DESIGN-FINAL-FIX): 오른쪽 보조 목록의 제목 역할이며 Pencil 원본의 26px 줄 높이를 DESIGN.md·원본에서 확인하지 못함. 구역 제목(20/24)과 줄 높이 2px 차이라 값 변경 없이 기록. 이후 Pencil 근거가 없다고 확인되면 토큰으로 통일 |
| 홈 히어로 h2 | 390 28px/800, 1440 32~42px/800 유지 | `home-hero-banner.module.css:162` | 사유 기록만(2026-11-06 DESIGN-FIX-5 M4): 구역 제목이 아니라 배너 표시용 히어로 역할이라 구역 제목 20/24와 비교하지 않음
| 내 응모 결과 패널·공개 h2 | 결과 패널 상태 h2: 390 20px, 768+ 24px, 굵기 850, 줄 높이 1.2(구역 제목 h2 규칙과 동일). 공개 연출 초대 h2 24px/850/1.35 | `features/benefit/ui/raffle-result-panel.module.css` `.status h2`, `raffle-result-reveal.module.css` `.invitation h2` | 2026-11-06 DESIGN-FIX-5: 전 패널 1440 26px/700/normal·390 20px/700 → 20/24px·850·1.2. 강조 역할로 두지 않고 h2 규칙에 맞춤 |
| 역할 토큰(이름만, 값 변경 없음) | 분홍 `--color-accent` #d11b62·`-soft` #fff0f6·`-line` #f4c3d7·`-ink` #ad1457, 코인 `--color-coin` #ffc83d·`-ink` #4a3500, 금박 `--color-foil` #b8975a, 그림자 `--shadow-overlay`(0 8 24 검정 8%)·`--shadow-dialog`(0 16 48 검정 16%), 배지 글자 `--fan-badge-size` 12, 사이드 보조 제목 `--fan-aside-title-size/-weight` 16/650, 시간 `--motion-reward` 600·`--motion-count` 400·`--motion-exit` 120, `--z-toast` 58 | `app/globals.css` | 261107-2 S1. 화면마다 직접 쓰던 값에 이름만. 새 코드는 hex 대신 토큰 |

# Design System: kyaa Fan Pulse Spectrum

<!-- Maintenance note (2026-09-05): This document describes the Fan Pulse
Spectrum foundation, not a verified 1:1 specification of every current byus.kr
screen. Shared tokens and FanAction implement core rules; typography and layout
also live in feature CSS modules. Check deployed source and rendered desktop /
mobile states before claiming full alignment. Preserve intentional surface-specific
differences when consolidating tokens and components. -->

## Current shared content contract (2026-10-09)

- A section reads in this order: heading with secondary navigation, description, filters, content. `FanSectionHeader` owns its `{ label, href }` action: the heading and action align in one wrapping row, and supporting copy sits below both. The title has a flexible 10rem basis; long translated actions wrap naturally. Never shrink the title to fit a translation.
- Section headings use 20px on mobile and 24px from 768px; item names use 16px/700, body copy 16px, metadata 13px. Related copy has 4–8px gaps, subgroups 16px, and major sections 32px/48px. Existing hero artwork/display type remains independent.
- Event catalog (`/events`) is a specific exception: following the 2026-10-27 feedback that 16px event titles looked too small beside 16px descriptions, use 20px/700 event titles and 16px body copy on mobile and desktop. Titles wrap without clipping. This exception does not change the shared 16px item-name or LIVE-row title roles.
- Event catalog starts 32px below the header on mobile and 64px from 768px, following the 2026-10-27 feedback that the page heading sat too close to the header. Its list and pagination share the header and footer content width.
- Creator summaries read image → name → audience metadata → actions. The name may wrap; stateful fan links stay actionable. Social marks remain 20px inside non-shrinking 44px targets and action groups wrap when necessary.
- Filters have 12px corners and quiet labels. Creator-role filters use equal-width columns sized by the longest localized label, with a five-character Korean minimum (`5em + 26px`) and 44px minimum height. A narrow viewport scrolls the whole strip horizontally without truncating labels; focus outlines remain visible. Status pills remain distinct from filters. Community translation belongs to the body, reactions share one row, and secondary/destructive actions live in the accessible More menu.
- All `APP_LOCALES` use the same composition. Use native language wrapping, flexible heights, and complete accessible labels; do not encode Korean/English-only layout branches. CMS content fallback and proper names retain their existing semantics.
- For shared composition changes, verify affected home/community screens at 390px and 1440px for every supported language, plus 360px and 768px for Korean, Japanese, Vietnamese and Thai. Read the locale list from current `APP_LOCALES` and cover new scripts/directions when supported. Include applicable guest/owner/loading/empty/error states, long names, keyboard menus, locale switching and fixed-navigation clearance. Scope local changes to their actual impact and reuse unchanged valid evidence.

### Compact community (2026-10-28)

- `/community` groups the shared 20/24px page heading, separator and 16px creator selector in one wrapping row. The selector and all links keep 44px targets. Fan page and LIVE remain secondary destinations. Remove the large creator box, repeated intro/board heading and redundant posting-prompt sidebar card so reading reaches the feed sooner.
- Community tabs use an 8px top/16px bottom margin; the feed controls and composer are separated by 16px. The media filter uses the shared 12px filter corners and preserves locale, creator and media context through tabs, sidebar links, post details and login. Photo/video-only results are filtered before server pagination; no visible matches use the existing recoverable empty state.
- Hot communities are the top five published creators with positive fan counts, sorted by count, then display order and slug; the visible subtitle states the fan-count criterion. This is not a recent-activity ranking. At 768px and above it occupies a 280px sidebar (260px below 1024px); below 768px it is a horizontal strip before the feed. DOM and keyboard order follow that mobile reading order. CreatorAvatar owns the 36px portraits; names wrap and count metadata stays 13px. Hide the list if no eligible creators exist.
- All shared fan-post cards place the timestamp after the media and body, at the right edge of the likes/comments footer. Keep its 13px metadata role, full localized timestamp and natural image ratios. At narrow widths the timestamp can wrap below actions without overlap; never shrink actions or clip time text. This also applies to fanpage feeds, legacy cheer cards and post details using PostCard. Legacy cheers retain their existing reaction and reply records; show the same likes/comments footer and disclose replies inline on request.
- Owners: `features/community/ui/community-screen.tsx`, `community.module.css`, the shared `FanHeading`, `FanPostFeed`, `PostCard` and `features/content-safety/ui/content.module.css`. Verification uses real components with synthetic data in `e2e/community-compact-local` and `e2e/post-layout-local`; screenshots are local fixtures, not production users.
- Group board list (`GroupBoard` full list, `groups.module.css` `.fullBoardList .postRow`, 2026-11-05 F20): rows use `min-height:44px` with 6px vertical padding on desktop (measured 1440: 44px, was 52px) and 6px padding with a 3px row gap below 768px (measured 390: 53.5px, was 58.5px), matching the fan-page board. Long titles stay on one line with an ellipsis so height holds. Notice titles are 750 against 650 for normal titles; the grey notice ground and the plain-text `공지 ` prefix before the title (no chip; unchanged by F20, also shown on dev) stay. The group board has no shared CSS owner with `CompactFeed`, so these values are set in its own module.
- Fan-page board and popular-post rows (`CompactFeed`): a 36×24px thumbnail (radius 4px, `#f3f3f3` ground, 14px Lucide icons) precedes each title inside the existing 24px line, so row height does not grow (measured 390: 53px, 1440: 45px, the same as without thumbnails). The first photo uses a cover crop of the authorized `?size=thumbnail` asset with lazy loading; the failed or loading status stays `visibility:hidden` so lazy loading still fires and the icon shows. Video-only posts show a Play mark, posts without media a same-size ImageOff placeholder, and notices a FileText mark; none carries visible text, only a screen-reader name on photo and video. Notice titles are bold (700) and keep the notice tag. Views show `—` when the server sends no `viewCount`.

### Content and navigation refinements (2026-10-04)

- Home previews only Passports whose creators are in the current published directory; the explicit Passport count and carousel use that same set. A directory failure shows a recoverable error and a collection link, never a misleading empty collection. The owned collection and historical records remain intact and accessible from MY/Passports. A managed announcement CTA describes and opens its actual destination; creator welcome banners may link directly to the creator home.
- Creator home is a summary. Full conversation, news and media belong to their named tabs; a personal fan activity card appears on home only. Nicknames wrap without competing with attendance, tier or growth controls. The creator's Fan board remains inside that creator's page, and detail, sign-in and back navigation preserve the originating board and language.
- Brand fan pages use the same Home/Board/Certification/Events/Leaderboard navigation, board Feed/Media/LIVE sections, home calendar, daily check-in and Passport flow as other fan pages. Creator roles describe the profile; they do not remove these shared journeys. Keep existing campaign, membership, ticket-policy and leaderboard eligibility gates, and show honest empty states when no content is registered. Preserve the brand's separate event booking action and natural-ratio official artwork. A first like is saved as a Stamp and attaches when the fan's Passport is issued.
- Passport totals include the owner's collected Stamps; do not repeat a narrower collection count without explaining its scope. The activity cards remain available for earning more Stamps. Distinguish an issued Passport or earned Stamp from its record-registration status, including a clear attention-needed state when registration cannot continue.
- Media uses a clear heading, official-channel links, type filters and a consistent content grid. Landscape video previews retain 16:9 framing. External portrait-video covers keep their natural ratio beside the title and metadata so faces and embedded text are preserved without a tall empty grid row. Missing covers use the shared 16:9 source/type fallback; source failures remain recoverable without hiding successful content. 같은 행에 사진과 영상이 섞이면 카드는 위 맞춤이며 행 높이를 맞추지 않는다(자연 비율 보존).
- Fan-post replies open within the selected comment, with the target author, a short quote, and keyboard focus in the reply field. Keep the composer and its controls above fixed navigation when focusing. Use compact right-aligned Neutral submit and Text cancel actions (minimum 44×44px), separate top-level and per-comment drafts, and retain drafts on cancel or failure. Cancel returns focus to the originating reply action. A reply retained across comment pagination keeps its target context below the list.
- Community creator selection is the primary element in its switcher; Fan page and LIVE are secondary destinations. Auxiliary participation cards stack as concise rows on small screens. Composer visibility defaults to public for new posts, preserves the saved choice when editing, and uses a compact trigger with a responsive dialog/bottom sheet. Focus return, image limits, upload/error states and member-only permissions remain part of the interaction contract. Uploaded images have a quiet visible boundary.
- A selected post-like heart is filled red and paired with `aria-pressed`; failed requests restore the previous state. Certification cards distinguish open, preparing and ended work, and attempt numbers have an explicit localized label rather than a bare `#1`.
- The fan list becomes a leaderboard from 100 active fans. Count the deduplicated union of completed creator likes and issued Passport holders, while retaining the separate Passport count. Below 100, show recent fans; at 100 or more, show the top 100 and the signed-in fan's rank. Like-only fans participate with zero points until they earn points.
- The available leaderboard replaces the animated fan gathering. Overall, Quiz, LIVE (reservation/attendance), Missions and Verification filters rank the entire eligible fan population on the server. Only Overall includes score adjustments and zero-point fans; category lists show fans with positive points. Existing lifetime score, tie order and threshold stay unchanged. Use the shared circular `Avatar`; ranks 1–3 retain numbered gold, silver and bronze badges on mobile. Show activity earning rules without claiming fixed mission or verification rewards.
- MY favorites display the complete list by default (2026-10-30): no six-item disclosure. `my-screen.module.css` owns a full-width adaptive grid with two columns on narrow screens, 12px control corners, wrapping 16px/700 names and the existing portrait/pressed/check/focus treatment. Selection preserves list order and updates the existing activity panels.
- MY separates primary activity destinations from secondary history/request links. Settings is an index of aligned rows leading to query-addressable detail sections with Back navigation, retained locale and visible focus. Entering a detail focuses its heading; returning focuses the originating row. Logout and destructive account actions belong to account details. Authentication and resource restoration use loading states before showing account actions or a guest screen.
- Notifications use the shared Primary action for enabling browser notifications and a Neutral action for marking all read. Unread counts, dots and permission icons use the existing Spectrum Ink and subtle focus surface; status is also conveyed through labels and weight.
- These refinements reuse the existing kyaa brand. Public Weverse artist tabs and b.stage community/MY references informed separation of summaries, feeds, media and settings; they do not establish kyaa membership rules or authentication behavior. Source examples: [Weverse artist home](https://weverse.io/enhypen/highlight), [Weverse media](https://weverse.io/enhypen/media), [b.stage community](https://bigbang.bstage.in/community), [b.stage My Posts & Activity](https://bstage.in/article/bstage-tips-7-en/).

### Creator board and unified feed (2026-10-09)

- Creator pages have five primary destinations: Home, Board, Fan verification, Events and Fan leaderboard. Board contains Feed, Official media and LIVE. Keep the creator, language and originating board filter when entering details or signing in; legacy news, media, LIVE, lounge and cheer links resolve to their corresponding destination.
- Feed is one chronological conversation combining official posts, fan posts and existing cheers, with All, Official and Fan posts source filters. Pinned standard notices precede pinned welcome notices; an unpinned welcome notice follows its publication time. Use one existing composer in All and Fan posts. Each content type keeps only its supported reactions, comments and owner actions.
- The board navigation, filters and feed share the full `FanContentContainer` edges: 1440px maximum width and 16/32/40px responsive gutters. There is no secondary official-news column. Individual text and media retain readable widths inside the full-width feed. Creator home may retain its calendar beside the summary.
- Official media uses three columns on desktop, two on tablet and one on mobile. Keep a purposeful empty state with a filter reset or Feed destination; a failed source has a retry action while successful content remains visible. Official channels stay available above the grid.
- A new fan post shares the existing one-time first-comment reward eligibility with cheers and notice comments. Do not suggest a new score reward or retroactively reward existing fan posts. Existing content and reward history remain intact.

### Completion requires a visual finish review

- Image work must follow the repository-wide [image framing and review contract](docs/design/image-framing.md), including its role owners, deliberate-space exceptions, loaded mobile/desktop evidence and access-gap reporting. This applies to new screens and source replacements as well as existing UI.
- Approved exception (judge: orchestrator, 2026-11-05): the passport card slot (`CreatorImage presentation="passportCard"`, 92×108) shows the landscape Kara group photo with `contain` so all five members are visible, on the card frame colour `#f6f6f5`. It applies only to the registered Kara source; other creators, 40px avatars and other slots keep the `portrait` behaviour. Reason, scope and captures are recorded in the "승인된 예외" section of [docs/design/image-framing.md](docs/design/image-framing.md).
- Apply the current user-approved design, then this current role contract. Historical observations and example prompts cannot override it. Reuse shared owners and keep approved hero/profile/display variants; do not normalize every surface into the same card. This document is a design contract, not a claim that an old checkout or production already implements it.
- Verify both behavior/accessibility and the actual composition. View the affected mobile and desktop screens at native display size with realistic normal content and varied representative images. Confirm a clear first focus and next action, readable title/body/metadata hierarchy, coherent information groups, optical icon alignment, face-legible crops, balanced density and deliberate section rhythm. Compare with the approved product direction and resolve visible disharmony before claiming visual completion.
- Reject unintended blank bands around image content, including letterboxing from fixed frames/minimum heights and excess space baked into the source. Inspect the source and the rendered image separately at mobile and desktop widths. Text/logo banners use their natural aspect ratio and a content-sized frame; do not stretch, crop essential text/logos, or hide empty space with blurred duplicates. Preserve deliberate composition, required padding and existing approved artwork treatments. If a fixed slot cannot show the complete content without empty bands, use suitable artwork or adjust that slot before passing visual review.
- Check translated and long content without shrinking type/targets or hiding meaningful information. Inspect active keyboard focus in Portal menus as well as the surrounding page, and inspect open dialogs for padding, clipping, safe-area and fixed-navigation conflicts. Focus ownership or automated accessibility passes alone do not prove visible focus or aesthetic quality.
- Keep evidence tied to the changed screen, width, locale and state. Loading-only captures, repeated identical portraits or isolated component fixtures cannot certify a whole page. Report functional checks and visual judgment separately; disclose incomplete states and unresolved material issues. No score or token check guarantees beauty.

## Brand copy (2026-10-13)

- The approved slogan is `Kyaa. Every Fan Moment Counts.` in every locale. Home displays `Kyaa.` with `Every Fan Moment Counts.` immediately beside it as a smaller 13px slogan, baseline-aligned with an 8px gap and natural wrapping on narrow screens (2026-10-21 user request); the old LIVE tagline is removed. Keep the full slogan for the default page/share title, installed app name, and guide footers. Preserve the existing kyaa wordmark artwork.
- Current partner banner copy uses `NCHIVE × Kyaa` and `WELCOME TO KYAA`. Internal identifiers, legacy URLs, and historical records retain their existing names.
- The connect introduction and Passport artwork use Kyaa. Preserve the whole book, stamps and outro copy with contained video framing; the wide layout places copy beside the film on its paper canvas. Keep playback, skip, replay and reduced-motion behavior. New Membership artwork has a new content-addressed URL; issued artwork remains available.
- Approved collectible display artwork (2026-10-18) uses 14 carved ink Stamps and 11 fan tier seals in `images/{stamps,passport/tiers}/ink-v1/*.webp`. Lossless WebP decodes pixel-identically to the approved 512px PNG masters. Preserve transparency and use `object-fit: contain` without inherited crop/scale; serve these precompressed assets without a second lossy transform. Dates, points, tier names and localized meaning remain live UI content. Historical credential v2 PNGs, issuance/metadata URLs, the representative Passport and unrelated mission artwork remain available. Editable SVG and PNG masters live in `docs/design/assets/ink-v1`; reproduce exports with `node scripts/prepare-ink-collectibles.mjs`.
- The v2 `passport.png` is the standalone representative Passport illustration. The functional Passport canvas remains the fully opened nine-slot record book with its data-driven Stamp overlays and latest-nine semantics; do not place a nine-item grid over the representative illustration's six embossed slots or reduce visible records to match it. Current state (2026-11-07): the small places (home, MY, group side, issuance, login, guides) draw `public/images/passport/passport-open-book.svg`; the detail screen draws a CSS book with page turns instead of this canvas. See "doc-261107 묶음 계약".
- MY keeps owned Passports, points, tickets and entry history for unpublished fan pages, while hiding public participation links and requests that would lead to an unavailable page.

## Intent

The system is an image-first fan utility: editorial artist imagery creates emotion, while quiet product surfaces make reservation, login, discovery, and Passport tasks immediately understandable. Current approved role contracts below guide new UI. Historical extraction notes describe their original evidence, not current deployment status.

## Color

Use a White and Near Black shell with a `single-gradient-highlight` strategy. Reserve the filled pink-to-violet Spectrum Relay for the current surface's single most important next action. Google, Passport, and repeated LIVE-row context actions may reuse the relay as a 1px outline with a high-contrast solid Spectrum Ink label; neutral utility surfaces must not compete with artist photography.

## Typography

Use Pretendard Variable throughout product UI. Apply the exact hierarchy, weight, line-height, and tracking rules documented below; countdown numerals use a monospace stack with tabular figures.

## Image

Use face-legible, editorial, full-color artist photography. Preserve the approved hero crop and Home's inset square favorite artwork within a Gallery Gray field from 768px. Below 768px, Home favorite artwork fills its square frame while preserving the registered crop. The `/celebrities` directory uses full-bleed portraits: 5:4 for approved cover crops on mobile and square from 768px; mobile full-image (`contain`) sources use their natural ratio, retaining the registered image source and focal position. Role filters use 12px rounded rectangles with at least 44px touch targets; search and sort render at the same 14px label size. Use only the fully opened identity-and-stamp Passport asset.

## Surfaces

Use 12px controls, 16px collections, and a 20px hero with 1px neutral hairlines and short two-layer micro-shadows. Avoid dark utility cards, glassmorphism, nested cards, and decorative color surfaces.

## Interaction

Maintain 44px minimum targets, a 3px Near Black `focus-visible` outline, 160ms control feedback, and 240ms object or layout transitions. Adjacent icon-only actions, including Home celebrity social links, use optically centered 20×20px visible marks inside separate 44×44px targets with no inter-target gap. Never overlap or shrink the targets to achieve visual density. Collapse transitions for reduced-motion users.
2026-11-05 예외 — 모임 찾기 상단 슬라이드 점: 버튼 32×44px, 점 8px. 이유: 사용자가 점 간격을 좁히라고 명시했고 인접 타깃과 겹치지 않는다. 다른 컨트롤에는 적용하지 않는다.

## Locked Contract

Preserve the Korean copy, artist identities, live data, Google login treatment, opened Passport lifecycle copy, and responsive panel behavior. The global fan information architecture is `HOME · 커뮤니티 · 최애 · MY` on desktop and mobile: HOME routes to `/`, 커뮤니티 to `/community`, 최애 to `/celebrities`, and MY to `/my`. Passport, benefits, notifications, and settings are MY sub-surfaces and keep MY active. Focused login, onboarding, verification and Passport issuance flows may use the compact Focus Header; it still carries the main header's language icon (`FanLanguageSwitch compact` via `FocusFlowFrame languageSwitch`, inside the start dialog when that dialog covers the header, and beside Close in the login overlay) because N19 has no focus-flow exception. LIVE missions and the LIVE survey use the main fan shell (`FanAppFrame`) like the LIVE detail they return to, with `← LIVE로 돌아가기` above the content (2026-11-08, evaluator round 2 defects 5·6); the Elina art-mission campaign keeps its own campaign header. The hero remains the sole dominant visual surface, while the active surface's one most important next action may use the gradient-filled Primary treatment.

- Fan verification flow exception (user request 2026-11-09 01:0x, K10: "헤더는 레이아웃 아니야? 왜 또 없어져 버렷어. 푸터쪽도."): the quiz entry (`/c/[slug]/verify`), questions and result screens use the main fan shell (`FanAppFrame`: common header, footer and bottom navigation) instead of the compact Focus Header. Answers are saved per question on the server, so leaving through the header loses nothing; no leave confirmation is added. Login, onboarding, Passport issuance, account deletion, legal pages, runmusic and kyaa wave keep `FocusFlowFrame` as above. Files: `features/quiz/ui/quiz-{entry,questions,result}-screen.tsx`.

The Home hero is an independently managed carousel of published home banners, ordered by the administrator's saved order with stable ID ties. Publishing LIVE occurrences does not add hero slides; the LIVE calendar and upcoming list retain their independent schedules. A creator may have at most one published regular-broadcast banner. Banner artwork, copy and destination are localized for Korean and English. Mobile uses the registered mobile artwork, falling back only to the same language's desktop artwork with contain. The existing Elina participation guide remains the final slide. With more than one item the carousel advances horizontally every 6 seconds; hover, keyboard focus and pointer interaction pause it. Reduced-motion users receive no autoplay or large translation. Hidden slides are inert. Keep existing geometry, controls and typography except for the user-approved welcome spacing and inline home slogan refinements documented here.

All Home hero status badges (UPCOMING, LIVE, and SPECIAL EXHIBITION) share one component and use the user-selected Magic UI Shimmer Button perimeter light: pale pink-white glint on a dark solid surface, original 3s alternating travel and 6s rotation, with existing 28px height and 12px type. Only the visible active badge animates; offscreen/hidden slides pause and reduced-motion keeps the static outline.

The Home hero viewport has a 1.5px Spectrum outline with a pink-white-violet highlight circling it every 8 seconds (2026-10-28 user request). This decorative layer preserves the existing 20px corners, artwork, layout and click/drag targets. It pauses with carousel autoplay, including hover, keyboard focus, pointer interaction, manual pause and offscreen/hidden state; reduced-motion keeps only the static outline.

Scheduled LIVE countdowns share a vivid pink accent (`#be185d`), with a pale pink fill (`#fff1f7`) and fine pink border on MY and badge variants. Calendar text variants keep their compact unboxed layout. On Home photography, use pale pink text (`#ffd0e6`) on a dark translucent pill. A 7px dot and expanding halo pulse every 1.8s while a future LIVE is visible and active; the time text stays steady. Hidden/inactive countdowns and elapsed scheduled starts do not pulse, and reduced-motion disables both dot and halo animation. Keep existing KST date/countdown semantics and server-confirmed LIVE status.


## 1. Visual Theme & Atmosphere

Fan Pulse Spectrum is a bright, image-first fan utility interface. A full-color KARA hero supplies nearly all of the page's visual intensity; the surrounding product UI stays white, neutral, and deliberately quiet. The composition pairs editorial entertainment imagery with disciplined product surfaces: generous whitespace, black display type, hairline borders, short micro-shadows, and one pink-to-violet conversion accent. The result should feel like a polished global fan platform rather than a promotional microsite or a dense dashboard.

The page uses asymmetry only at desktop scale. The main content owns the visual narrative while a narrower sticky context panel handles logged-out actions. Below 1024px, that panel disappears and the experience becomes a single-column feed with a fixed four-item bottom navigation. Color is concentrated in photography, the primary reservation action, and restrained Spectrum outlines on repeated LIVE-row actions; utility cards do not compete with the hero.

### Key Characteristics

- Image-first editorial hierarchy with one dominant 2:1 desktop hero.
- White canvas, near-black text, soft neutral surfaces, and almost invisible borders.
- One controlled pink-to-violet filled gradient reserved for the primary conversion CTA; repeated LIVE-row actions may reuse the same relay only as a 1px outline.
- Rounded but not bubbly: 12px controls, 16px collections, 20px hero, full pills only for status and primary action.
- Large negative space between sections; dense information is organized inside compact rows rather than scattered labels.
- Product utility and fandom emotion remain separate: photography carries emotion, cards carry tasks.

## 2. Color Palette & Roles

| Role | Semantic Name | Value | Usage |
| --- | --- | --- | --- |
| Page background | Canvas White | `#FFFFFF` / `oklch(100% 0 0)` | Page, header, primary cards, context panel cards |
| Primary text | Near Black | `oklch(18% 0 0)` | Headings, active navigation, key labels, focus rings |
| Secondary text | Muted Ink | `oklch(48% 0 0)` | Subtitles, metadata, supporting instructions |
| Subtle surface | Soft Gray | `oklch(97.5% 0 0)` | Quiet hover states and low-emphasis controls |
| Media field | Gallery Gray | `#F6F6F5` | Framed artist-photo fields inside the favorite collection |
| Structural line | Hairline | `oklch(90% 0 0)` | Navigation capsule and bottom navigation dividers |
| Card line | Micro Hairline | `oklch(93% 0 0)` | Cards, artist media fields, social buttons, live rows |
| Strong line | Warm Gray | `oklch(76% 0 0)` | Reserved for stronger internal guides; use sparingly |
| Primary action | Spectrum Relay | `linear-gradient(125deg, oklch(68% 0.22 18), oklch(62% 0.25 340), oklch(56% 0.22 285))` | The current visible surface's single most important next action |
| Action text | On Action White | `#FFFFFF` | Text and icons on the gradient CTA |
| Status accent | Live Pink Line | `rgb(255 95 191 / 78%)` | UPCOMING status outline only |
| Highlight outline | Spectrum Relay | Same gradient as Primary action | 1px border on Google, Passport, and repeated LIVE-row context actions |
| Highlight action text | Spectrum Ink | `oklch(45% 0.22 315)` | Solid accessible label, icon, and arrow on outlined highlight actions |

### Primary

- The interface is monochrome-first. White and Near Black define the product shell.
- The Spectrum Relay is a conversion signal, not a decorative background. It appears at most once as a filled action in each active main or inert-isolated overlay. Google, Passport, and repeated LIVE-row actions may reuse it as a restrained 1px outline, but every action within the same repeated collection uses the same outline treatment.
- Photography may be colorful, but no colored surface should be introduced merely to balance an image.

### Interactive

- Default interactive text inherits Near Black or Muted Ink according to hierarchy.
- `:focus-visible` uses a 3px Near Black outline with a 3px offset. Exception (2026-11-04): the fan, hobby and brand page tab strips scroll horizontally below 1024px and would clip an outer ring, so their tab links move the ring inside (`-3px` offset) at that width. The fan tab keeps the 3px Near Black ring; hobby and brand tabs keep the group-role ring below. At 1024px and wider the strip does not scroll (`overflow:visible`) and keeps the default outer offset. Group-role exception (2026-11-05, recorded per owning file; values unchanged): the group screens do not share one ring. `apps/web/features/groups/ui/groups.module.css` uses a 2px `#d11b62` outline with a 3px offset for `.page :is(a,button,input,select,textarea)` (line 47), the `summary` toggles (lines 82, 90) and the image picker and application-type chips (lines 78, 123), a 2px offset for the social links (line 70), and 2px `#bd1258` with a 2px offset for the activity and room cards (lines 189, 195); `.sourceRaffleCreate` is 2px `#ad1457` with a 3px offset (line 319). The same 2px `#d11b62` / 3px offset is used by `group-collections`, `group-members`, `group-manage`, `group-settings-panel`, `group-report-manager`, `group-qualification`, `my-passport-hero`, `my-group-destinations` and `group-header-account` (`.profile`; its language, menu and close controls use a 2px offset) and by `group-wallet/ui/wallet.module.css` `.supportDialog`. 3px `#d11b62` with a 3px offset is `wallet.module.css` `.page`. 3px `#121212` Near Black is used by `wallet.module.css` `.walletPage`, `activity-evidence`, `task-panel.css`, `event-application-dialog`, `group-earnings` and `group-benefits` (offsets 2, 3 or 4px by control). 3px `#ad1457` is used by `group-home-source` pagination (2px offset), `group-rooms` and `creator-board-aside` (3px offset); 2px `#ad1457` / 3px by `artist-presence-dialog`. Smaller owners are `group-room-list` (2px near-black, 2px offset), `group-application-dialog` (3px `--color-focus`, 2px offset) and `creator-board-footer` (`--focus-width` ink). These are existing per-screen values kept as is; `#d11b62` is 5.19:1 against white (text 4.5:1, non-text 3:1 met). Fanpage role exception (2026-11-04): `apps/web/features/fanpage/ui/fanpage.module.css` line 7 (`.page :is(a,button,input,textarea):focus-visible` and `.dialog :focus-visible`) keeps the legacy pink 3px ring (`#ff2d87`, offset 4px) instead of the Near Black ring; contrast on white is 3.51:1 (non-text 3:1 met). Fan strip height includes the tab's 1px overlap with the divider so the bottom edge of the ring is not clipped.
- Fine-pointer hover feedback runs for 160ms with `cubic-bezier(0.2, 0, 0, 1)`.
- The gradient CTA darkens all three stops on hover; outlined Spectrum actions receive a faint Spectrum-tinted White surface while preserving their outline; neutral controls shift toward `oklch(97.5% 0 0)`.

### Neutral Scale

- Canvas and card: `#FFFFFF`.
- Gallery field: `#F6F6F5`.
- Soft interaction surface: `oklch(97.5% 0 0)`.
- Hover surface: `oklch(94% 0 0)`.
- Muted text: `oklch(48% 0 0)`.
- Primary text: `oklch(18% 0 0)`.

### Surface & Overlay

- Main canvas: solid White; no page gradient or ambient color wash.
- Hero readability: two restrained black scrims, vertical and horizontal, fading to transparent before the image midpoint.
- Text on hero photography uses a short `0 1px 3px` dark text shadow.
- Passport asset uses a soft object drop-shadow rather than a surrounding colored panel.

### Theme Modes

#### Light Mode

- Background: Canvas White.
- Surface: Canvas White with a Micro Hairline and short micro-shadow where separation is necessary.
- Text: Near Black plus Muted Ink.
- Accent: Spectrum Relay on the primary hero CTA.
- Notes: this is the only observed and supported appearance mode.

#### Dark Mode

- Not observed and not implemented. Do not infer or auto-generate a dark palette from this document.

### Shadows & Depth

- Card micro-shadow: `0 1px 2px oklch(18% 0 0 / 0.05), 0 4px 12px oklch(18% 0 0 / 0.03)`.
- Hero CTA shadow: `0 5px 8px rgb(58 18 55 / 22%)`.
- Passport image: `drop-shadow(0 8px 14px rgb(23 25 28 / 7%))`.
- Borders provide the primary separation; shadows confirm depth but never create floating islands.

## 3. Typography Rules

### Font Family

- Primary: `"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif`.
- Google login control: `"Google Sans", Roboto, Arial, sans-serif`.
- Numeric countdown: `ui-monospace, SFMono-Regular, Menlo, monospace` with tabular figures.
- OpenType features: use `font-variant-numeric: tabular-nums` for changing timer values.

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Hero event title | Pretendard Variable | `48px` desktop / `32px` mobile | `850` | `1.02` | `-0.04em` | White overlay title, maximum `15ch` |
| Shared section heading | Pretendard Variable | `24px` from 768px / `20px` mobile | Standard `850`, editorial `800`, personal `700` | Shared role leading | Shared role tracking | Description is optional; preserve the MY page-specific breakpoint and leading |
| Context-card heading | Pretendard Variable | `20px` | `850` | `1.2` | `-0.03em` | “곧 만날 최애”, “최애의 Fan Passport” |
| Item / creator name | Pretendard Variable | `16px` | `700` | Shared item leading | Shared role tracking | Image → name → audience metadata → actions; names may wrap |
| Body copy | Pretendard Variable | `16px` | `400` | Shared body leading | `0` | Preserve readable translated content |
| Metadata | Pretendard Variable | `13px` | Role-specific `400–550` | Shared metadata leading | `0` | Quieter than the item name |
| Live-row title | Pretendard Variable | `16px` | `700` | Shared item leading | Shared role tracking | Allow wrapping without clipping the title |
| Section subtitle | Pretendard Variable | `14px` | `550` | `1.5` | `0` | Muted Ink, sentence-style Korean |
| Primary CTA | Pretendard Variable | `15px` | `800` | Normal | `0` | Compact, direct verb phrase |
| Status label | Pretendard Variable | `12px` | `800` | Normal | `0.04em` | Uppercase only for UPCOMING |
| Passport value line | Pretendard Variable | `14px` | `750` | `1.45` | `0` | Centered and concise |
| Passport supporting line | Pretendard Variable | `13px` | `550` | `1.5` | `0` | Muted Ink |
| Countdown | UI monospace | `14px` | `750` | Normal | `-0.02em` | Stable width; never use proportional numerals |

### Principles

- Use weight contrast before introducing additional size tiers.
- Korean headings are short, assertive noun phrases; subtitles explain value in one sentence.
- Home Hero event titles use `{celebrity name} LIVE` and do not repeat the associated brand name. CMS titles and brand context remain unchanged for LIVE lists and detail screens.
- Do not use the Bricolage wordmark font for UI copy. The custom wordmark remains an image asset.
- Keep hero text high-contrast and left aligned; keep Passport empty-state copy centered.

## 4. Component Stylings

### Buttons and Links

- Primary CTA: at most one visible per active main or inert-isolated overlay; some surfaces need none. Use a 320px maximum width, 48px minimum height, full pill radius, Spectrum Relay fill, White text, Pretendard Variable 15px/800, optically centered label, and optional 18px leading/trailing icons. Labels are short verbs describing the immediate next action. Put necessary preconditions or destination details in helper copy 8px below at 13px/550 and connect it with `aria-describedby`.
- Google login: 90% of card width, 52px minimum height, full pill radius, White fill, 1px Spectrum Relay outline, solid Spectrum Ink label, authentic multicolor G mark, centered label.
- Passport CTA: label `Fan Passport 발급받기`; 90% of card width, 52px minimum height, full pill radius, White fill, 1px Spectrum Relay outline, solid Spectrum Ink label, centered label and right arrow.
- Creator summaries: inset 12px below the media field, then show a wrapping 16px/700 name, quieter 13px audience metadata, and a separate action group. Use a 4–8px gap within related copy and allow actions to wrap without shrinking their 44px targets.
- LIVE state: show a blinking red dot plus `LIVE 진행중` / `LIVE NOW` only for an active LIVE, a static muted dot plus `LIVE 예정` / `UPCOMING LIVE` for a scheduled LIVE, on LIVE surfaces. Home creator cards instead show an outlined heart with `입덕하기` / `Become a fan` in the action group, linking to the existing creator fan-verification detail page (`/c/{slug}`) with the current locale; this is navigation, not a saved-favorite toggle. Disable dot animation for reduced-motion users.
- Celebrity social controls: keep the icon group together in the action area after identity and audience metadata; allow the group to wrap. Use optically centered 20×20px brand marks inside separate 44×44px targets and `0px` gap between adjacent targets. Do not render visible YouTube, TikTok, or Instagram labels. Preserve accessible names in the links.
- Mobile/tablet context actions: below 1024px, keep the existing state-appropriate activity summary and authentication or Passport action in the normal content flow. Reuse the service/passport action roles; do not force duplicate CTAs or invent a destination for unavailable content.
- Button owner and states (2026-11-04): `FanAction` (components/fan-ui/fan-action) is the only owner of button/link-button state. Always pass an explicit `variant` (`primary|neutral|text|service|passport`); a missing variant falls back to `neutral`, whose hover must never sit under white text. Hover/lift only under `(hover:hover) and (pointer:fine)`; primary hover is `brightness(.92)` with a 1px lift; `:active` presses back; `:focus-visible` is a 2px outline; `disabled`/`aria-disabled`/`loading` use #e4e1e6 fill with #5d5d5d text (5.08:1), `cursor:not-allowed` (`progress` while loading), no hover, no gradient. Screen modules must not restyle disabled colors (the base uses doubled-class selectors to win). `loading` disables, sets `aria-busy`, keeps width and shows a 16px spinner. Minimum height 44px.
- Skip link (2026-11-05): `.skipLink` in fan-app-shell.module.css is the only bypass link. `position:fixed`, off screen at `translateY(-200px)` until `:focus-visible`, then `translateY(0)`; 44px height (min 44px), `padding:0 16px`, `inline-flex` with centered text, 14px/750, 12px radius, no underline, #121212 fill with white text (18.73:1). Focus ring is 3px #121212 with 3px offset. Position top 76px/left 16px below 1024px; top 10px/left 144px at 1024px and up. `z-index:var(--z-tooltip)`.
- Button icons: `leadingIcon`/`trailingIcon` are flex children of the button with `--fan-action-icon-gap` (8px), never absolutely positioned, so a label can wrap but never overlap its icon. The label is the single wrap rule (`overflow-wrap:break-word; text-wrap:balance`). Forward navigation uses `ArrowRight`, back uses `ArrowLeft`, external `ArrowUpRight`; chevrons are reserved for disclosure and carousels. Section "전체 보기" links are a `FanAction variant="text"` with `ArrowRight`.
- History entry is one link on the 덕질 title row (`내역`). Balance cards (points, tickets, hearts) carry no history button and share one structure (icon, name, value). The destination shows two tabs, 적립·사용 (`/my/wallet#wallet-history`: points, tickets, hearts) and 참여 (`/my/raffles`), rendered by `HistoryTabs`; existing URLs keep working.
- Section secondary links: minimum 44px interaction height, 13px/550, Muted Ink, unboxed chevron treatment. Other text-action roles retain their shared typography.
- Icon-only controls: use 20×20px visible icons inside 44×44px targets with Lucide-style 1.75–2px strokes. The Header language switch is the deliberate exception: use a 24×24px visible glyph inside the same 44×44px target. Adjacent icon-only controls use `0px` group gap while each target remains distinct and non-overlapping. Do not apply this compact rule to controls with visible text.
- Repeated LIVE-row actions: use the highlighted Secondary treatment rather than Primary or Neutral. Apply the same White fill, 1px Spectrum Relay outline, and Spectrum Ink label/icons to every action in the collection regardless of reservation or replay state. At desktop use a 184×48px outlined pill with a 14px/750 centered label and balanced 18px leading/trailing icons; below 768px reduce the same action to a separate 44×44px icon target.
- LIVE detail action rail: treat its title as a Page heading, not a Hero overlay title. Use 24px/800 on desktop and 20px/800 on mobile, 14px/550 schedule labels, 14px/750 schedule values, 24px between information groups, and 8px between the Primary and its 13px/550 helper.
- Avoid parallel primary actions. The hero ends at “라이브 예약하기”; detailed information belongs downstream.

### Cards and Containers

- Collection card: White, 16px radius, 24px desktop padding / 20px mobile padding, Micro Hairline, card micro-shadow.
- Utility card and live row: White, 12px radius, Micro Hairline, card micro-shadow.
- Hero: 20px radius, no card shadow; depth comes from the photograph and internal scrim. Home's shared carousel viewport has a 1px Spectrum Relay perimeter (2026-10-27 banner-boundary feedback), overlaid without changing artwork geometry or blocking controls and swipe gestures.
- Desktop context cards stack with a 16px gap and remain visually quieter than the hero.
- Nested colored cards are prohibited. Inner separation should use a media field, spacing, or a hairline.

### Inputs and Interactive Controls

- No form input was observed on this page.
- Controls use an explicit 3px Near Black focus outline with 3px outer offset. The shared ContentActions/PostCard More menu items use a 3px inset outline (`-3px` offset) to stay inside the compact popup; report-dialog fields and actions keep the default outer offset. Portal content owns its product font and focus styling independently of the page frame.
- Touch targets remain at least 44px even when the visible icon or label is smaller.

### Navigation

- Header: sticky White shell using the current shared header geometry, with 88px desktop height from 1024px. Preserve the compact mobile header and avoid duplicating historical extraction heights in new CSS.
- Wordmark: 80px rendered image inside an 88×44px link target.
- Desktop navigation from 1024px: White pill, 44px height, subtle border, active item in Near Black/800 and inactive items in Muted Ink/600.
- Desktop optical correction: navigation is translated upward by 1px to align Pretendard with the wordmark.
- Below 1024px, hide the desktop pill and retain brand plus header actions.
- Below 1024px, show a fixed 64px four-column bottom navigation with a thin top line and a 2px active indicator.
- Desktop and mobile use the same four product destinations: `HOME`, `커뮤니티`, `최애`, `MY`. Do not replace them with section anchors or separate mobile-only labels.
- `/passports`, `/stamps`, `/benefits`, `/notifications`, and `/settings` are MY sub-routes and render MY as the current top-level destination.

### Image Treatment

- Hero uses full-bleed high-resolution KARA photography with `object-fit: cover` and a slightly right-shifted focal position.
- Home favorite cards use a nested gallery composition from 768px: a square `#F6F6F5` field contains the shared `min(84%, 240px)` square portrait. Below 768px, the portrait and preview fill the square frame, retaining the same registered crop. The `/celebrities` directory fills its entire media area, 5:4 below 768px and square from 768px. Both use the shared per-creator framing. Mobile directory images requiring `contain` use a content-sized frame instead of 5:4 letterboxing; never promote an unapproved crop to cover.
- Favorite portraits are direct, colorful, face-legible editorial crops: blue KARA group styling, warm gold Elina close-up, cool dark Changha close-up.
- Upcoming LIVE avatars reuse the corresponding artist imagery in circular 64px desktop / 56px mobile crops. (Home no longer has this block since 2026-11-09; the LIVE list, calendar and fan pages keep their own.)
- Passport uses the fully opened identity-and-stamp-book image `passport-open-book.svg` with `object-fit: contain` in small places and a CSS book with page turns on the detail screen. It is never shown as a closed burgundy cover; the detail screen keeps only a cover band.

### Distinctive Components

- Status Rail: UPCOMING outline pill plus date on one horizontal rail; the countdown sits below in monospace. Scheduled LIVE events use `D-{days} HH:MM:SS`, omitting the day prefix when less than 24 hours remain, and update once per second. Active events and countdowns that reach zero show `LIVE NOW`.
- Favorite Gallery Collection: one rounded outer collection with image-led items; each item reads portrait → emphasized name → fan count → fan-detail and social actions. Keep real YouTube, TikTok, and Instagram marks in full-size targets.
- Logged-out Live Card: heading and subtitle at the top, centered calendar-heart line icon, centered explanatory copy, Google login CTA at the bottom.
- Fan Passport Card: title/subtitle, opened Passport asset, lifecycle value copy, and login CTA in one quiet vertical composition.
- Upcoming LIVE Row: circular avatar, identity/title/date block, right-aligned reservation metadata on tablet/desktop, and a 44px chevron action. (Removed from Home 2026-11-09; see "홈 블록 순서" in 안내·배너.)

## 5. Layout Principles

### Spacing System

- Base unit: `4px`.
- Repeated spacing values: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64px`.
- Adjacent icon-only action groups are the deliberate exception to the positive spacing scale: use `0px` between separate 44×44px targets and center a 20×20px icon in each target.
- Major content sections use the shared 32px mobile / 48px wider-screen gap.
- Shared section headers use a 16px bottom gap. The optional secondary link wraps below when a 20rem title column and the action do not fit.
- Dense components use 12–24px internal gaps; avoid arbitrary intermediate spacing.

### Grid & Container

- Maximum product width: `1440px`.
- Shell width tokens (2026-11-09 shell-width): `--shell-max-width: 1440px` and `--shell-inset` (`16px` below 768px, `32px` from 768px, `40px` from 1280px), defined once in `app/globals.css`. The header inner container, the page body (`FanContentContainer`), HOME's own header and shell, the focus-flow and compact headers and the onchain header all read these two tokens, so the logo's left edge and the avatar's right edge line up with the body's first and last content edges at every width. Do not put a literal `1440px` or a `max-width` below it on an element that also carries the container class, and do not override the header inner `padding-inline`. Detail screens (fan page post, notice, group event, mission) start at the shell's left edge: the title, meta, body, reaction buttons and the comment block (head, composer card, list) share the tab row's left edge (at 1024px and wider the comment block drops its card inset; below 1024px it keeps it), and the fan page post column fills the cell next to the fixed 288px rail (gap 32px). The PC header (1024px and up) is one grid at every width: `minmax(0,1fr) auto minmax(0,1fr)` = logo | tabs | right group, so the tab group's centre equals the header's centre (measured 0px at 1024/1100/1200/1280/1300/1440/1920). Below 1400px the tabs use compact cells (gap 0, padding 8px; font 13px from 1024 to 1199px); the right group shrinks instead of moving the tabs. The mobile rule below 1024px is unchanged. The 덕질 body grid (`group-benefits.module.css`) is `minmax(0,1fr) 352px` with a 32px gap from 1024px and is not centered: the left column takes the remaining width, so the body's left and right edges equal the header's logo-left and avatar-right (measured 0px at 390/768/1024/1280/1440/1920/2560). Notices with a recent list use a `minmax(0,1fr) 264px` grid with a 48px gap; notices without one, group events and missions keep a 720px reading width but are left aligned. This replaces the centered 720px columns of FX-47 and UI-R10 F06. The participation guide, the US fan meetings page and the public live dashboard use the same tokens (their 100px/64px desktop insets are gone; their mobile insets of 20px are unchanged). Measured 1440/1920/2560: logo left = body left (40/280/600) and avatar right = body right (1400/1640/1960). Before this, MY's `.main { max-width:1232px }` narrowed the body on the same element as the 1440 container, and the groups header used 16px at 768~1023 and 40px at 1024~1279 while the body used 32px.
- HOME, event catalog, LIVE list, LIVE calendar, creator directory and MY share that outer width, including horizontal gutters of `16px` below 768px, `32px` from 768px, and `40px` from 1280px. Page headings and first content edges align with the header and footer; do not add narrower nested page containers. Control density with rows and columns inside this shared shell.
- Reading and focused task widths remain separate: settings fields 720px; certification and quiz 760px (quiz result 690px); login 440px or gateway 960px; onboarding 1120px; legal reading 760px; LIVE mission 880px and survey 800px; Passport issuance presentation 1320px. Dialog widths are independent of page width.
- At 1440px with the always-visible side panel: 40px page insets, `944px` main column, 32px gutter, `384px` context panel.
- At 1024–1279px: main column plus 360px context panel with a 24px gap.
- At 768px: 32px page insets and a single 704px content column.
- At 390px: 16px page insets and a 358px content column.
- Desktop hero ratio: `16:8`; mobile hero ratio: `4:5`.

### Whitespace Philosophy

- Whitespace is the primary neutralizing force against colorful artist imagery.
- After implementation, review spacing/alignment/type separately at the same viewport, locale, content and state before and after. Keep related title/description closer than separate actions; choose existing role tokens, not equal gaps to fill a frame. Preserve purposeful bottom-aligned card actions and approved image safety space. Record changed properties and values, then verify actual mobile/desktop composition alongside behavior and accessibility.
- Creator welcome banners center the natural-height reading group on desktop: category → title 16px, title → description 12px, description → CTA 32px. Mobile and the narrow-sidebar layout use 16px/8px/24px. Keep the existing image framing, carousel height and type scale; these are welcome-role values, not global spacing defaults.
- Major sections use the 32px/48px rhythm; judge the whole-page density with real content and do not fill gaps with decorative copy or badges.
- Left alignment governs discovery and live information. Center alignment is reserved for empty states and authentication prompts.
- The right context panel stays sticky and task-focused rather than becoming a second scrolling content feed.

### Border Radius Scale

- Micro: `10px` for compact social buttons.
- Standard control: `12px`.
- Collection card: `16px`.
- Hero: `20px`.
- Authentication CTA: `14px`.
- Pill: `999rem` for navigation capsule, status, and primary CTA.

## 6. Depth & Elevation

| Level | Treatment | Use |
| --- | --- | --- |
| Flat | White or Gallery Gray, no shadow | Header, page canvas, artist media field |
| Ring | 1px Hairline or Micro Hairline | Navigation, social controls, CTA outlines |
| Card | Micro Hairline plus two-layer micro-shadow | Favorite collection, context cards, live rows |
| Hero | Full-bleed image plus internal black scrim | Primary live feature only |
| Focus | 3px Near Black outline with 3px offset | Keyboard focus on every link and button |

### Depth Principles

- Use borders before shadows and micro-shadows before floating elevation.
- The hero is visually dominant without an external shadow.
- Image objects may use a soft drop-shadow, but their containing surface remains White.
- Footer: keep navigation links at 13px/550 inside full 44px targets. Use 48px top and 16px bottom padding on desktop, 40px top and 16px bottom padding on mobile, and create hierarchy with grouped whitespace rather than taller link rows.
- Keep the three service groups separate from a full-width horizontal social row. On mobile, the service navigation uses two group columns and the longer guide group spans both columns with its links in two columns; from 768px, use three compact service columns.
- Social marks render at 20×20px, centered inside separate 44×44px targets. Business and policy metadata stays at 13px and wraps naturally instead of shrinking.
- The footer remains normal-flow content and owns no viewport height, bottom-navigation clearance, or safe-area padding. `FanAppFrame`, `FocusFlowFrame`, standalone login, and standalone page layouts own the clearance required by their navigation and viewport context.
- No glassmorphism, backdrop blur, ambient colored glow, or broad decorative shadow was observed.

## 7. Do's and Don'ts

### Do

- Let one strong artist image lead each viewport.
- Keep utility surfaces white and separate them with hairlines and micro-shadows.
- Use the filled Spectrum Relay only for the active surface's single primary next action. A page may have no filled Primary. Repeated LIVE-row actions use the approved Spectrum-outline Secondary treatment consistently; other repeated card actions and secondary exploration stay Neutral or Text.
- Keep title and explanatory subtitle together as a reusable section-heading pair.
- Preserve 44px minimum interaction targets and visible keyboard focus.
- Use real social brand marks and face-legible, high-quality artist photography.
- Present Passport as an opened record system with empty stamp capacity.

### Don't

- Do not add colored card backgrounds to “balance” the hero.
- Do not place multiple gradients, dark feature cards, or competing primary CTAs on the same screen.
- Do not use a closed leather Passport, pocket graphic, or heavy burgundy surface in this system.
- Preserve the inset portrait composition on Home. Only the creator directory uses the approved full-bleed portrait variant; banner, Passport and circular-avatar treatments are separate.
- Do not introduce nested cards, oversized shadows, glass panels, or ornamental divider lines.
- Do not hide secondary information behind tiny hit areas or use icons below 44px without a larger target.
- Do not fabricate dark mode rules from the light-only implementation.

## 8. Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
| --- | --- | --- |
| Mobile | `< 768px` | 16px page inset, 20px headings, 4:5 hero, horizontal 288px favorite cards, 56px live avatars, desktop nav hidden |
| Tablet | `768–1023px` | 32px page inset, 24px headings, 2:1 hero, three visible favorite cards in the horizontal snap rail, 64px live avatars, compact header and bottom navigation |
| Desktop | `1024–1279px` | Desktop header navigation appears; side context panel is visible and sticky; bottom navigation disappears; no panel toggle |
| Wide desktop | `≥ 1280px` | 40px page inset, 384px context panel, 32px column gap; social controls remain icon-only |

### Touch Targets

- Standalone links and buttons maintain at least 44×44px interaction areas; inline prose links keep readable native line flow. Never shrink icon targets to fit a translation.
- Adjacent icon-only actions maintain independent 44×44px hit areas with `0px` visual gap; hit areas must meet edge-to-edge but never overlap.
- The visible icon remains 20×20px. Text-bearing actions, navigation labels, and isolated icon controls keep their component-specific spacing.
- Bottom navigation divides the viewport into four equal-width targets with 64px minimum height.
- Horizontal favorite cards use scroll snap and hide the scrollbar without disabling native touch scrolling.

### Responsive Layout Strategy

- Desktop behavior: two-column shell with a 944px content column and sticky 384px context panel at 1440px.
- Tablet behavior: single content column, compact header and bottom navigation; the side context and desktop header navigation are hidden below 1024px.
- Mobile behavior: compact header, no desktop nav or side panel, horizontal favorite rail, fixed bottom navigation.
- Desktop context: keep the right activity panel visible without a header toggle or collapse state. The main column retains its two-column width; mobile activity summaries remain in the content flow.
- Live metadata: reservation count is hidden on mobile, leaving avatar, content, and action columns.
- Reduced motion: all transitions are reduced to `0.01ms`, and smooth scrolling is disabled.

## 9. Agent Prompt Guide

### Quick Color Reference

- Primary CTA: Spectrum Relay gradient.
- Background: `#FFFFFF`.
- Heading text: `oklch(18% 0 0)`.
- Body text: `oklch(48% 0 0)`.
- Border or ring: `oklch(90–93% 0 0)`.
- Media field: `#F6F6F5`.
- Status accent: `rgb(255 95 191 / 78%)`.

### Quick Summary

Build a white, image-first K-pop fan product with Pretendard typography, a dominant full-color editorial hero, and at most one pink-to-violet filled gradient CTA per active surface. Repeated LIVE-row actions may reuse that relay as a consistent 1px outline; keep all other utility surfaces neutral with 1px hairlines, 12/16/20px radii, and short two-layer micro-shadows. Use the shared 32px/48px section spacing and compact heading/optional-description groups with quiet secondary navigation. On wide screens, split the page into a large content column and a narrow sticky logged-out context panel. Below 1024px remove that panel and use fixed bottom navigation; below 768px use the existing horizontal snap collection where appropriate.

### Example Component Prompts

- Hero: “Create a 2:1 desktop live hero with full-bleed high-resolution artist photography, a restrained left-and-bottom black scrim, a clearly defined outlined UPCOMING rail, 48px white event title, monospace countdown, and one 320×48px spectrum-gradient reservation pill.”
- Card: “Create a White favorite collection with a 16px outer radius, 24px padding, micro hairline and short two-layer shadow. Place three square Gallery Gray media fields inside; use the shared min(84%, 240px) inset portrait, then a wrapping 16px/700 name, 13px fan count and a separate action group with three 44px social controls and 20px brand marks.”
- Navigation: “Reuse the shared sticky White header with an 80px kyaa wordmark, a 44px hairline pill navigation optically shifted upward by 1px, and 44px language/menu controls. Use a 24px visible language glyph inside its 44px target. Hide the pill below 1024px.”
- Passport: “Create a quiet White Passport utility card with a 20px/850 title, 14px subtitle, fully opened identity-and-stamp asset, centered two-line lifecycle copy, and a 90%-width 52px outlined login CTA.”
- Live row: “Create a 112px White live row with a 64px circular artist avatar, wrapping 16px/700 title and 13px metadata stack, plus a right-aligned 184×48px Spectrum-outline Secondary booking pill. Apply the same outline treatment to every action in the collection. Below 768px use a 44px icon-only action without turning repeated rows into filled Primary buttons.”

### Ready-to-Use Prompt

Using the kyaa Fan Pulse Spectrum design system, turn the supplied product scenario into a responsive fan-platform screen. Preserve the White/Near Black shell, Pretendard hierarchy, 4px spacing scale, 12/16/20px radius ladder, hairline-plus-micro-shadow surfaces, face-legible editorial imagery, and at most one filled Spectrum Relay primary CTA per active surface. Repeated LIVE-row actions may use the same relay as a consistent 1px outline. Use a wide content column plus sticky context panel at desktop, a single column with fixed bottom navigation below 1024px, and the existing horizontal snap collection below 768px where appropriate. Do not introduce dark cards, extra filled or decorative gradients, glassmorphism, nested cards, or decorative color surfaces.

### Iteration Guide

1. Establish the screen’s main task and visual focus before adding secondary modules; a utility screen does not need a hero or filled CTA.
2. Translate scenario information into title/subtitle pairs, compact rows, or one neutral utility card.
3. Check that colored surfaces do not compete with artist photography.
4. Verify 44px targets, 3px focus outlines, and mobile in-flow activity access.
5. Confirm that new components reuse shared roles and tokens, then apply the separate visual finish criteria below. Token compliance alone is insufficient.

## Optional Appendix: Interaction Patterns

- Scroll behavior: header remains sticky; context panel is sticky from 1024px; mobile/tablet use a fixed bottom navigation.
- Hover behavior: neutral controls receive a subtle gray fill; artist media fields rise by 2px and strengthen their border; Passport artwork rises by 6px; the primary gradient darkens.
- Click behavior: login and reservation actions route downstream. The desktop activity panel is always visible and has no fold/unfold control.
- Animation tone: restrained and product-like, 160ms for control feedback and 240ms for layout/object transitions.
- Reduced motion: transitions collapse to effectively instant and smooth scrolling is removed.

## Optional Appendix: Content & Messaging Patterns

- 화면 보조 문구(설명·소개·제목 풀어쓰기) 금지 규칙은 [docs/design/helper-copy.md](docs/design/helper-copy.md)가 우선한다. 법적 고지·비용·오류·출처 문구만 유지한다.
- Headline pattern: short identity or value phrase, often mixing Korean with a familiar English product noun, e.g. “최애의 Fan Passport”.
- CTA language: explicit task plus outcome, e.g. “라이브 예약하기”, “Google로 계속하기”, “Fan Passport 발급받기”.
- Lifecycle copy: enumerate meaningful fan actions before promising the stored value, e.g. “팬 인증부터 라이브 예약, 출석, 후기까지”.
- Voice and tone: warm and encouraging, but never cute, overly promotional, or verbose.

## Optional Appendix: Historical Observed Pages (2026-07-20)

- `http://127.0.0.1:5173/candidates/03-fan-pulse-spectrum`: desktop 1440×1100, tablet 768×1024, and mobile 390×844 rendered states; logged-out context panel open and collapsed; hover-capable controls.

## Optional Appendix: Historical Evidence Notes (2026-07-20; not current rules)

- Observed: the live rendered page exposes no root variables on `:root`; reusable tokens are scoped to `[data-fan-pulse-home]` and were read from the loaded stylesheet.
- Observed: at 1440px the hero is 944×472px, the favorite collection is 944px wide, and the open context panel is 384px wide.
- Observed: the favorite media field is about 287px square with about 48px padding, yielding an artwork ratio near 66.5%.
- Observed: the browser reported no runtime page errors during extraction; console output contained only Vite and React development messages.
- Inferred rule: color is intentionally budgeted—photography plus one primary gradient—because neutral utility surfaces preserve visual rest beside the hero.
- Inferred rule: the side panel is contextual rather than foundational because it is removed entirely below 1024px without replacing the main content flow.

## Shared fan UI implementation (updated 2026-10-04)

The current consolidation covers Home section headers, LIVE catalog headers,
LIVE calendar page title, MY page/section headings, and shared FanAction controls.
The migrated roles follow the current shared content contract; this does not
claim that all screens or all local CSS have been migrated.

- `apps/web/app/globals.css` owns semantic `--fan-*` typography and action tokens,
  alongside existing color, spacing, radius, focus, and motion tokens.
- `FanHeading` separates semantic `as` (`h1` / `h2` / `h3`) from visual `variant`.
  Standard headings are 20px / 24px at 48rem, weight 850. Editorial headings retain
  weight 800. MY page headings retain their 40rem breakpoint and inherited leading;
  personal section headings use 20px / 24px at 48rem, weight 700.
- `FanSectionHeader` owns title, optional description, optional `{ label, href }`
  action and their spacing. Its heading row wraps the flexible 10rem title and
  14px secondary action together, with supporting copy below and a 16px bottom gap. Standard/editorial retain their shared
  minimum header height; personal headers have no minimum height.
- Do not add local heading selectors or arbitrary style/className overrides to
  these migrated roles. Add an intentional, reusable variant in the shared module
  only when the existing roles cannot express the product requirement.
- `FanAction` continues to own primary, neutral, text, service and passport
  behavior. Its central dimensions remain 44px base, 48px primary, 52px service /
  passport, and 18px icons. Existing service-specific typography is preserved.
- Home hero typography, Passport artwork, profile identity, calendar controls and
  non-migrated screens remain intentional separate owners, not silently normalized.
- `fan-design-system.contract.test.ts` guards token resolution and migrated CSS
  ownership; component tests guard heading semantics, optional content and links.
  Run these checks plus the affected screen tests when changing shared properties.
  Desktop/mobile rendering verification remains necessary; source checks alone do
  not certify visual parity with production.

- `LiveStatusIndicator` owns `density="comfortable" | "compact"`. Catalog rows
  select compact density rather than overriding the shared badge's min-height in
  a screen stylesheet; this keeps dev and production CSS ordering equivalent.
- The `Fan design system` GitHub workflow runs the shared-role and migrated-screen
  tests on relevant pull requests and main pushes without production credentials.
  Repository branch-protection settings are separate; this workflow does not itself
  make the check mandatory for merges.


### Calendar phase one ownership

- `components/fan-calendar/calendar-parts.tsx` owns month controls, KST labels,
  and the numeral-only today ring for full and embedded calendars. Callers keep
  their existing links or local month state; these primitives do not own fetching.
- `globals.css` owns `--fan-calendar-*` type roles. Metadata stays at 12px and
  event titles at 14px; desktop density must not introduce 9px overrides.
- The full calendar retains its mobile agenda, tablet two-column layout and
  desktop seven-column month grid, multi-celebrity filters and inline +N expansion.
  Titles use two lines; the full accessible detail-link title remains intact.
- Celebrity calendar placement: outside the hero, after the upcoming LIVE section
  in DOM/mobile order. At 1024px+, the same single instance occupies the 360px
  right content rail above Passport. No duplicate hidden calendar or hero overlay.
  The September 6 feedback extends this single-calendar placement to notice,
  LIVE, and benefit tabs, including empty notice states. Tab navigation targets
  the content below the hero and retains keyboard focus with a sticky-header offset.
  Full-calendar event chips use soft pastel surfaces inspired by TimeTree/Amie;
  the compact month and nearby schedule list follow the approved Fantastical reference.
- The mini calendar preserves direct first-LIVE links and month/locale/celebrity
  context in “open calendar.” Today is a numeral ring, not a reservation border.
  Single-event reserved/unreserved/unknown states have distinct non-color markers
  and a complete legend. Multiple-event dates show a neutral count rather than
  borrowing the first LIVE's reservation state. Full multi-event selection is
  deferred, not claimed complete by this visual pass.
- No date-selection panel, month/list toggle, new reservation flow or API change
  is part of phase one. Validate 360/390/768/1024/1440px before promoting changes.

## Utility surfaces and truthful copy (2026-09-05)

The UI/copy guide is implemented as an opt-in extension, not a replacement of
Fan Pulse Spectrum. `fan-ui/fan-surface` owns neutral utility canvases and static
section cards; `--color-utility-canvas` and `--color-surface-focus` are shared
roles. HOME, artist heroes and Passport artwork retain their existing treatment.
Do not introduce a parallel hard-coded blue palette from the guide's example hexes.

- Creator directory: maximum three equal-width columns, left-aligned partial row,
  two columns at 768px and one below. The later shared portrait contract applies:
  full-bleed approved cover, 5:4 below 768px and square from 768px (mobile
  `contain` sources use their natural ratio), preserving registered framing and every face rather than reverting to the historical 4:3 contain layout.
  Use published summaries only, no invented biographies or popular/recommended claims.
  Default order remains the published order. Search, ordering and ownership filters stay.
- MY (updated 2026-09-10, slide 58): profile then a shared favorite selector,
  with attained fan tier/progress and that creator’s raffle ticket balance as the
  two primary panels. Reserved LIVE and recent activity follow; totals appear
  once as a quiet summary. Within LIVE, active precedes scheduled, then start time,
  with other reservations in a disclosure. First-reaction-only
  relationships remain distinct from owned Passports. Tier targets use FAN_TIERS;
  remaining points come from the existing summary, not a new score calculation.
- Passport collection cards stay at most 380px even for one record. Technical
  issuance details remain on detail; successful issuance is not a list warning.
- Repeated peer cards share content-driven row heights, comparable facts and
  bottom action baselines. Long names, translated labels and optional statuses
  must not move one card's action independently. Preserve full identifying names,
  image framing and touch targets; do not hide overflow or shrink typography to
  force alignment. Independent panels and single-column rows need not share a
  global fixed height. Follow `docs/design/card-layout.md`; its real-browser
  regression runs in the Fan design system CI alongside semantic contracts.
- Korean labels use 패스포트, 팬 점수, 도장, 티켓 and 디지털 기념품 without merging
  their underlying concepts. Authentication, failed reads and empty states differ.
- Mission pages preserve a locale-aware LIVE return link, use the public LIVE title
  when available, and distinguish loading/errors from an empty eligible list.
  An empty eligible list does not prove the LIVE has no configured missions.

Deferred pending evidence: creator biography editing, Fans metric provenance,
contractual official/appearance claims, benefit claimability aggregation, detailed
activity-type enrichment, and cross-site notification/benefit copy changes.
These must not be inferred from the visual guide or added as fabricated data.

Verification boundary: responsive public directory checks live in
`e2e/public/ui-guide.spec.ts`; owned MY/Passport visual checks require a test
account or isolated auth/API fixtures. Passing fixtures is not proof of a live
production account or of benefit eligibility logic.


## Fan hub density refinement (2026-09-05)

- Utility pages reuse the white `--color-canvas` via `--color-utility-canvas`;
  gray remains a media or hover field, not an alternate whole-page theme.
- Directory cards have one semantic link covering image, introduction, status,
  and action. Korean actions use the creator name plus `만나보기`. Introductions
  use the first complete published sentence; no line-clamp or invented biography.
- MY uses two restrained bordered panels for selected-creator fan tier and raffle
  tickets (updated 2026-09-10, slide 58). Supporting LIVE and recent activity use
  open sections below these panels. The same creator selection controls tier,
  tickets, current mission and existing benefit progress; it does not save a
  representative badge. Recent activity shares the desktop supporting row.
  Without supporting content, primary sections share available width instead of
  leaving a left-aligned 800px island. Mobile remains a linear task sequence.
- MY LIVE uses truthful KST date tiles, not an inferred creator/event photo; its
  DTO has no image association. Creator images belong only to owned creator rows.
- Creator home leads with next LIVE plus creator-context portrait. News and
  benefits retain their dedicated tabs, loading/error states, and compact home
  empty states. Independent desktop columns prevent the calendar height from
  stretching content rows. The calendar remains below the hero in the home tab.
- These refinements do not modify published content, personal history, or access
  rules. Verification of local rendering is not production deployment proof.

MY notification preferences live beside unread notifications in the profile header,
with visible labels and 44px targets. Mobile wraps the same utility group below
the identity; no separate full-width settings row appears below activity records.

### Growing creator roster
The editorial first three are centrally configured in `apps/web/server/content/creator-discovery.ts` (Changha, Elina, Yuna). Priority is conveyed only by order: all creators share the same card size, image treatment and information rules on each discovery surface. No secondary group heading, divider, compact tier on home cards. Display the existing CMS fan count below each name using the shared compact Fans format. Additional creators use individual-platform audience stored in CMS as an approximate order signal; do not sum platforms. Explicit directory sorts/search remain neutral. For group photos, crop around the complete member group with every face visible; do not fit the entire venue into the card. Personal MY records are unchanged.

Home favorites preserve the existing portrait-card size and image/social treatment in a single horizontal snap rail at every breakpoint. Desktop shows three equal cards (Changha/Elina/Yuna first); mobile keeps the existing card width. Use banner-style circular arrows at the left/right media edges for viewport-sized movement, disabled at boundaries, synchronized with native touch/trackpad scrolling and resize, with reduced-motion support. Do not show the bottom page count or pagination capsule. Portraits use a 240 × 240 CSS-pixel square (shrinking only when needed inside narrower cards), object-fit cover with creator focal points; Xin uses a 1.6× bottom-centered crop within the same square, retaining all five members while reducing venue and crowd space. Directory remains a normal grid. Generated list/gallery concepts were not selected.

Creator portrait selection and crop requirements: [프로필 사진 규약](docs/design/creator-profile-photo-guidelines.md). Visible tattoos are excluded from final profile crops; use another source if a complete face-preserving crop cannot remove them.

### September 6 remaining feedback

Passport collection photos use a more compact desktop crop. Fan Score and Stamp
numbers link to the existing Passport activity ledger and Stamp Book with stable
fragment targets. The Passport artwork carries its real STAR, issue date and
short Fan ID; the creator portrait links to the creator fan page. MY totals link
to their existing collections or in-page sections, and an unavailable collection
must not receive a fabricated destination. Completion rewards use aligned plain
text for earned score, total and level, without a duplicate floating score badge.

Fan-facing unspent creator balances use 응모권 / Raffle tickets. Applied amounts
use 응모 수 / Entries. Admission tickets and internal accounting identifiers retain
their existing meaning. Balances remain creator-specific.

Utility calendar, ticket, gift and radio icons use direct AnimateIcons Lucide
imports. Hover and keyboard focus trigger one bounded cycle. Active radio may
repeat a short cycle every seven seconds only while visible on a fine-pointer
device. Reduced motion, hidden documents and offscreen icons remain static;
all timers and observers are removed on unmount. Home hero shimmer is unchanged.

LIVE mission entry uses a public visibility boolean, independent of owner
completion or attendance. The read mirrors published, non-legacy, localized
missions in the half-open visibility window. False disables entry with the inline
reason 현재 참여 가능한 미션이 없어요. / No missions are available right now.
Unknown read results retain a link to check the authenticated list and never
claim there are no missions. No question or owner payload is exposed publicly.

### Creator directory portrait contract

`/celebrities` and Home favorites share `CreatorPortrait` and registered crops.
Directory keeps its responsive grid and existing full-card links, using the
`full-bleed` variant to fill a 5:4 media area below 768px for approved cover crops
and a square from 768px, without a gray frame. On mobile, full-image (`contain`)
sources keep their natural aspect ratio instead of acquiring blank side bands. Home keeps the default `min(84%, 240px)` square inset portrait from 768px; below 768px, the same square crop fills the Home card frame. Shared per-creator
cover crops preserve faces, all group
members and tattoo exclusion. Do not use contain letterboxing, route-local crop
copies or hover zoom on these portraits. Passport badges remain outside the crop.
Banner and circular-avatar treatments remain separate. See the directory section
of [프로필 사진 규약](docs/design/creator-profile-photo-guidelines.md) for replacement
and desktop/mobile verification requirements.

### 원형 크리에이터 프로필
- 팬 화면의 원형 사진은 `CreatorAvatar` 공용 컴포넌트 사용. 시각 옵션은 `size`만 허용하며 원형 마스크·개인/그룹 크롭·실패 시 실루엣은 공용으로 관리한다.
- 등록·교체·24px/64px 검수는 `docs/design/creator-profile-photo-guidelines.md`의 원형 프로필 공용 구현 규약을 따른다. 호출부에서 내부 이미지 CSS를 덮어쓰지 않는다.

### 모바일 LIVE 캘린더 — 2026-09-06 후속 피드백

앞선 calendar phase-one의 목록 전용 모바일 범위를 확장한다. 1024px 미만에서는
기존 월 이동 헤더 아래 7열 날짜 선택 달력을 제공하고, 선택된 셀럽의 일정이 있는
날짜에 점을 표시한다. 점은 예약 여부가 아니라 LIVE 존재를 뜻하며 실제 예약 상태는
아래 상세 일정에 유지한다. 날짜 선택은 아래 목록을 좁히고 전체 보기로 되돌릴 수 있다.
셀럽 필터 변경 시 날짜 선택을 해제하며 월 이동 링크는 셀럽/언어를 보존한다.
PC의 기존 월간 상세 달력에는 모바일 날짜 선택이 적용되지 않는다.

2026-09-10 후속 승인: 홈 상단의 팬 활동 버튼과 패널 접기·펼치기를 제거한다.
PC 오른쪽 활동 요약은 항상 표시하고 모바일 본문 활동 요약과 MY 경로는 유지한다.
모바일 달력은
사용자가 날짜를 선택하면 선택 날짜·LIVE 건수를 알리고 해당 결과 제목이 보이도록
이동한다. 화면 크기 변경만으로 포커스를 옮기지 않으며 reduced motion을 존중한다.
PC 날짜 셀의 다건 전환과 전체 보기 dialog는 유지한다.

사용자 승인으로 Weverse 공식 공지 27504와 Blip App Store 캘린더 이미지를
모바일 시각 레퍼런스로 채택했다. 필터는 박스 대신 가로 한 줄의 아바타 칩으로,
달력은 32px 선택 날짜 원과 단색 LIVE 점으로 정리한다. 오늘은 테두리 원,
선택 날짜는 서비스 색 채움으로 구분한다. 아래 일정은 부드러운 회색 영역 위
흰 카드로 배치하고 시간 13px / 제목 16px / 셀럽 13px의 위계를 유지한다.
여러 색 점의 의미를 새로 만들지 않으며 기존 예약·방송 상태는 카드에 유지한다.
공식 출처와 원본 이미지는 artifacts/feedback-2026-09-06/calendar/benchmark에 보관한다.

### Shared creator photography — 2026-09-10

All creator identity-photo consumers use `CreatorImage` with source and framing registered in `creator-image-config.ts`. `CreatorPortrait` and `CreatorAvatar` keep their existing square/circle masks and sizing APIs. MY, LIVE detail/calendar, Passport photos and calendar collage use the same renderer; fanpage banners use `CreatorHeroPicture` and the same registry with separate responsive composition. Source replacement and crop stay coupled. A later CMS upload must be honored without inheriting a previous photo's zoom. Keep event artwork, benefits and user avatars separate. Park Myungho uses the approved user-provided suit portrait, about50% crown-to-chin height in square/circular photos; preserve shape-specific framing in wide/vertical surfaces.

## Contextual content translation (2026-10-09)

Content translation uses the selected app locale. Show the text action directly below the affected content, aligned to its text edge, with muted 13px utility type and a 44px minimum target; preserve keyboard focus, loading/error feedback, and the original toggle. Hide the action entirely for language-free content and confidently matching source text. Ignore URLs, email addresses, and mentions for detection. Korean, Japanese (with kana), and Thai use script dominance; longer Latin-script text uses conservative language ranking. Short/ambiguous text, mixed scripts, and indistinguishable Chinese variants retain manual translation. Detection is local and never triggers translation API requests on reading. Changes to text, revision, locale, or account invalidate visible translated state.

### Incremental Home and community updates — 2026-10-19

Home previews ten public fan posts or root cheers per page across published creators below the managed hero banner, for guests and signed-in fans at every breakpoint. Ready photo/video posts come first, then newest within each group (2026-10-31 media-first approval). The banner always leads the fan-board preview in both DOM and visual order. Apply the verified viewer’s existing block relationships before selecting each page, exclude members-only content even for its owner, and preserve source text. Keep existing navigation and banners. Community creator selection preserves the selected tab and locale; its popup follows the shared focus, touch-target and viewport rules. Fan score summaries expose existing scores and next-stage targets without changing score policy.

### RUN&MUSIC winner notice (2026-10-30)

The approved compact notice at `/connect/runmusic/notice` pairs the intact official 3:1 banner with the title, prize counts and email date on desktop; mobile stacks the same natural-ratio banner above that concise summary. The list uses prize filters, masked-email search and 24-row pagination (four desktop/two mobile columns). Public data contains masked emails only: 104 winners, excluding three approved test-domain entries, with 15 yogurt and 89 Starbucks winners. This notice does not change historic draw records. Local screenshots validate 390/1440px, filters, search reset and page navigation.

### Compact home fan-board preview — 2026-10-31

Use two equal columns from 768px with 8px row / 16px column gaps, 12px card corners and 8px content padding. Show ten items per page (five rows on desktop). Use uniform 104px rows with 80px square thumbnails at every breakpoint; below 768px use one column and 8px row gaps. Preserve the existing 16px body, 13px metadata, shared section heading and 44px minimum actions. Show at most two body lines; align metadata at the bottom. Following the 2026-10-31 request for uniform, denser cards, home preview thumbnails use cover with a horizontally centered, upper-quarter focal position inside an 80px square with 8px corners. This crop is scoped to the home preview; full post imagery remains intact. Keep board and author metadata on one line, with the source text retained in the DOM; body previews retain two lines at 16px/22px. Fixed height is an explicit exception for this preview role, not a global card rule. Text-only posts have no fabricated image. Place localized previous/next arrow buttons and the current page below the list; disable unavailable directions. Fetch only ten items plus a next-page sentinel on the server, preserving public visibility, block and WAVE exclusions. The legacy three-item RPC remains available for old clients during rollout. Preserve loaded same-owner content on return refresh; clear it for page/owner transitions and community mutations. This structural compression reflects the user's general UI preference without shrinking readable text or touch targets.

## 2026-11-02 모임 웹 전환 범위

`KYAA_GROUPS_ENABLED`로 활성화되는 모임·관련 MY 화면은 승인된 `outputs/kyaa-fanpage-implementation-20261101/DESIGN.md`의 최신 계약을 따른다. 기존 HOME과 gate-off 페이지의 계약은 유지한다.

- 캔버스·읽기·입력·보유량·패스포트 표면: 흰색. 경계 `#EEECEF` 또는 구조 경계 `#E4E1E6`, 입력 경계 `#8A8A8A`.
- 선택·초점 `#D11B62`, 선택 글자 `#AD1457`, 선택 배경 `#FFF0F6`. 일반 정보 아이콘은 중립색, 보라는 원본 아트와 Spectrum 끝색에 한정한다.
- 주요 행동은 기존 접근성 보정 Spectrum `#D9194C → #B91A93 → #6042D5`. 탭·필터는 채워진 주요 행동과 구분한다.
- 모임 정보 밀도와 제목/간격/반응형은 `features/groups/ui/groups.module.css`, 전역 탐색은 기존 `fan-shell`, 지갑은 `features/group-wallet/ui/wallet.module.css`가 소유한다. 공통 버튼 정렬은 `FanAction`을 재사용한다.
- PC와 모바일의 실제 렌더·긴 이름·빈 상태·오류·권한별 검사 근거는 `docs/design/groups-production-coverage.json`과 작업 로그에서 구분한다. 매핑만으로 시각 검수 통과로 간주하지 않는다.

- 모임 지갑 출석은 기존 `CalendarDayNumber`로 현재 KST 월을 보여준다. 출석은 크리에이터 페이지별(2026-11-05 PASSPORT-RENEWAL)이며 실제 출석 기록에만 도장을 표시한다. 포인트 수치(출석 P·7일 보너스)는 고정 문구로 쓰지 않고 `/api/dukjil/catalog`와 `today` 응답에서만 읽는다(수치가 없으면 "출석하기"만 표기). 이전의 10P/30P 고정 표기는 정책이 2P+도장, 7일마다 +10P로 바뀌어 폐기했다. 새 출석·배지·타일·MY 목록은 카탈로그에 규칙이 있고 `today.policyActive`가 아닐 때만 나오며, 카탈로그가 비었거나 실패하면 기존 출석 화면과 고정 문구가 그대로 남는다(`DukjilSwitch`). 배지 숫자는 카탈로그, 남은 횟수·완료는 `today`에서만 읽는다. `wallet.module.css`가 7열 간격·핑크 도장·오늘 테두리를 소유한다. 관리자 행사 지원의 참석/후기 수는 `group-admin.module.css`의 2열 요약으로 표시한다.

### 모임 운영 전환: Pencil 원본 구성 보존 (2026-11-02)

`outputs/kyaa-fanpage-implementation-20261101/kyaa-fanpage.pen`의 승인된 화면 구성을 운영 UI 기준으로 유지한다. 기능 추가를 이유로 원본의 정보 순서·대표 이미지 비율·주요 행동 위치를 다른 구성으로 바꾸지 않는다. 실제 데이터·권한·로딩·오류·다국어·200% 확대에 필요한 대응은 해당 구조 안에서 처리한다.

- 탐색: 지정된 2026-11-02 HTML에 따라 소개와 사진 배너 다음에 실제 회원 수 순의 주목할 페이지 최대 3개를 표시하고, 이어서 목록과 내 페이지·출석·개설 신청을 배치한다. PC 배너는 960×480px, 행동은 Spectrum 그라데이션이다. 모바일 분류와 정렬은 한 줄, 검색은 다음 줄에 놓는다. PC 카드 아바타 64px/패딩16px, 모바일은 압축 행과 구분선이다. 목록은 PC 3열이며 이름과 회원 수를 표시한다. 목록 수는 실제 전체 개수이고 첫 20개 이후 더 보기로 이어진다.
- MY `R3Nnz/BdXrj`: PC는 본문과 240px 우측 MY 메뉴, 패스포트는 책 좌측·실제 발급 도장과 CTA 우측. 모바일은 책→도장→CTA→3개 잔액→지갑/출석 순서. 존재하지 않는 책·도장·포인트를 시안 수치로 채우지 않는다.
- 지갑 `CFdD7/IMzcm`과 출석 `U3Bip/g9zuQV`은 분리한다. 지갑은 잔액→교환→내역, 출석은 실제 연속 출석과 7일 도장·단일 CTA. PC 도장 7열, 모바일 4+3열. 일일 포인트와 7일 연속 보너스는 카탈로그 수치로만 표기하고 현재 지급 상태와 구분한다(고정 10P/20P 폐기). 출석 현황은 가입한 크리에이터 페이지 목록(페이지별 연속일·출석하기/완료)이다.
- 캡슐 `EqCqG/mC9VD`은 분홍 stage 안 기계와 흰 제어 패널, 횟수 선택과 단일 실행 CTA. 추첨 `mF4bM`은 경품·응모·활동 보조 영역. 모임에서 진입한 경우 실제 모임 헤더와 활동 탭을 유지한다. 전역 캡슐 풀을 특정 모임 소유로 표현하지 않는다.
- 페이지 운영 `AuwgA`는 공통 헤더88px/ADMIN띠60px/페이지 식별44px/상단 운영 탭/회원 표와288px 선택 상세. 플랫폼 신청·신고 `jzqEs/kITlr`는 compact 목록 선택→단일 상세 심사이며 항목별 긴 폼을 반복하지 않는다.
- 공통 PC 헤더는 높이88px, 탐색366×46px, 포인트88×44px과 #FAFAFA 배경, 실제 포인트→언어→알림→프로필 순서다. (2026-11-08 피드백 F로 변경: 로그인 768px 이상 오른쪽은 `[내 상태 캡슐][알림][아바타]` 세 개다. 캡슐은 `--color-soft` 알약 높이 44px 한 덩어리에 등급·최애·♥N·P N 네 셀을 담고, 셀마다 목적지(등급 안내·최애 메뉴·팬 탭·덕질)를 따로 둔다. 캡슐 안 글자는 14px 한 크기, 굵기는 이름·숫자 700과 등급어 500 두 가지, 숫자는 tabular이고 색은 잉크(아이콘이 색을 맡음). 캡슐 최대 폭 1200px+ 288, 1024~1199 224, 768 미만 182. 아바타가 계정 메뉴 트리거이며 ☰과 별도 프로필 버튼은 없다. 언어는 로그인 768px 이상에서 계정 메뉴의 `언어 설정`으로만 바꾼다. 로그인 768px 미만은 `[캡슐][언어][알림]`, 비로그인은 전 폭 기존 구성 유지. 1200px 이상 탭과 오른쪽 묶음 간격 ≥24px. 이유: 일곱 덩어리가 같은 무게로 놓여 헤더가 길고 탭의 연장처럼 읽혔다.) 모바일은 높이68px, 알림→언어 순서와 하단 탐색65px을 원본 Export에 맞춘다. 활성 탭은 pink와 현재 위치 의미를 함께 제공한다.

원본 비교 전에 받은 기능·접근성 점수는 원본 충실도 합격 근거로 재사용하지 않는다. 위 변경 화면은 실제390px/1440px와 확대 상태를 다시 대조한다.
- 탐색 필터는 원본의 한 줄 구성을 유지하도록 해당 영역에만 13px/8px 10px 패딩/최소44px 컨트롤을 적용한다. 폭이나 확대율 때문에 부족하면 필터를 줄바꿈하며 마지막 종류를 검색창 뒤에 가리지 않는다.

- 탐색 대표 배너·출석 CTA는 원본의 #D9194C → #B91A93 → #6042D5 그라데이션과 15px/21px/800 라벨을 사용한다. 대표 배너 CTA는160px, 더 보기의 라벨과 화살표는 한 묶음으로 중앙 정렬한다. 적용 범위는 탐색 화면이며 기존 gate-off 버튼 색은 유지한다.

- 브랜드 홈 `aq3i8/qXdjj`: PC 식별 영역 위24px, 제목28px/1.4/700·설명16px/1.4·탭56px, 대표 이미지72px/간격20px, 본문2열은24px 간격과320px 소식 영역, 본문 최소높이644px을 사용한다. 행사는180px 이미지·24px 간격·정보12px 간격, 소식은20px 패딩·16px 제목 행과 이동 화살표다. 모바일은48px 식별 이미지·전체 폭 가입 버튼·96px 행사 이미지·한 열 소식 순서다.
- 개설 신청 `HQQqP`: 상단 경로62px, 본문 앞24px, 폼760px/패딩28px/반경24px, 제목과 설명8px, 사진104px·옆20px, 입력48px·소개96px, 제출168×48px을 원본에서 가져왔다. 내용 없는 신청 내역은 숨기되 조회 오류·실제 내역은 표시한다. 모바일은 폼패딩20px과 줄바꿈으로 대응한다.

- 취미 홈 `CvUym`: PC 탭 높이56px, 회원·랭킹의 아이콘은 문구 뒤, 게시글 미리보기는40px 행·14px 본문·공지700/일반400으로 구분한다. 가입 행동은 공통 Pencil CTA 그라데이션을 사용하고, 우측 내 활동의 이동 화살표는 문구 바로 뒤에 배치한다.

- 출석 `U3Bip/g9zuQV`: 기존 `/images/community-stamps/daily-checkin.png`가 승인 원본과 동일하므로 이 화면에서 사용한다. 소개 제목과 연속 출석 수를 분리하고 PC 소개160px·112px 도장·7열150px 카드·320×48px 행동을 적용한다. 모바일은 제목 아이콘·4+3열124px 카드·전체 폭48px 행동, PC 화면 최소 높이900px(헤더 포함)으로 맞춘다. 경로 제목은 PC18px/모바일20px이며 기존 보상·중복방지·시작일 제한 로직은 유지한다.

- 모임 MY `R3Nnz/BdXrj`: PC 본문 최대1440px·우측264px·간격56px·상단 경로62px, 패스포트 제목→설명 카드→지갑 순서를 사용한다. 패스포트 카드 제목24px, 활동 제목18px, PC 행동320×48px·모바일 전체 폭48px을 유지한다. 가입·댓글·출석 도장은 승인된 기존 community-stamps PNG를 사용하되 실제 획득 기록과 선택한 발급 패스포트에만 노출한다. 기존 최애 MY에는 적용하지 않는다.

- 플랫폼 개설 심사 `jzqEs`: 모임 개설 신청에만 전체 폭 관리자 셸을 적용한다. 104px 어두운 헤더·32px 본문 패딩·400px 목록·24px 열 간격·24px 상세 패딩을 원본 Export에서 가져왔다. 대기 탭에는 접수·검토 중·보완 요청, 처리 완료에는 승인·반려를 포함한다. 상세는160px 항목명과20px 간격, 96px 사유 입력, 320×48px 승인 행동과44px 반려 행동으로 구성한다. 모바일은20px 패딩·단일 열이다. 실제 신청 데이터만 표시하며 승인 대상 크리에이터와 반려 사유 검증, 조회 전용 관리자 제한을 유지한다. 검토 시작·보완 요청은 추가 처리에 보존한다. `group-admin.module.css`와 `GroupAdminShell`이 이 화면만 소유하며 기존 운영 관리자 셸에는 적용하지 않는다.

- 모임 관리자 홈 `w4p3t`는 `/admin/groups/overview`에 대응한다. 기존 플랫폼 관리자 인증을 통과한 뒤에만 표시하고, 모임 출시 플래그가 꺼져 있으면 경로를 제공하지 않는다. 기존104px 관리자 헤더 아래32px 패딩·240px 왼쪽 메뉴·24px 간격, 오른쪽3개 검토 항목을 원본처럼 배치한다. 항목은20px 외부 패딩·12px 행 패딩·44px 아이콘 영역·16px 제목·13px 설명이다. 새 집계 수를 만들지 않고 기존 신청·공식 행사·신고·관리 기록 경로로 연결한다. 모바일은20px 패딩·상단2열 메뉴·단일 열 항목으로 줄인다.

- 모임 팬 홈 모바일 `Ov8dx`의 영상 미리보기는 한 개의 카드가 본문 전체 폭을 사용한다. `CreatorMediaPanel`의 `.compactPreview .previewGrid`가 767px 이하에서 한 열을 소유하며, 일반 참여 미디어의 두 열 규칙에 덮이지 않도록 한다. 기존 최애 화면의 그리드는 유지한다.

- 팬 홈 `dan0e`는 상단 이미지80px·20px 간격, 접속 현황72px·12×16px 패딩·현재/오늘 각각240px 지표와 설명을 사용한다. `Ov8dx`에서는 기존 한 줄 숫자 요약을 유지한다. 수치는 실제 presence 응답만 사용하며 아티스트 공개 설정을 우회하지 않는다. PC 본문 간격24px·우측312px/패딩20px으로 맞추고, 기존 최애 레이아웃에는 적용하지 않는다.

- 팬 홈 `dan0e` 제목 옆 즐겨찾기 별은44px 터치 영역·22px 아이콘으로 기존 모임 bookmark API에 연결한다. `GroupBookmarkAction`을 더보기 메뉴와 공유하며 저장 상태·쓰기 실패·비로그인 비활성 상태를 유지한다. `Ov8dx`에서는 별을 제목에 중복 노출하지 않고 더보기 메뉴에서 제공한다.

- 활동 허브 `M1oOtS/dIlgE`는 팬 인증·이벤트·미션·추첨의 목적별 카드와 컬렉션 링크를 먼저 제공한다. PC2열/16px 간격/24px 패딩, 모바일1열/16px 패딩이다. `activity` 쿼리로 선택한 기존 목록을 열고 돌아올 때 탭·언어를 보존한다. 비밀방·활동에서는 원본의 간단한 헤더(PC44px 이미지·20px 제목, 모바일 제목만)를 사용하고 접속 현황은 홈에만 표시한다.

- 비밀방 목록 `Msd7H/sPifp`의 방 카드는 PC24px·모바일16px 패딩, 16px 내부 간격, 16px/24px 제목을 적용한다. 열린 방은 대화 아이콘과 최근 메시지·읽지 않은 수를 표시하고, 서버가 입장을 허용하지 않은 방은 미리보기·읽지 않은 수를 숨긴다. 입장 조건 카드와 동일 데이터 비교는 후속 검증 대상이다.

- 비밀방 입장 조건 카드와 빈 대화 문구를 추가했다. 조건은 실제 방의 최소 등급에서 표시하며 여러 등급이면 방 이름을 병기한다. 확인 버튼은 인증·등급 이동을 펼치고 모바일에서 전체 폭44px 높이를 사용한다. dev 두 팬페이지에는 Gold 방 두 개씩을 추가했다. 실제 인증 계정의 동일 읽지 않은 수·메시지 상태 비교는 아직 남아 있다.

- 비밀방 접근 실패는 HTTP401 로그인,403 가입,404 페이지 목록,그 외 재시도로 구분한다. 기존 서버 권한을 유지하며 접근 오류를 빈 대화 상태로 표시하지 않는다. 로그인 복귀 경로는 원래 팬페이지의 비밀방과 언어를 보존한다.

### Custom social sign-in preparation · 2026-11-02

Kakao/WeChat sign-in is gated off by default. Enabled provider buttons reuse the existing 90%-width, minimum 52px, White outlined pill treatment and 3px Near Black focus outline, with provider names in each locale; they do not alter the Google artwork. The focused email-link step uses the existing 440px task width, 20px mobile / 24px desktop section heading, 16px explanatory text, 14px field labels, 48px fields with 16px input text, 12px corners and 16px related-control gaps. Errors are associated with inputs and announced. Existing-account sign-in links live in Settings → Account and reuse `FanAction` with 32px mobile / 48px desktop section spacing; notification consent is a separate surface. OAuth account linking keeps the same DID and embedded EVM wallet. Actual browser verification and release evidence must distinguish local fixtures from live enabled authentication.

- 비밀방 대화 `EU2Nf`는 선택한 방의 제목·방 전환 메뉴·380px 스크롤 대화 영역·48px 입력창으로 분리한다. PC24px·모바일16px 대화 패딩,20px 메시지 간격을 사용한다. 내 메시지는 서버가 인증된 회원 ID와 작성자를 비교해 결정하고 오른쪽 연분홍 말풍선으로 표시한다. 전송 실패 상태와 조회 오류를 분리해 새 조회가 실패 안내를 지우지 않게 한다. 참여 회원·아티스트 표시와 읽기 전용 운영자 발언은 후속 구현이며 원본 완전 일치로 판정하지 않는다.

- 비밀방 대화의 아티스트 표시는 `group_artist_bindings`에 근거하며 공개 아바타 URL을 재사용한다. 참여 회원은 해당 방의 읽기·작성 기록이 있고 현재 입장 가능한 회원 중 차단 관계와 아티스트를 제외한 최대20명이다. PC288px 보조 영역·32px 간격·24px 패딩, 모바일 아래 단일 열·16px 패딩을 사용한다. 기존 인증·방 접근 판정 이후에만 이 정보를 반환한다. 실제 dev 인증 fixture와 전체 원본 비교는 별도 검증 대상이다.

### Regional social sign-in preparation · 2026-11-02

Extend the fixed sign-in registry to LINE, Facebook and Naver while preserving the existing Google, Apple, Kakao and WeChat positions. Enabled LINE/Facebook/Naver methods live in a default-collapsed “Other ways to sign in” group; omit its trigger when all three are disabled. The disclosure has `aria-expanded`/`aria-controls`, a persistent hidden panel and native keyboard behavior. Reuse the current outlined sign-in button role with 16px group spacing and the existing mobile/desktop widths. Settings → Account reuses its existing account-link section for all five methods. All five remain off under Cognito; no additional social providers are in this preparation scope. Native LINE uses SDK `line` and linked-account type `line_oauth`; provider email does not bypass OTP verification.
- 읽기 전용 비밀방 `aWY6S`는 기존 입장 조건을 충족한 같은 페이지 운영진·아티스트만 입력할 수 있다. 서버가 메시지 조회마다 `canSend`를 반환하고 UI는 명시적인 false를 우선한다. 권한 회수 후 조회 실패가 이어져도 입력을 다시 열지 않는다. 원본의 대화·입력 크기와 공통 컴포넌트를 유지한다. PC1440·모바일390 로컬 fixture의 읽기 전용/운영자 입력 상태를 확인했으며, 실제 dev 인증 계정 검증은 남아 있다.

- 행사 참여 `VEfCi`/`qbarG`의 제목·상태·일정·장소는 동일 요약 영역에 배치한다. 원본 사진은 PC300×200·모바일96×64 contain, PC24px·모바일16px 패딩과 간격을 사용한다. 1440/768/390px에서 원본 비율·인물 잘림 없이 확인했다. 모임 내비게이션을 유지하고 QR은 참가 확정 후 버튼을 열 때 조회한다. 현장 미션·후기 행동 카드와 모든 행사 상태의 원본 일치는 아직 후속 범위다.

- 행사 참여의 행동은 원본 `VEfCi`/`qbarG`처럼 티켓·현장 미션·후기의 3열(모바일1열)로 구성한다. PC카드 최소232px/24px 패딩, 모바일16px 패딩, 카드 간격16px, 내부12px, 버튼 최소48px와 중앙 아이콘·문구 묶음을 사용한다. 서버의 ticketAvailable/canReview와 참가 상태로 행동을 제한한다. 현장 QR은 기존 카메라·이미지 업로드를 재사용하되 같은 origin·같은 모임의 미션 상세 경로만 허용하고 쿼리/해시 유입을 차단 또는 제거한다. 스캔은 미션으로 이동할 뿐 출석·보상을 자동 지급하지 않는다. 카메라 실기기 검증과 모든 행사 상태 비교는 아직 남아 있다.

- 행사 승인 대기·신청 마감·행사 취소(`HNDKv`/`XIfOn`/`Q8M9AR`)는 아이콘과 제목·설명·행사 이동으로 구분한다. 상태 카드 PC24px/모바일16px 패딩,16px 간격,제목24px/모바일20px,본문16px·1.5줄높이를 사용한다. 취소 상태를 승인 대기보다 우선하며 확정 참가자의 마감 이후 티켓 행동은 유지한다. 1440px 승인 대기와390px 취소·대기 로컬 화면을 직접 확인했다. 전체 행사 상태 및 실제 dev 인증 계정 검증은 미완료다.

- QR 티켓 `b97Jl`은 원본처럼 왼쪽 아이콘 제목, 중앙 QR, 행사명, 참가자 순서다. 카드 최대640px/32px 패딩/20px 모서리, 모바일16px 패딩, QR194px, 행사명16/24px, 참가자14/21px를 사용한다. 승인 대기·마감·취소·체크인 완료 상태 카드도 세로형·동일 폭/패딩으로 원본 구조를 맞췄다(앞선 가로형 상태 규칙 대체). 완료 피드백은48px 연녹색 배경의 체크 아이콘과 미션/후기 행동을 제공하되 서버의 후기 자격을 유지한다. 참가자 이름은 기존 본인 티켓 권한 검사 뒤에만 반환하며 없으면 생략한다. PC1440/모바일390의 로컬 화면을 원본 Export와 비교했다. 실제 카메라 인식·실제 dev 계정의 티켓은 미검증이다.

- 추첨 상세 `mF4bM`의 경품 이미지 슬롯은 원본 491.42×328px과 같은 3:2 비율이며 화면 폭에 맞춰 줄어든다. `group-raffle/raffle.module.css`가 소유하고, 고정 280/220px 높이·추가 분홍 배경을 제거한다. 상품 전체와 로고는 contain으로 보존하며 이미지가 없으면 슬롯을 만들지 않는다.
- 추첨 상세는 별도 중복 섹션 제목 없이 경품 이미지와 추첨 제목으로 시작한다. PC 경품 열491.42px·열간32px·보조 영역288px,1024px미만은 경품→응모→보조 영역으로 쌓는다. `GroupActivityFrame`의 기본 행사·미션 배치는 유지한다.

### 2026-11-02 local review — current Pencil header and featured carousel
User-selected source nodes `uTQNU`, `C1QkP`, `koi97`, `FP2ON`, `xzfqF`, `n325b`, `qADEF` supersede earlier header/banner geometry in the groups-enabled shell. Source extracted through Pencil `Export(..., "html-css", ..., {includeLayerIds:true})`. Header: HOME / 모임 / 최애 / MY with icons and active pink underline; account actions move language and notifications into a menu. Desktop header 88px, nav 488×64px; mobile header 68px. Carousel source `pjusn` / `tbCyx`: desktop slide 960×480px, 24px next-slide gap, bottom gradient with white action; mobile slide 300×349px, 200px photograph and dark copy region, 12px gap. Carousel CSS is copied from export inline declarations with source-node comments; responsive resets, runtime image binding, semantic HTML and interactions are explicit adaptations. No autoplay. Language dialog: desktop 960px/3 columns/32px padding; mobile 358px/2 columns/20px padding with scroll containment. Production gate-off shell remains unchanged; this work is local-only pending user review, no new dev or production deployment.
Header icon/font fidelity correction: uTQNU SVG path geometry (including phosphor coins-fill) is copied into pencil-header-icon.tsx, replacing approximate package icons in the groups header/account menu. Exact exported PretendardUI650.ttf and PretendardUI850.ttf are bundled under public/fonts/pencil and used at font-weight:400 as declared by the export, with synthesis disabled. Desktop navigation icon size is24px; point/menu icons20px. This overrides previous variable-font approximation only in the groups-enabled shell.

### I591ou artist-home reproduction (2026-11-02, local review)

- Source: `outputs/kyaa-fanpage-implementation-20261101/kyaa-fanpage.pen`, node `I591ou`, inspected with Pencil CLI. This change is under local review, not evidence of deployment.
- Creator home keeps a 312px unpadded aside and 32px column gap. The passport heading precedes the artwork; its final action is a text link. The video preview is borderless with 16px thumbnail corners, 8px title spacing and a bottom-left LIVE badge. Board titles use 16px regular text, 52px minimum rows and a compact Spectrum writing action.
- Local server root selects the NCHIVE fixture. Source images are copied unchanged from the Pencil assets; sample presence, posts, passport and live status are not production facts. Other explicit fixture routes remain available.

- 2026-11-02 artist-home follow-up: passport artwork fills the card content width (278px in the 312px desktop aside), replacing its 180px cap. Keep the entire book, portrait and stamps together at their natural ratio.

- 2026-11-02 account identity: keep points, avatar and menu trigger in the desktop header; show the provided profile image and nickname as the first account-menu item instead. Long nicknames wrap in the menu, including on mobile.

### 2026-11-02 팬 페이지 표·사이드바 정렬
사용자 지정 MApsZ, CSYpc, Z46DUz, QEXS7, qIhmn을 갱신하고 I591ou와 로컬 구현에 적용한다. 표 제목은 왼쪽, 작성자·작성일·조회·추천은 헤더와 본문 모두 중앙 정렬한다. 메타 열 너비는 112/96/64/64px, 셀 좌우 여백은 8px이다. 사이드바 이동 행은 최소 64px, 상하 여백 12px, 아이콘과 화살표 20px, 열 간격 12px이다. 제목 아래와 행 사이 8px, 그룹 사이와 구분선 위아래는 24px이다. 긴 문구는 줄바꿈하고 행 높이가 늘어난다. 팬등급과 추첨에도 이동 화살표를 표시한다.

### 2026-11-02 전체 Pencil 로컬 속성 대조

- 현재 원본 `kyaa-fanpage.pen` 239개 최상위 항목(제품 화면·상태215, 시스템·참고24)을 Pencil CLI로 확인했다. 기존205개 연결표는 최신 원본의 완전한 검수 근거가 아니다. `docs/design/groups-production-coverage.json`의 항목별 로컬 경로·미검증 상태를 기준으로 추적한다.
- `Nev5n` 공통 팬 헤더와 최신 화면을 우선하여 게시판·비밀방·활동에도 팬 정체성 및 접속 현황을 유지한다. 위의 간단한 헤더/접속 현황은 홈에만 표시 규칙을 대체한다. `CreatorGroupHeader`가 공통 소유자이다.
- `W0Xri/X7FfJ` 게시판은 흰 인기글 영역, 분홍 댓글 수, 본문 첫 줄 제목, PC20/모바일5 목록,44px 페이지 이동,288px 활동 레일을 사용한다. 기존 본문 저장 계약과 업로드 허용 범위를 유지한다. `KJKkH/wCL5S` 첨부는 원본 비율·이전/다음·썸네일·전체 보기로 연결한다.
- `R3Nnz/BdXrj` MY는 프로필 헤더, 패스포트·지갑, 최애 목록, 활동·획득 도장 순서이다. 패스포트 펼침 이미지는 원본 장식 이미지이며 실제 획득 도장과 구분한다. `CFdD7/IMzcm` 지갑의 수량·교환 후 잔액은 기존 지갑 계산을 사용한다.
- `KUEOR/XCSLO/F0pbG9/G5Sebj` 프로필은 MY 이동과 분리한400px(모바일358px) 패널이다. 2026-11-03 사용자 승인 UI-003으로 원본 QR96은 최대240px 정사각형 QR로 대체하며, 기존 스캔120 아이콘은 유지한다. PC 중앙 배치·기존 로고 적용은 아래 Profile KUEOR/XCSLO 계약을 따른다. 원본의 연결 전 QR 표시는 발급·촬영 성공을 뜻하지 않는다. `ykQWh/zcRQc` 메시지는320px 탐색·24px 간격, 실제 설정 저장과 로컬 전용 첨부 미리보기를 구분한다.
- `EqCqG/mC9VD/S38b4C` 캡슐은 데스크톱560px·모바일180px 기계와 실제 응모권/커밋된 결과 영수증을 사용한다. 없는 과거 기록·수령API를 구현했다고 표시하지 않는다. 하단의 중복 단계 안내(기계 작동→캡슐 열기→결과 모아보기)는 표시하지 않는다. 기존 주 뽑기 CTA·결과 연출/바로 보기·뽑기 기록 연결은 유지한다(UI-006). UI-015 승인에 따라 경품·경품별 확률·꽝/당첨 미보장 고지·기록은 주 조작 패널 밖의 하단 독립 흰색 영역으로 분리한다. 조작 패널은 횟수/필요권/주 CTA/잔여권 중심이며 비용 및 기존 고지는 뽑기 전 접근 가능하게 유지한다. 보조 영역은16px radius,PC24px/모바일16px padding,기존 경품 이미지 contain 및 native details 확률 접근을 유지한다. 확정 영수증 결과는 기존 TaskPanel(mode modal,width800) 안에 표시한다. 닫기/Esc/뽑기 화면으로는 영수증을 지우거나 재추첨하지 않고, 뽑기 결과 버튼으로 재열며 초점을 돌려준다. 계정 전환은 기존 owner key 경계를 유지한다. 결과 본문은 흰색24px/모바일16px padding과 기존 contain 이미지를 사용하고 10개 결과는 모달 내부에서 스크롤한다. 영상은 MEDIA-001 최종애셋 인계 전 미통합이며 기존 연출/바로 보기를 영상완료로 간주하지 않는다.
- `zBRpr` 미션 허브는180px 출석 원본 이미지·사진/텍스트 미션·288px 참여 레일을 사용하며 기존 미션 상세를 별도로 유지한다. `ZwPUD` 컬렉션은556.27px 이미지·24px 간격·상품 선택·168×48px 행동이다. 원본 분류는 로컬 fixture에서 명시적으로 제공하고 서버 필드를 추측하지 않는다.
- 이 작업의 데이터·댓글·첨부 선택은 로컬 검증 fixture를 포함한다. 실제 서비스 반영이나 외부 API 연동 완료의 근거로 사용하지 않는다.

### 2026-11-02 Pencil 속성 마감 · 로컬 검증 범위

- 제목용 `Pretendard UI 550/650/850` 폰트는 해당 파일의 실제 굵기를 사용하고 합성 굵기를 만들지 않는다. 제목별 크기·행간은 원본 역할로 지정하며, 공통 GroupShell/관리자 셸은 `Pretendard Variable`을 기본 본문 서체로 사용한다. 정의되지 않은 CSS 변수를 글꼴 fallback 목록에 넣지 않는다.
- `XnL4z` 정렬 메뉴는 200px, 안쪽8px, 항목 사이4px, 모서리12px, 항목44px이다. 키보드 선택과 Esc 닫기를 제공한다. `QyrvD` 선택 행은 높이72px, 좌우20px, 모서리12px, 제목16/24와 오른쪽 분류13/21을 사용한다.
- `Urthu/wCL5S` 작성 화면은 로컬 전용 원본 첨부 예시를 표시한다. 일반 게시글의 기존 사진4개·WAVE 영상 정책은 변경하지 않는다. `X7FfJ`는 본문→사진→반응→댓글→다른 글 순서이며 큰 사진720×540 contain, 댓글 사진120×90, 영상 포스터140×248.89를 사용한다. 원본 영상 포스터를 실제 동영상 재생 성공으로 표시하지 않는다.
- 원본에만 있는 조회 수·상대 시각·댓글 첨부·순위 예시는 로컬 presentation/fixture로 제공한다. 원본의 선택·빈 상태·실패·처리 중·결과 패널145개는 명시적인 React 상태 패널이며, 결제·전송·권한 변경 등 서버 처리 완료의 증거가 아니다. 댓글 첨부 선택은 파일명 표시까지의 로컬 예시이며 실제 업로드는 포함하지 않는다.
- `kqlrO`는 서로 다른 관리자 화면을 나란히 배치한4480px 구성도다. 앱에서는 그 안의 개별 관리 화면으로 연결하며, 구성도 자체를 가로로 긴 서비스 화면으로 만들지 않는다.200px 정렬 팝업과640px 패널의 원본 크기는 컴포넌트 치수이며 브라우저 최소 폭을 뜻하지 않는다.
- 검증은 항목별 연결표에 원본 치수·390/1440 렌더, 측정한 속성, 키보드 동작 및 증거 파일을 기록한다. 화면 폭·여백·간격·모서리 검사와 실제 시각 검수를 구분한다. 전체 파일의 모든 중첩 노드에 대한 자동 픽셀 동일성 인증으로 확대하지 않는다.


### 2026-11-02 22:16 최신 Pencil 재추출 · localhost 전용 계약

이번 사용자 지정 원본은 `kyaa-fanpage.pen`의 330개 루트다. 이전 239/327개 기준보다 이 항목을 우선한다. 제품 화면·상태 291개, 디자인 시스템·설계 참고32개, 명시적 보관7개를 분리한다. 추출 HTML/CSS·노드 속성·323개 표시 루트 PNG는 `byus/work/fanpage-visual-diff-20261102/reextract-221612/`에 보존하고, 경로·검증 근거는 `docs/design/groups-production-coverage.json`에 연결한다.

- 전역 탐색은 HOME / 모임 / 덕질 / MY이며 팬페이지는 모임 활성 상태다. 팬페이지·취미·브랜드 내부 메뉴의 네 번째 항목은 캘린더다. 이름은 계정 메뉴 안에 두고 프로필/QR과 MY 이동을 구분한다. 모바일 상단은 알림과 언어 선택을 사용한다. 계정 메뉴(2026-11-08 피드백 F)는 프로필 줄·MY·덕질(또는 출석)·친구·개인 설정·언어 설정·팬페이지 개설 신청이며, 헤더에 종이 늘 있으므로 `알림` 항목은 두지 않는다.
- 새 M/A/E/R/B 상세53개는 CLI Export HTML+CSS를 JSX로 직접 변환한 코드가 소유한다. 추출 노드 ID·원래 스타일을 유지하고 입력·선택·동작을 시맨틱 컨트롤에 연결한다. 비교 보드10개는 여러 대안 상태를 한 화면에 동시에 쌓지 않고 개별 상태로 제공한다.
- `AnIra/hSUpJ`: 댓글 아바타40/답글32, 가로 간격12, 답글 들여쓰기20, PC입력64·등록96×44. 모바일은 하단48px 입력과44px 전송 버튼, 답글 대상·취소를 사용한다. 댓글 좋아요·답글 접기·작성은 로컬 상태이며 별도 서버 저장 완료를 뜻하지 않는다.
- `EqCqG`: 기계는 가변 너비, 조작 영역320, 수량 선택은 세로이며 항목 폭272, 주 행동은 내용에 맞춘 높이45다. 예전560px 기계·376px 조작 영역 계약을 대체한다. `mC9VD`의336px 빈 헤더 잔여 공간은 재현하지 않는다.
- `Qp3M9`는 참가자 관리·공식 이벤트 신청·지원자료 화면이다. 일반 행사 생성폼으로 대체하지 않는다. 공식 신청은16px 간격의 두 행과8px label 간격을 사용한다. `z7s5v`는 상품·일정, 응모 규칙, 개설 전 확인의3단계 화면이며 기존 검증/요청 경로를 재사용한다. `QyrvD/z7s5v`의1064px 고정 폭은 제거하고 PC본문1360px을 채운다.
- 최신 변경된 행동·필터 가로 행은 `align-items:center`다. 패널 본문 또는 세로 행동 영역까지 일괄 가운데 정렬하지 않는다. `W0Xri`의 긴 제목은 PC에서 줄바꿈과 행 높이 확장을 허용한다. MY 바로가기 및 모바일 계정 도구도 같은 세로 정렬을 사용한다.
- 캘린더 원본에 명시된 기존 WEB 우선 지시를 따른다. 기존 캘린더·LIVE 예약·일반 일정 구독을 재사용하며 초안의 통합 예약폼은 만들지 않는다. 일정 fixture와 예시 출처는 실제 일정·공식 출처 보증이 아니다.
- 네이티브 날짜/파일 입력의 OS표시와 실제 API 계약에 없는 조회수·상대 시각·예시 인원 차이는 데이터/접근성 적응으로 구분한다. 이 로컬 검증은 실제 포인트 지급·신고/승인 처리·QR촬영·운영 배포를 포함하지 않는다. 원본 폭 및390/1440에서 렌더·해당 속성·상호작용·키보드·넘침을 검사하되 모든 중첩 DOM값의 완전한 자동 픽셀 동일성으로 확대하지 않는다.

### 2026-11-02 22:35 최신 재추출 · 작업 표시 방식 우선 적용

사용자의 재추출 요청에 따라 현재 원본은339개 루트로 갱신한다(제품299, 참고32, 상태 비교 묶음1, 보관7). 직전330개 대비 신규9·변경39·동일284·비표시 보관7이며, 신규8개 제품은 모바일 확인 시트다. 아래 LNwys 계약은 앞의 일반 페이지형 작업·960px 언어창·기존 독립 상태 카드 계약보다 우선한다.

- `LNwys/NqFPW/x9Cya/yf60n`: 조회·탐색은 페이지, 짧은 설정·초대·확인·전환은 PC 모달/모바일 시트, 인증·보완·후기는 PC 모달/모바일 전체 화면 작성이다. 긴 본문만 스크롤하고 제목과 하단 행동은 유지한다.
- M02/M04/A04/E01은 PC640px·모바일 전체 화면, A05/R01/R04/R05는 PC560px·모바일 하단 시트다. 모달 radius16, 시트는 위쪽 radius16 및24px 핸들 영역(36×4)을 사용한다. PC 본문24·모바일16, 간격16이다. 제목은 Pretendard Variable700, PC24/34·모바일20/28로 기존 UI850 제목 스타일과 구분한다.
- 헤더 외곽76px, 일반 하단 행동80px, 원본의 작은44px 행동이 있는 확인창은 하단76px이다. Export HTML의 content-box와 외곽 치수 중복은 border-box/100%로 보정한다. 원본 본문·버튼의 세부 스타일은 직접 추출해 유지한다.
- 언어 선택은 PC640px·2열, 모바일 전체 폭 하단 시트이며 선택 즉시 적용한다. 저장 버튼을 추가하지 않는다. 페이지 접속 공개와 MY 아티스트 공개 설정은560px 작업 모달/모바일 시트이며 기존 GET/PUT·권한 판단을 유지한다.
- native dialog 또는 기존 AccessibleOverlay가 배경 스크롤 잠금·초점 가두기·복귀·Escape를 담당한다. 작성창 닫기는 같은 창 안의 확인 단계로 바꿔 창을 중첩하지 않는다. 브라우저 이탈에는 native beforeunload 보호를 적용하고, 이탈 확정 시 현재 작성 초안만 정리한다. 원래 호출 경로·초점·스크롤 위치를 복원하며 실패 메시지와 첨부 상태는 작업 본문 안에서 입력을 보존한다.
- 새 확인16개는 호출 맥락(게시글 상세·작성·추첨·운영자 관리·행사) 위에 표시한다. 배경 참조31개는 별도 제품 화면으로 세지 않는다. 확인·초대·적립 등의 로컬 UI 콜백은 실제 서버 처리 완료를 뜻하지 않는다.
- 현재 추출 및 수정 근거: `byus/work/fanpage-visual-diff-20261102/reextract-223529/`. 변경41개 제품에 대해 작업16개, 확인/전환20개, 언어/공개설정5개로 나누어 원본 폭·390/1440·짧은 화면 높이·본문 스크롤·포커스·저장/취소를 검증한다. 바뀌지 않은284개 루트의 근거는 재사용한다.

현재 작업 본문의 가운데 정렬 테두리는 Export content-box 중복을 제거해 원본 외곽 크기로 복원한다(체크 행44px). 모바일 하단은 원본에 따라 취소88px+나머지 기본 행동이며, R05 가입 시트는 두 버튼169px를 유지한다. 원본에 호출 배경이 포함된 모바일 시트는 해당 배경도 표시한다. 네이티브 select/checkbox/date의 운영체제별 외형 차이는 허용하되 행·버튼 외곽과 간격은 원본을 따른다.

### 2026-11-03 cycle01 — current Pencil source and dev integration

The 23:43 KST CLI extraction supersedes the 339-root inventory: 342 roots, comprising 301 product screens/states, 33 references, one state reference and seven archives. Evidence is in `byus/work/pen-dev-loop-20261102/cycle-01/`. The user has authorized actual dev API/DB integration; production deployment remains excluded. Local fixture screenshots and actual service verification are recorded separately in the coverage ledger.

- Messages (`ykQWh`, `zcRQc`, `SBFKc`, `X7aUHx`): desktop rail 336px, search 48px; separate mobile list/conversation, header 72px, message padding 24px/16px, gap 16px, attachment 44px, input 48px, send 96px/44px. The social screen owns this layout and reuses authenticated DM media APIs.
- Rooms (`Msd7H`, `sPifp`): entry conditions precede unboxed 104px/158px rows. Collections (`ZwPUD`, `vkvq6`): photo 600×400px desktop and 358×238.67px mobile, content gap 40px/20px, action 240px/full width. Actual API data owns names, counts, permissions, available selections and destinations.
- Members retain real membership/ranking navigation and permissions. Remove duplicate panel padding, use search 320px and tabs 144px; source ranking rows are 79px. Source example tiers or owner labels must not replace real returned values.
- Shared detail identity wrappers use the group page container without inherited 70dvh minimum height. M01/M03 label width is 180px with 24px desktop gap and stacked 8px mobile gap. M02 textarea is 112px; application description is 144px with 16px padding; board comment input is 96px. A01 date fields use two columns with 16px gap, stacking on mobile.
- Native controls, actual data and preserved service actions may differ from fixture examples; each exception and missing API contract remains explicit. Render/geometry checks do not certify every nested pixel or physical camera behavior.

### Gift applications (2026-11-03, Pencil current-002 A06/A07)

Gift operator screens use the exported A06 registration properties (PC AbUp2 / mobile v0nqnh) and current-002 A07 status properties (PC fBPhw / mobile G4ayh). Owner: `features/groups/ui/group-gifts.module.css`. Main width is 960px at 1440, mobile horizontal padding 16px; content top spacing 32/16px, title 32/48px PC and 24/36px mobile at weight400, section titles 24/20px bold with normal line height. Form groups use20px separation,16px internal gaps; controls48px, multiline96px, radius12px, image container20px padding and12px gap. Primary action280px PC/full width mobile,48px tall. Status card uses20px vertical padding,12px gap,24/36px bold heading and16/24px reason. Shared header and black operation band retain real page name. Fulfillment is an enum select and upload/request/error states are interactive extensions of the exported form; successful requests preserve persisted revision/status. Only the application's current saved status is shown. Approved raffle selection and admin review use existing common controls. Uploaded images remain private until linked to a published visible raffle; replacing a gift revision preserves an already published image snapshot.

### 2026-11-03 current-002 — refreshed Pencil properties

Latest CLI HTML/PNG source: `byus/work/pen-dev-loop-20261102/reextract-current-002/` (342 roots; 92 changed, 243 unchanged, 7 archived). The requested source overrides earlier layout values only for these changes.

- MY R3Nnz/BdXrj: balances stack with12px gap and8px vertical row padding; label/use stack4px, 18px icon, amount right aligned without a unit space. `my-screen.module.css` owns this layout.
- Wallet CFdD7/IMzcm: desktop asset cards have16px padding,8px gap,14/21 label,28/35 balance and24px icon; mobile rows have12px vertical padding,16px list gap,22px icon,16/22 label and28/39 balance. Mobile history stacks description and value with4px gap and16px vertical padding. `wallet.module.css` applies the balance rules to both service data and local fixtures.
- Profile KUEOR/XCSLO (UI-003 user-approved update, 2026-11-03): copy-link stays inside the QR block; a separate friend-add section has12px gap and a48px gradient scan action. Desktop backdrop remains inset0; replace the prior top88px/right40px placement with horizontal and vertical centering,32px viewport clearance and max-height calc(100dvh - 64px). Preserve400px panel width,24px padding and20px gap. Mobile retains358px panel width,20px padding, top alignment and16px viewport clearance; short screens scroll inside the panel.
- Profile QR uses a240px square maximum display width (max-width100%),480px canvas, qrcode error correction H and four-module quiet zone. Render the existing /images/guest-home/kyaa-wordmark.svg intact with contain on a central white60px square plate with6px padding (48px inner logo width; plate25% of QR width/6.25% of total square area). No new logo asset or external QR service. Production ProfileConnectionPanel and LocalProfilePreview share this implementation. Existing copy-link payload/token,24-hour expiry, errors/retry, permissions, scanner and friend-request behavior remain authoritative.
- UI-003 implementation evidence: work/local-team-20261103/tasks/UI-003/result.md and design-proposal.md. Backend reports40 focused tests, actual-header and preview390/1440 local fixture renders, short-screen scrolling/keyboard checks, and8 exact-payload screenshot decodes across nativeDPR2/CSS1×. These are synthetic local fixtures, not production profile/DB verification or physical-handset scanning; final user visual review remains pending. UI-003-DOC integrates the contract only and does not repeat product verification.
- Event VEfCi/qbarG: action cards use1px #e4e1e6 border,12px radius,224px desktop minimum height and48px actions; descriptions flex to align actions.

Evidence: current-002/parent-render (390/1440), associated computed-style assertions, focused MY/profile/wallet tests. Actual values and allowed actions come from APIs; screenshots use explicitly identified fixtures. Physical camera scanning is not certified by browser fixtures.

### 2026-11-03 최신 Pencil 재추출 003

- 원본 `kyaa-fanpage.pen`을 CLI HTML+CSS로 다시 추출: 352개 루트, 직전 추출 대비 신규 10개·변경 33개·동일 302개·비렌더 7개. 캔버스 구역 안내도 변경 수에 포함된다.
- 알림 저장 실패(hKn1B/MDfpG)는 선택값을 유지하며 16/24px `#9F1239` 안내와 ‘다시 저장’을 표시한다. 초대 동의(f2Ojl/rvIf6)의 ‘나중에’는 닫기, 본문의 44px ‘초대 거절’은 실제 거절 요청이다.
- 행사 신청 전(bzBcV/pkZ5D)은 신청 전 배지와 48px 참가 신청, 모바일 전체 너비 버튼을 사용한다. 확정·대기·검토 가능 여부는 서버 응답을 따른다. 제목은 ‘행사 상세’, 모바일 모임 이미지 48px/제목 20/28px, PC 이미지 80px/제목 32/40px이다. 현재 실제 서비스 내비게이션의 활동 선택을 유지한다.
- MY의 알림·문의·설정, 패스포트·지갑·활동 목록 아이콘을 원본에 맞춘다. 실제 데이터와 유효한 QR을 유지한다.
- A08/A09는 `/pages/groups/[pageId]/events/[eventId]/support` 및 `view=history`에서 기존 참석·후기·정산 검토 API를 사용한다. 960px 본문, PC 32/48px·모바일 24/36px 제목, 20px 간격을 사용한다. 원본 1만원 산식은 명시된 예시이며 지급·정책 확정·새 원장 처리를 의미하지 않는다. 제출 설명/증빙 URL 입력은 기존 API를 위한 기능적 확장이다.
- 확인/결과 상태는 실제 성공·실패 조건에 연결한다. 서버에 없는 광고 전환 정책과 본인 신고 결과 조회를 완료된 기능처럼 표시하지 않는다.

### Activity proof, survey, review (2026-11-03, Pencil current-003)

`activity-evidence-task.tsx` and `activity-evidence.module.css` own M02 photo proof and event-review inputs. They reuse TaskPanel640px PC/fullscreen mobile, shared76px header and80px actions. Body padding24px PC/16px mobile,16px vertical gap,8px label gap,112px textarea and48px review-title input. Photo attachment has24px padding/16px gap,18/27px normal title and32px icon; optional review attachment uses20px/12px. Current003 A2DH4O/E5rm07 requires a ready photo and original-material confirmation: required label,14/21px helper, disabled action background#EFEFEF/text#777777. L3JHJe/iWg4L error uses#9F1239 outline/helper and re-selection while preserving the description. Successful attachment leaves the temporary upload cleanup pool only after acknowledged persistence. Photo/review history remains private; replacing a current image preserves immutable prior evidence.

M05 (`group-survey-form.tsx`) uses the persisted question and exactly3 options,60px option rows with8px separation,24px controls,112px optional-opinion textarea,20px form gaps and280px PC/full-width mobile action. The page uses the existing real group slug/public creator/header contract; generic mission cover/instruction/reward duplication is omitted for survey. Its fixed mobile navigation is hidden while answering, preserving the source form's unobstructed action. Submission/review forms send their viewed mission/submission revisions; stale state returns conflict and preserves current edits. Current statuses/reasons/rewards and previous revision records come from the API; no source policy example becomes a real reward promise.
- 후속 시각 검수: 행사 신청 전과 A08/A09의 주 행동은 PC 280px, 모바일 전체 너비다. 모바일 규칙을 PC로 확장하지 않는다. 행사 티켓·미션의 빈 접이식 컨테이너는 숨겨 불필요한 grid 간격을 없앤다.

### 2026-11-03 own report states · current-003
`/my/groups/reports` uses exported XlbOv/AYzQG state panels:640px maximum width,24px padding,16px gap,16px corner, #e8e8e8 outline,24/31px Pretendard UI850 title at exported weight400,48px actions with12px corners and14/20px UI650 labels. Source HTML declarations are adapted only for responsive width, semantic buttons and actual report data. Existing created date and expanded resolution/status are functional additions; private or removed targets have no link. Owner:`group-own-reports.module.css`. Source-state panels retain their dedicated640px reading column within the960px page body.

### Group calendars (2026-11-03, Pencil current-003)

`FI1kg` / `euRh2` / `I2EszZ` / `E8m4wq` explicitly require reuse of the existing WEB `/live/calendar` calendar, day list, month art, reservation/detail actions and responsive layout; the hobby frame is placement guidance rather than a replacement visual implementation. `GroupCalendarPanel` embeds `LiveCalendarScreen` under the actual group/creator header, hides other-creator filters and preserves the current group path, locale and query during month navigation. No new visual tokens are introduced. Creator-linked pages use their authorized LIVE identity and schedule slug; other groups use only their own authorized published/cancelled/ended event records. Group event entries retain explicit real event destinations and group identity rather than fabricating LIVE/creator/schedule records. Source example events and empty-state examples never replace API results. Native390px/1440px renders cover fan, hobby and brand with empty/occupied dates; existing WEB calendar regressions remain required.


UI-011 · 이전 Creator home upcoming schedules 계약 (접힘 상태는 아래 최신 정정으로 대체): `CreatorScheduleCard` reuses the existing `CelebrityMiniCalendar` in embedded mode in the shared `CreatorGroupHome` mobile card and PC aside. The small calendar is collapsed by default; its toggle preserves `aria-expanded`/`aria-controls` and each calendar uses `useId` to avoid duplicate IDs. Keep the card’s existing outer frame, spacing and typography. Embedded mode omits only the duplicate calendar header, outer border, check-in controls and lower links; the card retains the existing `/:slug?tab=calendar&locale=…` full-calendar link. Reuse existing API data, month navigation, date selection and detail paths. Do not duplicate the calendar, create schedule examples as real data, or alter the full calendar/image crop.

UI-011 evidence is inherited from `work/local-team-20261103/tasks/UI-011/result.md`: local shared-component390/1440 expansion/collapse, focus/controls and overflow checks; focused card/calendar tests. Occupied-date evidence temporarily projected an existing same-creator local event into the calendar response. This is not operating schedule data or verified LIVE-detail arrival. UI-011-DOC integrates this contract only; no implementation or browser/test rerun.

2026-11-03 Pencil003 cRVyO: reduced-motion state uses the original160px contain capsule, #FFF5FA background, centered34px title line and26px description line. Existing120ms reduced reveal timing is preserved. Mobile qUpqC/HbVi5 and PRK1L/x3FJF confirmations use77px action region and45px primary button (15/21,800); other80px/compact76px action regions remain role-specific.

### Event create/publish/participation (2026-11-03, current-003)
A01 XwD8y/O1pP6 uses32/48px PC and24/36px mobile normal headings,20px form groups,8px labels,16/24px normal label text,48px inputs and96px textarea. Basic order is name,start/end,read-only Asia/Seoul,location,participation instructions; real required registration windows/capacity/approval/image/state remain additional settings rather than invented defaults. Existing schedule-time conversion makes wall time explicitly KST. A02 JhfMg/IybBO reuses actual event-save publication; source item text18/27px normal, actions160px PC/equal mobile with12px gap. E02 nlql7/uGGjp uses real review/check-in status,20px row padding,12px gaps and review action200px PC/full width mobile. Source example states are not substituted for actual API status. Missing linked-mission/cancellation-reason/attendance-request contracts remain explicitly partial; no fake submission, automatic check-in or reward policy is introduced.
- 79000 A01/A02 contract follow-up: the actual authorized paginated mission selector preserves omitted values and clears only on explicit no-link choice. Event editor form occupies the exported960px column rather than inheriting the shared720px form maximum. Cancellation uses source24px divider padding/16px gap/20px700 section title/96px textarea and280px PC/full mobile #9F1239 action. Reason is optional raw text (max1000); persisted reason display comes only from the server. No new reward/refund/check-in policy is implied.

### Profile QR camera access states (2026-11-03, current-003 ae7UT/P0nPX)
Profile QR scanning keeps the existing profile overlay and shared scanner/image-upload flow. Only confirmed unavailable platform capability (insecure context or missing getUserMedia) renders source `카메라 미지원`; only observed Permissions API camera=denied renders `카메라 권한 없음` with source browser-setting guidance/reopen action. Unsupported permission queries and generic library camera errors remain generic. State rows use12px vertical padding/8px gap/1px #E4E1E6 divider,18/27px normal titles,16/24px body and280px PC/full-width mobile retry. Existing profile width is preserved. Mocked390/1440 renders and unit tests cover both states without camera prompts/streams; physical camera capture remains unverified and excluded.

- 2026-11-03 · 컬렉션 상품 URL 조회 실패 `kgWAV`: 실제 상품 URL 조회가 실패한 경우에만 CLI003 원본의 아이콘24px·제목24/31px·본문16/24px·패딩24px·간격16px·반경16px·필드48px·주요 행동48px을 적용한다. 목록 조회 오류와 구분한다. 수동 이미지 URL은 검증 후 기존 `group_image` 업로드로 전환하고 ready 자산만 저장하며, 입력한 제목·판매처 URL과 실패한 저장의 요청 식별자를 보존한다. 원본은 `reextract-current-003/properties/kgWAV.json`; 실제390/1440 로컬 API fixture 검증은 `reextract-current-003/collection-import/checks.json`에 기록한다.

### 2026-11-03 MY 신고 내역 접근

원본 current003 `BdXrj`의 상단 3개 이동에 실제 서비스의 `접수한 신고` 링크를 더해 4개가 됐다. 767px 이하에서는 MY 프로필의 이동 버튼만 2열로 배치해 한 글자씩 줄바꿈되는 문제를 막는다. 버튼 최소 높이 44px와 기존 데스크톱 배치를 유지한다.

### 2026-11-03 비밀방 참여 회원

원본 current003 `EU2Nf`의 참여 회원은 36px 아바타와 회원 정보를 2열로 두고, 프로필 보기 행동을 정보 아래 같은 열에 놓는다. `roomParticipant`의 2열 grid와 `roomProfileAction`의 두 번째 열 배치로 좁은 회원 정보가 한 글자씩 줄바꿈되는 문제를 막는다. 목록 행 높이는 원본 CLI 실제 경계(PC 104px, 모바일 158px)를 유지한다. HTML 내보내기의 content-box 계산으로 추가되는 40px은 실제 Pencil 도형의 높이가 아니다.

- current003 탐색 정렬 버튼은 기존 Source menu를 유지하며 공통 select 배경 화살표를 제거하고 Lucide 화살표 1개만 표시한다. 버튼 접근성 이름은 현재 표시값과 일치한다. 실제 DEV 중복 표시 관찰 뒤390/1440 로컬 정렬 전환과44px hit area를 확인했다.

원본 current003의 추가 확인값을 비밀방에 적용한다: 목록 안내문 16px/normal(`WfS6E`, `xnacl`), PC 대화 열 안쪽 가로 여백 24px(`GAOT0`), PC 보내기 104×48px(`QN7qg`), 참여 회원 제목 16px/24px·700과 20px Users 아이콘(`QxYQ6`, `T5m4W8`). 대화 열 여백과 고정 전송 폭은 1024px 이상에만 적용하며 모바일의 기존 대화 경계를 유지한다.

### M03 current submission (2026-11-03, KUuyw/r5caXR)
Own current submission body/status is shown independently of older history length. Existing owner-scoped mission GET supplies all data; original text/whitespace, server rejection reason, actual completed rewardPoints and existing canSubmit permission are preserved. Current photo/text history uses the source unboxed hierarchy:32/48px PC or24/36px mobile heading,20px vertical gaps,8px status spacing,18/27px normal row titles and16/24px body. Native CLI PNGs show90.5px effective short-row height; exported HTML content-box must not add padding twice. Browser short rows91px with-.5px margin/half-pixel inset divider preserve that interval, while long text/actual photos grow naturally. Only rejected+canSubmit offers source `내용 보완하기` and retains existing revision-aware form. Previous revisions remain separate; no fake group reward-history/result destination is added. Survey/manager review flow and empty M01 stay unchanged.

### 2026-11-03 신청 검토·보완 작업 패널

원본 current003 `CDOu1`/`IrlP8`을 기존 `TaskPanel`로 연결한다. 실제 Pencil CLI 경계는 PC 640×763px(감사 문서의 560px 표기는 오기), 모바일 390×844px 전체 화면이다. 헤더 76px, PC 본문 607px·padding 24px, 모바일 본문 padding 16px, 하단 행동 80px, 설명 입력 96px, 증빙 선택 48px를 적용한다. 요약 제목 18px/27px·본문 16px/24px를 패널 범위에서 명시해 호출 화면의 문단 line-height가 새어들지 않게 한다. 실제 접수 상태와 보완 사유·저장된 설명은 신청자 데이터로 표시하며 예시 상태를 운영 상태로 만들지 않는다. 신청 유형·이름·증빙 주소는 기존 값을 그대로 제출하고, 보완 설명과 증빙만 이 패널에서 편집한다. 실패 재시도의 요청 ID·조회한 revision·초안 보존과 작성 취소 확인은 기존 API 및 공통 작업 패널 계약을 따른다.
- M01↔M03 view-flow correction: the actual mission Next route explicitly whitelists `view=conditions|submission` and defaults to conditions, including after a prior submission. Existing requirements/instructions remain reachable through source `내 제출 내역` / `미션 참여 조건` navigation; locale and appropriate existing query values stay on the same real mission path. A missing own submission falls back to conditions. Only acknowledged own submission POST navigates to submission; failure and manager review PATCH stay in place. This restores flow without claiming the still-separate full M01 template or M06 history/result implementation.

- 2026-11-03 · 팬 게시판 native 첨부 `R2Cts3`/`Urthu`/`wCL5S`/`BXOYV`: published fan group에 연결된 celebrity의 게시글만 서버 정책에 따라 사진10장 또는 영상1개를 허용하고 혼합 첨부를 금지한다. 기존 일반 대상4장·WAVE 행사 게이트는 유지한다. 원본의 사진104×104/영상104×138 썸네일, 모바일 입력48px·본문160px·첨부 행동48px·취소88px/등록 나머지 폭을 해당 작성기에만 적용한다. 첨부 썸네일 cover는 원본에 지정된 미리보기 역할에 한정하며 상세/확대 재생은 실제 비율을 보존한다. 정책 실패 시 기존 첨부를 자르지 않는다. 공개 영상의 optional-viewer 읽기는 별도 fan-post 범위이며 DM/WAVE/draft의 기존 인증 읽기는 유지한다. 실제390/1440 로컬 합성 파일 검증은 `work/pen-dev-loop-20261102/fan-board-media/render/{checks,edit-checks,guest-checks}.json`에 기록한다. 이 근거는 source 전체 페이지를 픽셀 단위로 일치시켰다는 의미는 아니다.

### 2026-11-03 모임 알림 저장 완료 안내

원본 current003 `M6GC6N`/`T4HZxl`의 저장 완료 설명(`cMAi3`, `I0EcQ`)은 실제 Pencil CLI 16px·line-height 1.5·높이 24px다. 실제 알림 설정 PUT 성공 뒤 기존 창 안에 이 문구를 16px/24px, #5d5d5d의 polite live status로 하나만 표시한다. 상태 비교 원본의 대기·성공·실패를 동시에 표시하지 않는다. 새 편집·다시 저장·닫기·재열기에는 완료 표시를 비우고, 모임·계정이 바뀌면 이전 창과 초안을 제거한다. 실패한 선택값 및 성공 뒤 재조회 실패 시 현재 창은 유지한다. 기존 TaskPanel·닫기 행동을 재사용한다.

### M03 earnings navigation (2026-11-03, current-004)

Fresh Pencil desktop CLI extraction is byte-identical to current-003; the older on-disk pen export is not the latest canvas. M03 `W1n8A`/`mshCT` connects the owned submission to the actual group earnings route, preserving locale without forwarding mission-only query parameters. The text action uses the exported 240px desktop/full-width mobile, minimum44px height,8px horizontal padding,12px radius and14/20px Pretendard UI650 label. Long translations may increase height. Global wallet and attendance destinations remain global. Local synthetic-fixture captures at1440/390 show240×44/358×44px actions with no horizontal overflow; this does not certify the destination API or DEV deployment.

### Survey revisit and submitted-history entry (2026-11-03, current-004)

Saved surveys with no further submission permission show the actual mission title and the source `hHsHw:q0NBD` / `jxGJk:BjYCo` already-answered explanation before the existing own-history action. Revisiting is not a fresh submission success. All12 locale strings retain16/24px explanation type; the page title uses32/48px desktop and24/36px mobile, with20px group spacing. Scoped selectors prevent the shared page paragraph rule from changing the source24px line height. Mission-overview submitted-history links explicitly select `view=submission`; participation links retain their existing view, and both preserve locale and other query/hash values. Actual component browser checks cover12 locales×390/1440, history navigation and earnings destination; examples are synthetic local API data.

### M06/M07 actual group earnings (2026-11-03, current-004)

`group-earnings-screen.tsx`, `group-earning-result.tsx` and `group-earnings.module.css` own the real list/detail routes. Direct Pencil CLI native geometry for `OtyQM/EGVrD/tTXMv/Tnes3` defines960px desktop and358px at390px body widths,20px group gaps,32/48px desktop or24/36px mobile headings,18/27px row titles and16/24px body. Short list rows are89/81/89px; result rows81/81/78px, including padding. Long original titles/reasons and localized labels expand naturally. The48px return action is280px desktop/full width mobile. Mobile bottom clearance protects pagination from fixed navigation.

The existing shared group identity and authenticated resource helpers remain authoritative. Scope describes the current group and all returned activity; it does not invent a cross-group filter. Only verified credited amounts are shown as credits; pending/rejected/no-reward/under-review/corrected/raffle-return states are distinct, and null is never converted to0. Original source title/reason is preserved; missing time is not replaced by occurrence time. Detail/back navigation preserves locale and opaque cursor. Source `HMCkB/EMnw2` empty/error/retry treatments are mutually exclusive. Local synthetic-fixture browser evidence covers all12 locales at390/1440, narrow long-text boundaries, errors, session changes, pagination and keyboard focus. This certifies the named component states, not whole shared chrome parity, live DEV data or every historical reward source.

### Group form languages and narrow cancel labels (2026-11-03, current-004)

Gift, invitation/consent, activity-photo/review and survey interface copy is complete for all12 APP_LOCALES; original user/source fields remain unchanged. Gift image removal/method placeholder and invitation Later action use the same locale owners. Editing a gift without changing fulfillment method preserves its stored original fulfillment description rather than replacing it with a translated label. New or explicitly changed methods retain the existing enum-to-description behavior.

The photo/review task alone reduces mobile cancel-button horizontal padding from20px to8px, preserving source88px target width,48px height and14/20px label. This accommodates complete localized words without shrinking text or changing shared TaskPanel actions. Local synthetic fixtures verified144 form cases at390/1440, with48 additional photo/review cancel-label checks after this scoped padding correction. Actual French mobile and desktop consent captures were inspected; this is not native-speaker/legal or whole-shared-shell certification.

### Actual global benefits, capsule and raffle (2026-11-03, current-004)

The groups-enabled `/benefits` route uses `GroupBenefitsScreen` with real wallet, paginated group raffle/mission catalog and public creator data; gate-off keeps the legacy screen. Source `sX58m/ajFsZ` orders balances/history, lucky draws, creator support and point events. Repeated raffle cards share content/metadata/action tracks with CSS subgrid so long titles and optional actual metadata do not misalign actions. No sample campaign promise, fake entry total or invented reward is copied into production. Capsule entry is generic and real published content supplies the remaining cards.

Source `mF4bM/EqCqG/mC9VD/S38b4C` belongs to global 덕질: actual capsule/raffle consumers now use that frame without the old group identity/activity tabs; pageId remains API scope. `/benefits/` descendants retain the same selected global destination. Capsule desktop controls stack as in the source, while translated radio rows expand without text overlap. Existing accounting, consent, confirmation/receipt and direct-wallet-exchange semantics remain unchanged. The global side rail uses only supported destinations, not source-only creator/event examples. Native current004 source PNGs and actual no-preview component captures were inspected; synthetic fixture checks are not deployed wallet writes or full-source parity.

### Existing-data collection presentation (2026-11-03, current-004)

Actual `CreatorGroupCollection`, `GroupDetailScreen` and Activities→Collection bind the stored page name to a localized collection heading and source description. Stored names and product titles remain literal, including `$&` and `{name}`, and sale URLs retain query/hash and common outbound behavior. Source `ZwPUD/vkvq6` uses600×400px desktop and358×238.67px at390px contained artwork,40/20px product gaps and240×48/full-width48px seller actions. Mobile section title is20/26px and product title24/31px. At768–1023px details stack under the maximum600px image instead of collapsing to a narrow column. Existing items/status/selection remain intact.

Source category/product-group samples have no authored persistence contract and are not invented or displayed as actual metadata. New classification management is not part of this implementation; the existing merchandise-view/seller-link function is retained.12locale actual-caller captures, long originals, sold-out/error/retry/pagination and keyboard evidence are scoped to that existing-data composition, not complete source grouping or deployed seller availability.

### M01 mission conditions (2026-11-03, f5sjXn/UvV19)
Direct CLI html-css declarations/native PNGs define the conditions title32/48px PC or24/36px mobile, API mission-title subtitle16/24px, source before-participation heading20/30px, and four16/24px fact rows. Facts use180px labels/24px horizontal gap on PC, stacked8px gap on mobile,16px row padding/20px separation and a half-pixel divider. Native short rows occupy55.5px PC/87.5px mobile effectively (56/88px browser rect minus.5px margin), avoiding exported HTML content-box double padding. Primary/secondary actions are280px PC/full-width mobile and48px tall. Actual API instructions/rewardPoints, including0P, replace examples; source unconfirmed-policy and timing-caveat text remains verbatim. No recognition count, specific payout date or sample reward is inferred. The source member requirement matches the existing SQL membership guard. Own history is disabled when no owned submission exists; submission/revision/view navigation and API permissions remain unchanged. Current shared chrome and actual optional content may differ from source examples; no whole-page100-point claim.

## Managed discovery banners — 2026-11-03

User-approved: group discovery banners use the existing banner manager's image, localized copy and destination. Placement separates Home, group discovery and both; category is shown above the title (13px/700/20px): event, group, fan page, with existing news/LIVE categories retained. Preserve current artwork framing, carousel spacing and controls; support zero, one or multiple published banners. Links open the registered detail destination and preserve the selected locale. Local fixtures use the same public banner DTO; they do not represent live DB contents. Final visual verification is delegated to the user for this session.

## Benefits hierarchy and currency artwork — 2026-11-03

User-approved local review: apply the same asset summary → lucky draw → separated support/point activities hierarchy to the actual benefits screen and Pencil preview. Desktop title-to-assets gap is32px and assets-to-lucky-draw gap48px; mobile retains32px. Asset summary uses Canvas White #fff (UI-001 supersedes the initial gray proposal), the existing16px radius/1px boundary, and an internal divider (desktop vertical with32px spacing; mobile horizontal with20px spacing). Lower activities have a1px #e4e1e6 top divider and32px top padding; desktop columns48px apart, mobile32px. Amounts use tabular numerals and item tracks share subgrid alignment. Heart/ticket SVGs in public/images/economy use transparent128px viewBoxes and decorative empty alt beside their labels; preserve their full silhouettes. No financial-policy, amounts, destinations or lucky-draw artwork changes. Initial scoped14tests and CSS parsing passed; see UI-001 below for subsequent browser review. User retains final design approval.

### UI-001 · white benefits asset hierarchy (2026-11-03, local only)

Actual GroupBenefitsScreen and PencilBenefitsPreview preserve existing labels, images, balances, links, keyboard semantics and policies. Use white asset backgrounds with the existing16px radius/1px boundary. Point amount is40/48px desktop and32/44px mobile; ticket/heart amounts remain32/45px desktop and28/40px mobile. At widths below768px, history sits beside the point amount and the40px currency icons sit beside amounts, keeping labels and full-width44px-minimum actions in shared subgrid tracks. Preserve48px desktop icons with contained artwork and empty alt. Long action labels wrap rather than truncate. No new copy, animation, decoration or conversion policy.

Page gap32px, with16px extra after the desktop asset summary (48px to lucky draw); mobile uses32px without the extra margin. At768–1023px lucky-draw cards stack to one column to retain readable image/title proportions;1024px+ keeps two columns. Support/point activities retain their existing divider and32px top padding. Local Aside review covers KO390/1440 and tablet768, plus actual component VI390 with long fixture content. The actual component uses existing synthetic API fixtures, not production balances. Evidence and current limitations live in work/local-team-20261103/tasks/UI-001/. UI-001 is excluded from separate DEV work and does not authorize deployment.

### UI-002 · distinct benefits roles (2026-11-03, local only)

This follow-up supersedes UI-001's enclosing asset panel and lower divider treatment. Keep the asset background white and expose the existing localized wallet name (`walletCopy.wallet`) as its h2,24/34px desktop and20/28px mobile. Render balances as an open summary strip (no enclosing border/radius/padding), retaining the internal point/item divider and original amount hierarchy. Desktop exchange controls use natural width with144px minimum; mobile retains full currency-column width and44px minimum height. Do not add financial copy or change destinations/policies. The 2026-11-03 wallet polish places each existing currency icon before its amount in the same row with a 12px gap, using an intrinsic amount track and a trailing flexible space track; the amount row grows when long balances wrap. Labels and actions span the whole item, preserving shared subgrid amount/action alignment. Icon sizes stay48px desktop/40px mobile, contain/empty alt unchanged.

User steering rejects gray fills in every benefits section, including lucky draw. Keep lucky draw #fff and group its heading/cards with matching1px #e4e1e6 top and bottom boundaries (UI-004 softens the prior2px black top rule to match adjacent card hairlines),24px vertical/0 horizontal padding,0 radius and0 horizontal margin at every width. This structural rule retains the original heading/card content alignment and image sizes. Existing one/two-column breakpoint at1024px remains. Support alone becomes a white16px-radius/1px-boundary panel with24px desktop or20px mobile padding; point events remain open rows. Desktop events get24px top padding to align headings; do not force equal lower-panel heights. Existing source copy, images and button semantics stay intact.

This structural distinction was selected after one scoped UI-002-R review: summary strip vs structurally bounded campaign section vs contained support workflow/open mission list. The review's Soft Gray means was rejected by the user; its distinct-role intent was retained. It replaces repeated identical panels without new decoration, colors or larger numbers. Actual component and preview390/1440 normal viewport captures,768 impact and VI390 long content were checked locally using synthetic fixtures; evidence is work/local-team-20261103/tasks/UI-002/. No production deployment or live-balance verification is implied. User retains final visual judgment.

UI-007 (2026-11-03): 덕질 자산 전환 버튼 앞에 교환비율을 14px/20px #5d5d5d로 표시한다. 실제 화면은 검증된 wallet API pointCost, 정적 preview는 동일 walletSchema의 정책값을 사용한다. API 로딩/오류 상태에 추정 비율을 표시하지 않는다. 비로그인 상태는 정책 값이므로 공용 상수 `GROUP_WALLET_POINT_COST`로 실제 비율을 표시한다(2026-11-06 사용자 원칙). 잔액/아이콘과 버튼의 두 열 정렬을 유지한다. UI-007b (2026-11-05): 합계는 선택 수량×API `pointCost`이며 같은 규칙이다. 중간에 멈추면 수량을 1로 되돌려 합계가 실제 잔액 기준으로 나온다.


### UI-013 · 지갑 / 사용 목적 / 참여 이벤트 (2026-11-03, local only)

이 계약은 UI-002의 럭키드로우 경계·하단 배치와 UI-007의 전환 버튼 위치만 대체한다. 흰색 지갑 요약, 검증된 API 교환비율(14/20px), 잔액과 아이콘 사이12px 및 아이콘48/40px는 유지한다. 전환 행동은 해당 사용 목적 카드 하단으로 이동하며 기존 My 지갑 목적지·정책을 유지한다.

지갑 다음은 럭키드로우 한 열이다. 흰 배경,1px #e4e1e6 경계,16px radius,PC24px/모바일16px 내부 여백,열 간20px/12px를 사용한다. 제목은24/34px·모바일20/28px, 기존 ticket 이미지는48/40px contain이다. 캡슐 진입은 기존 흐름을 보존한다. 하트 교환·응원 화면은 2026-11-06 하트 UI 삭제로 없어졌다. 회색 면·다크테마·새 장식을 도입하지 않는다.

아래 이벤트 영역은 실제 raffle/mission 원본 항목을 세로 목록으로 표시한다. 종류와 원본 모임·제목·설명·조건·보상값·목적지를 보존하고 응모형을 적립형으로 설명하지 않는다. 목록 이미지는80×60px·모바일64×48px contain, 제목20/28px·18/26px,행은1px hairline으로 구분한다. 상태 open은 ‘응모 접수 중’이며 개인 자격 보장이 아니다. 소스별 페이지네이션·빈 상태·오류 재시도·로그인 경계를 유지한다. 현재 wallet의 공개 크리에이터 목록은 응원 대상이지 캠페인 목록이 아니므로 응원 캠페인을 만들어 목록을 채우지 않는다. 공식 캡슐도 기존 진입을 유지하며 개별 캠페인을 복제하지 않는다.

actual/preview는 같은 역할 구조를 사용하지만 preview의 기존 예시 수치·정적 이벤트를 운영 데이터로 간주하지 않는다. 로컬390/768/1440 및 긴 문구·빈/오류/비로그인 확인과18개 국소 테스트 근거는 work/local-team-20261103/tasks/UI-013/에 있다. 운영 데이터·배포 검증이 아니며 최종 시각 판단은 사용자에게 있다.


### UI-016 · benefits composition polish (2026-11-03, local only)

UI-013의 흰 지갑→두 목적 카드→분류된 세로 이벤트 구조를 유지한다. 지갑은 PC1:2 grid 안에서 points/두 자산의 라벨20px·수치 최소48px·하단44px 행을 맞추고 수치는32/48px로 통일한다. 모바일은 포인트 한 행과 두 자산 행으로 유지하며 자산 수치는28/40px, 아이콘 다음 잔액 사이 12px를 보존한다. 긴 잔액은 수치 행을 늘려 교환비율과 겹치지 않게 한다.

목적 카드 padding20px/모바일16px,내부gap12px,제목22/30px·모바일20/28px. 기존 진입은 화살표 있는 링크, 전환은 하단44px 이상 행동으로 구별한다. preview 응원은 이미지·대상·기존 ‘응원 보기’를 하나의 링크로 묶는다. actual의 실제 대상 선택기는 유지하되 접근 가능한 label을 시각적으로 숨기고 이미지/선택기를 한 행에 두어 과도한 높이를 줄인다. 이미지 contain 및 데이터별 차이는 유지하며 preview CSS로 실제 문제를 가리지 않는다.

이벤트의 중복 그룹 h3는 제거하고 aria-label 영역과 각 행의 분류/모임명을 유지한다. 행은 border-box 최소100px(모바일96px),상하16px,간격16px/12px;제목18/26px·모바일16/24px. 이미지80×60px/64×48px 칸에 fallback 아이콘도 맞춰 본문 시작선을 통일한다. 실제 긴 문구는 자르지 않고 줄바꿈한다. API/포인트/교환/권한/목적지/독립 페이지네이션은 변경하지 않는다. 근거 work/local-team-20261103/tasks/UI-016/result.md, 운영 검증 아님.

UI-009 (2026-11-03): 게시판 CompactFeed의 제목/댓글수 행은 chevron·inline 펼침 없이 원래 글 ID 상세로 이동한다. cheer는 source=cheer로 기존 상세의 권한검사 원문 읽기/댓글을 사용하며 fan_post로 변환하지 않는다. 제목은 원문 첫줄, 본문은 원문 그대로; 기존 상세 타입·returnTo·키보드 링크 동작 보존.

### UI-010 팬페이지 제목 별

> 2026-11-07 Q1로 대체됨: 머리의 별은 `FanStarAction` 하나다(팬페이지는 팬 인증, 취미·브랜드·모임은 가입). 아래는 당시 기록이다.
- 팬페이지 제목 옆 별은 해당 slug의 기존 `/c/[slug]/verify?locale=…` 팬인증 진입 링크이며 접근 가능한 이름은 기존 번역 `팬 인증`을 사용한다. 북마크 여부를 인증완료 표시로 사용하지 않는다. 로그인·이미 인증·퀴즈 없음 처리는 기존 QuizEntryScreen 정책을 따른다. 브랜드 제목 별 및 메뉴의 북마크 기능은 보존한다. 기존 별 크기22px/버튼 스타일을 재사용한다.

### UI-012 회원·랭킹 탭과 프로필 보기
- CreatorGroupHeader와 GroupDetailScreen의 회원·랭킹은 캘린더 바로 다음 동일 navigation 링크다. 기존 `/pages/groups/{id}?locale=…&tab=members` 및 returnTo 처리, 하위 회원/내 친구/팬랭킹 상태를 보존한다. 우측 별도 회원 버튼은 제거하고 메뉴는 유지한다. 1023px 이하 해당 nav는 탭이 한 줄 폭을 넘으면 가로 스크롤하며(아래 팬페이지 탭 규칙) 선택 탭은 기존 aria-current/브랜드 underline을 사용한다. 회원·랭킹 탭 라벨은 es·id·vi·pt·fr·ru에서 390 기준 원문구가 탭 폭 358px을 넘어(367~409px) 줄인 문구를 쓰고, 랭킹은 목적지 화면 안에 있다. en은 원문구를 유지한다.
- GroupMembers의 프로필 보기 affordance는 행 전체 Link 안의 span이며 중첩 버튼을 만들지 않는다. 기존 `fanActionClassName('neutral')`를 재사용해 중앙정렬/line-height1.2를 공유하고,44px 높이·가로12px padding·8px gap·18px chevron·내용기반폭을 적용한다. 기존 모바일 축약 `프로필`과 긴닉네임 줄바꿈을 유지한다. 국소 렌더 측정: PC약115.65px/모바일88.30px 폭, 모두44px 높이/16.8px 줄높이.

### UI-018 · 전환 조회 / 응원 연결 체크포인트
전환 preview의 받을 응모권은 한개선택 select 대신 기존 Kyaa 공식 응모권 고정라벨이다. 기본 사용자진입의 잔액/비율/계산은 wallet GET의 검증된 schema값으로 표시하고 실패를0이나성공으로 바꾸지 않는다. 명시한 ticket/heart 오류 node는 원래시안을 유지한다. 광고 성공/차감은 만들지 않으며 재조회만 수행한다. 응원 진입은 WalletSupportDialog를 재사용하며 actual의 선택 slug 또는 preview nchive를 명시적으로 전달한다. href deep-link는 유지하고 수정키 없는 primary activation만 모달로 연다. 기존 OwnedWallet의 ownerKey+slug 상태경계/auth/receipt를 재사용한다. 공통 accessible-overlay Dialog는 폭min(100%,560px),높이최대calc(100dvh - 32px),흰배경/radius16px/padding24px·모바일16px와 focus trap/Escape/지연초점복귀를 사용한다. 로컬초안은 합성·제안·운영미반영 disclosure이며 공통 Dialog를 사용한다. 390px에서 하트 전환 CTA를 가린 fixed 배치는 폐기한다. 로컬초안 trigger는 content와 footer 뒤 provider 끝에 단일 인스턴스로 두는 normal-flow end chrome을 사용한다. 헤더 앞 삽입 및 행동 위 고정 겹침을 피한다. 현재 main.tsx의 해당 순서는 소스로 확인했으며 최종 통합 캡처는 checks 검증 대상으로 남긴다.

### ARCH-001 · 두 공통 레이아웃 계열 (2026-11-03, implemented / acceptance pending)

인물(셀럽·크리에이터)은 팬페이지이며 모임이 아니다. 팬페이지끼리는 하나의 공통 팬페이지 구성을, 취미·브랜드 모임끼리는 별도의 공통 모임 구성을 사용한다. 두 계열을 하나의 시각 레이아웃으로 강제하거나 개별아티스트/모임별 마크업을 복제하지 않는다. 실제 데이터·기능가용성·가입/접근권한 차이는 보존한다.

backend 구현체크포인트 기준: 검증된 kind=fan + celebrityId + 유효slug + 일치하는 published non-brand 인물은 기존 CreatorGroupHeader/CreatorGroupHome/CreatorBoardAside/FanPostFeed를 사용한다. 미확인/불일치 연결은 오류 상태이며 generic 모임 헤더로 대체하지 않는다. 취미·브랜드는 기존 GroupDetail 모임 identity/권한 경계를 유지한다. 이름 매칭·전체ID route blanketredirect 금지.

기존 creatorPage의 흰색/padding-top32px/min-height70dvh,제목24px·avatar64px(모바일20px·52px),nav44/56px 규칙과 PC312px sidebar·모바일 schedule/verification 적층을 재사용한다. 새로운 색·타입·크롭은 도입하지 않았다. UI010 팬인증별·UI012 회원탭/프로필정렬·UI009 원래cheerID/source 계약을 보존한다. legacy tab/room/post/month/returnTo와 원래membership detail/API scope/가입동작을 유지하며 legacy group post를 cheer/fan_post로 재해석하지 않는다. 실제 GroupMissionsOverview의 fan은 검증된 GroupActivityHeader를 사용한다.

검증상태: backend의32개국소검사·canonical Elina/NCHIVE390/1440 근거를 재사용한다. 해당근거는 로컬합성 데이터이며 운영검증이 아니다. ID-route의 회원도착은 fixture identity불일치로 오류 상태이며 preview adapter연결·변경된 ID-route390/1440/auth/back/room/member/calendar 검증 및 coordinator 디렉터리분류가 남았다. ARCH-001 전체완료/전체 DESIGN 준수 완료로 간주하지 않는다. main/pencil/legacy adapter는 checks 직렬소유 인계 대상으로 조정했다. 근거 tasks/ARCH-001/design-proposal.md 및 preview-blocker-evidence.md.

ARCH-001 최신 사용자 확인: 두 공통 계열은 최종 목표 계약이며 전체 구현 완료를 뜻하지 않는다. 현재 canonical brand /[slug]의 CelebrityFanPage/CreatorGroupHeader 사용과 generic brand/hobby 헤더 CSS 차이는 backend의 남은 모임 계열 통합 범위다. 해당 경로의 최종 source 및 각 계열 390/1440 근거 확인 전 공통 모임 레이아웃 적용 완료로 표시하지 않는다. coordinator 디렉터리 인계는 별도 pending을 유지한다.

### UI-015 · 확정 캡슐 영상 연결 (2026-11-03, local only)
MEDIA-001의 실제 WebM/MP4 및 poster를 공통 CapsuleReveal에서 사용한다. 서버 확정 receipt 이후에만 muted/playsInline/no-loop로 한 번 재생하며 ended는 기존 TaskPanel 결과모달로 이어진다. 영상은 width100%/max-width480px/aspect-ratio1/object-fit contain/radius12px로 전체 기계를 보존한다. 원본의 불투명 웜그레이 배경은 영상 내용이며 새 CSS 회색 면이 아니다. play 거부/미디어 오류/10초 미완료에는 정지 poster와 기존 결과 바로 보기 행동을 유지하고, reduced-motion은 재생 없이120ms 후 같은 확정결과를 표시한다. skip/닫기/재열기는 새draw를 실행하지 않으며 기존receipt/idempotency/계정경계를 유지한다. 하단 경품·확률·기록 분리와 사전고지는 유지한다. actual/preview390·1440에서 실제 WebM decode/currentTime/ended→모달/Escape복귀를 확인했다. 브라우저별 MP4 자동대체의 전기종 검증을 뜻하지 않는다.

### ARCH-001 · 등급/탭 및 모임 공통 구성 추가 체크포인트
backend 최신 design-proposal의 구현·국소검증 근거를 반영한다. 사람 팬페이지의 CreatorFanGrade는 인증된 owner-scoped `/api/me/summary?locale=...&tierStages=1`에서 현재 slug의 passport만 사용한다. 기존 FanTierBadge/stage/level 표기를 재사용하며 badge24px,글자13/20px,gap8px,링크최소44px,줄바꿈을 적용한다. 복원중/guest에는 이전개인등급을 노출하지 않고 loading/error/retry를 구분하며 passport가 없으면 기존 인증링크로 연결한다. 헤더 Silver와 방 입장요건 Gold는 서로 다른 데이터이며 요건으로 개인등급을 추론하지 않는다.

팬페이지 탭은 gap0, 높이56px이다. 1024px 이상은 동일5열(1440 실측 전체600px/각120px, 좌우padding 12px)이고, 1023px 이하에서 탭이 한 줄 폭을 넘으면 줄바꿈 없이 가로 스크롤하며 모바일 좌우padding은 8px이다(2026-11-04 갱신, 이전 5열 균등·4px 실측 대체). 이전 calendar만의74px/43px·탭별offset 규칙을 팬페이지 계열에서 대체한다. 모임 계열에 팬페이지 스타일을 강제하지 않는다. 관련 room/month/board 필터·returnTo·원래 회원ID 경로 보존 및 hash-jump 제거/Link scroll=false는 적용된 계약이나, 이것만으로 문서reload 방지가 검증된 것은 아니다.

모임 계열은 GroupIdentityHeader를 hobby/brand GroupDetail 및 canonical brand 헤더에서 재사용한다. 구현된 geometry는 avatar64/radius16·모바일48/radius12,제목28/39·모바일20/28,gap20/12,동일5탭높이56px/padding12·4px다. 공유 content grid를 사용하되 브랜드 원래 event/news와 취미 intro/board/info,가입·질문·권한·실제내용 차이는 유지한다. backend의 header7/detail11 국소검사 및 ID003/004390·1440 관찰 근거를 재사용하며 여기서 재실행하지 않았다.

미완료: room→board에서 performance.timeOrigin 변경/documentReloaded=true가 관찰되어 persistent shell은 통과가 아니다. checks preview router와 assets canonical CelebrityFanPage 바깥구성/회원query 통합 후 최종 두계열390·1440/access/back/room/calendar 검수가 필요하다. auth=off NCHIVE fixture의 방 ‘대화 보기’ 노출은 fixture권한정합성 과제로 남기며 실제API권한 우회를 허용하지 않는다. 이 체크포인트는 전체 ARCH 완료·운영계정검증을 뜻하지 않는다. legacy Elina002 resolver/activity1검사는 별도 최신 arch-identity-contract-pass.md에서 통과하여 과거 대기문구를 대체한다.

UI-018 직접 응원 경로 보완: `/my/wallet?view=support&creator=...`는 최소 공통 shell·제목·해당 creator 복귀 링크 위에 기존 WalletSupportDialog 하나를 연다. 닫기/Escape는 해당 creator board와 locale로 replace하며 브라우저 Back은 기존 history로 복귀한다. CreatorBoardAside의 일반 primary 진입은 현재 board 위에 같은 dialog를 열고 URL·본문을 유지하며 닫을 때 원래 trigger에 초점을 돌린다. 원래 href와 수정키/new-tab 동작은 보존한다. 공통 OwnedWallet의 인증·대상·요청·receipt와 기존 모달 크기를 재사용하며 별도 transaction/CSS 규칙은 추가하지 않는다. checks의 직접경로·맥락진입390/1440,키보드·Back 및 wallet14tests/호출부1test 근거를 재사용한다. 합성데이터이며 실제전송·광고검증·운영반영을 뜻하지 않는다.

UI-018 최종 notice 실측/소스 동기화: compact trigger의 wrapper는 flex/end 정렬,padding8px 16px,margin-bottom calc(80px + safe-area-inset-bottom)이며 position:fixed를 쓰지 않는다. main provider 안 content/footer 뒤 단일 인스턴스인 END local chrome 계약을 유지한다. checks의 shared3128 1440 정상모달/키보드와390 의도오류503/retry·무넘침,기존390/1440 안내겹침없음 근거를 재사용한다. preview 요약 hearts35와 wallet-backed support hearts2는 현재 서로 다른 합성입력으로,표면상 잔액 일관성 미해결이며 실제잔액으로 주장하거나 임의로 병합하지 않는다. 교환footer는 GET 재조회만이며 API002 광고/서버gate/실제exchange 완료가 아니다.

UI018 잔액 정합성 보완: 기본 Pencil benefits 요약의 points/tickets/hearts/pointCost는 지원모달과 동일한 기존 `/api/me/wallet` 응답을 walletSchema로 검증해 표시한다. 로딩/조회실패에는 원래고정값·0잔액으로 대체하지 않고 상태/재시도를 제공한다. wallet-changed 이벤트에 재조회하며,명시적 ticket/heart 오류 source node의 고정시안만 보존한다. 390/1440 공유로컬에서 요약2하트와 지원모달2하트가 일치함을 확인하여 앞선 기본화면35/2불일치는 해소했다. 정책/fixture잔액을 임의수정한 것이 아니다.

### DATA-001 · 관리형 캐러셀 원본 비율 (로컬 구현 완료)
DiscoveryCarousel은 등록된 desktop/mobile URL·원본alt·자연크기를 보존하는 단일 responsive picture를 사용한다. PC 기존960×480 slide 안에서 정사각 WeNa480×480 원본은480×480 이미지와 copy열로,가로형 NCHIVE1638×819 원본은960×480 및 기존하단copy로 표시한다. 모바일/768은 등록모바일원본을 사용하여 WeNa2560×1890→300×221.484375,NCHIVE704×880→300×375로 비율을 유지한다. cover crop/비율왜곡/모바일배경중복을 만들지 않는다.

track의 slide는 같은높이로 stretch(KO실측552px)하여 전환시 높이변화를 방지한다. 짧은이미지 아래 더큰흰copy영역은 의도된본문영역이며 이미지letterbox가 아니다. NCHIVE 모바일 하단어두운영역은 원본source-1-mobileImage.webp 내용으로 보존한다. 옆slide부분노출은 기존동작이고 inactive/inert이며 활성원본전체는 보인다. URL·문구·순서·featured선정/랭킹 변경은 이프레이밍계약에 포함하지 않는다.

backend DATA-001 완료인계 근거: 원본4이미지와 양slide KO390/768/1440,EN390/1440 settled캡처 직접검수,WeNa4명/NCHIVE6명·WELCOME보존. 초기resize과도기캡처는최종근거아님. pause/dot/arrow와Next Enter 활성slide변경,국소5tests/crop-tests.log 및diff PASS. 기존source-equality/link-identity 근거재사용. layout은문서동기화만수행하며동일브라우저·검사를반복하지 않았다. 로컬3128의관리형home데이터/합성directory검증이고운영반영이 아니다. 사용자최종시각판단은남으며 ARCH/UI014 완료를뜻하지 않는다.

### ARCH-001 · 디렉터리 두 계열 분류 구현
coordinator의 정확한 인계 후 backend가 구현한 디렉터리는 인물 팬페이지를 독립 계열로 표시하고 취미/브랜드는 모임 계열의 구분된 필터로 표시한다. featured/browse/owned sidebar의 제목·메타데이터도 같은 분류를 사용하며 혼합목록의 오류/빈상태는 사람을 모임으로 통칭하지 않는다. 원래 이름·groupHref검증연결·query/API/검색/정렬/페이지네이션은 보존한다. featured는 기존 전체인기순 첫3개/기존순서이며 계열별3개나 새랭킹으로 바꾸지 않는다.

모바일에서는 검색/정렬을 계열필터 아래로 배치하고 취미/브랜드 버튼을 중첩overflow로 압축하지 않는다. 기존역할필터스크롤은 유지한다. backend directory-tests.log1PASS 및 실제로컬 fan→brand→hobby 필터2/1/17·390/1440최종캡처 근거를 재사용한다. 수치는해당합성fixture관찰이지운영건수가 아니다. 초기HMR/stale refs캡처는최종근거에서제외한다. 배너재작업/데이터재등록/순서변경없음.

디렉터리 소유인계 대기는 해소되어 이전pending문구를 대체한다. public/artistidentity adapter도 최신별도검사근거로완료됐으나 canonical member/query 지속구성,canonical brand바깥구성 및 변경경로/access/back최종검수는별도추적한다. UI014개인최근페이지네이션은 이분류작업완료에 포함하지 않는다. 전체ARCH/운영반영완료아님.

UI014 로컬 구현: 가입한 페이지 사이드바의 최근 방문순은 현재 인증 사용자의 기록된 group_presence.seen_at 내림차순이며 기록이 없는 페이지는 뒤에, 동률은 페이지 ID 오름차순으로 둔다. 접근 가능한 가입 페이지만 포함하고 없는 시간은 만들지 않는다. 한 번에 3행과 기존 중립 스타일의 최소44px 이전·다음 제어를 표시한다. 서버 opaque cursor를 그대로 사용하고 소유자 변경이나 새로고침 시 커서를 초기화하며 클라이언트에서 임의 정렬하지 않는다. 방문 기록이 갱신되는 실시간 순서는 고정 snapshot이 아니다. 합성 390/1440 화면·페이지 이동과 390 오류→키보드 재시도·빈 상태, 국소 6 tests 및 backend route 25 tests와 격리된 함수 체인 근거를 재사용한다. 실제 로그인·서비스 간 실시간 연결·운영 데이터·성능은 미검증이다.

오늘 주목의 로컬 순위 계약은 KST 당일 인증된 고유 heartbeat 사용자 수를 우선하고, 동률은 공개 유효 게시물 수·생성시간·ID 순으로 정한다. 비활성 계정과 artist binding은 방문 집계에서 제외하며 공개 가능한 페이지의 첫 3개만 사용한다. 카드의 기존 memberCount는 회원 수로, 오늘 방문이나 게시물 수가 아니다. 전체 웹 방문자·실시간 접속 또는 개인 최근 방문 순위로 표현하지 않는다. 원본 visibility 함수 체인을 일부 합성 schema에 연결한 로컬 검증 근거다. 별도 실제 GroupDirectory 합성 하네스에서 390/1440의 세 카드 순서·원본 합성 ID 링크·키보드 초점과 가로 넘침 없음을 확인했다. 필수 DTO placeholder는 실제 회원 수나 활동 수가 아니며 하단 일반 목록 검증도 아니다. 실제 DB 적용·운영 인증·성능·운영 데이터 순위 화면은 미검증이다. 공유 로컬 fixture의 의도된 503에서는 영역을 유지하고 기존 오류 안내와 최소44px 재시도 행동을 표시한다. 로딩과 명시적 빈 상태도 구분하며, 390/1440 오류 화면 및 국소 4 tests를 확인했다. 테스트의 재시도 복구는 mock rerender이며 실제 네트워크 복구와 정상 서비스 200 화면의 증거는 아니다.

### UI020 · 디렉터리 페이지 개설 신청 맥락 모달 (승인 계약 / 최종검수 진행중)
디렉터리의 팬페이지 개설 신청 및 취미·브랜드 페이지 개설 신청은 기존 TaskPanel을 재사용하는 맥락모달로 연결한다. PC폭800px/max-width viewport-32px,radius16px,header76px,본문padding24px. 모바일390px에서는fullscreen/본문padding16px/내부스크롤/고정제목·기본하단행동80px를 사용한다. 이값은 사용자승인계약이며 최종렌더실측완료를뜻하지 않는다.

첫 화면은 이름·소개 두 필수 입력을 우선한다. 팬 신청은 유형 선택 없이 fan으로 고정하고 취미·브랜드는 기존 두 종류 선택을 유지한다. 사진·가입 질문·운영자 자격 자료는 선택 details에 두며 summary는 최소44px과 focus 표시를 유지한다. 장문 qualification은 같은 창의 기존 필수 근거 폼과 하단 행동을 재사용하고 단계 전환 중 기본·증빙 초안을 보존한다. 기존표준검증/API/승인정책을변경하지 않으며 성공receipt확인후만접수상태를표시한다. Escape/닫기/browserBack은기존sourceDiscardConfirmation으로동일dialog안에서확인하고 중첩모달을추가하지 않는다. focus trap/복귀/body scroll lock은TaskPanel소유이다. 기존독립direct routes와수정키링크동작을보존한다.

새CSS는group-application-dialog.module.css에한정하고 input border-box로내부넘침을방지한다. shared TaskPanel/groups CSS는변경하지 않는다. 로컬 API double의 초기 화면 390/1440과 자격 단계 화면 390/1440, 관련16tests를 확인했다. 자격 단계 왕복과 이전 입력·자격 초안 보존은 390과 1440에서 확인했다. 1440은 합성 API double에서 키보드 Enter로 이전·재진입 및 하단 초점을 확인한 근거다. 실제 신청·업로드·자격 상태 조회·운영 데이터 검증이나 배포를 뜻하지 않는다.

### UI021 · 지갑 초기 로딩 (로컬 부분 구현)

WalletScreen과 공통 응원·출석 모달은 인증 준비 및 지갑·응원 대상·이력의 최초 조회에 해당 화면 형태의 skeleton을 사용한다. 상태는 이름 있는 role=status/aria-busy, 장식은 aria-hidden이며 reduced-motion에서는 애니메이션을 끈다. 기존 값이 있는 재조회는 내용을 유지하고 로딩·인증·오류·빈 상태·영수증을 구분한다. PC 지갑의 사이드 placeholder는 독립 지갑에만 두고 모달에는 넣지 않는다. 숫자나 인위적 지연은 만들지 않는다.

로컬 합성 gate에서 지갑·응원·이력·출석의 390/1440 초기 로딩과 기존 성공·오류 경로를 확인했고, 출석 오류 후 키보드 재시도도 확인했다. 출석 모달 CTA와 닫기 버튼은 검증한 두 폭에서 최소44px 이상이다. 브라우저 reduced-motion에서 각 skeleton과 장식 및 가상 요소의 애니메이션이 꺼짐을 확인했다. 수정 후 응원 모달의 로딩→실제 내용은 390/1440 모두 상단 차이 0.75px·높이 차이 1.5px이며, 1440 지갑의 첫 잔액 면 placeholder와 실제 면은 모두 top 211px이다. 빈 이력은 섹션이 약116.4px 줄어드는 내용을 그대로 유지한다. 이 좌표 차이는 CLS 측정이 아니며, 항목이 있는 이력의 이동·실제 스크린리더·다른 언어의 긴 문구는 미검증이다. 전체 UI021 완료나 운영 검증을 뜻하지 않는다.

### UI021 · 덕질 초기 로딩 (부분구현, local)
GroupBenefitsScreen의 자산요약/이벤트 원본/응원대상 최초조회는 기존 benefit skeleton의 oklch(94% 0 0),radius6px,1.4초 pulse 표현을 역할 geometry에 맞춰 사용한다. wallet은 PC3열·모바일 point후2열,이벤트는 각 source당 이미지80×60/모바일64×48과 텍스트행,응원대상은48×48/모바일32×40 placeholder다. 시각요소 aria-hidden,상태는 role=status/aria-busy+기존 locale loading명칭이며 reduced-motion에서 animation없음. 이미 수집한 목록이 있는 다음페이지 로딩에는 내용을 유지한다. auth/empty/error/retry·실제값·원래전환정책을 보존하며 placeholder 숫자/인위적지연을 만들지 않는다. 이 회색은 조회중에만 나타나는 skeleton 상태이며 덕질 기본배경에 회색면을 추가하지 않는다.

actual local synthetic fixture390/1440 loading·ready·error 캡처/14tests 및 마지막변경 영향1test를 확인했다. browser state들은 별도fixture 방문이며 같은화면 지연→응답 전환은 자동test에서 확인했다. fixture는 public creator를 지연시키지 않아 응원대상 skeleton 실브라우저는 미검증. UI021 다른소유범위/전체완료·운영반영 아님.

### 팬등급 위치·배너 표면 경계 (post-snapshot 부분 검증)
사람 팬페이지의 기존 owner-scoped exact-slug CreatorFanGrade는 제목·설명 stack에서 분리해 우측 creatorUtilities의 SNS 링크 위에 둔다. creatorUtilities는 flex column/gap8px,모바일 actions는 height:auto/min-height44px이고 유틸리티는 유연하게 흐른다. guest/unknown/검증링크·기존 SNS/가입/탭/identity 계약은 유지하며 구체적인 재검증은 아직 남는다. 사용자 전역 원칙: 하나의 컴포넌트에 독립 정보·행동 셋 이상을 단일 목록으로 몰지 않고 의미별영역으로 나눈다. 기존 기능 삭제나 전사이트 일괄변경을 뜻하지 않는다.

관리형 discovery slide는 기존 radius20px에 inset 1px solid #e4e1e6 outline으로 artwork와 흰 copy를 하나의 배너 surface로 구분한다. 원본 responsive URL·비율·얼굴·내장문구·CTA/controls를 보존한다. backend scoped header/carousel12tests 및 모바일경계·양크기 grade 캡처 근거를 재사용한다. desktop배너 캡처는 viewport resize 직후 모바일원본이 남아 유효근거가 아니므로 settled reload 후 재확인 필요. guest/unknown·긴문구도 변경범위 검수 대기이며 grade 캡처에는 기존 source-error alert가 보인다. 전체 시각완료/운영반영을 뜻하지 않는다.

팬등급/SNS 정렬 후속: creatorUtilities는 align-items:flex-end/gap8px로 등급과 SNS 행의 오른쪽 기준을 맞춘다. 합성 harness의 390/1440 영어 Platinum 4, unknown 인증 링크, guest 등급 숨김에서 오른쪽 차이 0px, SNS 링크 각각 44×44px 및 가로 넘침 없음을 확인했다. 다른 언어의 가장 긴 등급과 실제 계정은 미검증이다. 접속 현황을 불러오지 못할 때는 기존 meta 역할의 13px/1.5/#5d5d5d 짧은 role=status 문구만 표시하고 숫자·아티스트 접속을 추정하지 않는다. 일시적 GET 실패는 한 번 재시도하며 인증 오류·abort·명시적 transport 미설정은 반복하지 않는다. 기본 `/nchive?locale=ko`의 로컬 transport 미제공503에서는 390/1440 상태 화면을 확인했으나, 실제 인증 transport 연결·성공은 미검증이다. 기존 API001 guard/인증/권한을 우회하거나 허위인원을 표시하지 않는다.

### UI011-D · 공유 전체 달력 compact 구현 (이전 구현 기록)

아래는 이전 공유 전체 달력 compact 구현의 기록이다. 현재 사이드카드는 문서의 최신 embedded mini 계약을 따르며, 아래 전체 달력 검증을 mini 카드 증거로 사용하지 않는다.
사이드 일정카드는 기존 CreatorGroupCalendar→GroupCalendarPanel→LiveCalendarScreen 실제공유달력을 항상 compact 표시한다. 공유 CalendarArt 높이는 PC165px/모바일130px,월 헤더와7열 날짜 grid를 사용하며 day min-height44px이다. 크기조절은 CSS로 처리하고 버튼에 transform 축소를 적용하지 않는다. 기존 실제 group/artist LIVE source·KST·선택월·이벤트 상세 및 선택월이 담긴 전체달력 링크 하나를 유지한다. 샘플일정이나 접기토글을 추가하지 않는다. 초기 identity/page 로딩에는 기존 live catalog shimmer를 재사용한 grid-shaped accessible status skeleton과 reduced-motion을 제공하고 오류·재시도는 별도 유지한다.

assets의 scoped8tests/lint/diff, 로컬합성390/1440 정상이미지·다음월→전체달력 월 유지 및 controlled resolver loading→success/503 alert→retry 근거를 재사용한다. 합성 harness는 실제 CreatorGroupCalendar를 가져오며 지연은 검증용으로만 제어한다. 오류에는 기존 alert와 재시도 행동을 표시한다. 44px은 날짜셀 최소 **높이**이며 아래 실제 폭·높이 검증을 함께 적용한다. 실제 운영일정 검증 및 운영반영을 뜻하지 않고, 이전 실패한 자체 탭의 정리 여부는 확정하지 않는다.

UI021 덕질 추가검증: 전용 local creator GET gate를 수동해제해 실제컴포넌트390/1440의 응원대상 skeleton→선택기 전환과 viewport 넘침없음을 확인했다. 390 합성503→기존 retry→성공도 확인. 최종390 이벤트 source당 placeholder1행 캡처 확인으로 직전 creator시각/최종행수 미검증 문구를 대체한다. 실제screenreader 및 다른owner화면은 별도다.

UI011-D 최종근거 동기화: compact loading skeleton은 art 높이130px/radius12,월 placeholder 폭50%·높이32px,7열 gap8px·cell 높이36px/radius8; full은 art180px/cell80px이며 status/aria-busy 및 reduced-motion을 유지한다. 기존 live shimmer의44px override 충돌을 소유자가 수정한 이후의 실측값이다. assets controlled 합성 resolver의390/1440 loading→success 및 503→retry→success 근거가 직전 미검증문구를 대체한다. 최종 실제 shared3128 화면에 보이는 날짜버튼30개 전수 실측에서390 최소46.28×46 CSS px,1024/1440 최소44×44 CSS px이며 가로넘침0으로 프로젝트 필수44×44를 충족한다. compact 전용으로 기존 margin-left:32%와 header margin/max-width/size를 보정하고 calendar margin-inline을 0으로 하여 1024의 월헤더 offset을 수정해 이전/다음 월 버튼 모두44×44로 viewport 안에 표시되며 다음월 클릭→12월을 확인했다. desktop 1024px 이상 rail은342px이며 이전312px rail·39.71×43 실측 및 40px min-height 미달 판정을 대체한다. transform 축소없음. 정상이미지와 다음월/전체달력링크는 기존근거 재사용. 모든근거는 로컬합성,post-DEV snapshot 변경이며 운영검증이 아니다.

### UI011D 이전 복원 기록 · 공유 전체 달력 compact (현재 mini 카드 아님)
CreatorScheduleCard는 기존 CreatorGroupCalendar→GroupCalendarPanel→LiveCalendarScreen compact를 다시 사용한다. 기존 group/artist source·slug/identity/locale/KST·loading/error와 단일 전체달력 링크를 유지하며 선택월을 링크에 전달한다. 샘플행·접기 토글은 없다. 직전 CelebrityMiniCalendar 사이드카드 및 선택월 reset 미완료 상태는 최신 복원으로 대체됐다. 소유자는 자신의 카드·테스트 변경만 복원했으며 다른 공유 달력/art/rail dirty를 되돌리지 않았다.

assets의 복원 후 card1test·실제3128 390/1440 날짜30개 전수(최소46.28×46 및44×44,가로넘침없음)와 동일 복원 구현의 기존8tests·controlled loading/error/retry·1024 월 이동·선택월 전체링크 근거를 재사용한다. 합성 로컬 fixture이며 운영 일정·배포 검증이 아니다. 이전 불명확한 소유 탭 정리 여부는 확정하지 않는다.

### UI011D 최신 현재 카드 · embedded mini (post-DEV snapshot / 로컬 범위 검증)
최신 지시에 따라 CreatorScheduleCard는 기존 CelebrityMiniCalendar를 creator·locale과 embedded로 즉시 렌더한다. 샘플행·접기 toggle 없이 기존 전체달력 링크 하나를 유지한다. 390/1024/1440 실제 월 이전·다음 버튼은 각44×44·viewport 내부,가로넘침0으로 관찰됐다. 별도 controlled harness의 명시적 합성 이벤트 날짜 버튼은342px 카드에서390/1024/1440 모두44×49px,넘침0이며 Enter 선택을 확인했다. 실제 운영 이벤트를 뜻하지 않는다. 실제 컴포넌트의 로딩 status와 장식 skeleton bar는 max-width180px/height16px/radius8px이며,오류 alert의 retry는 최소높이44px·focus ring을 사용한다. 합성 test-only gate로390/1440 loading→503→retry→success를 확인했고 제품 지연을 추가하지 않았다.

mini의 기존 onMonthChange callback으로 선택월을 단일 전체달력 링크의 month 쿼리에 전달한다. 로컬 실제 12월 선택 후 `/nchive?tab=calendar&locale=ko&month=2026-12` 도착과 scoped callback/link 1test를 확인했다. 이전 공유 전체달력 compact의 날짜30개·로딩 검증은 현재 mini 카드의 증거가 아니다. 기존 공유 calendar/art/rail 변경은 다른 실제 사용처를 소유자·release writer가 추적할 때까지 보존한다. post-DEV snapshot 로컬 합성 검증이며 운영 일정·배포를 뜻하지 않는다.

### UI022 · 팬 인증 목록 카드 (부분 구현, 로컬)
기존 CertificationPanel의 공개 인증 목록은 API가 제공한 kind/category/title/description/actionHref만 표시한다. 인증 가능한 전체 카드 링크는 최소높이152px,기존흰배경/radius16px/padding20px와 동일 정보순서를 유지하고 keyboard focus-visible 3px #d11b62 outline/offset3px을 제공한다. 선택을 새로 저장하는 UI나 임의 인증종류·단계를 만들지 않는다. 로그인 소유자의 기존 `/api/me/celebrities/:slug/certifications` 응답을 strict historyItemSchema로 검증하고 같은 kind+missionId의 최신 제출상태만 각 카드에 표시한다. 승인(ko 인증 완료),pending(검토중),rejected(반려)를 구분하며,인증준비/게스트/계정·slug 변경에서는 이전 owner 상태를 재사용하지 않는다. 개인 이력조회 실패는 기존 오류/재시도 표현이며 완료로 바꾸지 않는다. 원래 공개 availability/actionHref/퀴즈·제출 경로와보상을 변경하지 않는다.

2026-11-03 공개 NCHIVE 인증 목록의 Official Fan 퀴즈 1개를 소스 기반 로컬 fixture로 확인했으며, 다른 시점·인물의 종류나 개인 자격을 일반화하지 않는다. NCHIVE 개인 이력 fixture의 503은 오류·재시도로 표시하고 승인이나 미승인으로 추정하지 않으며 공개 목록을 지우지 않는다. 기존 인증 패널의 합성 390/1440 승인·초점, pending/rejected/error/loading/guest·긴 제목 및12tests 근거를 재사용한다. 팬 sidebar/mobile 인증 카드는 기존 certifications 탭으로 연결되며 390/1440 키보드 이동과 locale·returnTo 보존을 로컬에서 확인했다. 별도 통제된 guest hook을 사용하는 실제 sidebar·패널 하네스의 1440에서는 원래 href로 Enter 이동 후 공개 퀴즈·로그인 안내와 Back/Forward를 확인했고 개인 이력 GET은 없었다. 공개 목록 503→Enter 재시도는 별도 390 패널에서 확인했다. 공유 환경의 기존 auth shim 이동 연속성, 390 게스트 sidebar 호출부와 실제 개인 이력은 미검증이다. 실제 계정 인증·업로드·운영 데이터/배포 검증이 아니다.

UI011D mini 카드 배치 보완: 제목과 선택월을 전달하는 단일 전체달력 링크를 상단 header에서 좌우 배치한다. header flex gap8px,링크 text12px/padding8px/min44×44px,360px 이하는 wrap이며 기존하단 중복행동과 겹친화살표는 제거한다. 실제 KO390/1024/1440 링크96×44px,EN390 100.02×44px·넘침0. embedded 기본일정 목록의 중복 제목은 선택일이 없을 때만 숨기고 선택일 제목·이벤트/빈상태는 유지한다. 목록 gap4px/padding8px,데이터·KST/오류/재시도는 변경하지 않는다. assets card1test·390 다음월→Enter 전체링크의 month 유지와 정상캡처,기존mini 로딩/이벤트 검증을 재사용한다. 360px 이하 wrap과 영어 외 긴번역은 실제 브라우저 미검증; 합성 데이터/post-DEV snapshot이며 운영반영 아님.

### 팬페이지 이야기 헤더 (2026-11-03, 로컬 후속)

`CreatorGroupHome`의 이야기 제목, 기존 필터와 전체 보기·글쓰기 행동을 하나의 헤더로 묶는다. 데스크톱에서는 한 행에 배치하고, 1023px 이하에서는 제목 아래 도구 영역이 줄바꿈하며 모바일에서도 필터와 행동을 숨기지 않는다. 기존 필터 상태·링크·권한을 유지한다. 로컬 합성 화면의 390/1024/1440 캡처와 390/1024의 44×44px 이상 제어 영역, 1024 키보드 필터 동작 및 관련 테스트 1건은 backend 근거를 재사용한다. 이 변경은 DEV001 스냅샷 이후이며 운영 검증이 아니다.

### 덕질 교환·응원·추첨 구성 (2026-11-03 로컬 작업 중)

기존 흰 지갑과 자산 아이콘 선행 순서를 유지한다. 그 아래 교환 행동은 반경16px의 하나의 흰 경계 안에 사용 가능 포인트와 응모권·하트 선택, 검증된 비율 및 단일 행동을 묶고, 다음에 전체 너비 응원과 럭키드로우 캠페인 카드 순서로 둔다. 덕질의 포인트 이벤트 섹션과 해당 mission 목록 요청은 제거하며 다른 미션 화면·API는 유지한다. 응원은 기존 공개 창작자 데이터 순서의 48px 원형 이미지·이름을 native radio로 하나 선택하며 선택 윤곽과 체크는 선택만 의미한다. PC는 대상과 수량을 두 열로, 모바일은 쌓아 배치한다. 기존 Base UI 단일 thumb slider와 정확한 숫자 입력을 함께 사용한다. 범위는 1부터 실제 wallet 잔액과1000 중 작은 값까지이며 잔액0은 입력 비활성, 잔액1은 slider 비활성이다. thumb 44×44px·현재값 말풍선과 기존 브랜드 강조를 사용한다. 기존 지갑 확인 모달로 선택 수량을 전달하고 wallet GET과 모달에서 각각 확인한다. 원래 수정 클릭용 링크, 개인 상태·오류·기존 전환 경로를 보존한다.

럭키드로우 카드는 기존 캡슐 진입과 API의 실제 캠페인을 구별해 표시한다. 카드의 기존 이미지·제목·상태·기한·원래 링크를 유지하고 API에 없는 경품·수량·비용은 만들지 않는다. 사용자가 승인한 카드 내부 색상 예외로 캡슐은 연한 노랑, 캠페인은 연한 분홍 프레임을 사용한다. 주변은 흰색이며 768px 이상 2열, 그 미만 1열이다. 이미지 최대폭360px·높이280px(모바일200px) contain, 반경20px이며 제목은 위, 기존 설명·상태는 아래에 둔다. 합성 실제 컴포넌트와 preview의 390/768/1024/1440 이미지 로드·외곽 및 넘침을 확인했다. 실제 컴포넌트 KO/EN/JA 390/1440, preview의 12개 언어 32개 폭 조합과 긴 합성 문구의 390/1440 행 높이를 검증했고 preview 주요 영역 axe A/AA는 두 폭에서 위반 0이다. 기존 passport/raffle-layout 필수 자동검사는 승인된 빈 4197 포트의 임시 서버로 실행해 32개 언어·폭 조합을 통과했고 서버는 종료했다. 이 검사는 새 benefits 카드 역할 자체를 대체하지 않으므로 별도 benefits 검증 근거와 구분한다. 선택은 native radio와 기존 분홍 선택 표시로 나타내며 기존 64px/모바일56px 자산 이미지를 contain한다. 하트 비율은 검증된 wallet GET으로 표시한다. 공식 응모권의 구분된 전환 계약이 없어 응모권 선택 시 실행을 비활성화하고 비율을 추정하지 않는다. 공식 응모권 전환과 광고 서버 검증·수량 전달 계약은 미완료다. 이 규칙은 UI-013/016의 두 목적 카드 배치를 대체한다.

### UI019 · 출석 모달 (로컬)

직접 `/my/wallet?view=attendance` 진입은 최소 MY 화면과 기존 `WalletAttendanceDialog`를 사용하며 닫으면 MY로 돌아간다. 문맥 내 출석 링크는 기본 href와 수정키 이동을 보존하고 일반 클릭만 공통 Dialog로 연다. 닫기·Escape는 원래 링크에 초점을 돌린다. 공통 모달은 최대560px, viewport 양쪽16px 여백, 반경16px, 본문 padding PC24px·모바일16px 및 기존 focus trap을 사용한다. 기존 인증·requestKey·영수증 복구를 유지하고, 검증된 출석 영수증 이후 별도 wallet 재조회로 확인한 잔액만 표시한다. 실패는 기존 오류와 재시도를 표시한다.

합성 로컬 검증에서 390/1440 오류→키보드 재시도→복구, 닫기 약62×44px, 주요 행동은 각각326×48px·320×48px, 가로 넘침 없음을 확인했다. 기존 호출부와 직접 진입은 같은 출석 로직을 사용한다. 모임 홈의 GroupHomeInfo 사이드바 링크는 1440px에서 272×44px로 확인됐고, 390px에서는 숨겨지므로 별도의 GroupDetail 모바일 링크(324×44px)를 사용한다. 각각 원래 URL과 초점 복귀를 유지한다. 이 근거는 합성 데이터이며 실제 출석·운영 보상 또는 배포의 증거가 아니다.

### DATA-001 · 공통 이미지 배너 (로컬 검증)

최신 사용자 방향은 위의 정사각 이미지·별도 copy열 방식을 대체한다. 관리형 discovery slide는 원본 desktop/mobile URL과 alt·문구·목적지·순서를 유지하고, 짧은 문구는 공통 이미지 프레임 위에 copy와 CTA를 겹친다. PC 프레임은 960×480, 모바일·태블릿은 300×250px이며 top-aligned cover와 기존 반경20px·경계·제어를 유지한다. 렌더된 문구 높이가 이미지의 보호 범위를 넘으면 같은 슬라이드의 이미지 아래에 문구와 CTA를 배치한다. 활성 슬라이드 높이에 viewport를 맞춰 짧은 배너로 이동할 때 빈 공간을 남기지 않으며, 줄바꿈된 CTA도 최소44px 높이를 유지한다.

CMS 계약은 제목 최대160자·설명 최대600자·CTA 최대80자이며 제목과 CTA는 비어 있을 수 없다. 이전 288자 합성 설명도 유효 범위에 속하며 문구 한도를 임의로 줄이지 않는다. backend 로컬 검증에서 합성 최대 길이 KO 문구를 WeNa·NCHIVE에 주입해 390/1440의 이미지 아래 분리와 가로 넘침 없음을 확인했고, EN 600자도 같은 폭에서 확인했다. 긴 배너에서 짧은 배너로 전환하면 모바일 viewport는 250px로 돌아간다. 변경 후 6 tests PASS 및 기존 정상 390/768/1440·제어 키보드 근거를 재사용한다. 이 관찰은 현재 두 애셋과 합성 문구에 한정하며, 기존 원본 하단 크롭이 있다. 미래 이미지의 얼굴·문구·로고는 등록 시 별도 프레이밍 검수가 필요하다. 위임받은 최종 시각 확인에서 NCHIVE 390/1440 보이는 화면의 이미지·여섯 얼굴·WELCOME 및 이미지 아래 문구 분리를 확인했으며, 캡처 화면 밖의 전체 문구·CTA는 이 시각 확인의 범위가 아니다. 운영 반영의 증거는 아니다.

### UI021 · 팬 피드 초기 로딩 (로컬 부분 구현)

첫 피드 조회는 이름 있는 role=status/aria-busy skeleton을 사용하고 장식은 aria-hidden으로 둔다. compact는 3행, 데스크톱 행52px·모바일60px, bar 높이14px·반경6px, 중립 oklch(94% 0 0) 및 1.4초 pulse이며 reduced-motion에서는 animation을 끈다. noncompact는 최소120px 행·36px avatar placeholder를 사용한다. 같은 키의 재조회에서는 기존 내용을 유지하고 빈 상태·오류·재시도는 기존 동작을 보존한다.

합성 로컬 compact·noncompact 390/1440의 초기 로딩과 오류→키보드 재시도, browser reduced-motion animation none 및 noncompact 120px 행·넘침 없음을 확인했다. refresh suite의 attachment-policy 테스트 fixture를 실제 스키마에 맞추고 정책 조회를 피드 조회 수에서 분리한 후 기존 동작 검증을 유지해 전체 7건이 통과했다 (`tasks/UI-021-worker5/refresh-final.md`). 실제 스크린리더·운영 데이터는 미검증이며 UI021 전체 완료를 뜻하지 않는다.

### UI021 · 디렉터리 초기 로딩 (로컬)

첫 조회에서 오늘 주목 3개·목록 6개·가입 목록 3개의 장식 skeleton과 이름 있는 busy 상태를 표시한다. 오늘 주목은 PC 3열·모바일 세로, 이미지는 56px이다. 본문은 PC 3열·1023px 이하 세로, 이미지 56px과 행 최소 96/80px을 사용한다. 가입 목록은 36px 이미지와 최소 60px 행이다. 중립 oklch(94% 0 0), 14/12px 막대, 12px 간격을 사용하고 reduced-motion에서는 움직이지 않는다. 기존 동일 키 데이터는 재조회 중 유지하고 오류·빈 상태는 구분한다.

합성 지연 GET의 실제 컴포넌트에서 390/1440 로딩→성공 및 오류, reduced-motion과 장식 요소의 비포커스를 확인했고 국소 6 tests를 재사용한다. 실제 로그인·운영 데이터나 순위·방문 기록의 증거는 아니다.

### 팬 홈 사이드바 카드 제목 (로컬)

다가오는 일정·찐팬인증·내 패스포트 및 같은 역할의 사이드바 카드 제목은 기존 `Pretendard UI 650`, 16px/24px, font-weight400, font-synthesis:none으로 통일한다. 범위는 `creatorHomeAside`의 직접 카드·section 제목과 해당 모바일 카드이며 전역 h2 규칙을 바꾸지 않는다. 로컬 1440px 한국어의 다섯 제목과 390px 영어 일정·인증 제목에서 동일 역할 및 텍스트 넘침 없음을 확인했다. 캘린더 행동의 별도 색상·초점 근거는 아래 UI011D 계약을 따른다.

UI011D 캘린더 상단 단일 링크는 기존 브랜드 #ad1457, 12px/1.3, 반경8px 및 hover #fff0f6을 사용하고 기존 focus-visible·선택월 href·최소44×44px을 유지한다. 흰 배경 대비 계산 약6.97:1이며 로컬 KO390/1440·EN390/1440을 확인했다. KO390 95.99×44px, EN390/1440 100.02×44px 및 390 가로 넘침 없음을 확인했고 EN390 focus ring을 살폈다. 영어 외 긴 번역과 200% 확대는 미검증이며 합성 로컬 근거다.

### UI021 · 팬 경로 공통 로딩 (컴포넌트 검증)

`FanRouteLoading`은 최대폭360px, 제목 55%×24px·보조 78%×14px, 필드 두 개와 행동 각48px, 간격·반경12px의 중립 oklch(94% 0 0) skeleton을 사용한다. page는 최소50vh/padding32px 16px, overlay는 최소240px/padding24px다. 기존 현지화 status와 aria-busy를 유지하고 reduced-motion에서는 animation을 끄며 포커스를 가로채지 않는다.

활동·방·컬렉션·이벤트·브랜드홈 resolver와 멤버 연결, 그룹 상세 및 팬 identity의 최초 대기는 기존 page/overlay를 사용한다. 기존 데이터가 있으면 유지하고 오류 시 기존 alert·retry를 표시한다. 합성 gate의 실제 활동·상세 컴포넌트에서 390/1440 로딩→성공·503 오류, 상세 오류→키보드 재시도→헤더 복구, reduced-motion과 넘침 없음을 확인했다. 실제 Next 경로·인증 transport, 스크린리더와 실제 dialog focus trap은 미검증이며 UI021 전체 완료를 뜻하지 않는다.

### UI023 · 회원 행 대화 진입 (로컬 통합 중)

기존 회원 프로필 행 링크와 대화 행동은 중첩하지 않는 형제 요소로 둔다. 행의 profileId·닉네임·locale을 기존 `MemberDmEntry`에 전달하며, 개인 식별자 직접 비교 대신 기존 프로필 응답의 isSelf·DM 권한·기존 대화 여부를 사용한다. 비회원 목록 접근과 기존 프로필 목적지를 유지한다. 좁은 화면에서는 프로필 링크 전체 너비 아래에 88×44px 대화 버튼과 전체 너비 오류를 배치해 긴 이름을 읽을 수 있게 한다. 데스크톱 행동 열은 88px이며 랭킹 제목과 점수 열을 정렬한다. 권한 조회 중 기존 동작 가드와 aria-busy를 유지해 키보드 초점을 잃거나 중복 실행하지 않는다.

합성 390/1440 회원 오류·거절·본인 상태와 키보드 초점 및 랭킹 정렬, 국소 테스트 7건을 확인했다. 공유 fixture의 잘못된 프로필 DTO는 이동을 거부하며 실제 권한의 증거가 아니다. 실제 인증·DM 전송이나 운영 검증은 하지 않았다.

### 응원 댓글의 조건부 포인트 안내 (로컬)

기존 cheer 댓글 입력 옆에는 해당 creator의 인증된 earning-status를 읽는 `ActivityPointHint(comment)`를 재사용한다. 표시값·조건·남은 횟수는 응답을 따르고 disabled·자격 없음·미설정·오류를 구분한다. 댓글 성공 후 상태를 재조회하되 응답을 적립 영수증이나 보장으로 해석하지 않는다. 원래 cheer ID의 replies 조회와 replyToId 제출 경로는 유지하며 fan_post로 변환하지 않는다. 기존 안내 스타일 13px/20px, gap4px 8px, 강조 #ad1457 및 조건 #5d5d5d를 사용한다. 로컬 합성 정책·mock 제출 테스트 8건과 390/1440 표시 검증 근거이며 실제 댓글·적립 또는 운영 정책 확인은 아니다.

덕질 지갑의 `group-wallet-v1` tickets는 모임 응모권으로 표시하며 공식 응모권과 합산하지 않는다. 별도 공식 잔액을 제공하는 검증된 계약이 없으므로 Kyaa 공식 응모권은 `—`로 표시하고 0이나 모임권 잔액을 대신 쓰지 않는다. 교환 패널의 공식 응모권 선택은 전환 계약이 확인될 때까지 비활성·비율 미표시다. 하트의 기존 지갑 진입은 단순 이동이며 서버 광고 검증이나 교환 성공을 의미하지 않는다. 로컬 실제/preview는 동일 경계를 유지한다.

UI018 로컬 진행(2026-11-06 정리): 하트 교환 화면은 하트 UI 삭제로 없어졌다. 응모권 교환의 수량 선택은 −/+ 스테퍼와 1·3·최대 칩(44px 이상 터치)을 두고, 최대는 `min(1000, floor(points/pointCost), exchangesRemainingToday)`이며 남은 횟수 필드가 없으면 포인트 기준만 쓴다. 광고 1회당 서버 교환 1개(units=1)를 N번 차례로 하고, 진행은 k/N 막대로 보이며(role=progressbar, 값 k/N 읽기) 취소·무광고·오류·429는 그 자리에서 멈춘다. 받은 개수는 유지하고 남은 교환은 자동 재개·차감하지 않는다. 광고 단위 미설정은 "지금은 광고를 볼 수 없어요. 포인트는 차감되지 않았어요."로 구분한다.

UI018 섹션 구분은 흰 배경과 기존 경계색을 유지하며 자산 요약→단일 교환 패널→응원→럭키드로우 순서다. 주요 간격은 PC48px·모바일32px, 응원 및 럭키드로우 앞의 가는 경계와 안쪽 간격은 PC24px·모바일20px이다. 공식 응모권의 권위 있는 잔액·전환 및 광고 검증 계약은 여전히 확인되지 않았다.

### 덕질 응모권 전환 우선 공개 (2026-11-04 사용자 승인)
앞선 UI018의 공식 응모권 `—` 표시와 전환 비활성, 하트 기본 선택 기준을 이 항목이 대체한다. 덕질의 교환 패널에서는 `group-wallet-v1`의 모임 응모권 전환만 연다. 하트 선택지는 비활성 radio와 흐린 아이콘(3px), 13px `곧 안내해 드릴게요`로 표시하고, 지갑 요약의 교환비율도 응모권에만 표시한다. Kyaa 공식 응모권은 자산이 없어 화면에 표시하지 않는다. 교환 행동은 `WalletExchangeDialog`에서 기존 요청 키·결과 복구 흐름을 그대로 쓴다.

럭키드로우 목록은 `BenefitsComingSoon`으로 제목을 남긴 채 흐림 6px·`inert`·`aria-hidden`을 적용하고, 흰 배경 12px radius·16px/700 안내를 가운데에 둔다. 높이는 160~480px로 제한한다. 390/1440 예시 데이터 화면에서 확인했다.

교환·응원은 덕질로 모은다. `/my/wallet`은 잔액·내역과 덕질 이동만 제공하고, `view=support`는 `/benefits`로 이동한다. MY의 교환 행동과 응모권 부족 안내는 `/benefits`로 연결하고, 팬페이지 게시판 사이드의 하트·캡슐 항목은 덕질 링크 하나로 합친다. 모임 내부의 추첨 목록과 출석 다이얼로그는 유지한다.

응모권 교환은 보상형 광고 완료 후에만 진행한다(2026-11-04 사용자 결정, 흐름은 2026-11-09 B13). 덕질 포인트 타일의 `교환 ›`으로 시트를 연 뒤 `[− N장 +]`로 장수를 고르고 `광고 보고 교환하기`를 1탭하면 중간 창 없이 서버가 광고 세션을 발급하고 광고가 1회 표시된다. 광고 시청이 서버에서 granted로 확인되면 교환 요청 1건을 보내고, 서버는 그 granted 세션 1개를 소비하며 같은 트랜잭션에서 N×100P를 차감하고 응모권 N장을 적립한다(`exchange_owned_group_wallet`, 1~1000장, 하루 한도는 소비된 세션 = 교환 횟수로 센다). 끝나면 토스트 `응모권 +N장`만 띄우고 완료 화면은 없다. 취소·광고 없음·오류·하루 한도에는 차감하지 않고 기존 문구를 토스트로 안내한다. 광고 단위(`NEXT_PUBLIC_REWARDED_AD_UNIT`)가 없거나 이 기기에서 광고를 볼 수 없으면 버튼은 눌리고, 누른 뒤 그 사유를 토스트로 알린다. 응답을 잃으면 같은 요청 키·같은 세션으로 다시 확인해 두 번 차감하지 않는다.

## 2026-11-04 수락 작업 통합 (checks, DESIGN-SYNC-20261104-01)

아래는 수락된 로컬 작업을 현재 계약으로 옮긴 것이다. "계약"은 앞으로 지킬 규칙이고 "관찰"은 합성 로컬 예시 데이터(3128)에서 한 번 잰 값이다. 관찰 값은 운영 근거가 아니며 계약이 아니다. 앞선 항목과 충돌하면 사용자 요청이 근거인 이 절이 해당 범위에서 대체하며, 대체 범위를 각 항목에 적는다.

### 팬페이지 홈 하단·LIVE 링크 (2026-11-04)
- 계약: 크리에이터 홈 게시판 하단(`CreatorBoardFooter`)은 검색 입력만 둔다. "전체 보기"·"글쓰기"는 위쪽 이야기 헤더(앞선 "팬페이지 이야기 헤더" 계약)에만 제공한다. 다른 호출부의 `FanPostFeed` 동작은 바꾸지 않는다.
- 계약: compact 영상 미리보기 카드(예: "팬들과 함께하는 LIVE")의 제목 링크 높이는 44px 이상이다. 이미지 링크는 같은 목적지의 별도 링크이며 외부 링크 공통 UTM·클릭 측정은 링크마다 한 번만 적용한다.
- 관찰(합성): LIVE 제목 링크 390px 358×44(수정 전 358×30), 1440px 318×44.
- 충돌 판단: 위쪽 헤더 계약과 일치. 하단 중복 버튼 제거는 사용자 요청.
- 미검증: 한국어만 관찰, 다른 언어 미검증.

### 공통 빈 상태 (2026-11-04)
- 계약: 정보가 없는 상태는 `SourceStatePanel`의 `illustration`(자체 SVG)·제목·설명·필요 시 다음 행동으로 표시한다. 사이드바·좁은 영역은 compact, 본문은 regular를 쓴다. 일러스트는 장식(`aria-hidden`)이며 오류 상태에는 쓰지 않는다. 종류는 page·search·people·notice·live·ticket·comment 7가지다.
- 관찰(합성): compact 일러스트 112×84, 패딩 20/16, 제목 18px. regular 160×120.
- 미검증·후속: 내 페이지·MY 큰 빈 화면의 실제 캡처, 일러스트 하드코딩 색의 토큰화, 다크 모드 없음.

### 탐색 영역 오류·내 페이지 빈 상태·모임 라벨 (2026-11-04)
- 계약: 탐색(추천 영역) 오류는 내용 폭(`fit-content`, 최대 640px)의 컴팩트 알림으로 표시하고 재시도는 문구 옆의 44px 외곽선 중립 버튼(간격 12px)이다. 사이드바 알림은 기존대로 전체 폭·우측 정렬이다. 앞선 503 알림 문장은 이 범위에서만 이 규칙으로 대체되며 영역 유지·재시도 44px 기준은 그대로다.
- 계약: 내 페이지가 0건이면 일러스트 빈 상태로 대체하고 "최근 방문순"과 "내 페이지 전체 보기"를 숨긴다.
- 계약: 디렉터리 필터의 "모임" 라벨 그룹은 라벨을 유지하되 앞 그룹과 1px 구분선(`#e4e1e6`)과 12px 좌측 여백·패딩으로 구별한다. 필터 동작은 바꾸지 않는다. 데스크톱 칩은 밑줄형 탭이며 12px 반경은 모바일 칩에만 적용한다. `sort=today&limit=3`은 의도된 값이다.
- 관찰(합성, ko만): 1440px 행 높이 44·칩 44, 390px 한 줄 유지·넘침 없음.
- 미검증: 한국어만 관찰, 다른 언어 미검증.

### 최애 찾기 압축 행 (2026-11-04 사용자 요청)
- 계약: `/celebrities`(그룹 비활성 시)는 72px(모바일 64px) 정사각 썸네일과 이름·역할·패스포트 보유·소개를 담은 압축 행으로 표시한다. 열은 1열, 768px부터 2열, 1280px부터 3열이다. 패스포트 보유 배지는 역할 줄 옆에 두고 카드 링크는 2열 그리드이며 카드 높이를 고정하지 않고 같은 행은 늘려 맞춘다.
- 충돌 판단: 이전의 정사각 큰 카드(약 575px 높이) 배치를 이 목록에서 대체한다. 근거는 사용자 요청.
- 관찰(합성, 10장으로 DOM 복제): 1440px 3열 445×98, 768px 2열 346×98, 390px 1열 358×98.
- 미검증: 실제 데이터, LIVE 행, 단체 사진 얼굴 크롭, 나머지 9개 언어.

### 덕질 요약·교환 정돈 (2026-11-04)
- 계약: 덕질 요약(`BenefitsSummary`)은 동일 구조의 카드 3장(아이콘·라벨·숫자, 포인트도 아이콘)이며 제목은 `srOnly`다. 768~1023px에서는 포인트 카드가 한 행 전폭이고 응모권·하트가 아래 2열이다. 선택한 카드는 24px 체크 배지와 테두리를 쓰고 하트 카드는 같은 점선·흐림 프레임을 쓴다.
- 계약: 교환 패널은 포인트 잔액을 반복하지 않는다. 환산(예: "100 P → 1장", 값은 지갑 API의 `pointCost`)과 주요 버튼은 하단 바에 한 번만 두며 PC는 환산 좌측·버튼 우측, 모바일은 쌓고 버튼 전폭이다. 비활성 사유는 기존 `곧 안내해 드릴게요`를 버튼 아래에 한 번만 보인다. "참여 내역"·"적립·사용 내역"은 테두리 쉐브론 링크 44px다. 수량 선택(2개 이상 가능할 때만 표시)이 추가되어 하단 바 합계는 선택 수량×`pointCost`로 바뀌고, 진행 k/N 막대와 중단 사유는 버튼 아래에 한 번만 둔다.
- 충돌 판단: 앞선 UI-007(환산비가 버튼 앞 2열)과 "덕질 교환·응원·추첨 구성"의 교환 블록 내 "사용 가능 포인트" 표시를 배치 면에서만 대체한다. 비율·정책 값과 "덕질 응모권 전환 우선 공개"의 하트 비활성, 광고 후 교환 게이트는 그대로 유지한다.
- 미검증: 활성·오류 상태 캡처.

### 출석 대화상자 간결화 (2026-11-04 사용자 요청)
- 계약: 규칙은 한 줄로 한 번만 말한다("매일 출석하면 10P · 7일 연속이면 보너스 20P"). 7개 칸은 같은 높이의 일자·도장·보상 3단이고 390px에서도 한 행을 유지한다. 칸마다 같은 포인트를 반복하지 않고 보너스(7일차) 칸만 +20P를 표기한다. 오늘 칸은 강조 테두리를 쓴다. 상단 카드·큰 도장·하단 설명은 없고 주요 버튼은 대화상자 전폭 52px다. 오늘 도장이 0개이면 제목은 `오늘 첫 도장을 찍어요`다(4805ef90c).
- 충돌 판단: 모임 웹 전환 절의 출석 항목(4+3 모바일, 320×48 행동, 큰 도장, 10P/30P 칸 표기)과 "UI019 · 출석 모달"의 행동 326×48/320×48을 대화상자 레이아웃 범위에서 대체한다. 공통 Dialog 규격(최대 560px, 닫기·Escape 초점 복귀, 직접 진입 동작)은 유지한다.
- 관찰(합성): 1440px 버튼 512×52, 390px 326×52, 대화상자 높이 약 597→390px(1440; 597은 수정 전 직접 확인, 파일 없음). 관찰 프레임은 6일 연속·7번째 칸 합성 값이다.
- 계약(완료 상태): 출석을 마치면 상태 행 하나(완료 표시와 서버가 준 실제 지급액)와 다음 행동 하나만 보인다. 완료 후에는 비활성 주요 버튼을 남기지 않는다. 비활성 주요 버튼은 배경 `#e4e1e6`·글자 `#5d5d5d`다.
- 관찰(완료 상태): 합성 mock이며 실제 출석 제출은 하지 않았다. 근거 reports/3f5413d04b8766f03b07.md.
- 미검증: 1~5일차, 다른 언어, 키보드 초점 캡처.

### 목록·카드 섹션의 전체 보기 (2026-11-04)
- 계약: 목록·카드 섹션의 "전체 보기"는 제목 행 오른쪽에 두며 높이는 44px 이상이다. 개수는 같은 링크 안에 `· N`으로 표기한다(예: "전체 보기 · 3"). 개수를 링크 밖 별도 요소로 두지 않는다.
- 계약: 정렬 기준 보조 문구(예: "최근 방문순")는 제목과 링크 사이에 들어가면 같은 행에 두고, 들어가지 않으면 그 문구만 제목 아래 줄로 내린다. 이때 링크는 제목 행에 남는다.
- 계약: 목록 하단에 전체 보기만 있는 단독 이동 행을 두지 않는다. 예외는 이어보기·펼침 토글·필터·모달 트리거이며 이는 이 규칙의 대상이 아니다. 목록이 비면 전체 보기 링크는 숨긴다.
- 관찰(합성 3128, ko·en·th·ru, reports/d3bb4c4dfe1c1cc6fc39.md): ko·en·th 390과 ko 1440에서 제목·정렬 문구·링크가 한 줄이고 링크 44px, ru 390은 링크가 제목과 첫 행에 남고 정렬 문구만 아래 줄이다. scrollWidth는 화면 폭과 같다.
- 미검증: 다른 언어(ko·en·th·ru 외), 실제 데이터, 390·1440 외 폭.

### 모임 상단·목록 보완 제안 (UI-RUBRIC fix-r01-moim, worker6, 제안)
- 제안: 1023px 이하 모임·팬페이지 상단의 '…' 메뉴는 탐색 줄이 아니라 제목 행 오른쪽에 둔다(빈 줄 제거). 1024px 이상은 기존 탐색 줄 유지. 팬페이지 1023px 이하에서 팬등급과 SNS는 한 행(좌 팬등급, 우 SNS)에 둔다.
- 제안: 모임 둘러보기 언어 칩은 고정 80px 대신 최소 80px·최대 min(42vw,184px)로 내용에 맞춘다(ru 'Ру…' 잘림 해소). 600px 이하 검색·정렬 선택은 각각 전체 폭 한 줄이다.
- 제안: 라이브 캘린더 일정 목록 배경은 부모 안쪽 여백 안에 두며 음수 마진을 쓰지 않는다. 모임 참여 카드 아래 간격은 1023px 이하 16px.
- 제안: 배너 CTA 그라데이션은 125deg #d9194c→#b91a93→#6042d5, 흰 글자(가장 밝은 정지점 대비 약 5.0:1). 인기글 링크·운영자 회원 이름 버튼·1024px 이상 홈 게시글 행은 목표 크기 44px 이상.
- 예외 근거(제안): 44px 예외는 본문 문장 흐름 안에 끼어 있는 인라인 링크에만 적용하고 줄 높이를 따른다. 단독 줄에 놓인 안내 링크(예: 혜택 수령 화면 `.privacy a`는 44px 최소 높이)와 인기글 링크·회원 이름 버튼 같은 목록 컴포넌트는 예외가 아니며 44px을 지킨다. 미검증: 운영자·비회원 상태의 '…' 위치 전 폭 확인, ru 외 언어의 상단 실측.

## 2026-11-04 버튼·내역·MY 홈 갱신

- (2026-11-09 삭제: 비활성은 불투명도만, 아래 토큰은 더 쓰지 않는다) 비활성 토큰(`app/globals.css :root`): `--fan-action-disabled-bg #e4e1e6`, `--fan-action-disabled-ink #5d5d5d`(배경 대비 5.1:1, 계산값), `--fan-action-disabled-text-ink #6b6b6b`(text 변형, 흰 배경 대비 약 5.3:1, 계산값·브라우저 실측 아님). 화면 모듈은 직접 색을 쓰지 않는다. 별도로 필요한 토큰은 아직 없다.
- FanAction 로딩 스피너는 절대 배치가 아니라 라벨 뒤 flex 자식이며 trailing 아이콘 자리를 대신한다(글자·아이콘과 겹치지 않는다). 패딩은 `8px 18px`, 최소 높이 44px이다. Link 분기는 비활성·로딩이 불가하다. 아이콘은 반드시 `leadingIcon`/`trailingIcon`으로 넘긴다(자식으로 넣으면 글자 위에 쌓인다).
- 공통 오류 화면 "다시 시도"는 `leadingIcon`으로 글자 앞에 한 줄로 놓는다.
- 덕질 홈 제목 행에 짧은 `내역` 링크 하나만 둔다(`/my/wallet#wallet-history`). 잔액 요약 카드에는 내역 버튼이 없다. 이동 링크는 text FanAction이며 화살표는 제목 행 오른쪽이다.
- MY 홈: 패스포트는 인라인(embedded)으로 보인다. 상단 유틸리티는 알림·설정만이고 신고·문의는 활동 영역에 둔다. 프로필 행은 이름·알림·설정만, 비로그인은 로그인 화면과 같은 구역을 유지하고 내 값은 `FanLockedValue`·`FanLockedRows`로 둔다(`비로그인 화면(전 화면)` 행). 패스포트 선택 칩의 이름은 최대폭 말줄임이다.

### Home metadata and empty reservations — 2026-11-03

The home fan-board preview keeps its compact thumbnail cards and shows localized like and comment totals as non-interactive, muted 13px metadata with 14px decorative icons. Totals include zero; existing cheer totals map to claps and replies. Empty reserved-LIVE summaries omit the large calendar illustration and use a wrapping inline status/link row with 4–12px gaps, preserving the 44px link target. Populated reservations and passport empty states are unchanged.

### Changha GGGI photography — 2026-11-03

At the user's request, registered Changha identity and hero images use the unedited first photograph from his own Instagram post `DfHkOu8mQkn` (2026-10-30), stored at `/images/celebrities/changha/gggi-20261030.jpg` (1883×2510). Old registered URLs resolve to the new image; future CMS uploads and explicit role removals remain authoritative. Identity and hero crops focus at 50% 28%; square/avatar/passport identity crops use 1.5x about that focus for legible faces; calendar retains its near-top portrait focus. The GGGI campaign keeps green copy on the left and the portrait in the right 46% on desktop; mobile uses a 4:3 face-preserving crop above the existing white information panel. The campaign dialog uses a 3:2 crop at the same focus. Background event lettering is photographic context, not a complete text banner; the person's face and campaign UI copy remain visible. Original social posts and historical event artwork are not rewritten.


### DEV groups experience (2026-11-03)
- Heart support reuses the common Dialog on the originating page; direct support links use a minimal shell and return to the selected creator board. Preserve focus restoration, native modified links and the existing wallet request/receipt contract.
- Benefits retain the wallet data source and separate group tickets from unverified official tickets. The latest approved layout uses wallet, exchange, support and lucky-draw sections; the point-event section is removed. Local fixture values are not live balances.
- Capsule reveal uses the shared result dialog and supports video failure, skip and reduced motion. Group application uses the shared dialog and retains unsaved-input confirmation.
- Group discovery distinguishes fan pages, hobby groups and brand groups while retaining existing sort and navigation behavior.

- 2026-11-04 모임 `/my/groups/reports`·`/my/invitations`: 페이지 제목은 800 굵기 32px(모바일 24px), 본문 열은 최대 720px 가운데 정렬, 카드 제목은 18/28px로 페이지 제목보다 작게 둔다. 도움말 문장은 두지 않는다.

### UI-RUBRIC R02 모임 화면 정렬 기록 (2026-11-04)
- 캐러셀 슬라이드 하단 그라데이션은 `linear-gradient(0deg,#000000E6,#000000B3 55%,#00000000)`로 소식 라벨 대비 4.5:1을 지킨다. 행사 화면은 제목과 카드가 같은 720px 가운데 열이다. 공지 단독 화면 본문은 열 가운데이며 인증 카드가 1개면 전폭이다. 공지 상세 standalone 폭은 720px 왼쪽 정렬이고(2026-11-09 shell-width, 이전 가운데), 관련 공지가 있으면 본문이 남는 폭을 쓰고 오른쪽 264px 레일이 셸 오른쪽 끝에 닿는다(이전 1152px).
- 공지 상세 상단·댓글 정렬(2026-11-10 사용자 요청): 뒤로가기 아래 간격 8px, 제목·메타 간격 8px, 댓글 아바타는 44px 작성자·행동 행에 맞추고 입력 안내는 남은 너비를 사용한다. 모바일 최근 공지는 본문과 같은 좌우 경계에 둔다. 원문 제목과 본문은 변경하지 않는다.
- 알림 카드(640px)와 초대 카드는 1440에서 가운데 정렬이다. 선물·행사 운영 띠의 글자는 1024px 이상에서 본문 960px 열 왼쪽선에 맞추고 1023px 이하는 16px 여백이다. 게시판 '목록으로' 링크는 글자 안쪽 여백을 상쇄해 본문 왼쪽선에 맞춘다.
- 팬·브랜드 페이지 헤더 부제의 팬덤 접두(예: '세이브 · ')는 1024px 이상 소개 줄에서만 보이고 그 아래는 회원 수 줄이 대신한다. 게시판 헤더에서는 접두를 숨긴다.
- 취미·브랜드 홈의 페이지 정보 aside는 현재 접속·오늘 방문만 둔다(회원 수는 헤더 소유, 소개는 본문 소유). 회원 탭 개요에도 소개 문단을 반복하지 않는다.
- 회원·친구 목록 행은 행 전체가 한 카드(테두리는 li 소유)이고 대화하기 버튼은 같은 카드 안 오른쪽(767px 이하는 카드 안 아래 줄)이다. 같은 줄 카드는 높이가 같다. 랭킹 목록은 적용 제외다.
- 페이지 개설 신청 상단 경로는 '모임'만 두고 같은 제목을 반복하지 않는다.
- 행사 상세의 정체성 제목(`.eventPageIdentity h2`)은 섹션 제목 기준을 따라 20px(767px 이하)·24px로 맞춘다. 같은 화면의 H1·행사 H2와 크기가 같다.
- 취미·브랜드 페이지 탭 줄은 1023px 이하에서 팬 페이지와 같이 한 줄 가로 스크롤이다. 라벨은 줄바꿈하지 않고(nowrap) 좌우 10px 여백을 두며, 긴 라벨의 로케일(ru·th·fr·id·es·vi)에서도 겹치지 않는다. 마지막 탭이 화면 끝에서 잘려 보이는 것은 스크롤 신호다.
- 크리에이터 사진·영상 미리보기의 영상 카드는 같은 행에서 하단 행동('영상·댓글 보기')의 위치를 맞춘다. 버튼은 재생 가능한 영상 ID가 있는 카드에만 둔다(LIVE·채널 링크 제외).
- compact 사진·영상 화면에는 공식 채널 줄을 두지 않는다. 헤더의 SNS 아이콘은 그대로 둔다. 제목은 '사진 · 영상'으로 고정한다.
- 회원 탭에는 '회원' 소제목을 두지 않는다(탭 이름과 중복). 회원 행의 '대화하기' 버튼은 줄바꿈하지 않고(nowrap) 최소 폭 88px을 둔다.

## 모임 디렉터리 팬페이지 우선 구간 (2026-11-04)

- `/pages/groups` 기본 화면(필터·검색·내 페이지 없음)은 팬페이지 카드 구간 없이 주목할 페이지와 취미·브랜드 목록으로 구성한다(2026-11-04 사용자 요청으로 큰 팬페이지 카드 구간과 전체 보기 링크를 제거). 팬페이지는 주목할 페이지·팬페이지 필터·최애 찾기에서 계속 열 수 있다.
- 목록은 서버의 `type=nonfan`(취미·브랜드만)으로 조회해 페이지 넘김·총계가 서버 기준으로 맞는다.
- 디렉터리 스켈레톤 높이를 로드 후 값에 맞췄다: 주목 행 81px, 목록 행 390·768 94px(로드 94.4px)·1440 98px.
- 2026-11-09 사용자 결정: '지금 주목할 페이지' 구간(아바타·팬페이지 칩·'찐팬 100 도전 중'·팬 수 카드 행)을 모임 화면에서 지웠다. 위 두 항목의 '주목할 페이지'와 '주목 행' 기준은 더 이상 적용하지 않는다. 화면 순서는 내 아티스트 → 얇은 배너 → Hot 게시글 → 페이지 둘러보기 → 내 페이지다. 오늘의 덕질의 비회원 타일은 같은 오늘 순위 조회를 쓰므로 그대로 둔다.
- 2026-11-10 사용자 요청: 중복된 모임 찾기의 ‘내 페이지’ 최근 방문 목록과 전체 보기·페이지 이동을 제거하고 상단 ‘내 아티스트’는 유지한다. 가입 데이터와 다른 화면의 내 페이지는 그대로 둔다.
- 2026-11-09 사용자 결정(텍스트 다이어트): 모임 화면 옆 페이지 개설 블록은 질문 머리 문장과 '취미·브랜드 페이지 자세히' 링크를 없애고 행 2개만 둔다 — '팬페이지 개설 신청 ›', '취미·브랜드 페이지 개설 신청 ›'. 행은 높이 44px, 위 헤어라인, 설명·제목 없음. 끝의 `›`는 라벨 뒤 글자(`aria-hidden`)이고 `trailingIcon`은 쓰지 않는다(N24). `FanRow`가 생기면 그쪽으로 옮긴다(DS 묶음 B). 취미·브랜드 설명은 신청 화면 안(`group-application.tsx` 안내)에서 한다. 링크 목적지는 기존 신청 화면 그대로다. 390·1440의 12개 언어에서 넘침이 없고, ru·vi의 1440은 두 번째 행이 두 줄이 된다.

### UI-RUBRIC R02 덕질·패스포트 화면 기록 (2026-11-04)
- 패스포트 목록(`.collection`)은 768px 이상 2열, 1240px 이상 3열이며 트랙 폭은 최대 380px(`repeat(n,minmax(0,380px))`)이다. 카드 facts는 2열 격자로 값을 같은 행 하단에 맞추고 최소 높이 64px을 둔다.
- 스탬프 수: 목록 카드의 숫자는 기존 스탬프 + 해당 크리에이터의 커뮤니티 스탬프이고 상세 상단과 같은 계산이다. 스탬프북 제목과 아트는 기존 스탬프만 쓴다.
- 지갑 오류는 한 곳에만 표시한다. 인접한 잠금 구간(FX-35)은 한 줄의 잠금 행으로 합친다.
- 추첨 응모권 0장 패널은 제목 16px이고 응모권 수량을 반복하지 않는다. 교환 버튼은 유지한다.
- 하트 보내기 버튼은 대화상자 폭 전체다. 대화상자 닫기 라벨은 모든 로케일에서 번역한다(ko '닫기').
- 크리에이터 사이드 보조 행동 둘(굿즈 추첨 보기·응모권 교환)은 모두 neutral 테두리이고 '덕질' 링크 행은 전폭 왼쪽 정렬(아이콘·라벨 왼쪽, 화살표 오른쪽)이다.
- 크리에이터 추첨 선물 카드 목록은 `grid-template-rows: subgrid`로 7개 행(작품·메타·제목·설명·마감·내 응모·행동)을 같은 행 카드끼리 공유한다. 폭별 최소 높이는 두지 않는다(상세는 `docs/design/card-layout.md`).
- 모임 응모권 전환 대화상자의 교환 요약(필요 포인트·교환 후 포인트)은 대화상자 내용 폭 전체 1열이며 제목·버튼 왼쪽선과 같다(페이지의 2열 교환 배치를 상속하지 않는다).

### UI-RUBRIC R03 덕질 화면 기록 (2026-11-04)

- 포인트·하트·응모권(`/my/wallet`): 1440에서 본문 안에 같은 제목이 한 번 더 나오던 `h2`와 보조 안내 문장을 없애고, 제목은 `FanHeading`의 `c.wallet` 하나로 통일했다(390/768 모바일 제목도 같은 문구). 내역 영역 제목은 ko에서 "내역"으로 줄여 탭 "적립·사용"과 겹치지 않게 했다. DESIGN.md의 20/24 제목 척도는 그대로이고 새 값은 없다.
- 덕질 인라인 오류(`role="alert"`): 문구와 "다시 시도" 버튼 사이에 12px 간격을 두는 세로 배치(`.inlineError`)로 맞췄다.
- 내 활동 내역 탭(`fan-history`): 4개 탭을 `repeat(auto-fit, minmax(min(100%,140px),1fr))` 격자로 바꿔 390에서는 2×2, 넓은 화면에서는 한 줄로 배치한다. 둘째 줄에 1개만 남던 줄바꿈을 없앴다.
- 설정 메뉴 "MY로 돌아가기"는 좌우 안쪽 여백 8px를 없애 목록의 왼쪽 선과 맞췄다(높이 44px 유지).
- 팬 활동 사이드의 덕질 행은 좌우 안쪽 여백을 없애 위 행과 왼쪽 선을 맞추고 높이 44px을 유지한다.
- 확인한 합성 화면은 로컬 하니스 캡처이며 운영 화면이 아니다.

### UI-RUBRIC R03b 덕질·공통 기록 (2026-11-04)

- 덕질(`/benefits`) H1은 `.heading h1` 하나로 390에서 20px, 768px부터 24px이다(이전 32/28px 중복 선언 제거). 영향 화면은 덕질 홈과 같은 제목 구조를 쓰는 X01(덕질 로딩·안내 합성)이다. 로컬 하니스의 `pencil-benefits-preview.css`는 같은 H1을 32px/28px로 따로 선언해 이 값이 하니스 캡처에는 아직 반영되지 않는다.
- 모임 페이지 탭(`groups.module.css`, 480px 이하): 탭 글자 12px, 좌우 안쪽 여백(padding-inline) 4px, 최소 탭 폭 44px. 기준 값이 아니라 러시아어 탭 5개를 한 줄로 유지하기 위한 예외다(근거: `work/local-team-20261103/tasks/UI-RUBRIC-20261104/fix-groups-result-r03.md` M-01·M-02). 범위는 480px 이하 페이지 탭뿐이며 그 위 폭은 기존 값이다.
- 추첨 상세 지정 원본 분기(`sourcePresentation`)의 상태 줄은 "응모 중 · N명 추첨"을 유지한다(이 분기에는 정보 행이 없어 당첨 인원이 이 줄에만 있다). 일반 한국어 분기는 정보 행에 당첨 인원이 있으므로 상태 줄에서 숫자를 뺐다. 비한국어 일반 분기의 상태 줄에 있던 "당첨 인원: N"도 같은 이유로 뺐다(정보 행에 같은 수치가 있다).
- 지갑 제목용 `.walletTitle` 죽은 스타일을 제거했다(표시 변화 없음).

- 게시판 CompactFeed 목록(2026-11-04): 조회수 열을 삭제했다(집계가 없어 값이 `—` 고정이었다). 데스크톱 열은 제목 `minmax(0,1fr)`, 작성자 112px, 날짜 112px, 좋아요 88px이다. 390px에서는 좋아요 열만 숨긴다. 게시글·댓글 작성 시간은 공용 `RelativeTime`(`apps/web/i18n/relative-time.ts`)으로 방금 전·N분 전·N시간 전·N일 전을 보이고, `RELATIVE_TIME_MAX_DAYS = 7`일 이상 지난 글은 기존 절대 날짜로 돌아간다. 1분 미만 문구는 `catalogs/common__relative-time.ts`의 12개 로캘 값(ko 방금 전)이다. 모임 게시판(`group-board.tsx`)의 목록·상세·댓글 시간도 같은 컴포넌트를 쓴다.
- 방문 통계 동의 바(GA4, 2026-11-08 ga4): 측정 ID가 있는 환경에서만, 선택 전·다시 열기 때만 보인다. 화면 하단 고정 한 줄(390은 하단 탭바 64px 위 8px, 1024 이상은 바닥 24px, 최대 폭 720px 가운데), 13px 문구 + 개인정보처리방침 링크 + `FanAction` sm `거부`·`허용`. 허용·거부는 같은 중립 버튼으로 비중을 같게 두고 강조색을 쓰지 않는다(H6). 소유자 `features/analytics/client/google-analytics.module.css`. 다시 바꾸는 입구는 푸터 법률 링크 줄의 "방문 통계 설정". 실제 화면 캡처는 하지 못했다(로컬 실행기에 측정 ID를 넣을 수 없음).
- 방문 통계(`/admin/traffic`) 가입 퍼널 표(2026-11-08 funnel-fix): 기존 `admin-overview-dashboard.module.css` 패널과 `web-analytics-dashboard.module.css` 표를 그대로 쓴다. 제목은 design-lint C2에 따라 `FanHeading`이지만, 팬 화면용 넓은 크기(24px)가 관리자 패널 제목(16px)을 이기므로 `.funnelHeading h2[data-fan-heading]`에서 `--fan-item-title-size`로 되돌린다. 색 강조는 없다. 열은 단계·수·이전 단계 대비·방문 회원 중(로그인 방문 회원 코호트), 방문 세션 행에만 수집 시작일을 덧붙인다. 390에서도 4열이 가로 넘침 없이 들어간다. 확인은 로컬 DB 값의 390·1440 화면이며 운영·dev 관리자 화면은 보지 않았다.
- 방문 통계(`/admin/traffic`) 주간 표(2026-11-09 metrics-weekly): 가입 퍼널 위에 같은 패널·표 스타일(`admin-overview-dashboard.module.css`, `web-analytics-dashboard.module.css`)로 둔다. 제목 "주간"(퍼널과 같은 `FanHeading`·`.funnelHeading`)과 오른쪽 `FanAction` 보조 버튼(CSV 내려받기, `Download` 아이콘은 `fan-icons`로 가져옴). 열은 주(월~일, KST)·가입·주간 활성·글·댓글·포인트 지급·하트 지급·누적 가입이고, 누적 가입 칸 아래에 "3,000명 중 N.N%"를 보조 글씨로 붙인다. 최근 8주를 최신순으로 쓰며 이번 주는 "집계 중"을 붙인다. 기간 선택(7·30·90일)과 무관하다. 1440에서는 전체 폭, 390에서는 표가 760px 최소 폭의 가로 스크롤 영역이고 주 열만 왼쪽에 고정한다(8열이라 한 화면에 들어가지 않음). 굵기는 400·700만 쓴다. 집계 기준은 표 아래 `details`에 두고 문구는 컴포넌트 안에 ko/en으로 둔다. CSV는 같은 열에 목표 대비 % 열을 더하고 UTF-8 BOM을 붙인다. 확인은 로컬 DB 복사본의 실제 응답을 넣은 390·1440 ko/en 화면이며 운영·dev 관리자 화면은 보지 않았다.
- 채널 운영자 관리 화면(`/admin/operators`, `components/admin/channel-operator-manager.tsx`): 전체 관리자(`role: admin`)만 열 수 있고 조회 전용 관리자는 접근 불가 화면을 본다. 관리자 목록 화면의 `admin-directory-manager.module.css`와 `AdminOperationsShell`·`AlertDialog`를 그대로 재사용하며 새 토큰을 도입하지 않았다. 구성은 제목 → 지정 패널(채널 선택·이메일·지정 버튼) → 운영자 표(이메일·상태·지정일·해지일·작업)이다. 390px에서는 표가 카드 목록으로 바뀐다. 해지는 확인 창을 거치고 해지된 행은 흐리게 남는다(기록 보존). 안내 문구(보조 설명)는 두지 않았고 오류·성공 메시지만 표시한다. 문구는 컴포넌트 안에 ko/en으로 두었으며 화면 문자열 카탈로그 이전은 후속 작업이다. 검증은 합성 데이터의 PC1440·모바일390 로컬 화면이며 운영·dev 화면은 보지 않았다.

## UI-RUBRIC R04 모임 헤더 포커스 (2026-11-05)

- 모임 화면의 머리글·하단 메뉴 포커스 링은 3px Near Black(#121212)이다. 이 범위에서 계정 프로필 `.profile:focus-visible`의 2px #d11b62 링도 같은 3px ink 링으로 바뀌었다. 본문으로 바로가기 링크(`FanSkipLink`)의 포커스도 같은 3px ink다. 새 값은 없고 167행의 기존 링을 모임 머리글까지 확장한 것이다.
- 모임 하위 화면의 페이지 제목은 원본 Export 기준으로 데스크톱 32px(400)·모바일 24px인 화면(미션 조건·적립 내역·응원/선물·미션 제출)과 20/24px 계약 화면(덕질·이벤트)이 공존한다. 이번 감사에서 중첩 카드는 0건이었고 제목 크기는 화면별 원본 값이라 바꾸지 않았다. 2026-11-05 결정(UI-R11 FX-05): 화면별 제목 굵기는 통일하지 않는다. 역할별 굵기 850/800/700과 `font-weight:400` + UI 850 페이스 방식을 유지하며, 이 항목의 '별도 결정 사항'은 종결한다.

## UI-RUBRIC R06 지갑·덕질·패스포트 값 정리 (2026-11-05)

- 지갑 H1은 18px 예외 기록이 없어 계약값으로 맞췄다: 데스크톱 24px/32px, 1023px 이하 24px, 767px 이하 20px/28px. 굵기는 표준 제목과 같은 850이다(Pretendard UI 850, font-weight 400, font-synthesis none). 소스 지갑의 "내역" h2는 20px/26px이다.
- 덕질 교환 상점 `.exchangeShop` 반경은 컬렉션 사다리 16px이다(데스크톱·모바일 동일). 지원(하트) 영역 로딩은 `BenefitsSkeleton`을 쓴다.
- 패스포트 카드 사진 슬롯 `.cardMedia` 반경은 12px(컨트롤 단계), 다음 혜택 `h2`는 20px이다. 영향 화면은 패스포트 목록 전체 카드다. 카라 `contain`과 제니 원본 하단 흰색 번짐은 원본 그대로 둔다.
- 출석 7일 칸의 보너스 표시(+20P)는 규칙 줄과 중복이어서 제거했다. 응모 상세 오른쪽 메뉴의 지갑 바로가기는 "포인트·하트·응모권" 링크와 중복이어서 제거했다.
- 최애 찾기 카드 `.cardIdentity > p`(역할 줄)는 패스포트 보유 배지 높이(24px)와 같은 min-height를 가져, 배지 없는 카드도 팬페이지 문구가 같은 위치에서 시작한다(전: 보유 카드와 2px, 390px에서 카드 높이 5px 차이).

## UI-RUBRIC R09 내 활동 내역·운영 제목 기록 (2026-11-05)

- 내 활동 내역 `/my/activity`(D10, `fan-history-screen`)는 덕질 계열이라 제목을 덕질 H1 계약(390px 20px, 768px부터 24px)에 맞췄다. 굵기는 기존 700, 줄 높이 1.3은 유지한다(이전 28px/700). 1440 측정: 24px·700·31.2px.
- D10 본문 열은 규칙이 없는 현재 값을 그대로 기록한다: `main` 최대 900px(1440에서 x270 폭 900), 안쪽 좌우 여백 40px로 제목·돌아가기·탭이 x310 폭 820에 같이 정렬된다. 390px는 좌우 16px(폭 358). 값은 바꾸지 않았다.
- 운영 회원 관리(G25)의 제목 24px/400은 바꾸지 않는다. 덕질·이벤트의 20/24px 제목 계약에 속하는 화면으로 기록한다. G12 일정 상세(`schedule-detail.tsx`, `ParticipationPage wide`)는 1440에서 x240 w960으로, 모임 하위 본문 열 960(위 모임 하위 화면 규칙)에 맞췄다. `ParticipationPage`의 기본 폭 880은 다른 화면에 그대로 둔다.
- 확인 화면은 로컬 합성 fixture 캡처이며 운영 화면이 아니다.

## CTA 위계 정리

- 행동 가치별 강도: 화면(또는 오버레이)의 핵심 다음 행동 하나만 `FanAction variant="primary"`. 닫기·확인(단순 닫음)·홈/MY로 이동·내역/기록 보기 같은 보조 행동은 `neutral` 또는 `text`로 둔다. 행동이 끝난 뒤의 완료 상태에는 primary를 남기지 않는다.
- 이유: 출석 완료 뒤 "내 출석 기록 보기"가 화면에서 가장 강한 버튼으로 남는 등 보조 행동이 핵심 행동처럼 보였다. 기존 한 화면 강조 1개 규칙(위 Primary CTA)을 그대로 적용한 것이며 새 값은 없다.
- 이번에 neutral로 낮춘 곳(문구 변경 없음): 팬페이지 이벤트 완료 모달 닫기(`gggi-event-entry.tsx`), 모임 개설 신청 완료의 둘러보기(`group-application.tsx`), 혜택 수령 MY로 돌아가기(`benefit-recipient-screen.tsx`), 내 응모 빈 상태의 혜택 둘러보기(`my-raffles-screen.tsx`), 런앤뮤직 홈·확인(`runmusic-screen.tsx`), 크리에이터 Instagram 권한 안내의 돌아가기(`connection-screen.tsx`), 지원금 정산 검토 내역(`group-event-support-screen.tsx`), LIVE 예약 완료 다이얼로그의 계속(`live-event-screen.tsx`).
- 지갑 출석 완료 뒤 "내 출석 기록 보기"도 같은 규칙으로 neutral로 낮춘다. 모임 상세 잠금 가입, 디렉터리, 댓글·글쓰기 등록 화면은 이 규칙의 변경 대상에 넣지 않았다.
- 빈 상태의 유일한 다음 행동은 강조(primary)를 유지한다. 내 응모 빈 상태의 혜택 둘러보기를 primary로 되돌렸다. 혜택 수령 화면은 수정 가능 상태의 "수정"이 그 상태의 주 행동이라 primary이고, 읽기 전용 상태는 강조 없이 둔다.

## 포인트 지급 연출 (2026-11-05)

- 공통 소유자는 `components/fan-ui/point-reward-burst`(`usePointRewardBurst`·`PointRewardBurst`)다. 포인트가 실제로 지급되는 행동의 완료 시점에만 쓴다. 현재 연결: 지갑 출석 체크인, 그룹 미션 제출이 완료로 바뀔 때.
- 값: 서버 응답이 돌려준 금액(`pointsAwarded`·`rewardPoints`)만 쓴다. 잔액 차이나 고정 숫자로 추정하지 않고, 응답이 `replayed`이거나 0 이하면 재생하지 않는다. 1200ms 안에 연달아 지급되면 합산해 한 번 재생한다. 라이브 `scoreDelta`는 팬 점수라 연결하지 않는다.
- 위치·시간: `document.body` 포털, `position: fixed`, 화면 가로 중앙·세로 38%, z-index 1000. 레이아웃 자리와 입력을 막지 않고(`pointer-events: none`) overflow·sticky 헤더에 잘리지 않는다. 일반 1.5초, 모션 줄이기 2.6초.
- 색 토큰(`point-reward-burst.module.css`의 `--pr-*`): 금액 글자 `--pr-pink` #be185d(LIVE 핑크 계열), 금액 알약 선 `--pr-pink-line` #ffd0e6, 배경 흰색. 별 캐릭터·동전·반짝이 색도 같은 변수로 모은다. 금액 글자에 흰 블러·그림자를 쓰지 않는다.
- 접근성: 이중 낭독 금지. 화면에 이미 완료 `role="status"`가 있으면 `announce={false}`로 연출 자체의 안내를 끈다(출석·미션이 해당). 안내가 따로 없는 화면은 기본값으로 쓰며, 같은 금액이 반복돼도 노드를 교체해 다시 읽힌다. 연출 본체는 `aria-hidden`이다.
- 모션 줄이기(`prefers-reduced-motion`): 입자·움직임 없이 별과 "+N P"만 정지 상태로 표시한다.
- 확인은 로컬 합성 fixture(390·1440)이며 운영 화면이 아니다.
- 지갑 폭: 지갑 페이지 폭은 공통 `FanContentContainer`(최대 1440px) 하나로 정한다. 별도 1040px 폭을 두지 않으며, 패널 폭은 컨테이너 안쪽 grid로 정한다.
- 내 응모·지갑 상단 탭 쌍: 현재 탭은 채운 primary 그라데이션이 아니라 공통 탭 현재 값(글자 #ad1457, 배경 #fff0f6, 테두리 #d11b62, 굵기는 비활성 탭과 같은 `--fan-tab-weight` 500)으로 위치만 표시한다.

## 혜택 요약 ? 도움말

- 사용자 명시 요청에 따라 "도움말 문구 금지" 규칙의 예외로 혜택 요약 카드(포인트·모임 응모권)의 라벨 옆 ? 버튼에만 짧은 설명을 둔다. 다른 화면에는 확장하지 않는다.
- 공통 소유자는 `features/group-wallet/ui/help-hint.tsx`다. 클릭(터치는 탭)으로 고정, 호버(마우스만)·포커스로 열림, Esc로 닫고 포커스 복귀, 바깥 누름으로 호버·포커스 열림까지 닫힘, `aria-expanded`·`aria-controls`·`aria-describedby`와 `role="tooltip"`. 팝오버는 카드 안쪽 폭(좌우 12px)에 맞춰 열려 390px에서도 화면 밖으로 나가지 않는다. 버튼 24px, 눌림 영역은 ::after로 44px까지 확장.
- 문구는 `walletHelpCopy`(12개 언어). 포인트→응모권 전환은 광고를 본 뒤에만 열리므로 그렇게 적는다. 포인트 적립처는 코드로 확인된 출석체크·모임 미션·댓글만 쓰고(댓글 적립은 그룹 지갑과 같은 `mobile_fan_economy_ledger`의 `fan_point` 원장) 금액은 적지 않는다. 하트는 지갑 자산이 아니어서 지갑에 하트 카드와 ?를 두지 않는다.
- 확인 화면은 로컬 합성 fixture 캡처(390·1440)이며 운영 화면이 아니다.

## 모임·팬페이지 공통 레이아웃 정리 (2026-11-05)
- 가로 폭과 좌우 여백은 공통 `FanContentContainer`(최대 1440px, 좌우 16/32/40px) 하나가 정한다. `GroupShell`의 `main`도 이 컨테이너를 쓰고 `groups.module.css`의 `.page`는 세로 여백(데스크톱 32/48, 1023px 이하 24/32)만 가진다. 그래서 모임 화면의 좌우 여백은 390px 16, 768~1279px 32, 1280px 이상 40이다. 이전에는 768~1023px가 16, 1024~1279px가 40이었다.
- 탭 목록(홈·게시판·방·캘린더·멤버·랭킹)은 `features/groups/ui/group-tab-links.tsx` 하나가 소유하고 `CreatorGroupHeader`와 `GroupDetail`이 같이 쓴다.
- `GroupPresence`는 compact 형태 하나뿐이다. 접속·방문 지표와 아티스트 한 줄을 보여 주고, 아티스트가 접속 중이면 접속 중인 이름만 적는다. 이전의 별도 요약 형태는 크리에이터 없는 fan 상세 분기에서만 쓰였는데, 그 분기는 앞에서 로딩·오류 셸을 반환해 화면에 나온 적이 없다. 지금은 compact 하나뿐이고 크리에이터 헤더에서만 보인다. 접속·방문 이력이 없는 아티스트는 빈 행을 만들지 않고 줄 자체가 없다(비어 있는 칸을 남기는 것보다 낫다고 판단). 브랜드·취미 페이지는 숨김을 유지한다.
- 확인: 로컬 합성 fixture(390·768·1440)에서 가로 스크롤 없음. 운영 화면이 아니다. 혜택·지갑·래플 화면은 원래 `FanContentContainer`를 직접 쓰므로 값이 바뀌지 않는다.

## 모임 화면 열 폭 규칙 (2026-11-05, UI-R10-FIX-LAYOUT-2)
- 목록·그리드·대시보드 화면은 `FanContentContainer` 전체 폭(최대 1440px, 좌우 16/32/40px)을 쓴다. 화면별 `max-width`로 좁히지 않는다.
- 폭을 좁히는 화면은 단일 흐름 작성 폼과 글을 읽는 화면뿐이다. 읽는 열은 최대 720px이고 가운데에 둔다. 모임 개설 신청 패널은 760px에서 720px로 맞췄다. 일정 상세(G12)는 글을 읽는 화면이라 960px에서 720px 가운데 열로 맞췄다(UI-R10-FIX-LAYOUT-3).
- 화면별 분류(1440, 전→후): G07 글 읽기 x200 w720(1040 칸 안 가운데, `.creatorPostRead.creatorPostRead>*`로 `.detail{width:100%}`와의 specificity 동률을 이김) → 2026-11-09 shell-width: x40 w1040(칸 전체, 탭 왼쪽 끝과 같음, 센터 규칙 삭제) · G10 모임 목록 x360 w720→x40 w1040(본문, 옆 영역 별도) · G11 캘린더 x40 w1360 유지 · G12 일정 상세 x240 w960→x360 w720 · G18 미션 제출 폼 w960→w720 가운데 · G19 행사 상세 w720 가운데 유지(단일 흐름) → 2026-11-09 shell-width: w720 왼쪽 정렬(x40) · G20 행사 응원 대시보드 w960→x40 w1360 · G21 미션 그리드 x40 w1040+옆 영역 유지 · G22 선물 등록 신청 w1360→x360 w720 가운데(단일 흐름 작성 폼, 제목·폼 `.main>h1`·`.main>.form`, 390은 w358 유지) · G23 수익 목록 w960→w1360. 팬페이지 둘러보기(D11) 결과가 2개면 2열로 행을 채운다.
- 390px에서 작성 폼은 1열이다. 라벨은 입력 위에 두고, 신청 폼의 사진 영역도 이름 입력 위로 쌓는다. 게시판 글쓰기 폼은 제목·내용이 한 열로 쌓이며(라벨이 `display:contents` 필드셋 안에 있어도 한 줄을 모두 쓴다), 사진 추가 입력은 화면 안에 있다.
- 390px의 게시판 이야기 행은 카드와 같은 16px 거터에 글자를 맞춘다(행 안쪽 12px 여백 제거). 옆 영역 제목 행("내 페이지"·"오늘의 활동")의 "전체 보기" 같은 이동 링크는 제목 행 오른쪽 끝에 둔다.
- 확인: 로컬 합성 fixture(3128) 390·1440 캡처. 운영 화면이 아니다.

## 인기 게시판 표

- 인기 게시판 표에서 썸네일이 없는 행은 빈 자리 없이 제목을 왼쪽 끝에 붙이고, 작성자·시간·조회·추천 수치 열은 모든 행에서 같은 위치에 정렬한다. 제목 열과 작성자 열 사이에는 16px 간격을 둔다.

## 덕질 혜택 실패 알림

- 혜택 화면의 지갑·응원·카탈로그 실패 알림은 지갑 구역 바로 아래 한 목록에 모은다. 문구가 같으면 알림 한 개만 보이고 "다시 시도"는 같은 문구의 실패 요청을 모두 다시 부른다. 문구가 다르면 각각 보이며 간격은 16px이다. 알림은 흐림·inert 밖에 둔다.
- 이미 받은 내용(카탈로그 항목, 응원 지원 대상 래플 목록)은 요청이 일부 실패해도 흐림과 "곧 안내해 드릴게요" 칩을 유지한 채 가리지 않는다. 받은 내용이 하나도 없을 때만 실패한 구역을 숨기고 칩을 없앤다.
- 지갑 실패 때 잔액 자리는 "— P"·"—"로 두고 알림은 목록에 한 번만 보인다. 모임 응원 비활성 버튼은 opacity 대신 FanAction 비활성 글자색 토큰을 쓴다.
- 확인: 로컬 합성 fixture에서 실제 GroupBenefitsScreen 390·1440 캡처. 운영 화면이 아니다.

## 모임 달력 월 이동과 퀴즈 결과 보상 (2026-11-05, UI-R10-FIX-A2)

- 모임 화면에 들어간 달력(1024px 이상)의 월 이동은 제목 행에서 "일정" 제목 오른쪽에 둔다. 달력 위쪽 여백 84px을 두고 월 이동을 절대 위치(왼쪽 200px, 너비 360px)로 올린다. 768~1023px에서는 월 이동을 오른쪽 끝에 맞춘다. 1024~1120px 구간에서는 장식 그림을 .56배로 줄여 월 이동의 다음 버튼과 닿지 않게 한다.
- 제품이 지원하는 12개 언어(ko·en·ja·zh-Hans·zh-Hant·es·id·vi·th·pt·fr·ru)의 제목·전체 LIVE 버튼 오른쪽 끝은 1024·1100·1440px에서 가장 긴 러시아어도 164~172px로 월 이동 시작(232~240px)과 겹치지 않는다.
- 퀴즈 결과의 보상 영역(.rewards)은 한 겹이다. 안쪽 테두리 카드를 없애고 위아래 1px 구분선(--color-line-subtle)만 두며 안쪽 여백은 0이다. 모바일에서는 위 간격 24px을 둔다.
- 확인: 로컬 합성 fixture(presenceFixture) 화면이며 운영 화면이 아니다.

- 적립 배지(`EarnBadge`, 2026-11-05): `icon` 18px 노란 P 코인, `inline` 분홍 `+nP · 도장 ×남은횟수`, `done` 회색 체크+"오늘 완료". 상태는 색만으로 전달하지 않고 모양·문구와 스크린리더 문구("포인트 N 적립")를 함께 쓴다. 수치와 남은 횟수는 `today` 응답 그대로이며 응답 전에는 그리지 않는다. 팬 페이지 오른쪽의 "오늘의 덕질" 타일 목록은 상한에 도달한 타일을 완료 배지로 바꿔 뒤로 보낸다.

## 패스포트 쪽·하트·등급 표시 (2026-11-06, PR-P2-UI)

- 등급은 크리에이터 하트 수로 정한다. 하트는 패스포트 한 쪽(스탬프 9칸)을 채워 받으면 1개씩 쌓이며 지갑 자산이 아니다. 2쪽부터는 찐팬 칭호가 있어야 받을 수 있고, 찐팬이 아닌 팬에게는 등급 상한이 없다. 그래서 화면 어디에도 "골드 = 찐팬"으로 쓰지 않는다.
- 골드 이상 방은 찐팬만 들어간다. 조건이 모자란 회원에게도 방은 보이며 입장 버튼은 비활성이고, 뱃지는 "등급 · 찐팬", 행동은 해당 크리에이터의 인증 목록 하나다.
- 등급 옆의 팬 점수 숫자와 진행률은 제거한다. 점수는 혜택 잠금 조건과 스탬프 보상 줄에만 남긴다. 새 설명 문구는 추가하지 않는다.
- 미션북은 `ink-v1` 스탬프 그림을 쓴다. 입국 칸은 전용 그림이 없어 welcome을 쓴 임시 매핑이다.
- 이유: 새 정책에서 등급과 입장 조건이 점수가 아닌 하트·찐팬으로 바뀌었다. 지시서가 가리킨 88행은 현재 파일에서 커뮤니티 탭 규칙이어서, 해당 내용은 이 절에 새로 적었다.

## 덕질 2단 구성 (2026-11-06, 사용자 지적)

- 사용자 원문: "현재 이 오밀조밀 화면에 비해, 덕질 화면은 너무 프로토타입같은 느낌 조잡한 느낌". 기준 화면은 홈이다. 측정(글자·간격·색·린트)은 통과했으나 구성·밀도·끝선·위계가 어긋났다는 지적이다. 기록은 보드 `ui-feedback.md`와 같다.
- 계약: 덕질(`/benefits`, `KYAA_GROUPS_ENABLED=true`의 `GroupBenefitsScreen`)은 홈과 같은 단 폭의 2단이다. 1024px 이상 `minmax(0,1fr) 360px`·간격 24px, 1280px 이상 `minmax(0,1fr) 384px`·간격 32px, 1023px 이하는 1단. 제목 줄은 없다(아래 "페이지 제목 숨김"). 구역 사이는 `--fan-section-gap`(32/48)이다. 오른쪽 단은 고정(sticky)하지 않는다. 홈 하니스와 같은 x(본문 40~984, 단 1016~1400, 1440 기준)에서 확인했다.
- 계약: 본문은 "오늘의 덕질", "랭킹"(`rkTitle`), 럭키드로우(흐림) 순이다. 구역 제목 줄의 "전체 보기"는 화살표 끝이 아래 버튼·금액 끝과 같다(링크의 안쪽 여백만큼 오른쪽 음수 여백. 홈 "전체 이벤트"의 같은 어긋남은 홈 소유라 이번에 고치지 않음). 펼친 목록은 같은 자리의 "접기"(기존 `Show less` 번역 키 재사용, ko "접기")로 되돌린다.
  - "오늘의 덕질": 가입한 팬페이지별, 아직 출석하지 않은 페이지 먼저, 5개 + 펼침(최대 50). 1024px 이상은 2열 타일(이미지 44px·이름·연속 n일·오른쪽 행동, 외곽은 지갑 카드와 같은 12px 반경·1px 선, 간격 12px, 홀수면 마지막 칸 비움), 1023px 이하는 1열 행. 정책 꺼짐이면 그리지 않는다. 비로그인은 구역을 유지한다(`비로그인 화면(전 화면)` 행).
  - "랭킹": 주간 상위 5행, 제목 줄 "전체 보기"는 `/rankings`, 기준 시각은 목록 아래 13px. 768px 이상 행은 열로 나뉜다: 이미지 44px(순위는 이미지 모서리의 22px 원, 이미지 세로 중심 기준이라 이름이 여러 줄이어도 사진에 붙어 있음) / 이름과 팬미팅 준비 중 배지 / `찐팬 n/100`과 막대(768~1023 140~224px, 1024~1279 112~224px, 1280 이상 224px, 6px) / 내 하트 / `하트 n개`(보이는 행 중 `내 하트` 값이 있는 행이 없으면 그 열을 없애 막대를 하트 수 쪽으로 붙인다). 행 높이가 같고 열이 행끼리 같은 x에 선다. 767px 이하는 `/rankings`와 같은 쌓은 구성(이름은 줄바꿈). `/rankings` 화면 자체는 바꾸지 않았다(`embedded` 변형은 덕질에서만 쓴다).
  - 럭키드로우(곧 안내): 24px 구역 제목이 아니라 "오늘의 덕질" 타일과 같은 외곽선 한 줄 카드(12px 반경·1px 선, 이름 16/700 + 오른쪽 `곧 안내해 드릴게요` 상태 배지 13/700 알약, 눌리는 모양이 아님)다. 흐린 카드·흐린 제목·`inert`는 없고 화면은 카탈로그를 요청하지 않는다(`BenefitsCatalog`·`BenefitsComingSoon`은 로컬 미리보기 하니스용으로 남기고 카탈로그 실패 처리와 시험은 그 단독 형태에서 확인한다). 2026-11-04 승인("덕질 응모권 전환 우선 공개")의 "제목을 남긴 채 흐림, 160~480px"을 대체한다. 3차 검토(실제 dev 랭킹 1행)에서 큰 제목만 덩그러니 남아 왼쪽 단 아래가 비어 보여 카드 한 줄로 바꿨다. 전체 실패 때는 이 줄도 숨긴다.
- 계약: 오른쪽 단은 지갑 카드 한 장이다. 위에 잔액 2칸(포인트·모임 응모권, 라벨 13px, 숫자 28/36, 칸 사이 1px 세로선), 구분선 아래 `100 P → 1장`과 전폭 교환 버튼, 구분선 아래 소제목 "내역"(16/24 `Pretendard UI 650`, 사이드 보조 제목 역할) + 제목 줄 "전체 보기"로 펼치는 최근 행(1024px 이상 3행, 그 아래 5행. 펼치면 API가 준 전부). 날짜는 보조 글자색(`--color-muted`). 비로그인은 카드와 잔액 칸(`FanLockedValue`), 실제 교환 비율, 교환 자리의 로그인 버튼을 두고 내역은 1024px 이상에서 `FanLockedRows`로 둔다. 홈 사이드의 프로모 카드는 넣지 않는다(결정). 럭키드로우가 한 줄이라 왼쪽 단이 짧아져 오른쪽 빈 공간은 줄었다. 1023px 이하는 카드(잔액·교환)가 제목 바로 아래, 내역은 랭킹 다음의 카드 밖 목록이다(같은 마크업을 CSS 배치로 나눔).
- 계약(위계, 사용자 지적 "교환은 100P가 있어야 가능하지 않나? 그때에만 활성화"로 2026-11-06 변경, 1차 검토 H6의 "출석 전이면 출석하기가 강조"를 대체): **교환은 포인트가 `pointCost` 이상일 때만 활성이고 그때만 강조(primary)다.** 이때 `출석하기`는 모두 비강조(neutral)다. 포인트가 부족하면 교환 버튼은 비활성(공통 `FanAction`의 비활성 값인 회색 알약, 새 문구 없음. `100 P → 1장` 줄이 조건을 보여 준다)이고, 출석하기 버튼이 보이면(정렬상 첫 번째) 그 첫 `출석하기`만 강조한다. 이때 지갑 쪽 강조는 없고, 출석 전 페이지도 없으면(전부 완료·입국 심사만 남음·가입 0·불러오기 실패) 화면에 강조가 없다. 경계: 99P 비활성, 100P·101P 활성. 출석으로 포인트가 `pointCost`에 닿으면 강조가 출석하기에서 교환으로 옮겨간다. 포인트 조회가 끝나기 전에는 출석하기가 비강조라 지갑 판정 때문에 깜빡이지 않고 지갑 카드는 조회 중 골격이다(출석 판정을 기다리지 않는다). `/my/wallet?view=attendance`의 목록은 기존 표시 그대로다. 교환 버튼은 강조·비활성 모두 48px 알약이라 상태가 바뀌어도 아래 내역이 밀리지 않는다. 교환 버튼 최대 폭은 1023px 이하에서 `--fan-action-max-width`(320px), 1024px 이상 카드 전폭이다.
- 계약(상태): 구역 안 빈 값·오류는 한 줄 형식(`FanState` `inline compact`: 14/20 제목 + 같은 줄의 text 행동)이며 카드 안 상태 제목은 소제목(16px)보다 크지 않다. 지갑·오늘의 덕질·랭킹·내역이 모두 실패하면 내용 없는 구역 제목과 내역 탭은 그리지 않고(구역은 숨긴 채 마운트해 다시 시도가 동작) 지갑 자리에 같은 한 줄 형식의 알림 하나와 "다시 시도" 하나만 둔다. 이 다시 시도가 네 구역을 모두 다시 요청한다. 한 줄 형식의 제목은 500 굵기(소제목처럼 읽히지 않게), 끝의 마침표는 없애고, 행동 글자 끝은 아래 버튼·금액 끝선과 맞춘다. 일부만 실패하면 해당 구역 안에 그대로 둔다(지갑은 기존처럼 제목 아래 알림). 로딩 골격은 오늘의 덕질 타일 2개, 랭킹 3행(768px 이상은 실제 열 구성과 같은 모양), 내역 5행, 교환 버튼은 알약 모양이다. 행 수를 모르므로 이동을 없앨 수는 없고, 기본 값(가입 3·랭킹 5행)과 dev 모양(가입 2·랭킹 1행)의 중간으로 잡았다(로딩 전후 높이: 1440 기본 오늘의 덕질 +82px·랭킹 +141px, dev 오늘의 덕질 0px·랭킹 -135px, 지갑 +4px, 내역 0px / 390 기본 오늘의 덕질 +69px·랭킹 +184px, dev 오늘의 덕질 0px·랭킹 -143px).
- 계약(대화상자): 출석 대화상자 제목은 눌린 행의 페이지 이름을 쓴다(ko "{이름} 출석체크", 이름을 모르는 호출부는 "출석체크", 다른 언어는 이름 없는 기존 일반 제목). 이전의 고정 문구 "엔카이브 출석체크"는 쓰지 않는다. 출석 요청은 눌린 행의 크리에이터로 나간다(시험으로 확인). 대화상자의 불러오기 실패 버튼 문구는 `다시 시도`다(출석 요청 실패의 재시도는 `출석하기` 그대로).
- 계약: `#wallet-history`로 들어오면(`/my/wallet` 이동, `HistoryTabs`의 적립·사용 탭) 내역을 펼친 상태로 열고 고정 헤더 아래로 가려지지 않게 제목이 보이는 위치로 스크롤한다(`scroll-margin-top`). `/my/wallet`의 이동 규칙, `HistoryTabs`의 주소, `/my/wallet?view=attendance`의 기존 화면은 그대로다. `MyAttendanceList`의 다시 시도 버튼 문구는 `출석하기`가 아니라 `다시 시도`다.
- 대체 관계: "덕질 요약·교환 정돈(2026-11-04)"의 요약 카드 3장·교환 하단 바 계약과 "덕질 응모권 전환 우선 공개"의 하트 비활성 선택지 표시를 배치 면에서만 대체한다(교환 선택 카드·체크는 없앰. 교환권이 생기면 다시 둔다). 광고 후 교환·정책 비율·응모권 전환 대화상자·실패 알림("덕질 혜택 실패 알림")의 계약은 그대로다. "모임 화면 열 폭 규칙"은 목록·대시보드가 컨테이너 전체 폭을 쓰라는 규칙이며, 2단은 전체 폭을 본문과 사이드로 나눠 쓰므로 위반이 아니다(모임 목록의 "본문 + 옆 영역"과 같은 형태).
- 문구: 새 번역 키를 만들지 않았다. 기존 키(`dukjilTodayTitle`, `rkTitle`, 모임의 전체 보기·둘러보기·다시 시도, 지갑의 내역·로딩·오류, 내 화면의 `Show less`)만 쓴다. 보조 설명 문장은 없다.
- 제목 위계 확인(1차 검토 M7): `DESIGN.md` 역할 값에 화면 제목(h1)과 구역 제목(h2)이 다르게 정해진 값은 없다(둘 다 390 20px·768+ 24px·850, 줄 높이만 h1 1.4/h2 1.2). 모임 하위 화면의 32px 제목은 화면별 원본 값이라 덕질에는 적용하지 않는다. 값을 새로 만들지 않았고 덕질의 "덕질"과 "오늘의 덕질"은 같은 크기로 남는다(위아래 구분은 간격 32px로만 한다). 사용자 판단이 필요하면 공통 제목 규칙에서 정한다.
- 로컬 하니스(합성 데이터, 운영·dev 아님)에서 확인: 390·1440 로그인(기본값과 dev 모양 `joined=2&rank=1&hist=30&points=436&tickets=12`)/비로그인, 출석 전부 완료, 값 많음(가입 12·내역 30·랭킹 100행 응답·1,234,567 P·9,999장), 빈 상태, 전체 오류와 일부 오류, 긴 이름, 영어, 1024·1280·768, 대화상자(두 번째 행에서 눌러 제목과 요청 대상 확인, 모두 출석하면 강조가 교환으로 이동), 해시 진입, 12개 언어의 390·1440과 KO/JA/VI/TH의 360·768(가로 스크롤 없음).
- 확인하지 못한 것: dev·운영 실제 화면과 실제 값(합성에서만 맞고 dev에서 다르면 통과가 아니다), `/my/wallet?view=attendance`의 실제 화면, 교환 대화상자 실행, 도움말(`?`) 버튼 24px(기존 공용 컴포넌트 값, 바꾸지 않음), 포인트 부족 때 교환 불가 사유 문구(코드에 사유 문구 자체가 없음), 홈 실화면과의 나란히 비교.
- 계약(페이지 제목 숨김, 2026-11-06 오케스트레이터 결정, 2차 검토 M5): `DESIGN.md`에 화면 제목(h1)과 구역 제목(h2)을 가르는 값이 없어(둘 다 20/24·850) 새 값을 만들지 않고, 덕질의 "덕질" h1은 화면에서 숨긴다(`srOnly`, 문서 구조·스크린 리더용 h1 유지. 활성 탭이 이미 "덕질"을 알려 준다). 첫 구역(비로그인은 랭킹)의 제목 줄과 지갑 카드 위쪽 끝이 같은 y에서 시작한다. 제목 위 여백은 기존 "모임·덕질 제목 위 여백"(390 16px / 1440 40px)을 첫 구역 제목 위 여백으로 그대로 쓴다. 다른 탭(모임·MY)은 바꾸지 않았다.
- 계약(2차 재검토 반영): "오늘의 덕질" 타일이 1개면 전폭이다(2·3·5개의 마지막 빈 칸은 유지). 정렬은 출석하기 버튼이 있는 페이지 → 입국 심사가 필요한 페이지 → 출석 완료 순이다(같은 묶음 안은 API 순서). 이름은 단어 단위로 줄바꿈한다(`word-break: keep-all`, 한 단어가 칸보다 길면 글자 단위). 내역 불러오기 실패 한 줄의 한국어 문구는 다른 구역과 같은 "…을 불러오지 못했어요" 형태("내역을 불러오지 못했어요")다.
- 확인하지 못한 것(2차): dev·운영 실화면, 실제 크리에이터 사진 위 순위 원(특히 흰 4·5위 원), 실제 긴 이름·랭킹 행 수, 영어 외 언어의 이번 변경 후 시각 확인, 영어 내역의 "+1 Tickets" 복수형(기존 문구 규칙, 바꾸지 않음), 낮음 항목 중 L5(같은 행동의 두 모양)·L8(펼침 뒤 빈 공간)·L9(`— P` 붙은 대시)·L10(3위 원 색 등)은 근거가 약하거나 결정사항이라 고치지 않음.
- 계약(3차 재검토 반영): 두 단 끝 차이(1440·1024 동일, 합성 하니스): 실제 dev 모양(가입 2·랭킹 1행·내역 30건)은 왼쪽 y 550, 오른쪽 y 688(오른쪽이 138px 김), 합성 랭킹 5행은 왼쪽 826(왼쪽이 138px 김), 합성 기본(가입 3·랭킹 5행)은 왼쪽 908(왼쪽이 220px 김). 이 이상은 요소를 늘리거나 합성 내용을 넣지 않고 빈 공간으로 받아들인다. 영어 내역의 수량 1은 단수 명사("+1 Ticket", `ticketSingular`: en·es·fr·pt·ru, 나머지 언어는 기존 이름)다.
- 알려진 한계: 390 등 1023px 이하에서 본문이 짧은 페이지(비로그인, 랭킹 1행)는 럭키드로우 아래에 빈 공간이 남는다. 원인은 공용 셸의 "짧은 페이지는 푸터가 하단 탭 아래에서 시작한다"(`fan-app-shell.module.css` `min-height: calc(100dvh - 헤더 - 하단 탭)`, 1023px 이하)이며 덕질의 하단 여백(80px)이 아니다. 셸은 공통 소유자라 이 화면에서 덮어쓰지 않았다.
- 계약(내역 행 이름, 2026-11-06 감독 대조): 내역 행은 `활동 참여`로 뭉치지 않고 실제 활동 이름을 쓴다. 내역 API(`/api/me/wallet/history`)가 행마다 `actionKey`(덕질 활동 종류. 정정 행은 회수한 활동)와 `correctionReason`(`content_deleted`·`content_hidden`·`other`)을 내려주고, 화면은 덕질 가이드의 12개 언어 활동 이름(글 쓰기·댓글 달기·공감 누르기·공유하기·친구 초대·입국 심사 퀴즈·채널 구독·라이브 예약·라이브 참여·설문 참여·미션 참여·행사 체크인·행사 후기·찐팬 도장 인증)을 재사용한다. 정정 행은 "글 삭제로 회수"·"댓글 삭제로 회수"·"숨김 처리로 회수"(12개 언어, `history-label.ts`), 그 밖의 정정은 기존 "적립 정정"이다. 출석 적립 행(정책 2P)은 "출석체크", 초대받은 친구의 100P(`invite_friend`)는 "초대로 가입"(12개 언어)이다. 활동을 알 수 없는 행(예전 행, 응원 `cheer`, 새 키)은 기존 "활동 참여"를 유지한다. 금액·지급 로직은 바꾸지 않았다.

## DUO 비로그인 상태 (2026-11-10, DUO-FIX-GUEST)

- 비로그인 머리는 기존 번역의 최애 선택 제목과 로그인 행동을 표시하고, 콘텐츠 없는 커버·아바타 영역은 만들지 않는다. 로그인 상태의 DUO 커버·프로필 규격은 유지한다.
- 찐팬/팬 순위 탭과 내역·친구 추천은 유지한다. 고정 막대 대신 공통 잠금 표시와 기존 번역의 로그인 행동을 표시한다. 비로그인 카드 본문은 5행/3행 최소 높이를 해제하고 안내 내용에 맞춘다. 안내 간격 12px, 안쪽 여백 16px은 공통 토큰을 사용한다.
- 공개 미션과 럭키드로우 영역은 그대로 표시하며 회원 전용 조회·API 권한·포인트·교환·출석 동작은 변경하지 않는다.

## 덕질 재설계 F2·F3 (2026-11-08, 사용자 지적 "벤치마킹해서 최대한 따라하자", "레이아웃 여백 이상하고")

- 대체: 위 "덕질 2단 구성 (2026-11-06)"의 단 폭(`1fr 360/384`), 오른쪽 단 = 지갑 카드 계약, 그리고 261107-2 U4·E4·E5의 "지갑 띠 + 럭키드로우·응원 한 줄" 배치를 대체한다. 교환 위계(포인트 ≥ pointCost일 때만 활성), 상태·대화상자·`#wallet-history` 계약은 그대로다. 근거: 보드 `feedback-f/plan-ux-stan.md`, `feedback-f/benchmark.md`(Duolingo 웹 본문 + 레일, 토스 내 포인트).
- 계약(폭): 1024px 이상 `grid-template-columns: minmax(0,640px) 352px`, 간격 32, 가운데 정렬(`justify-content:center`). 1440에서 1,024(좌우 208), 1024~1199에서 레일 352 유지·본문은 나머지(1024 뷰포트에서 576). 지갑은 두 열을 가로지른다. 1023px 이하는 1열.
- 계약(순서): 지갑 → 오늘의 미션 → 럭키드로우 → 최애 응원 → 오늘의 덕질 → 내역(390). 1024+는 본문(미션 → 럭키드로우 → 오늘의 덕질)과 레일(최애 응원 → 내역).
- 계약(중복 0): 덕질 본문에 등급·최애·♥ 상태 줄(`SelectedBiasBar`)을 두지 않는다. 같은 값은 헤더 캡슐(피드백 F1)이 맡는다. 지갑 안에 럭키드로우 진행 수·응원 순위 칸을 두지 않는다.
- 계약(도움말 0): 덕질 화면에 `HelpHint`·`FanHelpTip` 물음표를 두지 않는다. 규칙 안내는 지갑의 `안내 ›`(13/700, 390은 하트 라벨 줄 끝, 768+는 행동 열 위 끝) 하나다. 아래 "혜택 요약 ? 도움말" 예외는 덕질에서 더는 쓰지 않는다.
- 문구: 새 키 `stanGuide`(안내, 12개 언어) 하나. 지운 키: `stanHeartHelp`, `flowLuckyOpen`, `flowRank`, `flowRankOut`.
- 로컬 확인(3171 개발 서버, 비로그인 실제 화면과 로딩 상태): 390·1024·1440 × ko·ja·th·ru 캡처 `feedback-f/captures/stan/a/`. 지갑 390 358×230(ru는 다음 하트 문구가 2줄이라 250, 가로 넘침 0), 768+ 높이 159, 1440 칸 367/367/288. 로그인 상태(실제 값·교환·카운트)는 로그인 가능한 3000을 쓰지 않아 로컬에서 보지 못했다.
- 계약(미션 행, F3 · 위 "미션 행 (D1·F3)" 행): 행 64 · 원 40(그림 28) · 오른쪽 열 96/120 고정 · 제목과 진행 게이지 x = 64 · 화살표 없음. 오늘 할 것 행은 접지 않고 구역 머리 `오늘의 미션` 오른쪽에 `N개 남음`/`모두 완료`(13/600 muted)를 둔다(접기 머리 `오늘 할 것` 삭제). `그 밖의 미션`·`인증`은 접되 머리를 같은 행 규격으로 그린다: 원 안 `LayoutGrid`·`BadgeCheck` 20, 제목 줄 = 이름 + `+NP`(간격 8), 오른쪽 열 = 개수(13/600 muted) + 체브론 16(160ms 회전). 묶음 사이 1px `--color-line`, 행 사이 `--color-line-subtle`. 불러오는 동안 미션 구역 자리 높이 390 496 / 1024+ 500(실측).
- 계약(최애 응원): 응원 카드에는 스탬프 9칸 게이지를 두지 않는다(지갑 스탬프 칸과 같은 값). 남는 것은 최애·순위, `내 하트`·커뮤니티 수치, `팬 순위 보기` 버튼. 1024+ 레일 352에서도 1열, 제목은 본문 `오늘의 미션`과 같은 높이(링크 없는 머리는 최소 높이 0).
- 로컬 확인(B, 3127 개발 서버, 비로그인 실제 화면): 390·1024·1440 × ko·ja·th·ru 미션 7행(오늘 5 + 접힌 머리 2) 모두 높이 64(ja·ru 390의 접힌 머리만 2줄 66), 원 40·50%, 오른쪽 열 96/120, 제목 x 64, 오른쪽 끝 여백 12, 화살표 0, 응원 게이지 0. 로그인 상태의 진행 줄은 같은 CSS 클래스로 게이지를 넣은 합성 측정(행 64, 제목 x = 게이지 x = 64)이며 실제 로그인 화면은 보지 못했다. 측정 `apps/web/scripts/measure-stan-missions.mjs`.


## doc-261107 묶음 계약 (2026-11-07)

묶음에서 정한 값이다. 다른 절과 다르면 이 절을 따른다. 구현 파일과 대조한 값은 근거 파일을 함께 적었고, 로그인 화면 일부는 시험과 코드로만 대조했다.

### 이름
- 사용자 결정(2026-11-07): 머리의 별과 행위는 `팬 인증`, 퀴즈 단계와 출석 현황의 이름은 `입국 심사`다(명세 [57]). `찐팬 인증`은 쓰지 않는다. 새 페이지 신청 문구는 `운영팀이 승인하면 페이지가 열려요.`다. 사람은 `팬`, `팬 점수`·`팬 랭킹`은 띄어 쓴다. 미션북의 칸 표시는 `도장`이다.
- 오류 공통 문구는 입력 보존을 약속하지 않는다. 읽기 화면에도 함께 쓰이기 때문이다.

### 공용 부품
- 용어: 화면의 한국어는 `도장`이다. `스탬프`를 쓰지 않는다. 이 문서의 옛 기록에 남은 `스탬프`는 `도장`으로 읽는다. 코드 이름은 그대로 둔다.
- `FanPostRow` 게시판 밀도: 768 이상은 작성자 132px, 시간 52px, `조회`·`추천` 각 64px 고정 열이고 값이 없는 행도 자리를 비운다. 조회·추천은 보이는 글자로 쓴다. 390은 값이 없는 열을 뺀다.
- `FanSkeletonRows variant="member"`는 56px 행이다. 팬 행과 같아 화면별 덮어쓰기를 두지 않는다.
- 접속 띠: 768 이상은 내용 폭, 390은 균등 3칸. 머리 이름은 390에서 2줄, 768 이상은 한 줄 말줄임이다.
- `body`가 앱 글꼴을 갖는다. 모달·창·안내처럼 `body` 아래 바로 그리는 요소에 글꼴을 따로 지정하지 않는다.
- 헤더 최애 칩: 높이 44px, 등급은 1200 이상에서만 보인다. 이름 최대 폭은 1200 이상 140px, 1024~1199 52px이다. 선택 메뉴는 폭 280px, 항목 최소 높이 48px이다.
- 팬페이지에는 가입 버튼이 없다. 패스포트 발급이 곧 가입이고, 패스포트 없는 글쓰기·댓글·비밀방은 입국 심사로 보낸 뒤 그 페이지로 돌아온다. 취미·브랜드 페이지는 가입 버튼을 유지한다.
- 글 행에 쓸 사진이 없거나 못 불러오면 글 아이콘 대신 페이지 이미지를 쓴다(팬페이지, 게시판, 홈). 홈의 모임 글 행은 값이 없어 아이콘이 남는다.
- 게시판은 공지를 맨 위에 두고 쪽 번호를 항상 보이며 검색은 가운데에 둔다. 팬페이지 인기글은 반응이 없어도 최신 글로 채운다. 결과 띠와 배너 띠는 없애고 공지 행과 하루 한 번 뜨는 모달로 대신한다.
- 안내 페이지(`features/dukjil-guide`): 제목은 `--fan-heading-size-wide`·`--fan-heading-tracking`·`--fan-heading-leading`, 본문은 `--fan-body-size`·`--fan-body-leading`이다. 화면 폭에 따라 커지는 전용 크기를 쓰지 않는다. 핵심 수치는 위아래 선이 있는 한 줄 3칸이고, 수치는 `--fan-heading-size-wide`, 이름은 `--fan-description-size`(768 이상 `--fan-body-size`)다.
- 달력 머리 간격: 그림 달력 머리의 월 이동 버튼과 월 제목 사이는 1023 이하 `--space-6`, 1024 이상 `--space-12`다.
- 패스포트 신분면의 워터마크는 `images/passport/kyaa-seal.png`다. 1024 이상에서 220px, 불투명도 .45이고 390에서는 보이지 않는다.
- 끝이 잘리는 가로 탭·카드 줄은 오른쪽 페이드로 더 있음을 알린다.
- 본문은 모든 폭에서 첫 화면 높이를 채운다. 푸터는 첫 화면 아래에서 시작해 내용이 와도 밀리지 않는다.
- 이름 대체 글자는 앞 기호를 뺀 첫 두 글자이며 칸 가운데에 둔다.

### 사이드
- 팬페이지 홈 사이드 순서는 값과 무관하게 `다가오는 일정 → 팬 활동 → 찐팬 게이지 → 패스포트`다. 게이지는 기본 꺼짐이고 늦게 도착하므로 위에 끼워 넣지 않는다(시각 검토 2차 N9, F2의 `맨 위` 결정을 대체).

### 게시글·에디터
- 게시글 상세: 제목 390 20/28, 768 이상 24/34, 700. 메타 13/20 `│` 구분. 아바타 32. 본문 16/26, 폭 최대 720. 댓글 구역 `--color-soft`, 위 32, 안쪽 16(768 이상 20), 반경 12. 입력 2줄 52px, 포커스나 입력 시 104px(`features/fan-posts/ui/post-detail.module.css`).
- 리치 에디터: 도구 막대 44px(호버 바탕과 링크 입력줄 바탕은 `--color-accent-soft`), 390은 서식 한 줄 가로 스크롤과 미디어 한 줄. 본문 최소 184, 390 160. 첨부 미리보기 최대 320(`components/editor/rich-text.module.css`).
- YouTube는 누르기 전에는 포스터(mqdefault, 16:9)만 읽고, 누르면 iframe을 연다.
- 수정 폼은 열 때 서버에서 읽은 값으로만 시작한다. 저장소에 남은 값으로 폼을 채우지 않는다(`useGroupResource`의 `forEdit`).

### 패스포트
- 상세는 CSS 책과 쪽 넘김이다. 닫힌 표지는 쓰지 않고 표지 띠만 둔다.
- 값: 종이 #f7f2e8, 칸 #fbf8f1, 선 #d9cbb2, 잉크 #4a3a26, 표지 #23252b, 금박 #d8bd86. 칸 원 64px, 쪽 넘김 44px, 신원 사진 96×116. 등급 카드 뱃지 88(1024 이상 96). 미션북 칸 이름 16/700, 할 일 13.
- 작은 그림은 `passport-open-book.svg`이고 원 칸은 점선이다. MY 카드는 찍힌 칸의 도장 그림을 그 위에 올린다.
- 닉네임이 없으면 FAN NAME에 `—` 대신 `닉네임 없음`을 쓴다.

### MY·덕질·랭킹
- MY 순서: 이름, 알림, 패스포트(크게), 지갑(광고 교환), 최애(큰 사진 줄), 바로가기(격자+목록). 잠금 자리는 움직이는 막대 대신 점선과 잠금 아이콘이다.
- 2026-11-10 사용자 요청: MY 내 최애는 모임 찾기와 같은 사진·이름 격자로 표시하고 사진을 누르면 팬페이지로 이동한다. 기존 패스포트 보유 조건과 비공개 페이지 처리·사진 원본을 유지한다.
- 출석 모달: 8열(1~6일 1칸, 7일 2칸), 480 이하 3열·7일 전체 폭, 칸 최소 88px, 분홍 #fff0f6/#ad1457/#d11b62.
- 미션 카드: 한 카드 안 행 나눔, 그림 40px, 이름 15/700, 할 일 13, 막대 6px, 머리 숫자 28/36/850. 게이지: 1px 선 카드, 막대 8px, 제목 16/650.
- 랭킹: 행 3개 이상이면 단상(1위 72px 가운데 12px 위, 2·3위 56px, 칸 96px, 간격 24/16px, 순위 22px 원, 이름 16/700 한 줄 말줄임, `하트 N개` 13px). 목표 달성은 단상과 행 모두 한 줄 태그 `찐팬 달성`이고, 행에서는 이름 옆이다. 고정 행은 표시 범위 밖에서 `myHearts>0`인 가장 높은 행이며 위에 `--color-line` 1px.
- 럭키드로우: 읽는 동안 골격, 열린 추첨이 있으면 경품 카드(이미지 96×72, 반경 8, 제목 16/700 한 줄, 13px 줄, 최대 2개, 카드가 320px을 지킬 때 2열), 없으면 한 줄 카드.
- `/rankings`는 하단·상단 탭에서 덕질로 강조한다.
- 홈 랭킹 카드(2026-11-08 C3): 탭 `찐팬 순위`(누적 하트)·`크리에이터 순위`(`찐팬 N`과 하트 합계, 모든 폭. 일반 팬 수는 쓰지 않음, 사용자 QA D13). 10행(행 44), 열 `24·32·1fr·auto·auto·36`, 마지막 열은 `RankDelta`(`rank-delta.tsx`, 아이콘 12 stroke 2.5 + 숫자 12/700 tabular, 폭 36 오른쪽 정렬, 오름만 `--color-accent-ink`, 내림·같음 `--color-muted`, 전일 없음·첫 7일은 같음 표시). 1024~1199는 등급 열을 숨긴다. 바닥 줄 왼쪽 `11~20위`는 같은 카드 안에서 펼친다(설계 3절의 `/rankings#rank-11`은 `/rankings`가 주간·하트 기준이라 다른 순위가 보이므로 쓰지 않음). 빈·오류는 10행 높이를 지킨다. 머리 옆 보조 글자는 탭 기준(`누적 하트`/`찐팬 수`).
- 찐팬 100 챌린지(C7): 게이지 카드는 팬·랭킹 탭 맨 위, `찐팬 100 챌린지` 16/650 + 오른쪽 `공유`(secondary sm) / `찐팬 67 / 100명`(24/850, 달성 시 `달성` accent-ink) / `FanGauge md` / `11. 30.까지 · 운영자 한 줄`(13 muted, 있을 때만). 꺼짐·종료·로딩·실패는 카드 없음. 홈 모듈은 랭킹 카드 아래 16px, 같은 외곽(r collection, 안쪽 20), 행 56(사진 40·이름 최대 7.5em·`FanGauge sm`+`67 / 100명`), 최대 2행(내 패스포트 페이지 우선, 다음 달성률), 바닥 오른쪽 `응원하러 가기`. 목록 태그 `찐팬 100 도전 중`은 `FanTag fan`(인증 아이콘 없음)으로 모임 목록 카드 메타 줄과 홈 최애 카드 사진 왼쪽 위(8px)에 둔다. 홈 랭킹 행에는 넣지 않는다(360 폭에서 이름 칸이 사라짐). 구슬 트레이는 삭제했다.

### 소셜
- 팬 행: 56px, 아바타 40, 닉네임 15/600, 메타 13, 1px 선, 768 이상 2열 간격 24.
- 프로필 모달: 420px, 안쪽 24, 반경 16 / 767 이하 아래 시트, 위쪽 반경 20. 대화 창: 360×480, 오른쪽·아래 24, 반경 16, `--z-dropdown` / 767 이하 전체 화면.
- 대화 머리의 `친구`는 실제 친구일 때만 쓴다. 계정이 제한되면 `/my/friends`는 다시 시도 대신 제한 안내 한 칸을 보인다.

### 모임 화면
- 홈 갤러리는 외부 영상도 정사각 크롭이다(`image-framing.md`의 영상 16:9와 다름, 지정 원본 3.4절). `object-position:50% 30%`. 페이지 메뉴: 너비 280, 행 48, 글자 15, 아이콘 20, 묶음 사이 1px 선.
- 비밀방: `아바타 줄(48, 가로 넘김) → 진행 중 큰 카드(1px 선, 라일락 면, 반경 16, 안쪽 16/20) → 다른 방 격자(1px 선, 반경 12, 최소 72, auto-fit 280)`. 잠긴 방은 소프트 면+자물쇠+등급, 열린 방은 말풍선 아이콘. 검색은 방 8개 이상일 때만. 비로그인·미가입은 큰 카드·아바타 줄 없이 같은 격자와 아래 행동 하나.
- 캘린더 머리: `화살표 44 · 월 그림 · 화살표`를 본문 폭 가운데, 사진 묶음은 오른쪽 끝선(390은 아래 가운데). 머리 줄 폭의 container query(월 숫자 64~120, 사진 168~300). `일정`+`전체 LIVE`는 달력 위(1440)/아래(390), 연도·시간대는 달력 아래 13px. 월 그림·요일·날짜 칸을 바로 그리고 일정만 채우며, 빈 달 문구는 로딩이 끝난 뒤에만 보인다.
- 행사 시각은 초를 쓰지 않는다. 슬라이드 그림이 실패하면 그림 칸을 빼고 글을 남긴다.

### 안내·배너
- 가이드 상세: 히어로 h1 clamp(34px,9vw,56px)/850, 구역 번호 clamp(36px,4vw,44px)·서비스 색, 구역 h2 clamp(24px,6vw,32px). 구역 머리는 삽화(88/144, `--radius-hero`)+번호+제목. `us-fanmeetings` 위계를 따른 큰 제목 예외다. 규칙 카드는 subgrid 3트랙(이름, 수치, 한도).
- 홈 배너 `data-kind="art"`: 데스크톱은 그림이 슬라이드를 채우고 왼쪽 절반에 글(768~1199는 44%), 모바일은 그림 위·글 아래. 그림 오른쪽 기준 정렬. 배경 `color-mix(ink 88%, service-ink)`.
- **홈 배너 규격(2026-11-09 사용자 피드백 "배너가 너무 크다", 벤치마크 Weverse 홈 1080×308·반경 16·글 왼쪽/그림 오른쪽·아래 가는 인디케이터. 근거 `board/tasks/home-banner-size/benchmark-weverse.md`)**: 위의 `art`·welcome·campaign·live·guide 모든 홈 배너 슬라이드를 한 규격으로 대체한다. 이전 규격(1440에서 폭 1360×높이 680 = 16:8·최소 440, 390에서 4:5 세로 칸·최소 400, 그림이 칸을 채우고 글이 그 위에 얹힘)은 큰 사진이 첫 화면을 차지해 아래 구역이 밀려서 바꿨다.

| 항목 | 이전 | 이후 |
|---|---|---|
| 폭 | 홈 본문 폭 | 같음(본문 컨테이너 안, 배너 자체 최대 폭 없음 — 셸 폭은 공통 셸이 정한다) |
| 높이 | 1440 680 / 390 약 448(4:5) | 390 200, 768+ `clamp(300px, 28vw, 380px)`(1440 이상 380) |
| 모서리 | 20 | 20(`--radius-hero` 유지, 벤치마크 16~20) |
| 배치 | 사진이 칸을 채움, 글은 사진 위 | 왼쪽 글 열(세로 가운데), 오른쪽에 안쪽 그림 칸(여백 16, 반경 12) |
| 그림 칸 | 칸 전체 | 768+ 폭의 42%(태블릿 40%), 390 폭의 52%(정사각에 가까운 170×160) |
| 글 | 제목 32~48, 설명, 알약 버튼 | 제목 26~36(모바일 18, 3줄 말줄임), 설명(모바일 1줄), 알약 버튼(모바일은 눌림 높이 44의 글자 링크) |
| 바탕 | 종류별(검정·흰·녹색·어두운 보라) | 흰색, 단 GGGI 캠페인(아트 녹색)·안내 그림(`ink 88%`)은 어두운 바탕 |
| 인디케이터 | 점+화살표(데스크톱만 아래 줄, 모바일 화살표는 사진 위) | 모든 폭에서 배너 아래 한 줄: 화살표·점(6, 현재 22 막대)·일시정지 |

- 그림 자르기(`image-framing.md` 적용): 칸에 cover로 채우고 종류별로 얼굴·글자가 남는 위치만 정한다. 위나 환영 정사각 원본 `50% 20%`, 모바일 4:3 원본 `53% 25%`(네 얼굴이 가로 74% 안), GGGI 인물 `50% 28%`, 안내 그림 데스크톱 `right center`·모바일 `center top`, 그 밖 `50% 35%`. 빈 띠 0, 단체 사진 얼굴 잘림 0을 390·1440에서 눈으로 확인했다(지정 원본 3장과 로컬 합성 슬라이드; 운영 CMS 실제 자산은 확인하지 못했다).
- 소유자: 칸 높이는 `guest-home.module.css` `.heroViewport`, 칸 안 배치는 `home-hero-banner.module.css`, 그림 자르기는 `managed-home-banner.module.css`. 그림 `sizes`는 `homeHeroSizes()`(1440+ 572px).
- **홈 블록 순서(2026-11-09 사용자 결정, TK-REMOVE-UPCOMING-LIVE)**: 브랜드 줄·메인 배너 → 랭킹(팬·크리에이터) → 얇은 배너 → 공지·갤러리·숏츠. 홈의 '다가오는 LIVE' 블록(제목·`전체 라이브` 링크·LIVE 행 3개·쪽 넘김)은 숨기지 않고 지웠다: `HomeUpcoming`·`StreamHomeUpcoming`, 홈 조회 `featuredLives`(와 저장소 `listFeaturedPublished`·`listPublishedSlugs`), `GuestHome`의 `featuredLives` 속성, 문구 키 6개(`upcoming`·`previousLivePage`·`nextLivePage`·`noLive`·`allLive`·`detail`) 및 번역, 행·쪽 넘김 스타일(`.liveList` 등), 시험.
- 남긴 것과 이유: `nearestRecurringLives`와 `listPublishedCatalog`는 LIVE 목록 화면(`/live`)이 그대로 쓴다. `/live`·LIVE 캘린더·팬페이지 LIVE(`다가오는 일정` 사이드)는 이 결정과 무관하다. DB·API 경로는 바꾸지 않았다.


- 홈 안내 배너 그림(2026-11-09): 내장 문구 보존을 위해 안내 이미지는 `contain`으로 표시하고, 768px 이상 그림 칸은 데스크톱 원본의 2:1 비율로 맞춘다. 사진 배너는 기존 `cover`와 초점을 유지한다. 시각 검수는 별도 작업자가 수행한다.

### 2026-11-10 홈 갤러리 검토 수정

- 홈 갤러리·숏츠의 loading/error/empty는 흰색 `--color-surface`와 `--color-line`을 사용한다. 기존 핑크 자리표시 규칙의 이 화면 예외이며 회색 채움은 쓰지 않는다.
- 사진 구역은 서버가 읽은 사진의 원본 치수와 최종 열 배치를 로딩 예약에도 공유한다. 고정 570/712px 대신 동일 사진의 실제 반응형 높이를 예약한다. 치수를 아직 알 수 없는 초기 셸은 모바일 1230px(기존 570px), 데스크톱 712px를 사용한다.
- 사진의 원본 비율, 정렬·순위·숨김 결과, 12개 언어 및 400/700/800 두께 계약은 유지한다.

- 2026-11-10 스트리밍 회귀 수정: 사진 치수 조회는 갤러리의 Suspense 안에서만 기다린다. 조회 전에는 기존 고정 예약(모바일 1230px·데스크톱 712px)을 사용하고, 조회 후 숏츠 대기 중에는 같은 열 배치와 원본 비율로 예약한다. 홈 셸과 다른 섹션은 갤러리 조회를 기다리지 않는다.

### 홈 랭킹 정보 보완 (2026-11-09, rank-info)
- 홈 두 탭의 실제 데이터 행은 `ranking-rows.tsx`의 compact 변형을 쓴다. `순위·등락 | 사진·이름·LIVE | 찐팬·하트·최근 7일 증감` 한 줄, 높이 56, 사진 24, 열 `20·32·24·minmax(0,1fr)·auto`, 간격 4. 이름은 말줄임하고 원문 title을 제공한다. 390 한 카드/1440 두 카드는 기존 1024 분기를 유지한다. `/rankings`의 등급·최애·보조 정보 행은 보존한다.
- 팬의 찐팬 수는 공개 집계 대상 크리에이터 중 하트를 보유한 곳의 수다. 크리에이터는 기존 찐팬 인원이다. 하트·찐팬 수는 정렬 지표와 관계없이 표시하며 증감은 최근 7일 범위 내 가장 오래된 스냅샷과 비교한다. 앞에 실제 weekGainDays(예: 3일, 7일)와 정렬 지표의 기존 하트 아이콘/P/찐팬 표기를 함께 표시한다. 비교 기록이 없으면 일수는 표시하지 않는다. 양수 +n, 0 +0, 음수 −n, 비교 자료 없음 —. 큰 수는 locale compact 표기와 전체 값 접근성 이름/title을 함께 쓴다.
- 등락은 순위 바로 다음 `▲n`/`▼n`/`—`. 신규 태그와 분리한다. 신규는 이전 기준 집계가 존재하고 그 이후 최근 7일 안에 처음 등장한 항목이다. 첫 집계 전체를 신규로 표시하지 않는다.
- 빨간 LIVE 점은 기존 공개 LIVE 판정만 사용한다. 2026-11-10 리뷰 결정: 크리에이터 행에서 본인의 방송만 표시한다. 팬 행에는 방송 점을 표시하지 않는다.
- 상단 시각은 지표 세그먼트 위 별도 한 줄 `{시각} 기준`, 과거 집계는 날짜·시각을 함께 표시한다. 글자 400/700/800, 회색 채움 없음, 이동 표시는 문자 `›`. 기존 transform 이동·reduced-motion 분기를 유지한다.
- 이번 작업의 390/1440 실화면·사진 크롭·12언어 시각 검수와 캡처는 별도 작업자 담당이며, 코드 검사 통과로 이를 대체하지 않는다.

- 2026-11-10 리뷰 보완: 홈 메달 순위·신규·증감은 `--color-ink`. 전용 비분홍 등락 토큰이 없으므로 ▲▼도 `--color-ink`. 내 순위/로그인 면은 흰색이며 분홍은 팬/크리에이터 선택 탭과 기존 하트 자산 두 역할에 한정한다. 정렬 지표 탭은 중립 면·글자·선 토큰을 쓴다. 기존 하트 아이콘을 aria-hidden으로 사용하며 문자 하트·회색 필터는 사용하지 않는다. 행 간 `--color-line` 1px 헤어라인은 높이 56을 바꾸지 않는다. 데스크톱 크리에이터의 전체 보기 링크는 상단 한 개만 둔다.
- 팬의 찐팬 수(하트를 보유한 크리에이터 수)와 신규(기준 집계 이후 최근 7일 안 최초 등장)는 현 구현의 해석이다. 대표 원문에서 확정한 정의가 아니며 사용자 확인이 필요하다. 이번 리뷰에서는 계산을 바꾸지 않는다.

## 팬·랭킹 팬 목록 — 2026-11-09 fan-list-sort 브리프(23:22 추가 포함)

- 팬 목록 칩은 `팬 · 찐팬 · 내 친구 · 팬 랭킹` 순서다. 찐팬은 해당 크리에이터의 `heart_totals` 하트 1개 이상이다. 팬·찐팬·친구 목록은 하트 내림차순 → 누적 스탬프 내림차순 → 최근 활동 내림차순 → 내부 app_user_id 오름차순으로 읽고, 머리 오른쪽에 `하트 많은 순`을 둔다.
- `GroupMembers`의 1024px 이상 헤더는 왼쪽 칩·오른쪽 검색 입력 한 줄이다. 좁은 화면은 칩을 가로 스크롤하고 검색을 그 아래 둔다. 칩은 공통 `FanTabs` 36·14/700·반경 8, 검색은 44·반경 8, 별도 검색 버튼 없이 250ms 디바운스다. 빈 검색 결과는 78px 한 줄이다.
- `SortedFans`는 아바타 40·행 최소 64·이름 15/700·메타 공통 토큰을 사용한다. 하트·스탬프가 없으면 0을 표시한다. 공개 목록 행에는 회원 식별 값이 없어 프로필 열기 행동을 두지 않는다. 기존 팬 랭킹은 별도 경로를 유지한다.
- **첫 하트 시각(2026-11-10 감독 결정):** 브리프의 상대 시간 요구보다 DESIGN의 날짜 2형식 규칙을 우선한다. 서울 기준 피드 형식 `11. 08. 13:47`로 표시하고, 올해가 아니면 `2025. 11. 08. 13:47`처럼 연도를 붙인다. 기존 `localScheduleTime` 절대 날짜 유틸을 재사용한다. 12개 언어의 라벨은 유지한다. 상대 시각 호출과 N23 예외는 없다.
- 이번 구현 워커는 실제 390·1440 화면을 **못 봄**. 긴 닉네임·12개 언어 칩 길이·행 메타 잘림·모바일 다음 칩 노출·실제 높이는 별도 캡처 워커가 판정한다. 계약·컴포넌트 시험을 시각 검수 통과로 간주하지 않는다.

### 팬 목록 날짜 잘림·공개 응답 수정 — 2026-11-10 mini 검토

- 찐팬 메타는 12개 언어에서 짧은 라벨(찐팬·True fan·熱烈ファン 등)을 먼저 쓰고 날짜를 분리한다. 날짜는 `flex-shrink: 0`, 라벨에만 말줄임이다. 날짜의 월·일 순서와 구분자는 선택 언어를 따르며, 24시간 시·분과 서울 기준 다른 해 연도 표시는 유지한다.
- 날짜 줄 아래에 스탬프를 표시한다. 새 정렬 목록 행의 최소 높이는 구분선 포함 64px(내용 최소 63px + 선 1px)이다. 아바타 40·기존 이름/수치 규격은 유지한다.
- `fan-list-overflow.browser.spec.tsx`는 실제 행·메타 컴포넌트와 CSS로 390px에서 긴 닉네임, 하트 12,345, 스탬프 1,234, 12개 언어 × 올해/다른 해 24건을 검사한다. 날짜 전체 텍스트 범위·행 안 경계, 라벨 선행 순서, 가로 넘침, 행 56~64px를 실제 Chromium에서 확인한다. 브라우저 fixture 검증이며 운영 화면 검수와 구분한다.
- `last_active_at`은 서버의 정렬과 암호화 커서에만 남긴다. 새 정렬 API의 공개 행은 닉네임·아바타·등급·하트·스탬프·첫 하트 시각 6개 필드다. 구형 `?hearts=1` 공개 API의 4개 필드(닉네임·아바타·등급·하트)는 유지한다.

### 2026-11-10 승인 사용자 피드백: 홈 랭킹 카드

홈 랭킹에 한해 위의 과거 탭·행 규칙을 대체한다. 소유자는 `features/rankings/ui/home-ranking-card`와 `ranking-rows`의 compact 분기다. 셸·푸터·전체 `/rankings` 지표는 보존한다. 한 카드 안 오늘의 랭킹(15/700)·실제 집계시각(11) → 찐팬 → 크리에이터 → 전체 보기. 양쪽 하트 기준을 명시 요청하며 로그인은 각 1~10위, 비로그인은 최대 공개 1~5위이며 각 구분이 공개 상한 5행일 때만 순위 범위를 확정하지 않는 로그인 진입(44px)을 둔다. 소수·빈 데이터에는 이 행을 두지 않는다. 없는 행은 생성하지 않는다. 행34px·아바타28px·순위16px·이름12/700·하트12/400·증가11/400, 카드 위12px·머리24px·구분20px·그룹간8px·하단36px·반경12px. 승인된 압축 행의 터치 영역은 행 전체다. 이름과 등락은 같은 flex 묶음으로 실제 이름 끝부터 등락 시작까지 gap8px, 이름 최대 폭은 팬142px·크리에이터72px(390 기준)이며 긴 이름만 말줄임한다. LIVE가 있으면 등락 앞6px 점+간격8px을 사용한다, Chevron12/stroke2.5/숫자간4px, 크리에이터 찐팬62px. 390 카드358px에서 팬 이름은 최대142px·크리에이터는 최대72px. 이는 09:43 주 감독의 실제 문자 끝~등락 8px 정정에 따른 승인 격자 보정이다. 숫자 우측 정렬·tabular, 이름만 말줄임. dayGain은 전날 KST 스냅샷 대비 하트이며 null/0/음수를 보존한다. 프로필에는 응답의 로그인 전용 profileRef를 원문 전달하고 기존 ProfileModal/AccessibleOverlay를 재사용한다. 홈 랭킹 참조로 연 프로필에 한해 데스크톱 폭480px을 적용하고 모바일은 기존 바텀시트를 유지한다. 기준은 board/tasks/user-feedback-20261110/rank/plan-ux.md 및 390.png, 사용자 최신 구현 승인이다.

### 2026-11-10 콘텐츠 피드백 3 — 컴팩트 갤러리

- `CreatorMediaPanel`이 소유하는 원래 팬페이지 게시판 미디어(`/<slug>?tab=board&section=media`)와 홈 `preview` 갤러리는 동일한 촘촘한 정사각 썸네일 격자를 사용한다. 768px 미만 3열, 768px부터 4열, 1024px부터 6열, 간격 4px이다. 홈 미리보기의 2.2칸 가로 스크롤은 이 역할에서 사용하지 않는다.
- 썸네일에서 제목·URL·작성자·날짜·사진/영상 유형 글자를 숨긴다. 접근 이름, 비문자 재생 표시, 기존 LIVE 상태, 실제 상세/선택 동작과 원문 데이터는 보존한다. 현재 실제 2건을 반복 복제해 칸을 채우지 않는다.
- 정사각 크롭은 이 미리보기 역할에만 적용한다. 얼굴·피사체를 실제 390px/1440px에서 확인하고 상세의 원본 비율을 유지한다. 사용자 `feedback-3.png`의 엔카이브 헤더·게시판 탭 아래 영역이 근거이며 공통 셸·푸터는 변경하지 않는다. 기존 외부 영상의 자연 비율 규칙은 상세와 이 컴팩트 갤러리 외 호출에서 계속 적용한다.

### 홈 배너 제어 (2026-11-10 사용자 지정)

좌우 이동 화살표는 배너 안 양끝에 배치하고, 아래에는 40px 선형 인디케이터를 둔다. 화살표는 배너 높이의 가운데에 둔다. 일시정지 버튼은 제거하며 수동 이동 시 자동 재생을 멈춘다. 기존 배너 내용과 크기는 유지한다.

### 홈 랭킹 폭 (2026-11-10 사용자 지정)

홈 랭킹 카드는 주변 홈 콘텐츠와 같은 너비로 표시한다. 행은 기존 원본의 촘촘한 단일 행 구성을 유지한다.
- 홈 공지와 `/notices` 목록(2026-11-10): 지정 참고 화면에 맞춰 분류·제목·날짜를 세로로 배치하고 날짜에 연도를 표시한다. 공지 건수가 5개 미만이면 빈 대시 행을 만들지 않으며 긴 제목은 줄바꿈한다.

홈 랭킹에서 이전 순위가 없는 대상의 이름 옆 신규 표시는 제거한다(2026-11-10 사용자 요청). 기존 순위 변동과 하트 수치는 유지한다.
- 홈 공지는 건수와 관계없이 전체 보기로 목록에 진입한다. 공지 목록은 한 페이지에 10개씩 보여 주며, 한 페이지뿐이면 페이지 이동을 숨긴다(2026-11-10).

홈 랭킹의 팬과 크리에이터 행은 누적 하트만 오른쪽에 표시하며 찐팬 수와 오늘 증가량 열을 표시하지 않는다(2026-11-10).
- 홈 영상 선반(2026-11-10): 한국어 이름은 숏폼이며, 공개된 크리에이터의 실제 숏폼과 원문 제목을 보여 준다. 영상이 없을 때는 빈 카드나 대시 대신 빈 상태를 표시한다.

- 모임의 Hot 게시글(2026-11-10): 제목 오른쪽의 텍스트 메뉴에서 좋아요·댓글·조회수 순서를 고른다. 정렬과 10개 선택은 서버의 전체 공개 후보에서 수행한다.

홈 랭킹 이름은 약 8글자 너비를 상한으로 말줄임하고 접근 이름은 전체를 유지한다(2026-11-10).
- 홈 숏폼 선반(2026-11-10): 9:16 세로 카드, 모바일 폭 160px·데스크톱 200px. YouTube의 원본 비율 세로 썸네일을 우선하고 대체 이미지도 자르지 않는다.

모임 찾기 모바일 출석은 하단 내비게이션 위 플로팅 버튼으로 제공하고 내 신청 요약을 제거한다. 덕질 화면은 최애 선택과 혜택·잔액·미션·출석을 유지하고 큰 프로필·팬랭킹·지갑내역 요약을 제거한다(2026-11-10).

- 모바일 홈 히어로(2026-11-10): 위버스 참고로 배너를 1:1 이미지 중심으로 표시하고 문구를 하단 중앙에 겹치며 순번을 오른쪽 위에 둔다. 기존 이미지·링크·자동 전환 정지는 유지하고 데스크톱 구성은 변경하지 않는다.

모바일 홈 배너는 일시정지 버튼 없이 자동 전환을 끄고 스와이프·순번으로 탐색한다(2026-11-10 사용자 일시정지 버튼 제거 요청).
- 2026-11-10 로컬 공지 `/notices/service-guide`: 기존 공지 제목·반응·댓글·공유를 유지하고, 생성된 패스포트 이미지(정사각 원본 비율)와 흰색·분홍 면의 네 단계 안내 및 실제 서비스 링크를 사용한다. 팬 인증·패스포트·LIVE·혜택 조건은 공지 원문과 기존 가이드에 근거한다. DB 원문은 변경하지 않는다.

모바일 홈 배너는 원본을 contain으로 보존하고 같은 이미지의 흐린 cover 배경으로 빈 띠를 채운다(2026-11-10).

- 공지 목록(2026-11-10): 지정한 위버스 화면처럼 뒤로가기와 제목 아래에 옅은 배경·둥근 흰 목록을 배치하고 실제 전체 건수에 따른 숫자 쪽 이동을 둔다. 모바일은 짧은 목록 아래 약관 링크만 남긴 축약 푸터를 사용한다.
- 2026-11-10 로컬 홈 숏폼: 홈은 기존 6개 미리보기와 전체 보기 링크, 전체 목록은 페이지별 공개 숏폼을 사용한다. 카드를 누르면 원제목의 YouTube 재생창과 원본 보기 링크가 열리며 자동재생은 하지 않는다. 9:16 썸네일 원본 비율을 유지한다.

- 2026-11-10 로컬 찐팬 안내: `/guide/jjinfan`은 사용자 지정 상세 안내 방향에 따라 첫 화면에 정사각형 찐팬 이미지를 크게 사용하고 단계별 구역을 흰색과 핑크 틴트로 구분한다. 미션 수와 인증·심사 조건, 로그인 상태별 행동은 기존 카탈로그와 공통 컴포넌트를 따른다.

덕질 안내는 생성된 정사각 이미지와 팬페이지·소통·출석·LIVE 활동의 네 단계, 실제 이동 경로를 먼저 보여준다. 포인트·미션북 등 기존 카탈로그 상세는 펼쳐 확인한다(2026-11-10).
- 2026-11-10 로컬 모임 찾기 출석 플로팅: 1023px 이하에서 72×72px 원형, 포인트 배지는 바깥 모서리와 기존 안전 영역 위치를 유지한다. 데스크톱 출석 카드는 변경하지 않는다.
- 2026-11-10 로컬 페이지 목록 신청 배너: 사용자 지정 레퍼런스에 따라 두 신청 링크를 핑크 틴트 둥근 면에 돌출 이미지·제목·설명·원형 화살표를 배치한다. 신청 주소와 일반 클릭 시 신청 창 동작은 유지한다.

덕질 화면은 지갑을 먼저 두고 럭키드로우 영역은 흐리게 표시하며 준비 중 상태로 이동·응모를 막는다(2026-11-10).

### 숏폼 뷰어 (2026-11-10, 로컬 확인용)
사용자 요청으로 기존 카드형 모달 대신 모바일 화면을 채우는 세로 영상 뷰어를 사용한다. 영상 바깥의 터치 영역과 이전·다음 버튼, 키보드·휠로 이동하며 현재 영상만 재생창에 남긴다. 제목과 닫기는 안전 영역에 두고 kyaa 반응은 YouTube 자체 반응과 구분한다. 원본 링크는 더 보기 안에 둔다.

### 오늘의 덕질 행 (2026-11-10, 로컬 확인용)
사용자 요청으로 팬 활동과 같은 `FanMissionRow`의 40px 원형 도장, 포인트 코인, 진행 막대와 카운트, 완료 pill을 오늘의 덕질에도 적용한다. 오늘의 덕질 제목·남은 개수와 접기, 그 밖의 덕질 및 인증 확장, 실제 항목과 동작은 유지한다. 이전의 단색 아이콘·별도 수치 표시는 제거한다. 상단 독립 최애 선택을 오늘의 덕질 제목 옆으로 이동하고 24px 원형 아바타를 붙인다. 긴 이름은 줄임표로 표시하며, 화면 전체에서 사용하던 선택 상태는 유지한다.

### MY 패스포트와 오늘의 덕질 선택기 (2026-11-10 로컬)
- MY의 지갑 요약은 제거하고 덕질의 지갑은 유지한다. 로딩·비로그인 MY도 같은 구성이다.
- MY 패스포트 책은 1536×1024 원본의 좌우 빈 공간(x 0–65, 1468–1536)만 잘라 가용 폭에 맞추고 책과 인물·스탬프의 비율을 유지한다.
- 오늘의 덕질 제목 옆 최애 선택은 본문 보조 크기와 24px 아바타를 사용한다.

### 포인트 교환 시트 (2026-11-10)
- 제목 아래 연회색 보유 포인트 정보, 수량 라벨과 전폭 pill 수량 조절, 그 아래 전폭 primary 교환 버튼을 둔다. 모바일 시트 최소 높이는 400px과 85dvh 중 작은 값이며 작은 화면은 기존 시트에서 스크롤한다. 광고·교환 동작은 유지한다.


### 2026-11-10 고정 원본 dd737 dev 합본: 사용자 시각 예외와 lint 수정

출처는 이 작업의 2026-11-10 사용자 지시 “pink/purple gradient toast·사진확장blur+가독성gradient·비활성luckydrawblur·최소높이bottomsheet 절대제거금지” 및 고정 최종 원본 `dd7376d123cb41a7bc8c0ff2750046dab800c786`이다. 일반 S1·S2·N29·N4보다 아래의 지정 역할에서만 이 요청을 우선한다.

| 역할·소유자 | 유지할 실제 값·범위 | 근거와 검사 |
| --- | --- | --- |
| 공통 toast `components/fan-ui/fan-toast.module.css` `.toast` 배경 | `linear-gradient(105deg, var(--color-accent), #6042d5)` | 사용자 지정 핑크·보라 그라데이션. 이 선택자의 배경에만 S1·N29 주석 예외. 다른 색·선택자의 위반은 계속 검사한다. |
| 모바일 사진 확장 `home-hero-banner.module.css` `.mobileBackdrop img` | `filter: blur(18px)`와 기존 `scale(1.1)` | 사진의 빈 가장자리 확장을 보존한다. 해당 선택자 S2 예외이며 이미지 원본·앞면 크롭은 바꾸지 않는다. |
| 위 사진 위 문구 가독성 `.overlay` | `linear-gradient(180deg, transparent 30%, rgb(0 0 0 / 88%) 100%)` | 사용자 지정 가독성 배경. 해당 선택자 S1 예외만 둔다. |
| 준비 중 럭키드로우 `group-benefits.module.css` `.luckyDisabled` | `blur(4px)`·`pointer-events:none`·`user-select:none` | 사용자 지정 비활성 표현·이동/응모 금지 상태를 보존한다. 해당 선택자 S2 예외. |
| 교환 BottomSheet `stan-wallet.module.css` `.sheet` | 원본의 `min(400px, 85dvh)` 최소 높이 및 스크롤·전체폭 수량/CTA 유지 | 기존 승인 390×450 CTA 검증 근거를 재사용한다. 복구 요청과 새 교환은 서로 배타적인 같은 CTA 자리이므로 `stan-exchange.tsx`의 primary 부품 하나에 상태별 label/handler/disabled를 넣는다. S8 전체 완화나 화면 강조 제거가 아니다. |
| 공지 상세·모임 모바일 하단 여유 | 공지 `24px 88px` / `8px 88px`, 모임 `padding-bottom:64px`, 출석 `bottom:80px + safe-area` | 기존 하단 내비게이션과 겹치지 않는 원본 간격. 공지·모임 해당 규칙의 N4 주석 예외이며 동일값 space 토큰·calc로만 치환한다. |
| shorts 어두운 영상 바탕·컨트롤 | `#111` / `#333` / `#ddd`, 재생 표식 검정 65%, 반경 22px | 원본과 같은 값의 `--color-shortform-*`·`--radius-shortform-control` 토큰으로 이동했다. 카드 비율 9:16·전체화면 높이·댓글/반응 상태는 보존한다. |

공통 FanAction·FanIcon·FanHeading·FanMenu를 사용하고 리스트에 data-row를 단다. raw 값만 동일 계산값으로 치환하며 새 제품 시안·추가 콘텐츠는 만들지 않는다. 기준선 파일과 룰 목록은 완화하지 않는다. 기존 N4의 선택자별 `design-lint-disable <정확 rule ID>` 처리를 공유해 S1·S2·N29의 승인 범위만 표시한다. 회귀 시험은 이 선택자 밖 gradient·blur·purple, 다른 rule ID 주석이 계속 실패하는지 검사한다. API contract 시험은 실제 route export를 거쳐 인증 401/403과 소유자 삭제 거절을 검사한다.

- 2026-11-10 정식 UI gate의 후속 보정: 오늘의 덕질 최애 선택 문구는 본문 보조 14px를 유지하고, 공통 400·700·800 굵기 계약에 따라 원본의 600 대신 `--fan-item-title-weight`(700)를 사용한다. 배너 개별 점·정지 버튼을 복원하지 않고 이전/다음·선형 진행 표시·수동 이동 후 자동 재생 중지, 모바일 자동 재생 금지를 검증한다. 한국어 Elina 진입은 승인된 “덕질 시작하기”를 유지한다.


### 2026-11-10 14:00 피드백 슬라이드 — 로컬 반영
- Google Slides `10IsbKd4pM_bv6bxGaXR327oLpzTku2QAbyRoYV7NAMc`의 2–10장 사용자 요청. 기존 브랜드·핑크/보라 토스트·공통 행을 보존하는 국소 교정이다.
- Hot 정렬은 `좋아요순·댓글순·조회수순`. 원문/번역 전환은 공통 TranslationControl에서 13px/400, 파란 `--color-translation-link`(#2876ad), 44px 터치 영역을 유지한다. 원문 데이터는 바꾸지 않는다.
- 팬페이지 홈 활동과 오늘의 덕질은 기존 FanMissionRow를 공유하고 공감을 기본 목록에 포함한다. 게시판에는 글 목록/상세만 남기고 챌린지·활동·등급·이벤트 보조열을 제거하며 1열 최대720px를 유지한다. 홈의 응원과 이벤트 링크도 제거한다.
- 교환 시트 수량 위에 실제 정책 pointCost P → 기존 응모권 asset 32px + 1장, 항목 간 12px, 수량 그룹과 20px 간격을 둔다. 기존 400px 모바일 최소높이와 440px 데스크톱 상한을 유지한다.
- 출석 성공 보상은 도장 애니메이션과 동시에 표시한다. 행동 없는 성공 토스트는 기본 4초 뒤 닫히며 키보드로 토스트에 초점을 둔 동안에는 닫힘을 미룬다. 오류·재시도 행동·명시적 duration=0은 기존 수명주기를 유지한다.

- 비밀방 내부는 44px 뒤로가기 ChevronLeft와 방 제목으로 축약하고 중복 방 탭을 제거한다. 기존 비공개 이미지 업로드·인증 이미지 표시를 재사용하며 이미지 원본 비율과 최대 원본 크기를 보존한다. 사진 전용 메시지도 허용한다. 업로드/삭제는 중립 아이콘 행동, 보내기만 강조한다.
- 로컬 S3 업로드도 AWS_STORAGE_ENABLED가 켜져 있으면 기존 검증된 버킷·리전의 `/mobile-media/` 주소만 CSP에 허용한다. 호스팅 종류로 실제 저장소 설정을 무시하지 않는다.

### /rankings 목록 재설계 1차 (2026-11-10, RANK-V3 A r3·C1)
`/rankings`의 목록만 바꾼다. 홈 압축 카드(`home-ranking-card.*`, `ranking-rows`의 compact 분기)와 앱 셸은 그대로다. 근거는 `board/tasks/rank-redesign/refs-20261110/concepts/A/handoff-impl.md`(끝 17:40 보완 포함)와 대표 17:30 C1이다. 상세 시트·기간 선택·연속 활동·추이·찐팬 TOP은 2차이며 이번 화면에 없다.
- 머리: h1 `랭킹` → 세그먼트 `찐팬 | 크리에이터`(1023px 이하만) → 줄 `누적 하트 · N초 전 업데이트`(13/400 muted) 오른쪽에 기준 전환 텍스트 버튼(하트·포인트 / 하트·찐팬 수, 12px, 줄 높이 36, 누르는 영역 44). 기존 `?tab&metric` 주소와 기준 전환은 그대로 보존한다.
- 1024px 이상은 두 목록이 양옆(C1): 각 단 최대 400, 단 사이 40, 단 제목 `찐팬`·`크리에이터`(h2). 행 높이(64)·열·간격은 390과 같고 이름과 하트 사이를 단 폭이 제한한다. 두 목록을 함께 읽으므로 1023px 이하에서 숨은 쪽도 함께 요청한다.
- 행(64): 안쪽 12·0, 열 28·8·40·8·이름·8·88·8·16. 순위 18/700(`--fan-section-size`, 메달 애셋 전까지 1~3위도 숫자), 이름 15/700, 보조 12/400, 하트 15/700. 값은 10,000부터 `12.3K` 식 짧은 표기이고 전체 수는 접근 이름에 둔다. 행 전체가 하나의 44 이상 누르는 영역이며 `aria-expanded`·`aria-controls`를 가진다. 항목 사이 1px `--color-line`.
- 이름 아래 줄: 등락 `▲N`(굵은 잉크)·`▼N`(회색)·`—`·`신규`(전일 비교 없는 신규 행, 비교 자체가 없는 날은 칸 없음) · `오늘 +N`(0은 회색, 값 없으면 생략, 음수는 `−N`) · 크리에이터는 LIVE(응답의 `liveNow`)와 `찐팬 100 도전 중` 태그(기존 조건). 값 아래 줄은 `1위까지 N`·`현재 1위`·`1위와 동점`(목록 맨 위 값과의 차이, 응답에 있는 값만).
- 하이라이트 카드(64, 흰 면 + 1px 선): `오늘 가장 많이 오름`(전일 대비 가장 큰 상승, 동률은 위쪽 행) → 없으면 `오늘 하트 최다 +N` → 둘 다 없으면 `변동 없음`. 오류에는 그리지 않고 로딩에는 같은 높이의 빈 틀만 둔다.
- 분홍은 본문에서 한 곳씩만: 비로그인은 바닥 주 버튼, 로그인은 내 순위(내 행 면 반경 8 + 순위 숫자 + 바닥 `내 순위 N위`), 내 순위가 없을 때만 1위(`현재 1위` 글자 + 아바타 링 2px). 하트는 회색 선 아이콘이다. 이 값은 DESIGN 4장 "하트만 채움 `--color-accent`"의 `/rankings` 목록 한정 예외다.
- 상태: 로딩은 요청 중일 때만 10행 골격. 데이터가 적을 때는 마지막 실제 행 뒤에 순위 숫자·빈 원·대시만(막대·가짜 값 없음), 비로그인은 채우지 않는다. 오류는 하이라이트 없이 한 줄 + `다시 시도`(44×44 이상), 빈 목록은 한 줄 `아직 순위가 없어요`. 두 상태 모두 목록 10행 높이를 지킨다.
- 갱신 표기 예외: `N초 전 업데이트`는 사용자 지시라 5장 "상대 시간 폐기"와 N23의 예외다(이 줄 한 곳). 서버 `computedAt`에서 10초 단위로 센다: 60초 미만 `N초 전`(10초 단위), 1시간 미만 `N분 전`, 그 이상·`state=stale`은 한국 시각 `11. 09. 23:50 업데이트`. 화면이 보일 때만 10초마다 다시 계산하고, 숨겨지면 멈추며 돌아오면 즉시 갱신, 화면이 닫히면 해제한다. 서버 재조회 주기(10분)는 바꾸지 않는다. 코드는 `formatRelativeTime`을 쓰지 않으므로 N23 검사에 걸리지 않는다.
- 펼침: 한 번에 한 행. 오늘·`찐팬 N명`(크리에이터) 또는 `최애 이름`(팬)·`최근 N일 ±M`(응답의 `weekGainDays` 그대로, 7일로 바꾸지 않음)과 행동 하나(`팬페이지 가기`·`프로필 보기`·`로그인하고 프로필 보기`, 모두 기존 경로·권한). 열림 200ms는 `grid-template-rows`, reduced-motion 즉시. 닫힘 연출은 없다(언마운트).
- 모션: 순위가 바뀐 재조회에서만 보이는 행이 240ms 이동하고, 숫자 400ms 세기와 등락 160ms가 같은 프레임에 시작한다. reduced-motion과 첫 응답에는 움직이지 않는다.
- 홈 오늘의 랭킹 카드 PC 폭(2026-11-10, C1): 1024px 이상에서 카드는 주변 홈 콘텐츠와 같은 폭을 지키고, 안에서 찐팬·크리에이터가 양옆 두 단(각 360px, 단 사이 48px, 카드 가운데)으로 놓인다. 머리는 두 단을 합친 폭, `전체 보기` 위 선은 카드 전폭이다. 1023px 이하는 바뀌지 않는다(768~1023은 별도). 행은 홈 압축 행(34px) 그대로이며, `/rankings`의 행(64)·단 폭(최대 400)과는 다른 화면이라 값을 맞추지 않았다.

- RANK-V3 실제 화면 판정 보완: PC 바깥 영역은 최대 920px로 가운데에 놓고, 제목과 두 단의 읽기 영역은 최대 840px로 끝선을 맞춘다. 단 최대 400px, 간격 40px, 행 64px를 쓴다. 비로그인 PC의 주 행동은 찐팬 단에 하나만 두고, 모바일의 선택 탭 행동은 유지한다. 내 행만 분홍 면을 쓰며 일반 hover에는 분홍 면을 추가하지 않는다. 기준 전환의 누르는 영역은 최소 44×44px이다(2026-11-10).
- 공지(`/notices`·`/notices/[slug]`·홈 공지, 2026-11-10 사용자 지적 #2~#11): 홈·목록·상세 하단의 공지 목록은 `NoticeCard`(`features/home/ui/notice-card`) 하나가 소유한다. 외곽은 랭킹 카드와 같은 12 반경 + 1px `--color-line`, 행은 분류·제목·날짜 88px, 홈은 아래 `전체 보기 ›`, 상세는 제목 줄 오른쪽 `최근 공지사항 ›`. 공지 목록 페이지는 회색 바탕을 없애 흰 바탕으로 하고 카드 선 둘레에만 `0 1px 3px rgb(0 0 0 / 6%)`을 준다(위 표의 카드 그림자 0에서 이 한 곳만 사용자 요청으로 예외, 홈·상세 카드는 그림자 0 유지). 상세는 운영자 공지이므로 좋아요·싫어요·공유·댓글을 두지 않고 본문이 셸 폭을 꽉 채운다. 본문 그림은 PC(1024+)에서 폭을 채우되 21:9로 자른다. 공지 본문 그림은 `/images/notices/<이름>.webp` 정적 경로를 쓸 수 있다.

## 미디어 표시 (2026-11-10 S6, 사용자 PC QA #13·#15)

- 갤러리(홈 갤러리와 `/gallery`)는 같은 `allocateGalleryColumns`로 열을 정한다. 사진은 원본 비율 그대로이고 열 바닥을 맞춘 뒤, 각 열 안에서 이웃 사진이 같은 크기 그룹(목록 비율의 3분위수)이 되지 않게 섞는다. 열의 맨 위 사진(순위가 가장 높은 사진)은 고정이고 같은 그룹끼리는 순위 순서를 지킨다. 근거 `board/research/media-layout.md`.
- 칸을 `contain`으로 통째로 채워야 하는 이미지·영상은 남는 여백을 그 이미지의 흐린 복사본으로 채운다. 공통 소유자는 `components/fan-ui/media-fill.tsx`(`MediaFill`, `mediaFillClass`, `MediaBackdrop`)다. 뒷면은 `alt=""`·`aria-hidden`이며 사진 자체는 자르지 않는다. 적용: 모임 격자 로고·배너 칸, 홈 쇼츠 표지, 이벤트 목록 그림. 승인 크롭·상품 배경·패스포트 장식에는 쓰지 않는다.
- 2026-11-10 S3 덕질·출석 UI(사용자 PC QA #17·#18): "내 페이지 출석 현황" 모달은 행 목록 대신 원형 아바타 격자(`attendance-avatars.tsx`, 열 최소 96·간격 24/16)다. 아바타 76(링 3 + 안쪽 4 + 이미지 62), 오늘 출석한 페이지만 초록 링과 오른쪽 아래 24 체크 배지, 이름은 마우스 호버·포커스(`FanTooltip`) 또는 터치 450ms 길게 누름(`FanTooltip longPress`, 1.8초 표시)에서만 보이고 스크린리더는 `role="img"`의 이름과 숨은 "오늘 완료"로 읽는다. 아바타 아래 `연속 N일` 13 muted, 오늘 출석을 못 한 페이지에만 `출석하기`(입국 심사 전이면 `입국 심사`) 버튼. 초록은 사용자가 참고 화면으로 지정한 출석 링·체크에만 쓰며 폐기 예정 표의 `--color-success`(#17613f) 값을 그대로 쓴다(새 값 없음). 같은 작업에서 `wallet.module.css .supportBackdrop`에 `justify-content:center`를 더했다: 공통 오버레이의 `display:flex`가 `display:grid`를 이기는 순서에서 모달이 왼쪽 끝에 붙던 것을 막는다. 확인: 로컬 dev(3002) 합성 계정 390·1440, 프로덕션 빌드는 이 환경에서 `ffprobe` 없음으로 못 돌림.
## 2026-11-10 MY 바로가기·패스포트 빈 칸·헤더 위젯 애셋 (사용자 PC QA 18:21~18:24, S4)

- 이 항목은 1920~1921행의 MY 순서 중 `최애` 구역을 대체한다. MY 순서는 이름 → 알림 → 패스포트 → 스탬프 모으기 → 바로가기다. `내 최애`는 모임(`/celebrities`) 상단에 이미 있어 MY에서 구역을 없애고 바로가기 첫 항목(`내 최애` → `/celebrities`)으로 옮겼다. 1921행의 사진·이름 격자는 `/celebrities`에서만 쓴다.
- 바로가기 9칸은 한 카드(1px `--color-line`, 반경 `--radius-collection`) 안에 두 열로 늘어선다. 행은 컬러 일러스트 아이콘 40(390은 32) · 이름 · 화살표(390은 생략)이고 행 사이는 헤어라인이다(위버스 2열 메뉴 기준). 아이콘은 imagegen 시트(저장소 밖 보관)에서 `scripts/prepare-my-shortcut-icons.mjs`로 잘라 `public/images/my/shortcuts/*.webp`로 둔다. 하트·동전·응모권과 같은 광택 3D 재질이다. 무채색 선 아이콘을 다시 쓰지 않는다.
- 패스포트 스탬프 줄(`my-passport-card`, 미션북 `Slot`)의 아직 받지 않은 칸은 점선 원 대신 받은 칸과 같은 그림의 흐린 회색 스탬프(`public/images/stamps/ghost-v1`, `scripts/prepare-ghost-stamps.mjs`가 ink-v1에서 회색 한 색·알파 50%로 만든다)를 놓는다. 그림이 없는 칸은 회색 틀(`frame.webp`)이다. 받은 칸은 같은 그림에 `saturate(1.25) contrast(1.12)`로 더 진하게 보인다. 이전의 "회색 스탬프를 늘어놓지 않는다"는 이 요청으로 바꿨다.
- 헤더 상태 캡슐(`fan-header-status`)의 하트와 포인트는 `economy/heart.svg`, `economy/point-coin.svg` 애셋 그림이다(`P` 글자·단색 선 하트 폐기). 크기는 기존 L10 규칙(24, 390 캡슐 안 16)을 따른다.

### 2026-11-10 운영 핫픽스 — 크리에이터 미디어·일정 달력

사용자 [운영] 지시(PROD-HOTFIX-1920)에 따라 모임 기능이 꺼진 운영 화면에 적용한다. 소유자는 `features/media/ui/creator-media-panel`(비 compact 분기)와 `features/fanpage/ui/celebrity-calendar`·`calendar.module.css`다.

- 크리에이터 홈 `영상`·`사진`·`다시보기` 미리보기와 게시판 미디어(`?tab=board&section=media`)는 글자 없는 썸네일 격자다. 768px 미만 3열, 768px부터 4열, 1024px부터 6열, 간격 `--space-1`, 모서리 `--radius-control`. 제목·URL·출처·날짜는 화면에 쓰지 않고 접근 이름에만 원문으로 둔다. 원문 데이터는 바꾸지 않는다.
- 사진·게시판 미디어 칸은 정사각 크롭. 크리에이터 홈 `영상` 줄의 세로 클립(YouTube 외)은 9:16을 유지한다. 영상 칸은 왼쪽 위 28px 재생 표시(얼굴을 가리지 않게)와 원문 링크(새 창)를 둔다. 사진 실패는 아이콘만 표시한다.
- 일정 달력: 꽉 찬 원은 선택한 날 하나(`--fanpage-action-solid`). LIVE는 숫자 아래 6px 분홍 점, 출석은 숫자에 2px `--color-success` 링과 오른쪽 위 16px 초록 체크 배지, 오늘은 1px 잉크 테두리. 달력 위 오른쪽에 범례 칩 2개(✓ 출석 · ● LIVE). 일정이 없는 날도 일정 있는 날과 같은 칸 구조(48px, 아래 7px 줄)로 숫자 높이를 맞춘다.
