import type { Route } from "next";
import type { AppLocale } from "@/i18n/locales";

export const COMMUNITY_TABS = ["posts", "fans", "certifications", "requests"] as const;
export type CommunityTab = typeof COMMUNITY_TABS[number];

export function parseCommunityTab(value: unknown): CommunityTab {
  return COMMUNITY_TABS.includes(value as CommunityTab) ? value as CommunityTab : "posts";
}

export function communityHref(slug: string, locale: AppLocale, tab: CommunityTab = "posts", mediaOnly = false): Route {
  const query = new URLSearchParams({ creator: slug, tab, locale });
  if (mediaOnly) query.set("media", "1");
  return `/community?${query}` as Route;
}

/** An explicit unpublished creator must never silently select somebody else. */
export function selectCommunityCreator<T extends { slug: string; displayOrder: number }>(creators: readonly T[], requested?: string): T | undefined {
  if (requested !== undefined) return creators.find(creator => creator.slug === requested);
  return [...creators].sort((a, b) => a.displayOrder - b.displayOrder || a.slug.localeCompare(b.slug))[0];
}

/** Published directory only; show the existing fan count as the ranking criterion. */
export function hotCommunities<T extends { slug: string; fanCount: number; displayOrder: number }>(creators: readonly T[]): T[] {
  return creators.filter(creator => creator.fanCount > 0).sort((a, b) => b.fanCount - a.fanCount || a.displayOrder - b.displayOrder || a.slug.localeCompare(b.slug)).slice(0, 5);
}
