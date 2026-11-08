import { WaveAccessBoundary } from "@/features/fanpage/ui/wave-access-boundary";
import { WAVE_FANPAGE_SLUG } from "@/features/fanpage/domain/wave-programs";
import { readPublicCheerEvent } from "@/server/fanpage/public-cheer-event";
import { toContentLocale } from "@/i18n/locales";
import { parseAppLocale } from "@/i18n/locales";
import { VercelTelemetry } from "@/features/analytics/client/vercel-telemetry";
import { creatorHomeHref, isCreatorHandle } from "@/features/creator/domain/creator-navigation";
import { GROUP_COLLECTIONS_VISIBLE } from "@/features/groups/domain/collection-visibility";
import { SITE_URL, publicMetadata } from "@/seo/metadata";
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
import { JJINFAN_SHARE_VALUE, jjinfanShareImagePath } from "@/features/rankings/domain/jjinfan-share";
import { readJjinfanSeed, readSharedJjinfanChallenge } from "@/server/rankings/jjinfan-share";
import { JjinfanSeed } from "@/features/rankings/ui/jjinfan-seed";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ locale?: string; share?: string }> }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  if (!isCreatorHandle(slug)) notFound();
  const locale = toContentLocale(parseAppLocale(query.locale));
  const celebrity = await loadSeoCreator(slug, locale);
  if (!celebrity) notFound();
  const otherLocale = toContentLocale(locale) === "en" ? "ko" : "en";
  const translated = await loadSeoCreator(slug, otherLocale);
  const fallbackImage = slug === "changha" ? resolveCreatorHeroImage(slug, celebrity.image)?.src ?? celebrity.image.url : celebrity.image.url;
  const photo = resolvePhoto(celebrity.image.photos, "creator.hero.desktop", fallbackImage, locale);
  // A shared 찐팬 100 gauge link (C7) previews the live gauge while the challenge is on; otherwise, or if the read fails, the usual photo.
  const challenge = query.share === JJINFAN_SHARE_VALUE ? await readSharedJjinfanChallenge(slug).catch(() => null) : null;
  return publicMetadata({ path: creatorHomeHref(slug), locale, title: challenge ? `${challenge.campaign.title} · ${celebrity.name} | kyaa` : `${celebrity.name} | kyaa`, description: challenge?.campaign.description || celebrity.summary,
    image: challenge ? new URL(jjinfanShareImagePath(slug, challenge.count, parseAppLocale(query.locale)), SITE_URL).href : photo.src, imageAlt: challenge ? challenge.campaign.title : photo.alt ?? celebrity.image.alt,
    locales: translated ? ["ko", "en"] : [toContentLocale(locale)] });
}

export default async function CelebrityPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ locale?: string; tab?: string; month?: string; section?: string; source?: string; news?: string; media?: string; authIntent?: string }> }) {
  const { slug } = await params;
  if (!isCreatorHandle(slug)) notFound();
  const { locale: requestedLocale, tab: requestedTab, section: requestedSection, source: requestedSource, news: requestedNews, media: requestedMedia, month: requestedMonth, authIntent: requestedAuthIntent } = await searchParams;
  const locale = parseAppLocale(requestedLocale);
  const celebrity = await loadSeoCreator(slug, locale);
  if (!celebrity) notFound();
  if (requestedTab === "raffles" || requestedTab === "benefits") {
    const authIntent = sanitizeAuthIntentId(requestedAuthIntent);
    redirect(`${creatorRafflesHref(slug, locale)}${authIntent ? `&authIntent=${authIntent}` : ""}` as Route);
  }
  if (requestedTab === "collection" && !GROUP_COLLECTIONS_VISIBLE) redirect(`${creatorHomeHref(slug)}?locale=${locale}` as Route);
  // 261107-2 leaderboard-raffle-slop: with fan pages on the group layout, the old leaderboard tab has no place in the tab strip (팬·랭킹 is `members`).
  // An old link lands on that tab, which carries the 찐팬 100 gauge and the fan list, and shows as selected.
  if (requestedTab === "leaderboard" && process.env.KYAA_GROUPS_ENABLED === "true" && slug !== WAVE_FANPAGE_SLUG) redirect(`${creatorHomeHref(slug)}?tab=members&locale=${locale}` as Route);
  const initialTab: CelebrityFanTab = slug === WAVE_FANPAGE_SLUG && requestedTab === "friends" ? "friends" : parseFanPageTab(requestedTab);
  const initialBoardSection = resolveBoardSection(requestedTab, requestedSection);
  const initialBoardSource = resolveBoardSource(requestedTab, requestedSource);
  // The 찐팬 100 gauge's answer is read here too, so the card (or its absence) is in the first paint. A failed read leaves it to the client.
  const [primaryLives, initialCheerEvent, jjinfanSeed] = slug === WAVE_FANPAGE_SLUG ? [[], null, undefined] : await Promise.all([createPublishedContentRepositoryFromEnvironment().listPrimaryLives(toContentLocale(locale)), readPublicCheerEvent(slug, toContentLocale(locale)), readJjinfanSeed(slug)]);
  const upcomingLive = primaryLives.find((live) => live.celebritySlug === slug) ?? null;
  const content = <JjinfanSeed slug={slug} value={jjinfanSeed}><CelebrityFanPage groupsEnabled={process.env.KYAA_GROUPS_ENABLED === "true"} celebrity={celebrity} locale={locale} upcomingLive={upcomingLive} initialCheerEvent={initialCheerEvent} initialTab={initialTab} calendarMonth={requestedMonth} initialBoardSection={initialBoardSection} initialBoardSource={initialBoardSource} initialNewsFilter={requestedNews === "artist_post" || requestedNews === "notice" || requestedNews === "chzzk" ? requestedNews : "all"} initialMediaFilter={requestedMedia === "photos" || requestedMedia === "videos" || requestedMedia === "replays" ? requestedMedia : undefined} instagramEnabled={process.env.INSTAGRAM_INTEGRATION_ENABLED === "true"} />{process.env.VERCEL_ENV === "production" && <VercelTelemetry publicCreatorSlug={slug} />}</JjinfanSeed>;
  return slug === WAVE_FANPAGE_SLUG ? <WaveAccessBoundary locale={locale}>{content}</WaveAccessBoundary> : content;
}
