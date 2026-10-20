import type { Metadata } from "next";
import { parseAppLocale } from "@/i18n/locales";
import { publicLiveDashboardCopy } from "@/i18n/catalogs/features__public-live-dashboard";
import { publicMetadata } from "@/seo/metadata";
import { PublicLiveDashboard } from "@/features/public-live-dashboard/ui/public-live-dashboard";

type Props = { searchParams: Promise<{ locale?: string | string[] }> };
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const locale = parseAppLocale((await searchParams).locale);
  const copy = publicLiveDashboardCopy(locale);
  return publicMetadata({ path: "/pages/live-dashboard", locale, title: `${copy.heading} | kyaa`, description: copy.intro });
}
export default async function PublicLiveDashboardPage({ searchParams }: Props) {
  const locale = parseAppLocale((await searchParams).locale);
  return <PublicLiveDashboard locale={locale} />;
}
