# 래플 이미지 출처
- 기존 승인 제작물 `board/tasks/banner-onboard/raw/o1-2.png`의 오른쪽 장식 영역 재사용. 기존 프롬프트 `prompts/o1b.txt`: 인물·얼굴·문구 없이 분홍 하트·리본·종이 조각.
- 새 생성·가짜 인물 없음. 원본 1536×1024에서 x740 y180 796×650 장식 부분을 사용, WebP 데스크톱 1440×900·모바일 390×390. 정해진 그림 칸의 cover 크롭이며 장식만 잘릴 수 있고 상금·마감·제목·버튼은 이미지 밖 실제 텍스트.
- 상세와 ManagedHomeBanner 실제 컴포넌트를 local fixture로 검증. 로그인은 guest stub이고 전체 앱 셸·실제 dev DB 응모 검증이 아님.

## 2026-11-12 로컬 검증
- `node apps/web/e2e/signup-raffle-local/server.mjs` + `node apps/web/e2e/signup-raffle-local/run.mjs`: 12언어 × 390/768/1440 × 상세/배너 72조합 통과. 보이는 이미지 로드, 가로 넘침 없음, 링크·버튼 44px 이상, pageerror 없음. 수치/터치 좌표: `ui-checks.json`.
- `npx vitest run app/s/raffle/page.test.tsx features/home/domain/signup-raffle-home-banner.test.ts` (apps/web): 2파일 2시험 통과.
- 390/1440 KO 캡처 네 장을 직접 확인: 제목·상금·마감·행동이 보존되며 이미지의 장식 크롭만 허용. 원화와 달리 인물·로고·내장 글자 없음. 상세 prize 2열/4열, 번호 단계, 하나의 primary 응모 버튼과 neutral 후속 이동. API 성공 안내 외 도움 문구 추가 없음.
- Hallmark floor: 기존 CSS의 stamp 누락 1 FAIL이 변경 전후 동일, 신규 FAIL 0. 요청 밖 스탬프 주석 추가는 하지 않음.
- preview snapshot이 DOM 정상에도 연속 두 번 빈 PNG를 저장해 Playwright 캡처로 전환. 임시 preview 탭과 4198 서버는 종료.
- 이 검증은 별도 회사 모델의 독립 점수/레퍼런스 A/B 평가가 아님. 전체 앱 셸·실제 dev 서비스·인증 후 응모는 별도 검증 범위. 운영 상태로 표현하지 않음.
