import type { AppLocale } from "@/i18n/locales";
import type { HomeBanner } from "./home-banner";

export function missionbookHomeBanner(locale: AppLocale): HomeBanner {
  const ko = locale === "ko";
  return {
    id: "247861a1-27b0-4e0a-9039-b5f8f7bc1c48", kind: "announcement", celebrityId: null, category: "guide",
    title: ko ? "덕질하는 법" : "How to earn as a fan", description: "",
    ctaLabel: ko ? "덕질하는 법 보기" : "See how to earn as a fan", href: "/guide/dukjil",
    alt: ko ? "덕질하는 법" : "How to earn as a fan",
    desktopImage: { id: "247861a1-27b0-4e0a-9039-b5f8f7bc1c49", url: "/images/guide/dukjil-hero.webp", width: 1254, height: 1254, mimeType: "image/webp", revision: 1 },
    mobileImage: null,
  };
}
