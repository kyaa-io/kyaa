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
import { createPublishedContentRepositoryFromEnvironment } from "../server/content/published-content-repository";
import { createLiveEventRepositoryFromEnvironment } from "../server/g3/live-event-repository";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ locale?: string | string[] }> }) {
  const locale = parseAppLocale((await searchParams).locale);
  return publicMetadata({ path: "/", locale, ...pageCopy.home[locale] });
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ locale?: string | string[] }> }) {
  const locale = parseAppLocale((await searchParams).locale);
  const environment = loadServerEnv();
  const liveRepository = createLiveEventRepositoryFromEnvironment({
    url: environment.SUPABASE_URL,
    serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY,
  });
  const celebrityRepository = createPublishedContentRepositoryFromEnvironment();
  const bannerRepository = createHomeBannerRepository({ url: environment.SUPABASE_URL, serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY });
  const queries = {
    featuredLives: settleHomeQuery(measureHomeQuery("featuredLives", () => liveRepository.listFeaturedPublished({ locale: toContentLocale(locale), now: new Date() }))),
    // The home reads only Elina (raffle guide); the full list would put unlisted creators in the guest payload.
    celebrities: settleHomeQuery(measureHomeQuery("celebrities", async () => {
      const elina = await celebrityRepository.findBySlug(toContentLocale(locale), "elina");
      return elina ? [elina] : [];
    })),
    homeBanners: settleHomeQuery(measureHomeQuery("homeBanners", () => bannerRepository.list(toContentLocale(locale)))),
    homeSlots: settleHomeQuery(measureHomeQuery("homeSlots", () => bannerRepository.listSlots(toContentLocale(locale), "home"))),
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
    />
  </>;
}
