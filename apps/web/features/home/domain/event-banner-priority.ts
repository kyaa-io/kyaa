import { pageLikeEventWindows, passportIssuedEventWindows } from "@/features/reaction/domain/page-like-event";

const inWindow = (window: { from: string; to: string }, at: number) => Date.parse(window.from) <= at && at < Date.parse(window.to);

/** 지금 열린 이벤트 창(`eventParticipantWindowEvents`)이 가리키는 배너 경로 판정. page-like는 `/<slug>`, passport-issued는 `/c/<slug>/verify`로 시작하는 내부 링크. */
function openEventBannerMatchers(at: number): ((path: string) => boolean)[] {
  const pageLike = Object.values(pageLikeEventWindows).filter((window) => inWindow(window, at)).map((window) => (path: string) => path === `/${window.slug}`);
  const passport = Object.values(passportIssuedEventWindows).filter((window) => inWindow(window, at)).map((window) => (path: string) => path === `/c/${window.slug}/verify` || path.startsWith(`/c/${window.slug}/verify/`));
  return [...pageLike, ...passport];
}

/**
 * 이벤트 날에는 그날 이벤트 배너를 홈 슬라이더 첫 칸으로 올린다(관리자 화면으로는 순서를 못 바꾼다).
 * 판단은 배너 링크(href)뿐이다. 맞는 배너끼리 원래 순서를 지키고 나머지 배너의 순서도 그대로이며, 열린 창이 없으면 입력을 그대로 돌려준다.
 */
export function prioritizeEventBanners<T extends { href: string }>(banners: readonly T[], now: Date | number): readonly T[] {
  const matchers = openEventBannerMatchers(typeof now === "number" ? now : now.getTime());
  if (!matchers.length) return banners;
  const isEvent = (banner: T) => banner.href.startsWith("/") && !banner.href.startsWith("//") && matchers.some((match) => match(banner.href.split(/[?#]/)[0]!.replace(/(?<=.)\/$/, "")));
  return [...banners.filter(isEvent), ...banners.filter((banner) => !isEvent(banner))];
}
