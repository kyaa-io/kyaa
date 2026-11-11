NOW: 증빙은 certification_submissions 및 비공개 certification-proofs 저장소에 저장. 기존 read_proof_board는 승인+publish_consent인 fan_posts(category=proof)만 공개하며 기존 증빙 화면 하단에 노출한다. 신규 마이그레이션 불필요.
공용 localhost:3000은 t3-wallet-v2-1248 checkout을 제공하므로 이 checkout의 변경 캡처로 사용할 수 없음.
검증 차단: 로컬 의존성 없음. 공유 의존성으로 재시도했으나 jsdom SyntaxError로 테스트 시작 실패. 공용 서버는 다른 작업 checkout이므로 변경 화면 캡처 미완료. LOCAL-READY 아님.
16:45 변경: 이미지 중심 그리드, 상단 정책 proof.points, 카드 실제 dukjil_action_log.points. MIGRATION 20261222163000 필요(미적용). 기존 신규 마이그레이션 불필요 판단은 이 추가 요구로 변경됨.
