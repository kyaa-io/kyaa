import type { HomeBanner } from "./home-banner";

/**
 * 2026-11-07 approved art for the two guide banners (home slider and the groups tab slider share it).
 * The managed rows keep the order, publication and link; the picture, title, description, button and alt for these two links
 * come from here so the draft art with its "[가안]" mark can never reach a screen. Desktop is 2:1 with the left half empty
 * for copy; mobile is 6:5 with the objects in the top 60%.
 */
type GuideCopy = Readonly<{ title: string; description: string; ctaLabel: string; alt: string }>;
type GuideArt = Readonly<{ id: string; desktop: string; mobile: string; copy: Record<"ko" | "en", GuideCopy> }>;

const DIRECTORY = "/images/home-banners/261107";
const GUIDE_ART: Readonly<Record<string, GuideArt>> = {
  "/guide/jjinfan": {
    id: "a0000000-0000-4000-8000-00000000a261",
    desktop: `${DIRECTORY}/jjinfan-desktop.webp`,
    mobile: `${DIRECTORY}/jjinfan-mobile.webp`,
    copy: {
      ko: { title: "찐팬 되는 법", description: "미션북 9칸을 채우면 찐팬 도장을 받아요", ctaLabel: "찐팬 되는 법 보기", alt: "여권과 9칸 도장판, 마지막 칸에 도장을 찍으려는 도장" },
      en: { title: "How to become a true fan", description: "Fill the 9 mission book slots to get the true-fan stamp", ctaLabel: "See how to become a true fan", alt: "A passport and a 9-slot stamp board with a stamp about to press the last slot" },
    },
  },
  "/guide/dukjil": {
    id: "b0000000-0000-4000-8000-00000000b261",
    desktop: `${DIRECTORY}/dukjil-desktop.webp`,
    mobile: `${DIRECTORY}/dukjil-mobile.webp`,
    copy: {
      ko: { title: "덕질하는 법", description: "출석·글·댓글·공유로 포인트를 모아 교환해요", ctaLabel: "덕질하는 법 보기", alt: "체크 표시가 있는 출석 달력과 코인 더미, 응모권" },
      en: { title: "How to earn as a fan", description: "Earn points from check-ins, posts, comments and shares, then exchange them", ctaLabel: "See how to earn as a fan", alt: "An attendance calendar with checkmarks, a stack of coins and a raffle ticket" },
    },
  },
};

const pathOf = (href: string) => href.split(/[?#]/, 1)[0] ?? "";
const asset = (id: string, url: string, width: number, height: number): HomeBanner["desktopImage"] => ({ id, url, width, height, mimeType: "image/webp", revision: 1 });

export const isGuideArtBanner = (banner: Pick<HomeBanner, "category" | "href">): boolean => banner.category === "guide" && pathOf(banner.href) in GUIDE_ART;

export function withGuideBannerArt(banner: HomeBanner, locale: "ko" | "en"): HomeBanner {
  const art = isGuideArtBanner(banner) ? GUIDE_ART[pathOf(banner.href)] : undefined;
  if (!art) return banner;
  return {
    ...banner, ...art.copy[locale],
    desktopImage: asset(art.id, art.desktop, 1774, 887),
    mobileImage: asset(`${art.id.slice(0, -1)}2`, art.mobile, 1374, 1145),
  };
}
