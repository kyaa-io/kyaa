import { needsCreatorChoice, ReadingCreatorPicker } from "@/features/chemi/ui/reading-creator-picker";
import { FanAction } from "@/components/fan-ui/fan-action";
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
import { TarotShared } from "./tarot-shared";

export const dynamic = "force-dynamic";
export default async function TarotPage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string | string[]; c?: string; step?: string; r?: string; from?: string; card?: string; rev?: string; claim?: string }>;
}) {
  if (!chemiEnabled()) notFound();
  const params = await searchParams;
  const locale = parseAppLocale(params.locale);
  const catalog = (await import(`@/features/chemi/i18n/locales/${locale}/chemi.json`)).default;
  return (
    <FanAppFrame currentPath="/chemi" locale={locale} mainId="tarot-main">
      <ReadingCopyProvider value={catalog}>
        <FanContentContainer as="main" id="tarot-main">
          <div data-chemi-list-link=""><FanAction variant="text" href={`/chemi?locale=${locale}`}>← {catalog.readingUi.chemiList}</FanAction></div>
          {params.from || params.card ? (
            <TarotShared
              key={params.from ?? params.card}
              locale={locale}
              from={params.from}
              card={params.card && /^\d{1,2}$/.test(params.card) ? Number(params.card) : undefined}
              reversed={params.rev === "1"}
              character={isTarotCharacter(params.c) ? params.c : "changha"}
            />
          ) : needsCreatorChoice(params.c, params.step === "result" && isReadingId(params.r)) ? (
            <ReadingCreatorPicker content="tarot" locale={locale} />
          ) : (
            <TarotScreen
              locale={locale}
              initialCharacter={isTarotCharacter(params.c) ? params.c : "changha"}
              initialStep={isTarotStep(params.step) ? params.step : "enter"}
              initialReading={params.step === "result" && isReadingId(params.r) ? params.r : null}
              initialClaim={typeof params.claim === "string" && params.claim.length <= 80 ? params.claim : null}
            />
          )}
        </FanContentContainer>
      </ReadingCopyProvider>
    </FanAppFrame>
  );
}
