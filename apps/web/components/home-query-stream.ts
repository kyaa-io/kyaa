import type { RaffleList } from "@/features/benefit/domain/raffle";
import type { HomeBanner } from "@/features/home/domain/home-banner";
import type { LiveEventResponse } from "@/features/live/domain/live-event";
import type { PublishedCelebrity, PublishedCelebrityLive } from "@/server/content/content-domain";

export type HomeQueryResult<T> = { status: "fulfilled"; value: T } | { status: "rejected" };
export function settleHomeQuery<T>(query: Promise<T>): Promise<HomeQueryResult<T>> {
  return query.then(value => ({ status: "fulfilled", value }), () => ({ status: "rejected" }));
}
export type HomeQueries = {
  featuredLives: Promise<HomeQueryResult<readonly LiveEventResponse[]>>;
  celebrities: Promise<HomeQueryResult<readonly PublishedCelebrity[]>>;
  celebrityLives: Promise<HomeQueryResult<readonly PublishedCelebrityLive[]>>;
  homeBanners: Promise<HomeQueryResult<readonly HomeBanner[]>>;
  elinaRaffles: Promise<HomeQueryResult<RaffleList>>;
  /** Creators whose fan page is unlisted: out of the discovery chips, kept in the viewer's own chip. Absent or failed: nothing is left out. */
  unlistedCreators?: Promise<HomeQueryResult<readonly string[]>>;
};
