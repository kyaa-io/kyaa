# 보조 행동 제목 행 정리 점검 (2026-11-10)

규칙: '기록 보기'·'전체 보기'·'더 보기'·'자세히 보기' 같은 보조 행동은 구역 제목 행 오른쪽 끝의 작은 글자 링크다. 별도 버튼이나 목록 아래 행으로 두지 않는다. 공통 소유자는 `components/fan-ui/fan-heading.tsx`의 `FanSectionHeader`(`action`·`extraAction`)와 `fan-section-link.tsx`이다. 이번에 `action`이 같은 화면의 펼침(`onClick`·`expanded`·`controls`)도 받도록 확장했다. 대상은 사용자 화면(관리자 `/admin` 제외)이다. 브라우저 캡처 검수는 하지 못했다.

## 변경한 곳

| 파일 | 컴포넌트 | 이전 형태 | 수정 |
| --- | --- | --- | --- |
| `features/community-stamps/ui/community-stamp-collection.tsx` | 스탬프 모으기 | 목록 아래 `<details>` 행 "스탬프 모으기 기록 보기 · N" | 제목 행 오른쪽 `FanSectionLink`(펼침 버튼, `aria-expanded`·`aria-controls`). 기록 목록은 제목 아래에서 펼쳐진다. MY·패스포트·모임 공통 |
| `features/rankings/ui/home-ranking-card.tsx` | 홈 랭킹 카드 | 카드 맨 아래 가로 줄 "전체 보기 ›" | 카드 제목 행 오른쪽 `FanSectionLink`. 같은 경로 |

## 이미 제목 행 링크라 변경 없음

`home-placeholder-blocks`(공지·갤러리·쇼츠), `creator-media-panel`·`group-home-panels`(갤러리), `chzzk-posts`·`home-panels`(공지·LIVE), `creator-group-home`(이야기), `stan-lucky-cheer`, `duo-profile`, `wallet-screen`(내역 펼침), `my-screen`의 `SectionTitle`.

## 변경하지 않은 곳

| 위치 | 이유 |
| --- | --- |
| `notification-inbox`, `home-notice-pages`, `my-raffles-screen`, `passport-proofs`, `chzzk-posts`의 "더 보기" | 이어 불러오기(페이지 추가)라 DESIGN.md의 예외 |
| `my-screen` 최근 활동·다른 예약 LIVE·`history` 펼침 | 펼침 토글이라 예외 |
| `live-calendar-screen`·`celebrity-calendar`·`promotion-page`의 "전체 보기" | 모달 트리거·필터·선택기라 예외 |
| `my-screen` 응모권 패널의 "응모권 내역 보기" 줄(`ticketHistoryLink`) | 제목 행에 이미 "내 응모 내역" 링크가 있어 둘을 한 행에 두는 판단이 필요함. 제품 결정 후 `extraAction`으로 이동 |
| `fan-participation-guide`·`elina/ifew-fan-guide`의 "내 기록 보기" | 설명이 딸린 안내 구역의 단일 행동(목록 아래 행 아님). 확인 필요 |
| 상세 화면의 "출석 기록 보기" 등 `live-event-screen`·`attendance-copy` | 완료 상태의 다음 행동으로, 구역 제목이 없음. 확인 필요 |
