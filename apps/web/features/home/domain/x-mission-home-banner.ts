import type { AppLocale } from "@/i18n/locales";
import type { HomeBanner } from "./home-banner";

export function xMissionHomeBanner(locale: AppLocale): HomeBanner {
  const ko = locale === "ko";
  return {
    id: "fc1bd251-f675-4e69-82b0-26a8a73be41f", kind: "announcement", celebrityId: null, category: "event", placement: "home",
    title: ko ? "X 미션 이벤트" : "X Event · Mission",
    description: ko ? "Google 로그인 → 좋아요" : "Google sign-in → Like",
    ctaLabel: ko ? "미션 시작하기" : "Start mission", href: "/s/x",
    alt: ko ? "좋아요 하트와 미션 완료 체크" : "Like heart and mission complete check",
    desktopImage: { id: "8539db20-aa65-43ec-983b-4384cb736b04", url: "/images/x-mission/banner.png", width: 1254, height: 1254, mimeType: "image/png", revision: 1 },
    mobileImage: null,
  };
}
