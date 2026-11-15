import type { LikeMissionConfig } from '../s/x/x-mission';
/** 이벤트 1(X 오픈, 2026-11-16) 참여를 담는 이벤트용 페이지 slug. 다음 이벤트는 이 값만 새 행으로 바꾼다(지난 참여 기록은 그 행에 남는다). */
export const followEventSlug = 'x-opening-1116';
export const followEventPath = '/follow';
export const followMission: LikeMissionConfig = {
 slug: followEventSlug, path: followEventPath, attributionKey: followEventSlug,
 // 팔로우·리포스트는 X에서 하므로 이 화면이 확인할 수 없다: 좋아요를 누르기 전에는 체크하지 않는다
 doneSteps: ({ completed }) => completed ? 3 : 0,
 copy: {
  ko: { title: 'X 오픈 이벤트', subtitle: 'X Opening Event', how: '참여 방법', once: '1인 1회', stamped: '도장 쾅! 이벤트 참여 완료', event: 'KYAA × X 오픈 이벤트', steps: ['X에서 @kyaa_app 팔로우', '이벤트 글 리포스트', '로그인하고 좋아요 누르기'], login: '로그인', like: '좋아요', done: '참여 완료', count: '좋아요', error: '이벤트를 불러오지 못했어요. 다시 시도해 주세요.', retry: '다시 시도', saveError: '좋아요를 저장하지 못했어요. 다시 시도해 주세요.' },
  en: { title: 'X Opening Event', subtitle: 'X 오픈 이벤트', how: 'How to join', once: 'Once per account', stamped: 'Stamped! You’re in the event', event: 'KYAA × X Opening Event', steps: ['Follow @kyaa_app on X', 'Repost the event post', 'Sign in and tap Like'], login: 'Sign in', like: 'Like', done: 'Entry complete', count: 'Likes', error: 'Couldn’t load the event. Please try again.', retry: 'Try again', saveError: 'Couldn’t save your like. Please try again.' },
 },
};
