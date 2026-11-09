// Fixed data for the screen-baseline test. Synthetic; never read from a live service.
import type { PublishedCelebrity } from "@/server/content/content-domain";

export const FIXED_NOW = "2026-11-02T03:00:00.000Z";

const creator = (slug: string, imageUrl: string, name: string, summary: string, displayOrder: number, fanCount: number): PublishedCelebrity => ({
  slug, locale: "ko", name, summary,
  image: { url: imageUrl, alt: name, position: "center" },
  roles: ["singer"], websiteUrl: null, ticketUrl: null, themes: [], socialLinks: [], displayOrder, fanCount,
});

export const homeCelebrities: readonly PublishedCelebrity[] = [
  creator("elina", "/images/celebrities/elina/hero-source.jpg", "엘리나", "합성 예시 소개 한 줄", 1, 1200),
  creator("nchive", "/images/celebrities/nchive/official-emblem-20261014.jpg", "엔카이브", "합성 예시 소개 한 줄", 2, 980),
  creator("wena", "/images/celebrities/wena/official-logo.jpg", "위나", "합성 예시 소개 한 줄", 3, 640),
];

export const homeQueryData = {
  celebrities: homeCelebrities,
  celebrityLives: [],
  homeBanners: [],
  elinaRaffles: { raffles: [] },
};

// Wallet history rows for the Deokjil (benefits) tab. Fixed ids and times; synthetic. Each 덕질 row carries what the history API
// returns for it: the real activity (`actionKey`) and, for a point correction, why it was reclaimed (`correctionReason`).
type Row = { sourceType: string; amount: number; asset: "fan_point" | "ticket"; actionKey?: string; correctionReason?: string };
const ROWS: readonly Row[] = [
  { sourceType: "group_check_in", amount: 10, asset: "fan_point" },
  { sourceType: "dukjil_action", amount: 5, asset: "fan_point", actionKey: "post" },
  { sourceType: "dukjil_correction", amount: -20, asset: "fan_point", actionKey: "post", correctionReason: "content_deleted" },
  { sourceType: "dukjil_action", amount: 2, asset: "fan_point", actionKey: "comment" },
  { sourceType: "group_exchange", amount: -100, asset: "fan_point" },
  { sourceType: "group_exchange", amount: 1, asset: "ticket" },
  { sourceType: "dukjil_action", amount: 3, asset: "fan_point", actionKey: "reaction" },
  { sourceType: "passport_verification", amount: 1, asset: "ticket" },
  { sourceType: "dukjil_action", amount: 20, asset: "fan_point" },
  { sourceType: "group_raffle_entry", amount: -2, asset: "ticket" },
  { sourceType: "dukjil_action", amount: 3, asset: "fan_point", actionKey: "share" },
  { sourceType: "mission_completion", amount: 10, asset: "fan_point" },
];
const uuid = (prefix: string, index: number) => `${prefix}-0000-4000-8000-${String(index).padStart(12, "0")}`;
export const historyEntries = (count: number, longReason = false) => Array.from({ length: count }, (_, index) => {
  const row = longReason && index === 1 ? { sourceType: "group_raffle_entry", amount: -2, asset: "ticket" as const } : ROWS[index % ROWS.length];
  return { id: uuid("20000000", index + 1), asset: row.asset, amount: row.amount, sourceType: row.sourceType, sourceId: uuid("20000000", index + 101), celebrityId: null, createdAt: new Date(Date.parse("2026-11-02T01:00:00.000Z") - index * 86_400_000).toISOString(), actionKey: (row as Row).actionKey ?? null, correctionReason: (row as Row).correctionReason ?? null };
});
export const HISTORY_ENTRIES = historyEntries(8);

// 오늘의 덕질 / 랭킹 합성 응답. Names are invented; images are repository assets.
const CREATOR_IMAGES = ["/images/celebrities/elina/hero-source.jpg", "/images/celebrities/nchive/official-emblem-20261014.jpg", "/images/celebrities/wena/official-logo.jpg"] as const;
const LONG_NAME = "합성 긴 이름 크리에이터 공식 팬페이지 이름이 아주 길게 이어지는 경우 확인용";
const NAMES = ["합성 크리에이터 가", "합성 크리에이터 나", "합성 크리에이터 다"];
export const joinedPages = (count: number, longNames = false) => Array.from({ length: count }, (_, index) => ({
  id: uuid("30000000", index + 1), kind: "fan", celebrityId: uuid("40000000", index + 1), slug: `synthetic-${index + 1}`,
  name: longNames && index === 1 ? LONG_NAME : count > NAMES.length ? `합성 크리에이터 ${index + 1}` : NAMES[index], description: "합성 소개", imageUrl: CREATOR_IMAGES[index % CREATOR_IMAGES.length], question: null, memberCount: 1200 - index * 40,
}));
/** Rotates pending / done (streak 3) / no passport so every row variant shows. */
export const attendanceFor = (count: number, allDone = false, attended: ReadonlySet<string> = new Set()) => ({ kstDate: "2026-11-02", items: Array.from({ length: count }, (_, index) => {
  const kind = allDone ? 1 : index % 3;
  return { celebrityId: uuid("40000000", index + 1), attendedToday: kind === 1 || attended.has(`synthetic-${index + 1}`), streak: kind === 1 ? 3 : kind === 0 ? 1 : 0, nextBonusIn: 4, hasPassport: kind !== 2 };
}) });
export const rankingRows = (count: number, longNames = false, noMine = false) => Array.from({ length: count }, (_, index) => ({
  rank: index + 1, slug: `synthetic-${index + 1}`, name: longNames && index === 0 ? LONG_NAME : `합성 크리에이터 ${index + 1}`, imageUrl: CREATOR_IMAGES[index % CREATOR_IMAGES.length],
  score: Math.max(1, 5200 - index * 313), jjinfanCount: index === 1 ? 100 : Math.max(0, 37 - index * 7), myHearts: index === 0 && !noMine ? 52 : null,
}));
export const DUKJIL_CATALOG = { version: 1, rules: { checkin: { points: 10 }, post: { points: 5, dailyLimit: 3 } }, missionBook: null };
