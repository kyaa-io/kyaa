# D-C · 찐팬 100 챌린지 배너

2026-11-12 사용자 12:35 지시. 구현, 검증과 로컬 커밋까지만 진행. 운영 DB 접근·DB 수정·푸시·배포 없음.

## 원본과 판단

- `https://dev.kyaa.io/api/public/celebrities?locale=ko`의 공개 읽기 응답에서 유나 `yuna`, 히로로 `hiroro`, 김민주 `mmnoo-s`와 등록된 profile URL을 확인했다. 정확한 공개 응답/사진 메타데이터는 `sources.json`. 운영 URL로 등록된 유나 사진도 dev 카탈로그의 공개 자산 URL로만 다운로드했으며 운영 DB에는 접근하지 않았다.
- 이전 Supabase dev 호스트는 DNS ENOTFOUND였다. 연결 도구의 프로젝트 목록에는 kyaa dev가 없어서, 현재 dev 서버의 공개 카탈로그 투영을 읽었다. dev 챌린지 목록 API는 `RANKING_UNAVAILABLE`; 사용자가 지정한 첫 세 크리에이터를 배너 대상으로 확정했다. 수치·마감일·신규 참여자 수를 만들지 않았다. 첫 대상 변경은 `JJINFAN_BANNER_CREATORS`에서 관리한다.
- Codex 내장 imagegen 사용: 세 원본은 팔레트 참조로만 전달하고 인물·얼굴·글자 생성을 금지하여 밝은 분홍 satin/heart 배경만 생성했다. 생성 원본 `generated-background.png`. 실제 인물은 원본 사진을 별도 `<img>`로 유지하고 공통 배경 및 가장자리 mask만 합성한다. 얼굴·체형·의상·표정 재생성 없음. 전용 3:1 원본 합성본은 `apps/web/public/images/jjinfan100/{yuna,hiroro,mmnoo-s}-banner.webp`(1440×480), 승인 사진은 같은 폴더의 각 slug.webp로 보존했다.
- 이동은 기존 유효한 팬페이지 경로 `/<slug>?locale=...&challenge=jjinfan100`를 사용한다. `/c/<slug>/verify`는 기존 `fanVerifyHref`로 생성하고 팬페이지로 돌아올 경로를 전달한다.
- 기존 팬 인증 기준은 페이지 헤더와 동일하게 해당 크리에이터의 발급된 passport 존재다. 로그인/세션과 본인 summary 로드 완료 전이나 실패 시 초대 모달을 표시하지 않는다. 게스트는 준비 완료 후 표시한다. 닫기·배경·Escape는 challenge query만 제거하고 나머지 경로·쿼리·해시를 보존한다.
- 기존 상단 `LiveHeroCarousel`을 재사용했다. 모바일160px/PC240px, 모바일 카운터만 얼굴을 가리지 않도록 오른쪽 아래. 화살표·진행 표시·카운터 모양·스와이프·자동 전환·reduced-motion·inert는 공통 동작 그대로다. DESIGN.md에 새 역할과 예외를 기록했다.

## 검증 범위

- 실제 제품 `GuestHome`, `CelebrityFanPage`, `LiveHeroCarousel`, `FanDialog`를 Vite 로컬 브라우저에서 렌더링했다. 데이터는 dev에서 읽은 공개 크리에이터 레코드이며, 로그인/보유 패스포트와 주변 API는 fixture다. 운영/실제 로그인 검증이 아니다. 관련 없는 주변 영역의 오류·빈 표시를 실제 dev 상태로 해석하면 안 된다.
- 서버: `node apps/web/e2e/jjinfan-banner-local/server.mjs` (4217). 공유3000 서버는 변경하지 않았다.
- Korean 390·1440: 세 배너 각각의 로드된 사진·얼굴·문구·왜곡·프레임, 홈과 팬페이지 모달을 실제 캡처했다. `release-notes/images/2026-11-12-jjinfan-*.png`.
- 브라우저 실동작: 다음/이전 전환과 카운터 동기화, 게스트 모달, 닫기 후 challenge 제거, 김민주 동참하기 → `/c/mmnoo-s/verify?locale=ko&returnTo=%2Fmmnoo-s%3Flocale%3Dko` 확인. 인증 보유 fixture(`viewer=verified`)는 `내 패스포트` 표시와 모달0개를 확인했다.
- 390 모달 폭358px, 닫기44×44px/동참하기318×44px; 1440 모달 폭360px/동참하기320×48px, 최초 초점 닫기, 가로 넘침0px. PC 화살표 양쪽44×44px. 각 배너는 모바일160px/PC240px이며 전환 시 고정 높이다. 같은 화면의 상단 배너는358px/380px로 각각 더 높다(`heights.json`).
- 새 설명용 보조 줄 없음. 배너·모달12개 언어 문구 제공. 다국어 자동 경계 검사 결과는 `locale-geometry.json`.
- `npm run test --workspace apps/web -- components/banner-slot/home-below-ranking-slot.test.tsx features/rankings/ui/jjinfan-challenge-entry.test.tsx components/live-hero-carousel.test.tsx components/celebrity-fan-page.test.tsx components/fan-ui/fan-heading.test.tsx components/fan-ui/fan-text.test.tsx`: 6파일115검사.
- `npm run typecheck --workspace apps/web -- --incremental false`: 일관된 viem2.55.4 의존성으로 전체 tsc 실행. 공유 preview 의존성(root2.52/web2.55)을 섞으면 무관한 onchain 타입 오류가 발생하여, 검사 시 root2.55.4 단일 의존성으로 실행했다.
- Hallmark floor: 새4파일 FAIL0/WARN0. 최초에는 CSS stamp 미설정 경고를 수정했다.

## 남은 환경 확인

실제 계정의 dev 로그인과 팬 인증 제출은 실행하지 않았다. 기존 인증 경로까지의 이동과 fixture의 인증 보유자 배제만 확인했다. dev 챌린지 API 장애 자체는 이 작업 범위에서 수정하지 않았다. 생성된 3:1 합성본은 보존용이며 반응형 화면은 읽을 수 있는 HTML 카피와 별도 사진을 합성해 사용한다.

## 시각 교정 및 캡처 원본

1차·2차 독립 판정의 사진 경계·중앙 간격·모달 CTA 비율·캡처 안정화 지적을 수정했다. 데스크톱 이름은 기존 홈 hero의36px 역할, 좌측 읽기 묶음 중앙 정렬과 사진12% 안쪽 배치, 28%/14% 가장자리 fade, 작은360px 모달과 양쪽 폭의 전폭 CTA를 적용했다. 접근성 초점 링은 공통 규칙을 보존했다. 사진 윗부분은 원본의 위쪽부터 시작하며 원본 자체에서 잘린 머리 부분을 생성하지 않았다.

preview_snapshot 저장을 두 차례 확인했으나1440px viewport에도 저장 파일은1280px로 축소되었다(`snapshot saved1280x800 for1440x900 viewport`). 따라서 최종 파일은 Playwright 실제 Chromium의DPR1 screenshot으로 다시 캡처했고 sharp metadata로390×900/1440×900을 확인했다. 최종8장은 모두 이 원본이며 앞선 축소 캡처는 최종 증거로 사용하지 않는다. `node apps/web/e2e/jjinfan-banner-local/run.mjs`는12개 동작·geometry assert와8장 캡처를 통과했다. 로그인/인증 보유자는 fixture이며 실제 계정 데이터가 아니다. 네이티브 브라우저 재현은 기존4217 서버만 사용했다.

최종 다국어 재현: `node apps/web/e2e/jjinfan-banner-local/geometry.mjs`.

## 최종 판정

- 독립 최종 평가(다른 회사 모델, Opus 5.5): 관문A1~A8 통과, B1 24/25 · B2 22/25 · B3 19/20 · B4 17/20 · B5 9/10 = **91/100 PASS**. 외부 비교 원본이 없어C는 해당 없음. 상세 `visual-review-final.md`; 이전 판정도 수정 경위로 보존했다. 독립 평가는 캡처·측정 산출물 기준이며 평가자가 직접 로그인·동작을 시험했다는 뜻이 아니다.
- 네이티브64조합 경계 검사 최종 통과. 첫 재사용 페이지 실행은 프랑스어 모달 탐색이 일시적으로 멈춰 단독 재현으로 정상 표시를 확인했고, 사례별 새 문서·컨텍스트로 격리한 재현을64/64 통과했다. 제품 코드를 우회하지 않았다.
- 최종 원본 캡처는390×900/1440×900이다. 실제 화면에서 사진·얼굴·글자·색·간격을 확인했고, 데스크톱CTA는320×48px/모바일318×44px 전폭이다. 최종 브라우저assert는 모바일44px/PC48px 높이를 확인했다.
- 테스트115개 통과, sloplint 새4파일FAIL0/WARN0. 공유3000 프로세스는 변경하지 않았으며 이번4217 서버와 임시preview탭은 검증 뒤 종료했다.

## 커밋 전 공통 규칙 검사 보완

첫 pre-commit은 화면 CSS의 직접 글자 역할·아이콘 import·CSS 마스크를 거절했다. 기준선·hook은 변경하지 않고, 승인된 배너 역할을 FanHeading/FanText의 실제 공통 소유자에 추가하고 FanIcon으로 연결했다. 얼굴 합성의 동일한 알파는 raster `portrait-mask.png`에 보존해 CSS gradient를 없앴다. 새 반응형은48rem 범위 문법이다. 기존 공통 역할 값은 유지한다. 이 수정 후 `node scripts/design-lint.mjs` **새 위반0**, 관련6파일 **115검사 통과**, 네이티브 동작12개·캡처8장 및 언어64조합을 다시 통과했다. 최종 원본을 직접 대조해 기존91점 판정의 구도·글자 수치·사진 프레임이 유지됨을 확인했다.
