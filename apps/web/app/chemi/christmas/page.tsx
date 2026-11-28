import { christmasAvailable } from "@/features/chemi/domain/christmas-season";
import { notFound } from "next/navigation";
import { FanAppFrame, FanContentContainer } from "@/components/fan-shell/fan-app-shell";
import { chemiEnabled, chemiPreview } from "@/features/chemi/domain/availability";
import { ReadingCopyProvider } from "@/features/chemi/i18n/reading-ui";
import { parseAppLocale } from "@/i18n/locales";
import { ChristmasEntry } from "./entry";

export const dynamic = "force-dynamic";

export default async function ChristmasPage({ searchParams }: {
  searchParams: Promise<{ locale?: string }>;
}) {
  if (!chemiEnabled() || !christmasAvailable(chemiPreview())) notFound();
  const locale = parseAppLocale((await searchParams).locale);
  const catalog = (await import(`@/features/chemi/i18n/locales/${locale}/chemi.json`)).default;
  return <FanAppFrame currentPath="/chemi" locale={locale} mainId="christmas-main">
    <FanContentContainer as="main" id="christmas-main">
      <ReadingCopyProvider value={catalog}><ChristmasEntry catalog={catalog} locale={locale} /></ReadingCopyProvider>
    </FanContentContainer>
  </FanAppFrame>;
}
