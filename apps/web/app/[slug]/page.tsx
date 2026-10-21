import { WaveAccessBoundary } from "@/features/fanpage/ui/wave-access-boundary";
import { WAVE_FANPAGE_SLUG } from "@/features/fanpage/domain/wave-programs";
import { readPublicCheerEvent } from "@/server/fanpage/public-cheer-event";
import { toContentLocale } from "@/i18n/locales";
import { parseAppLocale } from "@/i18n/locales";
import { VercelTelemetry } from "@/features/analytics/client/vercel-telemetry";
import { creatorHomeHref, isCreatorHandle } from "@/features/creator/domain/creator-navigation";
import { publicMetadata } from "@/seo/metadata";
import { loadSeoCreator } from "@/server/seo/public-content";
import { resolvePhoto } from "@/features/media/domain/public-image";
import { resolveCreatorHeroImage } from "@/components/fan-ui/creator-image-config";
import { creatorRafflesHref } from "@/features/benefit/domain/raffle-navigation";
import { sanitizeAuthIntentId } from "@/components/login-intent";
import { notFound, redirect } from "next/navigation";
import type { Route } from "next";
import { CelebrityFanPage, type CelebrityFanTab } from "@/components/celebrity-fan-page";
import { createPublishedContentRepositoryFromEnvironment } from "@/server/content/published-content-repository";
import { parseFanPageTab, resolveBoardSection, resolveBoardSource } from "@/features/fanpage/domain/board-navigation";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ locale?: string }> }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  if (!isCreatorHandle(slug)) notFound();
  const locale = toContentLocale(parseAppLocale(query.locale));
  const celebrity = await loadSeoCreator(slug, locale);
  if (!celebrity) notFound();
  const otherLocale = toContentLocale(locale) === "en" ? "ko" : "en";
  const translated = await loadSeoCreator(slug, otherLocale);
  const fallbackImage = slug === "changha" ? resolveCreatorHeroImage(slug, celebrity.image)?.src ?? celebrity.image.url : celebrity.image.url;
  const photo = resolvePhoto(celebrity.image.photos, "creator.hero.desktop", fallbackImage, locale);
  return publicMetadata({ path: creatorHomeHref(slug), locale, title: `${celebrity.name} | kyaa`, description: celebrity.summary,
    image: photo.src, imageAlt: photo.alt ?? celebrity.image.alt,
    locales: translated ? ["ko", "en"] : [toContentLocale(locale)] });
}

export default async function CelebrityPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ locale?: string; tab?: string; section?: string; source?: string; news?: string; media?: string; authIntent?: string }> }) {
  const { slug } = await params;
  if (!isCreatorHandle(slug)) notFound();
  const { locale: requestedLocale, tab: requestedTab, section: requestedSection, source: requestedSource, news: requestedNews, media: requestedMedia, authIntent: requestedAuthIntent } = await searchParams;
  const locale = parseAppLocale(requestedLocale);
  const celebrity = await loadSeoCreator(slug, locale);
  if (!celebrity) notFound();
  if (requestedTab === "raffles" || requestedTab === "benefits") {
    const authIntent = sanitizeAuthIntentId(requestedAuthIntent);
    redirect(`${creatorRafflesHref(slug, locale)}${authIntent ? `&authIntent=${authIntent}` : ""}` as Route);
  }
  const initialTab: CelebrityFanTab = slug === WAVE_FANPAGE_SLUG && requestedTab === "friends" ? "friends" : parseFanPageTab(requestedTab);
  const initialBoardSection = resolveBoardSection(requestedTab, requestedSection);
  const initialBoardSource = resolveBoardSource(requestedTab, requestedSource);
  const [primaryLives, initialCheerEvent] = slug === WAVE_FANPAGE_SLUG ? [[], null] : await Promise.all([createPublishedContentRepositoryFromEnvironment().listPrimaryLives(toContentLocale(locale)), readPublicCheerEvent(slug, toContentLocale(locale))]);
  const upcomingLive = primaryLives.find((live) => live.celebritySlug === slug) ?? null;
  const content = <><CelebrityFanPage celebrity={celebrity} locale={locale} upcomingLive={upcomingLive} initialCheerEvent={initialCheerEvent} initialTab={initialTab} initialBoardSection={initialBoardSection} initialBoardSource={initialBoardSource} initialNewsFilter={requestedNews === "artist_post" || requestedNews === "notice" || requestedNews === "chzzk" ? requestedNews : "all"} initialMediaFilter={requestedMedia === "photos" || requestedMedia === "videos" || requestedMedia === "replays" ? requestedMedia : undefined} instagramEnabled={process.env.INSTAGRAM_INTEGRATION_ENABLED === "true"} />{process.env.VERCEL_ENV === "production" && <VercelTelemetry publicCreatorSlug={slug} />}</>;
  return slug === WAVE_FANPAGE_SLUG ? <WaveAccessBoundary locale={locale}>{content}</WaveAccessBoundary> : content;
}
