import { APP_LOCALES } from "@/i18n/locales";
import type { MetadataRoute } from "next";
import { creatorSlugFromHomePath } from "@/features/creator/domain/creator-navigation";
import { CONTENT_SEO_LOCALES, canonicalUrl, isNoContentPath, isPrivatePath, isRehearsalPath, languageAlternates, type SeoLocale } from "./metadata";

/** Pages whose own text is written in every app language. */
export const TRANSLATED_PUBLIC_PATHS = ["/guide", "/guide/jjinfan", "/pages/us-fanmeetings", "/pages/creator-onboarding", "/pages/partners", "/pages/onchain"];
/** Pages whose main content is database content or a policy text, which exist in Korean and English. */
export const CONTENT_PUBLIC_PATHS = ["/", "/live", "/notices", "/events", "/about", "/privacy", "/terms", "/pricing", "/refund"];
export const STATIC_PUBLIC_PATHS = [...CONTENT_PUBLIC_PATHS, ...TRANSLATED_PUBLIC_PATHS];

const SLUG = "[a-z0-9]+(?:-[a-z0-9]+)*";
const DYNAMIC_PUBLIC_PATH = new RegExp(`^(?:/live/${SLUG}|/notices/${SLUG}|/c/${SLUG}/raffles(?:/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?)$`);

/** `directory` is the one creator directory address that renders: with pages and groups on, /celebrities only sends the reader to /pages/groups. */
export function buildSitemap(content: readonly { path: string; locale: SeoLocale }[], directory: "/pages/groups" | "/celebrities" = "/pages/groups"): MetadataRoute.Sitemap {
  const paths = new Map<string, Set<SeoLocale>>();
  const all = [
    ...[...CONTENT_PUBLIC_PATHS, directory].flatMap((path) => CONTENT_SEO_LOCALES.map((locale) => ({ path, locale }))),
    ...TRANSLATED_PUBLIC_PATHS.flatMap((path) => APP_LOCALES.map((locale) => ({ path, locale }))),
    ...content,
  ];
  for (const { path, locale } of all) {
    if (isPrivatePath(path) || isRehearsalPath(path) || isNoContentPath(path)) continue;
    const creatorHome = !path.startsWith("/c/") && creatorSlugFromHomePath(path) !== null;
    if (!STATIC_PUBLIC_PATHS.includes(path) && path !== directory && !creatorHome && !DYNAMIC_PUBLIC_PATH.test(path)) continue;
    const locales = paths.get(path) ?? new Set<SeoLocale>();
    locales.add(locale);
    paths.set(path, locales);
  }
  return [...paths].flatMap(([path, available]) => {
    const locales = [...available].sort() as SeoLocale[];
    return locales.map((locale) => ({ url: canonicalUrl(path, locale), alternates: { languages: languageAlternates(path, locales) } }));
  });
}
