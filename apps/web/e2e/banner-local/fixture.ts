import type { LiveEventResponse } from "../../features/live/domain/live-event";
import type { HomeBanner } from "../../features/home/domain/home-banner";
export const bannerFixture: HomeBanner = {
  id: "90000000-0000-4000-8000-000000000001", kind: "regular_live", celebrityId: "90000000-0000-4000-8000-000000000002",
  title: "엘리나의 정기 LIVE", description: "매주 금요일 오후 8시 · KST", ctaLabel: "방송 일정 보기", href: "/live/calendar?celebrity=elina", alt: "엘리나의 정기 방송",
  desktopImage: { id: "90000000-0000-4000-8000-000000000003", url: "/images/guest-home/kara-hero.png", width: 1360, height: 680, mimeType: "image/png", revision: 1 },
  mobileImage: { id: "90000000-0000-4000-8000-000000000004", url: "/images/guest-home/elina-card.jpg", width: 440, height: 550, mimeType: "image/jpeg", revision: 1 },
};

export const popupLive: LiveEventResponse = {
  live: {
    id: "91000000-0000-4000-8000-000000000000", slug: "elina-week-0", title: "엘리나 정기 LIVE 1",
    effectiveStatus: "scheduled", startsAt: "2026-11-20T11:00:00Z", endsAt: "2026-11-20T12:00:00Z",
    reservationOpensAt: "2026-11-19T12:00:00Z", reservationClosesAt: "2026-11-20T10:00:00Z",
    description: "엘리나와 함께하는 라이브 방송에 참여해 보세요.", productContext: "라이브 방송",
    heroImage: { url: "/images/guest-home/elina-card.jpg", alt: "엘리나" },
    celebrity: { slug: "elina", name: "엘리나", image: "/images/guest-home/elina-card.jpg", fanCount: 0 },
    brand: { slug: "byus", name: "ByUs", logo: "/images/guest-home/byus-wordmark.svg", websiteUrl: null },
    watch: { available: false, provider: "youtube", url: "https://www.youtube.com/@elina" },
  },
  viewer: { authenticated: true, passport: "active", reservation: null },
  primaryAction: "reserve",
};
