import type { AppLocale } from "@/i18n/locales";
import type { HomeBanner } from "./home-banner";

// 2026-11-16 대표 11/15 16:22: 덕질미션북 배너 그림 v2(필름 사진 톤). 새 파일 이름으로 바꿔 캐시된 화면도 새 그림을 받는다.
const WIDE = "/images/guide/missionbook-v2-wide.webp";
const SQUARE = "/images/guide/missionbook-v2-square.webp";

export const MISSIONBOOK_BANNER_ID = "247861a1-27b0-4e0a-9039-b5f8f7bc1c48";

/** The description stays empty: the slide shows the live like count there (ManagedHomeBanner, user 11/16). */
export function missionbookHomeBanner(locale: AppLocale): HomeBanner {
  const ko = locale === "ko";
  return {
    id: MISSIONBOOK_BANNER_ID, kind: "announcement", celebrityId: null, category: "guide",
    title: ko ? "덕질미션북" : "Fan mission book", description: "",
    ctaLabel: ko ? "미션북 보기" : "See the mission book", href: "/guide/dukjil",
    alt: ko ? "덕질미션북" : "Fan mission book",
    desktopImage: { id: "247861a1-27b0-4e0a-9039-b5f8f7bc1c4a", url: WIDE, width: 1536, height: 1024, mimeType: "image/webp", revision: 2 },
    mobileImage: { id: "247861a1-27b0-4e0a-9039-b5f8f7bc1c4b", url: SQUARE, width: 1024, height: 1024, mimeType: "image/webp", revision: 2 },
  };
}
