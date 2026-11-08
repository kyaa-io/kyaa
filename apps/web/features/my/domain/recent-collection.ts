import { type AppLocale } from "@/i18n/locales";
import type { MySummary } from "./my-summary";

type CollectionItem = MySummary["collection"]["recent"][number];
export type RecentCollectionGroup = { item: CollectionItem; count: number };

/** Combine stamps that display identically and open the same Passport, preserving the first item's order. */
export function groupRecentCollection(items: CollectionItem[]): RecentCollectionGroup[] {
  const groups = new Map<string, RecentCollectionGroup>();
  for (const item of items) {
    const key = item.kind === "stamp"
      ? JSON.stringify([item.kind, item.href, item.title, Math.floor(Date.parse(item.occurredAt) / 60_000)])
      : `${item.kind}:${item.id}`;
    const group = groups.get(key);
    if (group) group.count += 1;
    else groups.set(key, { item, count: 1 });
  }
  return [...groups.values()];
}

/** The database names a row "엘리나 Stamp", "엘리나 스탬프" or "엘리나 여권"; Korean screens say 스탬프 and 패스포트 (user decision 2026-11-08 13:05, reversing N1). */
export function koreanCollectionTitle(title: string): string {
  return title.replace(/(^|\s)Stamp$/, "$1스탬프").replace(/(^|\s)여권$/, "$1패스포트");
}

export function collectionGroupTitle({ item, count }: RecentCollectionGroup, locale: AppLocale) {
  const title = locale === "ko" ? koreanCollectionTitle(item.title) : item.title;
  return count > 1 ? `${title}${locale === "ko" ? ` ${count}개` : ` ×${count}`}` : title;
}
