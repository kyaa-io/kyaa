/** 이벤트 1(X 오픈, 2026-11-16) 참여를 담는 이벤트용 페이지 slug. 다음 이벤트는 이 값만 새 행으로 바꾼다(지난 참여 기록은 그 행에 남는다). */
export const followEventSlug = 'x-opening-1116';
export const followEventPath = '/follow';
/** 운영 X 계정. 미션 카드와 X 글에 같은 이름을 쓴다 */
export const followXHandle = '@kyaa_app';

export type FollowEventCopy = {
 title: string; subtitle: string; how: string; once: string; event: string;
 /** 01·02: X 팔로우·리포스트(Gleam 위젯 안에서 하고, 완료 체크도 Gleam이 띄운다) */
 xTitle: string;
 /** 03: kyaa 로그인 + 좋아요(서버 기록으로 확인) */
 likeTitle: string;
 login: string; like: string; count: string; stamped: string; post: string; postText: string;
 error: string; retry: string; saveError: string;
};

export type FollowEventConfig = {
 slug: string; path: string; attributionKey: string;
 /** Gleam 대회(2026-11-16 사용자 승인 공개, US$25·1명·11/22 23:59 KST). 공식 설치 코드의 주소·제목 그대로 */
 gleam: { href: string; title: string };
 copy: Record<'ko' | 'en', FollowEventCopy>;
};

export const followEvent: FollowEventConfig = {
 slug: followEventSlug, path: followEventPath, attributionKey: followEventSlug,
 gleam: { href: 'https://gleam.io/yAet3/kyaa-x-opening-event', title: 'KYAA × X Opening Event' },
 copy: {
  ko: { title: 'X 오픈 이벤트', subtitle: 'X Opening Event', how: '참여 방법', once: '1인 1회', event: 'KYAA × X 오픈 이벤트', xTitle: 'X에서 팔로우·리포스트', likeTitle: '로그인하고 좋아요', login: '로그인', like: '좋아요', count: '좋아요', stamped: '도장 쾅! 이벤트 참여 완료', post: 'X에 올리기', postText: 'KYAA × X 오픈 이벤트 참여 완료', error: '이벤트를 불러오지 못했어요. 다시 시도해 주세요.', retry: '다시 시도', saveError: '좋아요를 저장하지 못했어요. 다시 시도해 주세요.' },
  en: { title: 'X Opening Event', subtitle: 'X 오픈 이벤트', how: 'How to join', once: 'Once per account', event: 'KYAA × X Opening Event', xTitle: 'Follow and repost on X', likeTitle: 'Sign in and tap Like', login: 'Sign in', like: 'Like', count: 'Likes', stamped: 'Stamped! You’re in the event', post: 'Post on X', postText: 'I joined the KYAA × X Opening Event', error: 'Couldn’t load the event. Please try again.', retry: 'Try again', saveError: 'Couldn’t save your like. Please try again.' },
 },
};

/** 참여 캡처를 올릴 X 글쓰기 주소. 사진은 X 화면에서 참여자가 붙인다(웹 글쓰기 주소로는 그림을 넣을 수 없다) */
export function followPostIntent(locale: 'ko' | 'en', origin = 'https://kyaa.io'): string {
 const url = new URL('https://x.com/intent/post');
 url.searchParams.set('text', `${followEvent.copy[locale].postText} ${followXHandle}`);
 url.searchParams.set('url', `${origin}${followEventPath}`);
 return url.toString();
}
