import { redirect } from "next/navigation";
import { parseAppLocale } from "@/i18n/locales";
import { historyKindSchema } from "@/features/my/domain/fan-history";
import { FanHistoryScreen } from "@/features/my/ui/fan-history-screen";
export default async function FanHistoryPage({ searchParams }: { searchParams: Promise<{ locale?: string; kind?: string }> }) {
  const params = await searchParams;
  // 받은 혜택은 선물 탭으로 옮겼다. 옛 주소는 선물 목록으로 보낸다.
  if (params.kind === "rewards") redirect(`/my/gifts?locale=${parseAppLocale(params.locale)}`);
  return <FanHistoryScreen locale={parseAppLocale(params.locale)} kind={historyKindSchema.catch("applications").parse(params.kind)} />;
}
