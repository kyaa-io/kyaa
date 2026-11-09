import type { RaffleList } from "@/features/benefit/domain/raffle";
import type { BannerSlotMap, HomeBanner } from "@/features/home/domain/home-banner";
import type { HomeNoticePage } from "@/features/home/domain/home-notice";
import type { LiveEventResponse } from "@/features/live/domain/live-event";
import type { PublishedCelebrity } from "@/server/content/content-domain";

export type HomeQueryResult<T> = { status: "fulfilled"; value: T } | { status: "rejected" };
export function settleHomeQuery<T>(query: Promise<T>): Promise<HomeQueryResult<T>> {
  return query.then(value => ({ status: "fulfilled", value }), () => ({ status: "rejected" }));
}
export type HomeQueries = {
  featuredLives: Promise<HomeQueryResult<readonly LiveEventResponse[]>>;
  celebrities: Promise<HomeQueryResult<readonly PublishedCelebrity[]>>;
  homeBanners: Promise<HomeQueryResult<readonly HomeBanner[]>>;
  /** The managed slot banners of the home; the thin banner under the ranking is `home_below_board`. */
  homeSlots: Promise<HomeQueryResult<BannerSlotMap>>;
  elinaRaffles: Promise<HomeQueryResult<RaffleList>>;
  /** kyaa home notices, pinned first then newest, at most 5 (R8-DATA N1). */
  homeNotices: Promise<HomeQueryResult<HomeNoticePage>>;
};
