import { EventsCatalogScreen } from "@/features/home/ui/events-catalog-screen";
import { eventsCatalogCopy } from "@/features/home/ui/events-catalog-copy";
import { parseAppLocale, toContentLocale } from "@/i18n/locales";
import { pageCopy, contentPageMetadata } from "@/seo/metadata";
import { loadServerEnv } from "@/server/config/env";
import { createHomeBannerRepository } from "@/server/content/home-banner-repository";
import { createPublishedContentRepositoryFromEnvironment } from "@/server/content/published-content-repository";
import { createRaffleDependencies } from "@/server/raffle/raffle-dependencies";
import { withoutGuideBanners } from "@/features/home/domain/home-banner";
import { EVENTS_PAGE_SIZE, EventsPagination } from "@/features/home/ui/events-pagination";
import { voteCopy } from "./donation-vote/copy";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ locale?: string | string[]; page?: string | string[] }> };

export async function generateMetadata({ searchParams }: PageProps) {
  const locale = parseAppLocale((await searchParams).locale);
  const copy = eventsCatalogCopy(locale);
  return contentPageMetadata({ path: "/events", locale, title: `${copy.title} | kyaa`, description: pageCopy.home[locale].description });
}

export default async function EventsPage({ searchParams }: PageProps) {
  const { locale: requestedLocale, page: pageQuery } = await searchParams;
  const locale = parseAppLocale(requestedLocale);
  const contentLocale = toContentLocale(locale);
  const environment = loadServerEnv();
  const [banners, celebrities, raffles] = await Promise.allSettled([
    createHomeBannerRepository({ url: environment.SUPABASE_URL, serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY }).list(contentLocale),
    createPublishedContentRepositoryFromEnvironment().list(contentLocale),
    createRaffleDependencies().list({ celebritySlug: "elina", locale: contentLocale, now: new Date() }),
  ]);
  const allBanners = banners.status === "fulfilled" ? withoutGuideBanners(banners.value) : [];
  const hasElinaCampaign = raffles.status === "fulfilled";
  const pageCount = Math.max(1, Math.ceil((allBanners.length + Number(hasElinaCampaign)) / EVENTS_PAGE_SIZE));
  const requestedPage = typeof pageQuery === "string" && /^[1-9]\d*$/.test(pageQuery) && Number.isSafeInteger(Number(pageQuery)) ? Number(pageQuery) : 1;
  const page = Math.min(requestedPage, pageCount);
  const start = (page - 1) * EVENTS_PAGE_SIZE;
  const end = start + EVENTS_PAGE_SIZE;
  const [voteTitle, , voteAction, , voteDescription] = voteCopy[locale];
  return <EventsCatalogScreen
    locale={locale}
    homeBanners={allBanners.slice(start, end)}
    elina={celebrities.status === "fulfilled" && raffles.status === "fulfilled" ? celebrities.value.find(celebrity => celebrity.slug === "elina") : undefined}
    elinaRaffles={raffles.status === "fulfilled" ? raffles.value.raffles : []}
    showElinaCampaign={hasElinaCampaign && allBanners.length >= start && allBanners.length < end}
    donationVote={process.env.DONATION_VOTE_ENABLED === "true" && page === 1 ? { title: voteTitle, description: voteDescription, action: voteAction } : undefined}
    contentUnavailable={[banners, celebrities, raffles].some(result => result.status === "rejected")}
    pagination={<EventsPagination locale={locale} page={page} pageCount={pageCount} />}
  />;
}
