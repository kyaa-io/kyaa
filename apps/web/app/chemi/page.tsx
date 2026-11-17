import { notFound } from "next/navigation";
import { FanAppFrame, FanContentContainer } from "@/components/fan-shell/fan-app-shell";
import { chemiEnabled } from "@/features/chemi/domain/availability";
import { parseAppLocale } from "@/i18n/locales";

export const dynamic = "force-dynamic";
export default async function ChemiPage({ searchParams }: { searchParams: Promise<{ locale?: string | string[] }> }) {
  if (!chemiEnabled()) notFound();
  const locale = parseAppLocale((await searchParams).locale);
  return <FanAppFrame locale={locale} currentPath="/chemi" mainId="chemi-main">
    <FanContentContainer as="main" id="chemi-main" tabIndex={-1} data-chemi-tab="">{null}</FanContentContainer>
  </FanAppFrame>;
}
