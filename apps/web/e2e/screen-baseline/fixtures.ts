// Fixed data for the screen-baseline test. Synthetic; never read from a live service.
import type { PublishedCelebrity } from "@/server/content/content-domain";

export const FIXED_NOW = "2026-11-02T03:00:00.000Z";

const creator = (slug: string, imageUrl: string, name: string, summary: string, displayOrder: number, fanCount: number): PublishedCelebrity => ({
  slug, locale: "ko", name, summary,
  image: { url: imageUrl, alt: name, position: "center" },
  roles: ["musician"], websiteUrl: null, ticketUrl: null, themes: [], socialLinks: [], displayOrder, fanCount,
});

export const homeCelebrities: readonly PublishedCelebrity[] = [
  creator("elina", "/images/celebrities/elina/hero-source.jpg", "엘리나", "합성 예시 소개 한 줄", 1, 1200),
  creator("nchive", "/images/celebrities/nchive/official-emblem-20261014.jpg", "엔카이브", "합성 예시 소개 한 줄", 2, 980),
  creator("wena", "/images/celebrities/wena/official-logo.jpg", "위나", "합성 예시 소개 한 줄", 3, 640),
];

export const homeQueryData = {
  featuredLives: [],
  celebrities: homeCelebrities,
  celebrityLives: [],
  homeBanners: [],
  elinaRaffles: { raffles: [] },
} as const;

// Wallet history rows for the Deokjil (benefits) tab. Fixed ids and times; synthetic.
export const HISTORY_ENTRIES = [
  { id: "20000000-0000-4000-8000-000000000001", asset: "fan_point", amount: 10, sourceType: "group_check_in", sourceId: "20000000-0000-4000-8000-0000000000a1", celebrityId: null, createdAt: "2026-11-02T01:00:00.000Z" },
  { id: "20000000-0000-4000-8000-000000000002", asset: "fan_point", amount: 5, sourceType: "group_check_in", sourceId: "20000000-0000-4000-8000-0000000000a2", celebrityId: null, createdAt: "2026-11-01T01:00:00.000Z" },
  { id: "20000000-0000-4000-8000-000000000003", asset: "fan_point", amount: 3, sourceType: "group_check_in", sourceId: "20000000-0000-4000-8000-0000000000a3", celebrityId: null, createdAt: "2026-10-31T01:00:00.000Z" },
];
