import { parseAppLocale, toContentLocale } from "@/i18n/locales";
import { fandomCopy } from "@/i18n/catalogs/features__fandom";
import { FandomScreen } from "@/features/fandom/ui/fandom-screen";
import { createPublishedContentRepositoryFromEnvironment } from "@/server/content/published-content-repository";
import { createLiveEventRepositoryFromEnvironment } from "@/server/g3/live-event-repository";
import { loadServerEnv } from "@/server/config/env";
import { publicMetadata } from "@/seo/metadata";
import type { LiveEventResponse } from "@/features/live/domain/live-event";
export const dynamic = "force-dynamic";
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
export async function generateMetadata({ searchParams }: Props) {
  const locale = parseAppLocale((await searchParams).locale);
  return publicMetadata({ path: "/fandom", locale, title: `${fandomCopy(locale).title} | kyaa`, description: fandomCopy(locale).guest });
}
export default async function FandomPage({ searchParams }: Props) {
  const query = await searchParams, locale = parseAppLocale(query.locale), environment = loadServerEnv();
  const repository = createLiveEventRepositoryFromEnvironment({ url: environment.SUPABASE_URL, serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY });
  const contentLocale = toContentLocale(locale), now = new Date();
  const initialCreator = typeof query.creator === "string" ? query.creator : undefined;
  const initialLive = typeof query.live === "string" ? query.live : undefined;
  const [creators, catalog, requested] = await Promise.allSettled([
    createPublishedContentRepositoryFromEnvironment().list(contentLocale),
    repository.listPublishedCatalog({ locale: contentLocale, appUserId: null, now }),
    initialLive ? repository.findPublishedBySlug({ slug: initialLive, locale: contentLocale, appUserId: null, now }) : Promise.resolve(null),
  ]);
  const lives: LiveEventResponse[] = catalog.status === "fulfilled" ? [...catalog.value.liveNow, ...catalog.value.upcoming, ...catalog.value.replay] : [];
  if (requested.status === "fulfilled" && requested.value && !lives.some(item => item.live.id === requested.value?.live.id)) lives.push(requested.value);
  return <FandomScreen locale={locale} creators={creators.status === "fulfilled" ? creators.value : []} lives={lives} initialCreator={initialCreator} initialLive={initialLive} initialPhase={query.phase === "before" || query.phase === "during" || query.phase === "after" ? query.phase : undefined} contentError={creators.status === "rejected" || catalog.status === "rejected"} />;
}
