import { parseAppLocale } from "@/i18n/locales";
import { GiftDetailScreen } from "@/features/gifts/ui/gift-detail-screen";

export default async function MyGiftPage({ params, searchParams }: { params: Promise<{ rewardResultId: string }>; searchParams: Promise<{ locale?: string }> }) {
  const [{ rewardResultId }, { locale }] = await Promise.all([params, searchParams]);
  return <GiftDetailScreen locale={parseAppLocale(locale)} rewardResultId={rewardResultId} />;
}
