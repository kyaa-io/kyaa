import type { AppLocale } from "@/i18n/locales";
import { signupRaffleText } from "@/i18n/catalogs/signup-raffle";
import type { HomeBanner } from "./home-banner";

export const SIGNUP_RAFFLE_BANNER_ID = "ee9bdc92-a049-4f81-ab42-751f734af1ce";
export function signupRaffleHomeBanner(locale: AppLocale): HomeBanner {
  const text = (key: Parameters<typeof signupRaffleText>[1]) => signupRaffleText(locale, key);
  return {
    id: SIGNUP_RAFFLE_BANNER_ID, kind: "announcement", celebrityId: null, category: "event", placement: "home",
    title: text("homeBannerTitle"), description: `US$400 · ${text("winners")} · ${text("deadline")}`,
    ctaLabel: text("enter"), href: "/s/raffle?utm_source=kyaa&utm_medium=home_banner&utm_campaign=signup_raffle", alt: text("homeBannerArt"),
    desktopImage: { id: "052ea25c-b933-4d66-8d73-f8233349086d", url: "/images/signup-raffle/home-c.webp", width: 1536, height: 1024, mimeType: "image/webp", revision: 2 },
    mobileImage: { id: "735a095a-5704-487c-9cd1-c4b73767ce7e", url: "/images/signup-raffle/home-c.webp", width: 1536, height: 1024, mimeType: "image/webp", revision: 2 },
  };
}
