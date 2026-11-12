# 찐팬 100 배너 로컬 검증

실제 GuestHome/CelebrityFanPage/LiveHeroCarousel/FanDialog와 dev 공개 카탈로그의 승인된 크리에이터 사진을 사용한다. 인증·패스포트·주변 API는 로컬 fixture이며 운영 DB를 읽거나 쓰지 않는다.

- 실행: `node apps/web/e2e/jjinfan-banner-local/server.mjs` (127.0.0.1:4217, 공유3000과 별개)
- 화면·동작·원본 캡처: `node apps/web/e2e/jjinfan-banner-local/run.mjs`
- 언어별 경계: `node apps/web/e2e/jjinfan-banner-local/geometry.mjs`
- 홈: `http://localhost:4217/?locale=ko`
- 모달: `/yuna?locale=ko&challenge=jjinfan100`
- 인증 보유 fixture: 같은 주소에 `&viewer=verified`, 인증 없는 로그인 fixture는 `&viewer=new`

캡처는 390×900/1440×900, DPR1로 저장한다. run.mjs는 로드된 사진, 짧은 고정 높이, 넘침, 세 슬라이드 전환, 모달 CTA 전폭, Escape, 인증 보유자 배제와 크리에이터별 인증 경로를 assert한다. geometry.mjs는12언어390/1440와 KO/JA/VI/TH360/768에서 홈·모달64조합을 확인한다. 증거는 `work/jjinfan-banner/`, 최종 공개 캡처는 `release-notes/images/2026-11-12-jjinfan-*`에 남긴다. 주변 영역의 빈 화면·오류 응답은 fixture 제한이다.
