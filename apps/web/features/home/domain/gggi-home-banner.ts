import type { AppLocale } from "@/i18n/locales";
import { gggiCopy } from "@/i18n/catalogs/features__fanpage__gggi";
import type { HomeBanner } from "./home-banner";

export function gggiHomeBanner(locale: AppLocale): HomeBanner {
  const t = gggiCopy[locale];
  return {
    id: "8bf2f180-cb32-4f00-93e2-e84b570ad450", kind: "announcement", celebrityId: null,
    title: t.eventTitle, description: t.entryHelp, ctaLabel: t.details,
    href: "/gggi#gggi-event", alt: t.changha,
    desktopImage: { id: "8bf2f180-cb32-4f00-93e2-e84b570ad451", url: "/images/celebrities/changha/gggi-20261030.jpg", width: 1883, height: 2510, mimeType: "image/jpeg", revision: 2 },
    mobileImage: null,
  };
}
