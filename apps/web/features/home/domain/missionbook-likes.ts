/**
 * 덕질미션북은 /follow 이벤트 화면 아래에 붙는다(/guide/dukjil 은 /follow 로 넘긴다). 미션북의 공유·댓글은 안내 게시판 글 하나(home_notices.slug)에 붙는다.
 * 같은 글이 안내 게시판 목록에도 보이고, 그 상세 주소도 /follow 로 보낸다(app/notices/[slug]/page.tsx).
 * 좋아요는 안내 글이 아니라 X 오픈 이벤트의 좋아요 하나다(followEventSlug 크리에이터 좋아요, 1인 1회). 싫어요는 없다.
 */
export const MISSIONBOOK_NOTICE_SLUG = "dukjil-missionbook";

/**
 * 사용자 2026-11-16 14:1x "UI에 보여줄 때는 0이 아니라 10부터 시작": 미션북 좋아요 수는 화면에서만 이벤트 참여 수 + 10으로 보인다.
 * 집계·명단·어드민은 실제 수(이벤트 좋아요)를 그대로 쓴다. DESIGN.md 7절 RollingNumber '실제 값만'의 예외로 기록했다.
 */
export const MISSIONBOOK_LIKE_DISPLAY_START = 10;

/** The like count the mission book shows: the real event likes plus the display start. */
export function displayedMissionbookLikes(realCount: number): number {
  return realCount + MISSIONBOOK_LIKE_DISPLAY_START;
}
