import { parseAppLocale } from "@/i18n/locales";
import { GiftsScreen } from "@/features/gifts/ui/gifts-screen";

export default async function MyGiftsPage({ searchParams }: { searchParams: Promise<{ locale?: string }> }) {
  const locale = parseAppLocale((await searchParams).locale);
  return <GiftsScreen locale={locale} />;
}
