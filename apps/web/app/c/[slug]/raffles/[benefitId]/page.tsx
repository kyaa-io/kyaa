import { toContentLocale } from "@/i18n/locales";
import { parseAppLocale } from "@/i18n/locales";
import { notFound } from "next/navigation";
import { loadSeoCreator, loadSeoRaffles, loadSeoBenefit } from "@/server/seo/public-content";
import { publicMetadata } from "@/seo/metadata";
import { CreatorRafflesScreen } from "@/features/benefit/ui/creator-raffles-screen";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params, searchParams }: {
  params: Promise<{ slug: string; benefitId: string }>;
  searchParams: Promise<{ locale?: string }>;
}) {
  const [{ slug, benefitId }, query] = await Promise.all([params, searchParams]);
  const locale = toContentLocale(parseAppLocale(query.locale));
  const celebrity = await loadSeoCreator(slug, locale);
  if (!celebrity) notFound();
  const { raffles } = await loadSeoRaffles(slug, locale);
  const raffle = raffles.find((item) => item.benefitId === benefitId);
  if (!raffle) notFound();
  if (!await loadSeoBenefit(benefitId, locale)) notFound();
  const otherLocale = locale === "ko" ? "en" : "ko";
  const [translatedCreator, translatedRaffles, translatedBenefit] = await Promise.all([
    loadSeoCreator(slug, otherLocale), loadSeoRaffles(slug, otherLocale), loadSeoBenefit(benefitId, otherLocale),
  ]);
  const translated = translatedCreator && translatedBenefit && translatedRaffles.raffles.some((item) => item.benefitId === benefitId);
  return publicMetadata({ path: `/c/${slug}/raffles/${benefitId}`, locale,
    title: `${raffle.title} | ${celebrity.name} | kyaa`, description: raffle.summary,
    image: raffle.imageUrl ?? undefined, imageAlt: raffle.imageUrl ? raffle.title : undefined,
    locales: translated ? ["ko", "en"] : [locale] });
}

export default async function CreatorRaffleDetailPage({ params, searchParams }: {
  params: Promise<{ slug: string; benefitId: string }>;
  searchParams: Promise<{ locale?: string }>;
}) {
  const [{ slug, benefitId }, query] = await Promise.all([params, searchParams]);
  const locale = parseAppLocale(query.locale);
  const celebrity = await loadSeoCreator(slug, locale);
  if (!celebrity) notFound();
  const { raffles } = await loadSeoRaffles(slug, toContentLocale(locale));
  if (!raffles.some((raffle) => raffle.benefitId === benefitId)) notFound();
  const publicBenefit = await loadSeoBenefit(benefitId, toContentLocale(locale));
  if (!publicBenefit) notFound();
  return <CreatorRafflesScreen celebrity={celebrity} locale={locale} raffles={raffles} benefitId={benefitId} deliveryInstructions={publicBenefit.deliveryLabel} />;
}
