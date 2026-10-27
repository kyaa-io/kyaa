import { parseAppLocale } from "../../i18n/locales";
import { createRoot } from "react-dom/client";
import { HomeBannerManager } from "../../components/admin/home-banner-manager";
import { GuestHome } from "../../components/guest-home";
import { EventsCatalogScreen } from "../../features/home/ui/events-catalog-screen";
import { EventsPagination } from "../../features/home/ui/events-pagination";
import { gggiHomeBanner } from "../../features/home/domain/gggi-home-banner";
import { LiveCalendarScreen } from "../../features/live/ui/live-calendar-screen";
import { buildLiveCalendarMonth } from "../../features/live/domain/live-calendar";
import type { LiveEventResponse } from "../../features/live/domain/live-event";
import { bannerFixture } from "./fixture";
import "../../app/globals.css";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";

const query = new URLSearchParams(location.search);
const locale = parseAppLocale(query.get("locale"));
const ko = locale === "ko";
const scenario = query.get("scenario");
const creator = { slug: "elina", locale: ko ? "ko" as const : "en" as const, name: ko ? "엘리나" : "Elina", summary: "", image: { url: "/images/guest-home/elina-card.jpg", alt: "Elina", position: "50% 50%" }, roles: ["creator"] as const, themes: [], socialLinks: [], displayOrder: 0, fanCount: 0 };
const lives: LiveEventResponse[] = [14,19,24,29].map((day, index) => ({
  live: { id: `91000000-0000-4000-8000-00000000000${index}`, slug: `elina-week-${index}`, title: ko ? `엘리나 정기 LIVE ${index + 1}` : `Elina regular LIVE ${index + 1}`,
    effectiveStatus: "scheduled", startsAt: `2026-09-${day}T11:00:00.000Z`, endsAt: `2026-09-${day}T12:00:00.000Z`, reservationOpensAt: "2026-09-01T00:00:00.000Z", reservationClosesAt: `2026-09-${day}T11:00:00.000Z`,
    description: "", productContext: "", heroImage: { url: creator.image.url, alt: "Elina" }, celebrity: { slug: "elina", name: creator.name, image: creator.image.url, fanCount: 0 },
    brand: { slug: "byus", name: "ByUs", logo: "/images/guest-home/byus-wordmark.svg", websiteUrl: null }, watch: { available: false, provider: "youtube", url: "https://www.youtube.com/@elina" },
  }, viewer: { authenticated: false, passport: "missing", reservation: null }, primaryAction: "sign_in_to_reserve",
}));
const banner = { ...bannerFixture,
  title: ko ? "엘리나의 정기 LIVE" : "Regular LIVE with Elina",
  description: ko ? "매주 금요일 오후 8시 · KST" : "Every Friday at 8 PM · KST",
  ctaLabel: ko ? "방송 일정 보기" : "View the schedule", alt: ko ? "엘리나 정기 방송" : "Elina regular broadcasts",
  desktopImage: { ...bannerFixture.desktopImage, url: scenario === "broken" ? "/images/missing-banner.jpg" : `/images/celebrities/elina/${ko ? "hero-beach.jpg" : "hero-source.jpg"}` },
  mobileImage: scenario === "fallback" ? null : { ...bannerFixture.mobileImage!, url: scenario === "broken" ? "/images/missing-banner.jpg" : ko ? "/images/guest-home/elina-card.jpg" : "/images/celebrities/elina/guide-blue-beret-20260912.webp" },
};
const welcomeBanner = { ...bannerFixture, kind: "announcement" as const,
  title: "We;Na × Kyaa", description: ko ? "위나의 음악과 사진을 만나고, 팬 인증 퀴즈에 도전해 보세요." : "Discover We;Na’s music and photos, and take the fan verification quiz.",
  ctaLabel: ko ? "위나 팬페이지 보기" : "Visit We;Na’s fan page", href: "/wena", alt: "위나의 네 멤버가 함께한 단체 사진",
  desktopImage: { ...bannerFixture.desktopImage, width: 1890, height: 1890, url: "https://gmrykvmtmuaeswpajteq.supabase.co/storage/v1/object/public/cms-assets/public-image-assets/3a7b1190beb9a0a49daad1f5fcab87e541512c4a98345f6051eee71df43fa132.webp" },
  mobileImage: { ...bannerFixture.mobileImage!, width: 2560, height: 1890, url: "https://gmrykvmtmuaeswpajteq.supabase.co/storage/v1/object/public/cms-assets/public-image-assets/d28368aaf26a1ee76366cd647eb9f5807ddc0bae044f24c3186602c71c692232.webp" },
};
const calendar = buildLiveCalendarMonth({ month: "2026-09", events: lives.map(({live}) => ({ id: live.id, slug: live.slug, startsAt: live.startsAt, effectiveStatus: live.effectiveStatus, title: live.title, celebrity: { name: creator.name, image: creator.image.url }, reservationState: null, hasBenefit: null })) });
document.documentElement.lang = locale;
createRoot(document.getElementById("root")!).render(location.pathname === "/events" ?
  <EventsCatalogScreen locale={locale} homeBanners={[gggiHomeBanner(locale), banner]} elina={creator} elinaRaffles={[]} showElinaCampaign pagination={<EventsPagination locale={locale} page={2} pageCount={2} />} /> :
  location.pathname.startsWith("/admin") ? <HomeBannerManager locale={ko ? "ko" : "en"} role={query.get("role") ?? "admin"} /> : location.pathname === "/live/calendar" ?
  <LiveCalendarScreen initialCalendar={calendar} locale={locale} celebrities={[{ slug: "elina", name: creator.name, image: creator.image.url }]} eventMetadata={lives.map(({ live }) => ({ eventSlug: live.slug, celebritySlug: "elina", platforms: ["youtube"] }))} initialCelebritySlugs={["elina"]} /> :
  <GuestHome celebrities={[creator]} featuredLives={lives} homeBanners={scenario === "unpublished" ? [] : [scenario === "welcome" ? welcomeBanner : banner]} locale={locale} />);
