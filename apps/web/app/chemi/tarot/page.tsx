import { ReadingCopyProvider } from "@/features/chemi/i18n/reading-ui";
import { notFound } from "next/navigation";
import {
  FanAppFrame,
  FanContentContainer,
} from "@/components/fan-shell/fan-app-shell";
import { chemiEnabled } from "@/features/chemi/domain/availability";
import { isTarotCharacter } from "@/features/chemi/tarot/script";
import { parseAppLocale } from "@/i18n/locales";
import { isReadingId, isTarotStep } from "./types";
import { TarotScreen } from "./tarot-screen";

export const dynamic = "force-dynamic";
export default async function TarotPage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string | string[]; c?: string; step?: string; r?: string }>;
}) {
  if (!chemiEnabled()) notFound();
  const params = await searchParams;
  const locale = parseAppLocale(params.locale);
  const catalog = (await import(`@/features/chemi/i18n/locales/${locale}/chemi.json`)).default;
  return (
    <FanAppFrame currentPath="/chemi" locale={locale} mainId="tarot-main">
      <ReadingCopyProvider value={{ home: catalog.home, sajuScene: catalog.sajuScene, readingUi: catalog.readingUi }}>
      <FanContentContainer as="main" id="tarot-main">
        <TarotScreen
          locale={locale}
          initialCharacter={isTarotCharacter(params.c) ? params.c : "changha"}
          initialStep={isTarotStep(params.step) ? params.step : "enter"}
          initialReading={params.step === "result" && isReadingId(params.r) ? params.r : null}
        />
      </FanContentContainer>
      </ReadingCopyProvider>
    </FanAppFrame>
  );
}
