import { jjinfanDetailHref } from "@/features/rankings/ui/jjinfan-featured";
import { rankingsText } from "@/features/rankings/ui/rankings-copy";
import type { AppLocale } from "@/i18n/locales";
import { PromoBanner } from "./promo-banner";

/**
 * The home's banner slot right under the ranking card (대표 2026-11-11, slot name `home-below-ranking`): today the 찐팬 100 challenge banner to its detail page,
 * and the place an advertisement goes later (swap the content, keep PromoBanner or the managed BannerSlotCard). The caller draws it only while the 찐팬 100 flag is on, so production shows no box and no space.
 */
export function HomeBelowRankingSlot({ locale }: { locale: AppLocale }) {
  return <PromoBanner slot="home-below-ranking" href={jjinfanDetailHref(locale)} title={rankingsText(locale, "jjTitle")} description={rankingsText(locale, "jjBannerDesc")} ctaLabel={rankingsText(locale, "jjBannerCta")} />;
}
