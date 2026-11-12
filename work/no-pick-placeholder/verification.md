# D–F 검증

- 실제 제품 컴포넌트 fixture: apps/web/e2e/no-pick-local. 운영 DB 접근 없음.
- 이미지: Codex built-in imagegen 1장, 글자 없는 핑크 패스포트 원본을 확인 후 WebP로 변환. 이퓨 기존 studio 원본 직접 확인, 여유가 있어 사진 교체 없이 portrait 배율만 변경.
- 타입검사: kyaa-cds-typecheck 실행. 기존 top-layer.test.tsx matches 타입과 vitest.setup.ts IntersectionObserver.scrollMargin 3개 오류. 이번 변경 파일 오류 없음. apps/web tsc --noEmit도 실행: 변경하지 않은 인증·스토어 테스트 4파일에서 기존 jose KeyLike/CryptoKey 타입 오류 7개. 이번 변경 파일 오류 없음.
- 관련 Vitest 4파일 60개 통과. group-benefits-screen 38개 중 30개 통과, 8개 기존 실패. HEAD 원본 group-benefits-screen으로 되돌린 비교 실행에서도 동일한 8개 실패(교환 버튼 명칭·기존 지갑 문구 기대값). 변경 파일은 비교 실행 후 복구.
- 캡처는 실제 브라우저에서 생성한 로컬 예시 데이터 화면이다. 390/1440 그림·카드 프레임을 직접 확인. 운영 화면으로 표현하지 않음.
- 독립 평가자와 레퍼런스 A/B 점수는 미실행. 90점 통과 판정을 만들지 않음.

- 12개 언어 × 390/1440 24조합: 이미지 로드, 가로 넘침 없음, 빈 상태·로딩·가입 상태 통과. 측정 JSON 첨부.
- Hallmark 검사: 기존 stan-wallet.module.css 첫 줄 stamp 부재 1건, 이번 추가 선언의 새 위반 없음.
- 최종 관련 Vitest: 4파일 60개 통과(최애 이름 미지정 상태의 공통 bar 회귀 추가).
- 실제 지갑 미선택 분기 관련 Vitest 1개 추가 통과(나머지 37개 제외한 targeted 실행). 기존 8개 실패는 해당 범위 밖의 지갑·교환 계약이며 원본 대조 결과도 같음.
