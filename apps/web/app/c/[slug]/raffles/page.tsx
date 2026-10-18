import { toContentLocale } from "@/i18n/locales";
import { parseAppLocale } from "@/i18n/locales";
import { notFound } from "next/navigation";
import { loadSeoCreator, loadSeoRaffles } from "@/server/seo/public-content";
import { publicMetadata } from "@/seo/metadata";
import { CreatorRafflesScreen } from "@/features/benefit/ui/creator-raffles-screen";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ locale?: string }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const locale = toContentLocale(parseAppLocale(query.locale));
  const celebrity = await loadSeoCreator(slug, locale);
  if (!celebrity) notFound();
  const translated = await loadSeoCreator(slug, locale === "ko" ? "en" : "ko");
  return publicMetadata({ path: `/c/${slug}/raffles`, locale,
    title: `${celebrity.name}${locale === "ko" ? "의 선물" : " Gifts"} | kyaa`, description: celebrity.summary,
    locales: translated ? ["ko", "en"] : [locale] });
}

export default async function CreatorRafflesPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ locale?: string }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const locale = parseAppLocale(query.locale);
  const celebrity = await loadSeoCreator(slug, locale);
  if (!celebrity) notFound();
  const { raffles } = await loadSeoRaffles(slug, toContentLocale(locale));
  return <CreatorRafflesScreen celebrity={celebrity} locale={locale} raffles={raffles} />;
}
