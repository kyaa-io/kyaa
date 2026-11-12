# H3 검증

기준 origin/release/production = ef393bc9e3b5d697a0cea3d934fe0295ce8f1b40. 이 기준은 c070a9706 및 8208ddc1b를 이미 조상으로 포함하므로 재이식하지 않았다. 관련 결과·관리자·도메인·RPC·마이그레이션 구현이 이미 존재하며 운영 차단 조건만 제거했다. dev 전용 인프라를 새로 가져오지 않았다.

운영 DB 적용 필요: supabase/migrations/20261201011000_quiz_learning_hints.sql

파일 이름과 내용 유지. 운영 DB 접속 없음. production+flag=true에서 학습 v3 함수가 없으면 기존 v2 응답을 사용하고 learning 없이 반환하는 테스트 추가. 배포 설정 dev/prod 기본 true 및 명시 false 보존 테스트.

실제 브라우저 합성 화면: 390x1100, 1440x1100. 학습 구역 왼쪽 정렬, 모바일 링크 높이44px, 390 문항 폭316px, 재도전44px. 힌트가 없는 문항은 공식 링크만 보이고 learning 없는 문항은 숨김. 정답 표시 없음. 캡처 개인정보 없음. 공통 결과 화면의 기존 설명 문장과 세로 구성을 유지했으며 이번 변경에서 보조 문구 추가 없음. 독립 미적 평가 미실시로 루브릭 전체 통과를 주장하지 않음.

검증 결과: 관련 Vitest 4파일 55개 통과, 배포 설정 node:test 30개 통과, apps/web tsc --noEmit 종료코드0, git diff --check 통과. 브라우저 fixture의 prefetch 비불리언 DOM 경고는 기존 next/link shim에서 발생하며 실제 Next 런타임 검증을 대체하지 않는다. Hallmark 스크립트는 지정 로컬 경로에 없어 실행하지 못했다.
