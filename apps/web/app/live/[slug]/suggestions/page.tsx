import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { parseAppLocale } from "@/i18n/locales";
import { loadSeoLive } from "@/server/seo/public-content";
import { ParticipationPage } from "@/features/schedules/ui/participation-ui";
import { FanAction } from "@/components/fan-ui/fan-action";
import { participationCopy } from "@/i18n/catalogs/features__schedules__ui__participation";
import { liveSuggestionsCopy } from "@/i18n/catalogs/features__live-submissions__ui";
import { LiveFanSubmissions } from "@/features/live-submissions/ui/live-fan-submissions";
import { LivePlatformMark } from "@/features/live-submissions/ui/live-platform-mark";
export const dynamic = "force-dynamic";
export default async function Page({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ locale?: string }> }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const locale = parseAppLocale(query.locale), data = await loadSeoLive(slug, locale);
  if (!data) notFound();
  return <ParticipationPage locale={locale} title={liveSuggestionsCopy(locale).heading} path={`/live/${slug}/suggestions`} backAction={<FanAction variant="text" href={`/live/${slug}?locale=${locale}`} leadingIcon={<ArrowLeft />}>{participationCopy(locale).back}</FanAction>}>
    <h2>{data.live.title}</h2><p>{data.live.celebrity.name} · <LivePlatformMark provider={data.live.watch.provider} label /></p>
    <LiveFanSubmissions browseFirst slug={slug} celebritySlug={data.live.celebrity.slug} locale={locale} />
  </ParticipationPage>;
}
