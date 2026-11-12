# 현재 화면에서 옛 화면으로 이어지던 경로

정적 호출 관계 확인 결과다. 실제 사용자 클릭 기록으로 유입 원인을 확정한 것은 아니다.

| 화면 | 버튼/동작 | 새 경로 |
|---|---|---|
| 팬 인증 퀴즈 | 닫기·완료 후 인증 목록 복귀 | /c/<slug>?tab=certifications&locale=… |
| 홈 인기 팬글 | 글 링크의 목록 복귀 주소 | /c/<slug>?tab=board&locale=… |
| 홈 인기 팬글 | 빈 상태 버튼 | /pages/groups?locale=… |
| 팬게시판 상세 | 목록으로 기본 복귀 | /c/<slug>?tab=board&locale=… |
| 팬페이지 | 함께하는 팬 | /c/<slug>?tab=leaderboard&locale=… |
| 푸터 | 커뮤니티(groups 비활성) | /pages/groups?locale=… |
| 팬 참여 안내 | 커뮤니티 링크 | /pages/groups?locale=… |
| 앱 셸 | 커뮤니티 메뉴 | /pages/groups?locale=… |
| 사이트맵 | 커뮤니티 항목 | /pages/groups |
| 외부 클릭 측정 | 경로 분류표 | /pages/groups → groups |

/c/<slug>는 저장소의 기존 308 정책에 따라 /<slug>로 다시 이동한다. 기존 정책은 보존했다.
옛 CommunityScreen·전용 CSS·단위시험·compact fixture를 제거했다. 공용 부품은 유지했다.

브라우저 preview_status available=false, preview_open은 15000ms timeout으로 실제 화면에 접근하지 못했다. 390/1440 캡처 및 미적 판정은 미완료다. 운영 DB 접근 및 푸시는 수행하지 않았다.

검증: 관련 Vitest 13파일 270시험 통과. git diff --check 통과.
타입검사: kyaa-cds-typecheck 실행했으나 공통 top-layer 시험 타입, jose 의존성 누락, vitest.setup IntersectionObserver 타입 오류로 전체 실패. 최종 출력에서 변경 파일 오류는 없었다. 로그는 /tmp/community-typecheck-final.log, /tmp/community-final-tests.log.
