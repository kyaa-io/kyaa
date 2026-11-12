# REPORT-1112 묶음1

## 현재 결과
- 감독 diag-result-2215.md: B1 누락/미배치 0. 소급 SQL 불필요. B4 조회 없는 좋아요 929건, 추천>조회 164글. B5 elina 소속 revision 1.
- B1 미해결: MY/상세의 roadmap → state=filled 표시 경로를 추적했으나 특정 실패 응답이 없다. 진단의 quiz_stamp_unplaced=0은 도장이 어떤 칸에든 존재함을 뜻하며 1쪽 1칸 정상 여부나 클라이언트 응답을 보장하지 않는다. 문제 passport ID와 roadmap 응답을 요청했다. 임의의 도장·완료 표시를 만들지 않았다.
- B3: source=cheer인 예전 응원 글 상세에서 좋아요 UI가 빠져 있었음. 기존 read_celebrity_lounge(p_ids=[id])의 차단·공개 조건을 유지해 clap 상태를 읽고 기존 PUT /api/cheers/:id/clap으로 좋아요/취소 연결. 새 DB 함수 없음.
- B4: policies.md의 2안 중 추천 1안을 공통 목록/상세에 구현. 수치 보정 없음.
- B5: b5-move.draft.sql / b5-rollback.draft.sql. 실행 금지 초안. 대상 1글+정확한 연결 첨부 N개. 현재 N 미확인. 감독의 26개는 셀럽 전체 자산 수이므로 영향 건수가 아님. wena 대상 신원 확인, 원본 스냅샷, 트리거/원장 영향 검토 뒤 사용. 기본 ROLLBACK, 수정시각/버전/첨부 목록/소유 검사, mobile media 있으면 중단. 되돌리기도 revision을 3으로 증가시켜 이전 편집 요청의 충돌 방지.

## 검증
- 관련 테스트 6파일 34개 통과. 교차검토 후 새로고침 실패 안내와 회귀시험 추가, cheer-detail 5개 통과(기존 4개 포함).
- 390/1440 실제 브라우저 fixture 캡처 release-notes/images/2026-11-12-report-board-*.png. B3 0→1 선택, 44px 버튼 확인. B4 추천9/조회2 입력에서 추천9 유지·조회 숨김, 가로 넘침 없음. 운영 캡처 아님.
- tsgo: 변경 파일 오류 없음. 기존 top-layer.test.tsx 타입 predicate와 vitest.setup.ts IntersectionObserver.scrollMargin 오류. 게이트의 tsc와 구분.
- Claude Sonnet 교차검토: B3 새로고침 실패 안내 누락을 수정. target RPC 추가 필드는 기존 내부 계약이므로 strict 추가 대신 응답 화이트리스트 유지. 제목/본문 중복은 기존 동작, 이번 범위 밖. B3/B4 390·1440 국소 시각 검수 확인.
- 운영 데이터 변경·푸시 없음. B1은 재현 근거 대기, B5 SQL 실행 검증 미실시.
