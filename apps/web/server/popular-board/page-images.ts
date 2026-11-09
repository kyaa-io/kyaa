import "server-only";
import { loadPublicGroupDetail, loadPublicGroupDetailBySlug } from "@/server/groups/public-detail";
import type { AppLocale } from "@/i18n/locales";

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; url: string | null }>();

/** The picture of the page a popular post belongs to: a fan page is read by its slug, a group by its id, through the same public handlers the page itself uses.
 * Kept five minutes per page so the ten rows of the board do not read ten pages on every visit. A page that cannot be read has no picture. */
export async function readPopularPostPageImage(source: "fan" | "group", pageRef: string, locale: AppLocale): Promise<string | null> {
  const key = `${source}:${pageRef}:${locale}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.url;
  const detail = source === "fan" ? await loadPublicGroupDetailBySlug(pageRef, locale) : await loadPublicGroupDetail(pageRef, locale);
  const url = detail?.page.imageUrl ?? null;
  cache.set(key, { at: Date.now(), url });
  return url;
}
