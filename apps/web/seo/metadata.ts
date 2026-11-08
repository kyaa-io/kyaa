import { APP_LOCALES, type AppLocale } from "@/i18n/locales";
import { messages as localizedMessages } from "@/i18n/catalogs/seo__metadata";
import { additionalLocales } from "@/i18n/messages";
import type { Metadata } from "next";
import { bypassImageOptimization } from "@/components/fan-ui/public-image-policy";
import { runtimeEnvironment } from "@/server/config/hosting";

export type SeoLocale = AppLocale;
export const SITE_URL = "https://kyaa.io";
/** The production default picture. Other environments use `defaultShareImage()`. */
export const DEFAULT_SHARE_IMAGE = `${SITE_URL}/share/default.png`;
export const NO_INDEX: Metadata["robots"] = { index: false, follow: false };

const OPEN_GRAPH_LOCALES: Record<AppLocale, string> = {
  ko: "ko_KR",
  en: "en_US",
  ja: "ja_JP",
  "zh-Hans": "zh_CN",
  "zh-Hant": "zh_TW",
  es: "es_ES",
  id: "id_ID",
  vi: "vi_VN",
  th: "th_TH",
  pt: "pt_PT",
  fr: "fr_FR",
  ru: "ru_RU",
};

/** Only these hosts may serve their own share pictures; production, an unset value and anything else keep SITE_URL. */
const OWN_SHARE_HOST = /^(?:dev|staging)\.kyaa\.io$/;

/** Origin that serves this deployment's own share pictures (og:image, twitter:image). A dev or staging link pasted into a messenger
 * must fetch that environment's picture, not production's. Production's value is SITE_URL and does not change.
 * The canonical URL, sitemap and structured data deliberately stay on SITE_URL. Indexed read: the Next build must not freeze the value. */
export function shareOrigin(source: Readonly<Record<string, string | undefined>> = runtimeEnvironment()): string {
  try {
    const url = new URL(source["NEXT_PUBLIC_APP_URL"] ?? "");
    const own = url.protocol === "https:" && OWN_SHARE_HOST.test(url.hostname)
      || url.protocol === "http:" && url.hostname === "localhost";
    if (own && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash) return url.origin;
  } catch { /* unset or malformed: production */ }
  return SITE_URL;
}

export function defaultShareImage(): string {
  return `${shareOrigin()}/share/default.png`;
}

export function openGraphLocale(locale: AppLocale): string {
  return OPEN_GRAPH_LOCALES[locale];
}

export function canonicalUrl(path: string, locale: SeoLocale): string {
  const url = new URL(path, SITE_URL);
  // Only explicitly selected language belongs in the canonical URL.
  return `${SITE_URL}${url.pathname}?locale=${locale}`;
}

export function languageAlternates(path: string, locales: readonly SeoLocale[] = APP_LOCALES) {
  return Object.fromEntries(locales.map((locale) => [locale, canonicalUrl(path, locale)]));
}

export function isRehearsalPath(path: string): boolean {
  return /(?:^|[/-])(?:rehearsal|test|demo)(?:[/-]|$)/i.test(path);
}

export function isPrivatePath(path: string): boolean {
  return /^\/(?:admin|my|passports|stamps|settings|notifications|onboarding|login|creator|connect|s|i)(?:\/|$)/.test(path)
    || /^\/c\/[^/]+\/(?:verify|tickets)(?:\/|$)/.test(path)
    || /^\/live\/[^/]+\/(?:missions|survey)(?:\/|$)/.test(path);
}

/** Reuse the existing public-image allowlist/optimizer; never fetch arbitrary URLs. */
export function shareImageUrl(source?: string): string {
  const origin = shareOrigin(), fallback = defaultShareImage();
  if (!source || source === DEFAULT_SHARE_IMAGE || source === fallback) return fallback;
  if (!bypassImageOptimization(source) && !source.endsWith(".svg")) {
    return `${origin}/_next/image?${new URLSearchParams({ url: source, w: "1200", q: "75" })}`;
  }
  return new URL(source, origin).href;
}

export function publicMetadata(input: {
  path: string;
  locale: SeoLocale;
  title: string;
  description: string;
  image?: string;
  imageAlt?: string;
  locales?: readonly SeoLocale[];
}): Metadata {
  const { path, locale, title, description } = input;
  const url = canonicalUrl(path, locale);
  const image = shareImageUrl(input.image);
  const images = [{ url: image, alt: input.imageAlt || "Kyaa. Every Fan Moment Counts.",
    ...(image === defaultShareImage() ? { width: 1200, height: 630 } : {}) }];
  return {
    title, description,
    alternates: { canonical: url, languages: languageAlternates(path, input.locales) },
    robots: isPrivatePath(path) || isRehearsalPath(path) ? NO_INDEX : { index: true, follow: true, "max-image-preview": "large" },
    openGraph: { title, description, url, type: "website", siteName: "kyaa",
      locale: openGraphLocale(locale),
      alternateLocale: (input.locales ?? APP_LOCALES).filter((value) => value !== locale).map(openGraphLocale), images },
    twitter: { card: "summary_large_image", title, description, images },
  };
}

export const pageCopy = {
  home: {
    ko: { title: "Kyaa. Every Fan Moment Counts.", description: "최애의 LIVE 일정을 확인하고 팬 인증, 예약, 출석으로 함께한 순간을 팬 패스포트에 기록하세요." },
    en: { title: "Kyaa. Every Fan Moment Counts.", description: "Discover your favorite creators and their LIVE events. Verify your fandom, reserve a spot for a LIVE, and record your attendance in your Fan Passport." },

  ...additionalLocales((translationLocale) => ({ title: "Kyaa. Every Fan Moment Counts.", description: localizedMessages.m66f358c91b9f[translationLocale] }))
},
  live: {
    ko: { title: "LIVE 일정 | kyaa", description: "진행 중인 LIVE와 예정된 방송을 확인하세요. 최애의 LIVE를 예약하고 함께한 순간을 기록하세요." },
    en: { title: "LIVE events and schedules | kyaa", description: "Explore ongoing and upcoming LIVE events. Reserve a spot for your favorite creator’s LIVE and record the moments you share." },

  ...additionalLocales((translationLocale) => ({ title: localizedMessages.m70c75a25ee29[translationLocale], description: localizedMessages.m449445c22831[translationLocale] }))
},
  celebrities: {
    ko: { title: "셀럽과 크리에이터 | kyaa", description: "kyaa의 셀럽과 크리에이터를 만나보세요. 최애의 소식과 LIVE 일정을 확인하고 팬 패스포트를 시작하세요." },
    en: { title: "Celebrities and creators | kyaa", description: "Meet the celebrities and creators on kyaa. Explore updates and LIVE schedules, and create a Fan Passport for your favorite creator." },

  ...additionalLocales((translationLocale) => ({ title: localizedMessages.m83574df4c2b6[translationLocale], description: localizedMessages.ma7d9afcd4b2d[translationLocale] }))
},
} as const;
