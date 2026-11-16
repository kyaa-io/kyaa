/**
 * 덕질미션북(/guide/dukjil)의 좋아요·싫어요·공유·댓글은 안내 게시판 글 하나(home_notices.slug)에 붙는다.
 * 같은 글이 안내 게시판 목록에도 보이고, 그 상세 주소는 미션북 페이지로 보낸다(app/notices/[slug]/page.tsx).
 * 좋아요는 /follow 이벤트(팬페이지 좋아요)와 따로 센다.
 */
export const MISSIONBOOK_NOTICE_SLUG = "dukjil-missionbook";
export const MISSIONBOOK_GUIDE_PATH = "/guide/dukjil";

/**
 * 사용자 2026-11-16 14:1x "UI에 보여줄 때는 0이 아니라 10부터 시작": 미션북 좋아요 수는 화면에서만 실제 수 + 10으로 보인다.
 * 저장·집계·명단·어드민은 실제 수(home_notice_reactions)를 그대로 쓴다. DESIGN.md 7절 RollingNumber '실제 값만'의 예외로 기록했다.
 */
export const MISSIONBOOK_LIKE_DISPLAY_START = 10;

/** The like count a screen shows for a notice: the mission book's adds the display start, every other notice shows the real count. */
export function displayedNoticeLikes(slug: string, likeCount: number): number {
  return slug === MISSIONBOOK_NOTICE_SLUG ? likeCount + MISSIONBOOK_LIKE_DISPLAY_START : likeCount;
}
