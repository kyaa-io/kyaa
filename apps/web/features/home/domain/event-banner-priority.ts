import { openPageLikeEvent } from "../../reaction/domain/page-like-event";
import { SIGNUP_RAFFLE_BANNER_ID } from "./signup-raffle-home-banner";
import { xMissionHomeBanner } from "./x-mission-home-banner";

/** 홈이 코드로 두는 구분 '이벤트' 배너(가입 래플·X 이벤트). 관리자 배너가 아니므로 '오늘 하루 이벤트' 강조·상단 띠·1번 앞세움 대상이 아니다. */
const codePinnedEventBannerIds: ReadonlySet<string> = new Set([SIGNUP_RAFFLE_BANNER_ID, xMissionHomeBanner("ko").id]);

/** 관리자에서 구분을 '이벤트'로 둔 공개 배너. 날짜 창이 아니라 이 구분이 진행 중 이벤트를 가리킨다(11/19 14:1x 결정). */
export function isAdminEventBanner(banner: { id: string; category?: string }): boolean {
  return banner.category === "event" && !codePinnedEventBannerIds.has(banner.id);
}

type EventBanner = { id: string; category?: string; href?: string };

// Home promotion starts on the public announcement date. Like counting
// retains its earlier start dates for each creator.
const campaignSlugs = ["elina", "changha", "yuna"] as const;
const nextCampaignDay = Date.parse("2026-11-20T00:00:00+09:00");

function campaignIndex(banner: EventBanner): number {
  const path = banner.href?.split(/[?#]/)[0]?.replace(/\/$/, "");
  return campaignSlugs.findIndex(slug => path === `/${slug}`);
}

export function isLiveCampaignBanner(banner: EventBanner, now: number): boolean {
  const index = campaignIndex(banner);
  return isAdminEventBanner(banner) && index >= 0 && (index === 0 || now >= nextCampaignDay)
    && Boolean(openPageLikeEvent(campaignSlugs[index]!, now));
}

export function adminEventBanners<T extends EventBanner>(banners: readonly T[], now = Date.now()): T[] {
  const active = banners.filter(banner => isLiveCampaignBanner(banner, now));
  active.sort((a, b) => campaignIndex(a) - campaignIndex(b));
  return [...active, ...banners.filter(banner => isAdminEventBanner(banner) && campaignIndex(banner) < 0)];
}

export function orderHomeBanners<T extends EventBanner>(pinned: readonly T[], managed: readonly T[], now = Date.now()): T[] {
  const events = adminEventBanners(managed, now);
  const prioritized = new Set(events.map(banner => banner.id));
  return [...events, ...pinned, ...managed.filter(banner => !prioritized.has(banner.id))];
}
