# 매일 핵심 기능 검사

`Daily critical functions`가 main의 현재 코드를 매일 한국 시간 오전 9시(UTC 00:00)에 검사한다. GitHub 예약 실행은 혼잡 시 지연될 수 있다. Actions의 같은 workflow에서 수동 실행할 수도 있다.

| 핵심 기능 | 확인하는 내용 | 기존 검사 |
| --- | --- | --- |
| 로그인·계정 | 인증, 세션, 타인 정보 접근 차단, 탈퇴 | Backend security boundaries |
| 댓글·게시글 | 등록·답글·재시도, 모임 비공개 시 기존 패스포트 권한, 차단·제재 | Backend security boundaries, Fan design system |
| 패스포트·보상 | 팬 인증, 발급·조회, 중복 지급 방지, 원장·작업 재시도 | Backend security boundaries |
| 예약·참여 | LIVE 예약·출석·미션, 행사 참여, 실패 후 복구 | Backend security boundaries, Fan design system |
| 추첨·수령 | 응모·추첨·결과·수령 권한과 화면 | Backend security boundaries, Fan design system |
| 문의 | 접수·첨부·관리 권한·일반 빌드의 테스트 계정 차단 | CS inquiry flow |
| 운영 상태 | 실제 운영 서버 응답·배포 버전 형식·DB 연결 | Read-only production readiness |

실제 데이터 변경이 필요한 검사는 GitHub runner의 폐기용 DB와 로컬 브라우저에서 실행한다. 실제 회원의 댓글·보상·당첨 결과, 운영 원장은 변경하지 않는다. 운영 검사는 `/api/health/live`, `/api/health/ready`만 읽는다. 따라서 실제 회원의 운영 로그인·댓글 저장, 개별 외부 서비스 인증·수신, 인스타그램 앱 내 브라우저까지 통과했다고 해석하지 않는다.

첫 실행의 `Critical function result`에서 네 검사 묶음 결과를 한 번에 확인한다. 실패·취소·예상하지 못한 건너뜀은 성공으로 처리하지 않는다. 댓글 API와 `groups_content_release.sql` 검사를 포함하며, 매일 실행에는 변경 파일 최적화로 DB 검사를 생략하지 않는다. 기존 UI 증거와 운영 연결 검사 결과는 Actions artifact에서 확인한다(운영 연결 결과 보관 30일).

실패 확인은 GitHub Actions의 기존 알림 설정을 따른다. 별도 Telegram 메시지나 자동 수정·재배포는 실행하지 않는다. 이 예약은 개발 RDS를 기동하지 않는다.
