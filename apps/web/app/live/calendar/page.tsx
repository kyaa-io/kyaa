import { toContentLocale } from "@/i18n/locales";
import { parseAppLocale } from "@/i18n/locales";
import { LiveCalendarScreen } from "@/features/live/ui/live-calendar-screen";
import { resolveLiveCalendarMonth } from "@/features/live/domain/live-calendar";
import { loadServerEnv } from "@/server/config/env";
import { createPublishedContentRepositoryFromEnvironment } from "@/server/content/published-content-repository";
import { createLiveCalendarRepositoryFromEnvironment } from "@/server/g3/live-calendar-repository";
import { createLiveEventRepositoryFromEnvironment } from "@/server/g3/live-event-repository";

export const dynamic = "force-dynamic";

function currentKstMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { calendar: "gregory",
    year: "numeric",
    month: "2-digit",
    timeZone: "Asia/Seoul",
  }).formatToParts(now);
  const year = parts.find(({ type }) => type === "year")?.value;
  const month = parts.find(({ type }) => type === "month")?.value;
  return `${year}-${month}`;
}

export default async function LiveCalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const requested = await searchParams;
  const locale = parseAppLocale(requested.locale);
  const month = resolveLiveCalendarMonth(requested.month, currentKstMonth());
  const environment = loadServerEnv();
  const repositoryConfig = {
    url: environment.SUPABASE_URL,
    serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY,
  };
  const repository = createLiveCalendarRepositoryFromEnvironment(repositoryConfig);
  const contentRepository = createPublishedContentRepositoryFromEnvironment();
  const liveRepository = createLiveEventRepositoryFromEnvironment(repositoryConfig);
  const now = new Date();
  // A failed unlisted read leaves only the filter chips empty (null: nothing counts as listed); the calendar itself still renders.
  const [calendar, publishedCelebrities, unlisted] = await Promise.all([
    repository.readMonth({ month, locale: toContentLocale(locale), appUserId: null, listedOnly: true, now }),
    contentRepository.list(toContentLocale(locale)),
    contentRepository.listUnlistedSlugs().catch(() => null),
  ]);
  const allCelebrities = publishedCelebrities.map((celebrity) => ({
    slug: celebrity.slug,
    name: celebrity.name,
    image: celebrity.image.url, photos: celebrity.image.photos, imagePosition: celebrity.image.position,
  }));
  const availableSlugs = new Set(allCelebrities.map((celebrity) => celebrity.slug));
  const requestedCelebritySlugs = (Array.isArray(requested.celebrity)
    ? requested.celebrity
    : requested.celebrity ? [requested.celebrity] : [])
    .filter((slug, index, values) => availableSlugs.has(slug) && values.indexOf(slug) === index);
  const eventSlugs = [...new Set(calendar.days.flatMap((day) => day.events.map((event) => event.slug)))];
  const liveResponses = await Promise.all(eventSlugs.map((slug) =>
    liveRepository.findPublishedBySlug({ slug, locale: toContentLocale(locale), appUserId: null, now }),
  ));
  const eventMetadata = liveResponses
    .filter((response) => response !== null)
    .map(({ live }) => ({
      eventSlug: live.slug,
      celebritySlug: live.celebrity.slug,
      platforms: [live.watch.provider],
    }));
  // Sent to the client: listed creators (the chips), plus a creator the link selected or this month's events name, filtered here so
  // the page data carries no other unlisted creator. Only those extra unlisted ones are passed as unlistedSlugs, to keep them off the chips.
  const listed = (slug: string) => unlisted !== null && !unlisted.has(slug);
  const needed = new Set([...requestedCelebritySlugs, ...eventMetadata.map((event) => event.celebritySlug)]);
  const celebrities = allCelebrities.filter((celebrity) => listed(celebrity.slug) || needed.has(celebrity.slug));
  const offChips = celebrities.filter((celebrity) => !listed(celebrity.slug)).map((celebrity) => celebrity.slug);

  return <LiveCalendarScreen
    initialCalendar={calendar}
    locale={locale}
    celebrities={celebrities}
    unlistedSlugs={offChips}
    eventMetadata={eventMetadata}
    initialCelebritySlugs={requestedCelebritySlugs}
  />;
}
