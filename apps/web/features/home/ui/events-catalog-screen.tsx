"use client";

import { useState, type ReactNode } from "react";
import Link from "../../../components/fan-ui/hover-prefetch-link";
import type { Route } from "next";
import { getImageProps } from "next/image";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { FanAppFrame, FanContentContainer } from "@/components/fan-shell/fan-app-shell";
import { FanSectionHeader } from "@/components/fan-ui/fan-heading";
import { MediaBackdrop, mediaFillClass } from "@/components/fan-ui/media-fill";
import { bypassImageOptimization } from "@/components/fan-ui/public-image-policy";
import { ElinaGuideCard } from "@/components/home-entry-cards/home-entry-cards";
import type { RaffleList } from "@/features/benefit/domain/raffle";
import type { AppLocale } from "@/i18n/locales";
import type { PublishedCelebrity } from "@/server/content/content-domain";
import { localizedBannerHref, type HomeBanner } from "../domain/home-banner";
import { eventsCatalogCopy } from "./events-catalog-copy";
import { FanAction } from "@/components/fan-ui/fan-action";
import styles from "./events-catalog-screen.module.css";

type EventsCatalogProps = {
  locale: AppLocale;
  homeBanners: readonly HomeBanner[];
  elina?: PublishedCelebrity;
  elinaRaffles: RaffleList["raffles"];
  showElinaCampaign: boolean;
  donationVote?: { title: string; description: string; action: string };
  contentUnavailable?: boolean;
  pagination?: ReactNode;
};

function EventArtwork({ banner, priority }: { banner: HomeBanner; priority: boolean }) {
  const [failed, setFailed] = useState(false);
  const mobile = banner.mobileImage ?? banner.desktopImage;
  const imageProps = (image: typeof mobile) => getImageProps({
    src: image.url, alt: banner.alt, width: image.width, height: image.height,
    unoptimized: bypassImageOptimization(image.url),
    sizes: "(max-width: 767px) 96px, 180px",
  }).props;
  const desktopProps = imageProps(banner.desktopImage);
  const mobileProps = imageProps(mobile);
  const creatorWelcome = banner.kind === "announcement" && banner.celebrityId !== null && banner.desktopImage.width === banner.desktopImage.height;
  if (failed) return <span className={styles.artwork} aria-hidden="true" />;
  const campaign = banner.id === "8bf2f180-cb32-4f00-93e2-e84b570ad450";
  return <span className={`${styles.artwork} ${mediaFillClass}`} data-campaign={campaign || undefined}>
    {campaign ? null : <MediaBackdrop src={mobileProps.src} />}
    <picture>
    {!creatorWelcome || !banner.mobileImage ? <source media="(min-width: 768px)" srcSet={desktopProps.srcSet ?? desktopProps.src} sizes={desktopProps.sizes} /> : null}
    {/* getImageProps preserves Next's image policy and the original artwork ratio. */}
    <img {...mobileProps} alt={banner.alt} loading={priority ? "eager" : "lazy"} onError={() => setFailed(true)} />
    </picture>
  </span>;
}

// 배너 카드와 기부 투표 카드가 같은 모양을 쓴다. 그림이 없으면 글 한 칸으로 넓힌다.
function EventCard({ href, title, description, action, artwork }: { href: string; title: string; description?: string | null; action: string; artwork?: ReactNode }) {
  return <li className={styles.item}>
    <Link className={styles.card} data-text-only={artwork ? undefined : ""} href={href as Route}>
      <div className={styles.copy}>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
        <span className={styles.action}>{action}<ArrowRight aria-hidden="true" /></span>
      </div>
      {artwork}
    </Link>
  </li>;
}

export function EventsCatalogScreen({ locale, homeBanners, elina, elinaRaffles, showElinaCampaign, donationVote, contentUnavailable = false, pagination }: EventsCatalogProps) {
  const t = eventsCatalogCopy(locale);
  const router = useRouter();
  const elinaCard = showElinaCampaign ? <li key="elina-guide" className={styles.campaign}><ElinaGuideCard locale={locale} elina={elina} raffles={elinaRaffles} variant="catalog" /></li> : null;
  return <FanAppFrame locale={locale} mainId="events-content" currentPath="/events">
    <FanContentContainer as="main" id="events-content" className={styles.main}>
      <FanSectionHeader as="h1" title={t.title} />
      {contentUnavailable ? <div className={styles.state} role="alert"><p>{t.error}</p><FanAction onClick={() => router.refresh()}>{t.retry}</FanAction></div> : null}
      {homeBanners.length || showElinaCampaign || donationVote ? <ul className={styles.list}>
        {donationVote ? <EventCard key="donation-vote" href={`/events/donation-vote?locale=${locale}`} title={donationVote.title} description={donationVote.description} action={donationVote.action} /> : null}
        {homeBanners.map((banner, index) => <EventCard key={banner.id} href={localizedBannerHref(banner.href, locale)} title={banner.title} description={banner.description} action={banner.ctaLabel}
          artwork={<EventArtwork key={`${banner.desktopImage.id}:${banner.mobileImage?.id ?? ""}`} banner={banner} priority={index === 0} />} />)}
        {elinaCard}
      </ul> : !contentUnavailable ? <p className={styles.state}>{t.empty}</p> : null}
      {pagination}
    </FanContentContainer>
  </FanAppFrame>;
}
