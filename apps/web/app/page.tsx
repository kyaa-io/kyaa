import { xMissionHomeBanner } from "../features/home/domain/x-mission-home-banner";
import { createRaffleDependencies } from "../server/raffle/raffle-dependencies";
import { toContentLocale } from "@/i18n/locales";
import { parseAppLocale } from "@/i18n/locales";
import { settleHomeQuery } from "../components/home-query-stream";
import { measureHomeQuery } from "@/server/analytics/home-query-metrics";
import { createHomeBannerRepository } from "../server/content/home-banner-repository";
import { publicMetadata, pageCopy } from "@/seo/metadata";
import { homeStructuredData, serializeStructuredData } from "@/seo/structured-data";
import { StreamingGuestHome } from "../components/guest-home";
import { loadServerEnv } from "../server/config/env";
import { SIGNUP_RAFFLE_BANNER_ID } from "../features/home/domain/signup-raffle-home-banner";
import { signupRaffleEnabled, jjinfanGaugeEnabled } from "../server/config/feature-flags";
import { heartDonationEvent } from "../server/config/heart-donation-event";
import { createPublishedContentRepositoryFromEnvironment } from "../server/content/published-content-repository";
import { createHomeGalleryRepository } from "../server/home-gallery/home-gallery-repository";
import { createHomeNoticeRepository } from "../server/home-notice/home-notice-repository";
import { cookies } from "next/headers";
import { FIRST_STEPS_COOKIE, firstStepsDoneCookie } from "../features/onboarding/domain/first-steps";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ locale?: string | string[] }> }) {
  const locale = parseAppLocale((await searchParams).locale);
  return publicMetadata({ path: "/", locale, ...pageCopy.home[locale] });
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ locale?: string | string[] }> }) {
  const locale = parseAppLocale((await searchParams).locale);
  const firstStepsDone = firstStepsDoneCookie((await cookies()).get(FIRST_STEPS_COOKIE)?.value);
  const environment = loadServerEnv();
  const celebrityRepository = createPublishedContentRepositoryFromEnvironment();
  const bannerRepository = createHomeBannerRepository({ url: environment.SUPABASE_URL, serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY });
  const noticeRepository = createHomeNoticeRepository({ url: environment.SUPABASE_URL, serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY });
  const galleryRepository = createHomeGalleryRepository({ url: environment.SUPABASE_URL, serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY });
  const queries = {
    // The home reads only Elina (raffle guide); the full list would put unlisted creators in the guest payload.
    celebrities: settleHomeQuery(measureHomeQuery("celebrities", async () => {
      const elina = await celebrityRepository.findBySlug(toContentLocale(locale), "elina");
      return elina ? [elina] : [];
    })),
    homeBanners: settleHomeQuery(measureHomeQuery("homeBanners", async () => {
      const banners = await bannerRepository.list(toContentLocale(locale));
      // The raffle banner is pinned first by the home itself; the CMS copy would show it twice.
      const mission = xMissionHomeBanner(locale);
      return [mission, ...banners.filter(banner => banner.id !== SIGNUP_RAFFLE_BANNER_ID && banner.id !== mission.id && !["/s/raffle", "/s/x"].includes(banner.href.split("?")[0]))];
    })),
    homeSlots: settleHomeQuery(measureHomeQuery("homeSlots", async () => {
      const slots = await bannerRepository.listSlots(toContentLocale(locale), "home");
      if (signupRaffleEnabled()) return slots;
      return Object.fromEntries(Object.entries(slots).filter(([, banner]) => banner?.id !== SIGNUP_RAFFLE_BANNER_ID && banner?.href?.split("?")[0] !== "/s/raffle"));
    })),
    homeNotices: settleHomeQuery(measureHomeQuery("homeNotices", () => noticeRepository.listPublished(toContentLocale(locale), { limit: 5 }))),
    homeGallery: settleHomeQuery(measureHomeQuery("homeGallery", () => galleryRepository.listPublishedPool(toContentLocale(locale), { pages: 3 }))),
    homeShorts: settleHomeQuery(measureHomeQuery("homeShorts", () => galleryRepository.listShorts(toContentLocale(locale), { limit: 12 }))),
    elinaRaffles: settleHomeQuery(measureHomeQuery("elinaRaffles", () => createRaffleDependencies().list({ celebritySlug: "elina", locale: toContentLocale(locale), now: new Date() }))),
  };
  return <>
    <script
      id="byus-home-structured-data"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeStructuredData(homeStructuredData()) }}
    />
    <StreamingGuestHome
      queries={queries}
      locale={locale}
      jjinfanGauge={jjinfanGaugeEnabled()}
      signupRaffle={signupRaffleEnabled()}
      heartDonation={heartDonationEvent()}
      firstSteps={!firstStepsDone}
    />
  </>;
}
