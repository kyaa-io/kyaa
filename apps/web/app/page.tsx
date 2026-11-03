import { createRaffleDependencies } from "../server/raffle/raffle-dependencies";
import { toContentLocale } from "@/i18n/locales";
import { parseAppLocale } from "@/i18n/locales";
import { settleHomeQuery } from "../components/home-query-stream";
import { measureHomeQuery } from "@/server/analytics/home-query-metrics";
import { createHomeBannerRepository } from "../server/content/home-banner-repository";
import { publicMetadata, pageCopy } from "@/seo/metadata";
import { homeStructuredData, serializeStructuredData } from "@/seo/structured-data";
import { StreamingGuestHome } from "../components/guest-home";
import { parseCreatorRoleFilter } from "../features/creator/domain/creator-role";
import { loadServerEnv } from "../server/config/env";
import { createPublishedContentRepositoryFromEnvironment } from "../server/content/published-content-repository";
import { createLiveEventRepositoryFromEnvironment } from "../server/g3/live-event-repository";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ locale?: string | string[] }> }) {
  const locale = parseAppLocale((await searchParams).locale);
  return publicMetadata({ path: "/", locale, ...pageCopy.home[locale] });
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ locale?: string | string[]; owned?: string | string[]; role?: string | string[] }> }) {
  const { locale: requestedLocale, owned, role } = await searchParams;
  const locale = parseAppLocale(requestedLocale);
  const initialOwnedOnly = owned === "1" ? true : owned !== undefined || role !== undefined ? false : undefined;
  const environment = loadServerEnv();
  const liveRepository = createLiveEventRepositoryFromEnvironment({
    url: environment.SUPABASE_URL,
    serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY,
  });
  const celebrityRepository = createPublishedContentRepositoryFromEnvironment();
  const queries = {
    featuredLives: settleHomeQuery(measureHomeQuery("featuredLives", () => liveRepository.listFeaturedPublished({ locale: toContentLocale(locale), now: new Date() }))),
    celebrities: settleHomeQuery(measureHomeQuery("celebrities", () => celebrityRepository.list(toContentLocale(locale)))),
    celebrityLives: settleHomeQuery(measureHomeQuery("celebrityLives", () => celebrityRepository.listPrimaryLives(toContentLocale(locale)))),
    homeBanners: settleHomeQuery(measureHomeQuery("homeBanners", () => createHomeBannerRepository({ url: environment.SUPABASE_URL, serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY }).list(toContentLocale(locale)))),
    elinaRaffles: settleHomeQuery(measureHomeQuery("elinaRaffles", () => createRaffleDependencies().list({ celebritySlug: "elina", locale: toContentLocale(locale), now: new Date() }))),
  };
  const publishedCreatorSlugs = queries.celebrities.then(result => result.status === "fulfilled" ? result.value.map(({ slug }) => slug) : null);
  return <>
    <script
      id="byus-home-structured-data"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeStructuredData(homeStructuredData()) }}
    />
    <StreamingGuestHome
      queries={queries}
      publishedCreatorSlugs={publishedCreatorSlugs}
      locale={locale}
      initialOwnedOnly={initialOwnedOnly}
      initialRole={initialOwnedOnly ? "all" : parseCreatorRoleFilter(role)}
    />
  </>;
}
