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
  return (
    <FanAppFrame currentPath="/chemi" locale={locale} mainId="tarot-main">
      <FanContentContainer as="main" id="tarot-main">
        <TarotScreen
          locale={locale}
          initialCharacter={isTarotCharacter(params.c) ? params.c : "changha"}
          initialStep={isTarotStep(params.step) ? params.step : "enter"}
          initialReading={params.step === "result" && isReadingId(params.r) ? params.r : null}
        />
      </FanContentContainer>
    </FanAppFrame>
  );
}
