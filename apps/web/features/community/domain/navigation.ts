import type { Route } from "next";
import type { AppLocale } from "@/i18n/locales";

export const COMMUNITY_TABS = ["posts", "fans", "certifications", "requests"] as const;
export type CommunityTab = typeof COMMUNITY_TABS[number];

export function communityHref(slug: string, locale: AppLocale, tab: CommunityTab = "posts", mediaOnly = false): Route {
  const query = new URLSearchParams({ tab: ({ posts: "board", fans: "leaderboard", certifications: "certifications", requests: "home" } as const)[tab], locale });
  if (mediaOnly) query.set("media", "1");
  return `/c/${encodeURIComponent(slug)}?${query}` as Route;
}
