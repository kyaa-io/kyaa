import { notFound } from "next/navigation";
import { FanAppFrame, FanContentContainer } from "@/components/fan-shell/fan-app-shell";
import { chemiEnabled } from "@/features/chemi/domain/availability";
import { ReadingCopyProvider } from "@/features/chemi/i18n/reading-ui";
import { ReadingCreatorPicker } from "@/features/chemi/ui/reading-creator-picker";
import { parseAppLocale } from "@/i18n/locales";
import { TarotSpread } from "./screen";

export const dynamic = "force-dynamic";

/** 타로 세 장(과거·현재·미래). 계정마다 첫 1번 무료. */
export default async function TarotSpreadPage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string | string[]; c?: string }>;
}) {
  if (!chemiEnabled()) notFound();
  const params = await searchParams;
  const locale = parseAppLocale(params.locale);
  const catalog = (await import(`@/features/chemi/i18n/locales/${locale}/chemi.json`)).default;
  return (
    <FanAppFrame currentPath="/chemi" locale={locale} mainId="tarot-spread-main">
      <ReadingCopyProvider value={catalog}>
        <FanContentContainer as="main" id="tarot-spread-main">
          {params.c === "changha" || params.c === "elina" || params.c === "yuna" ? (
            <TarotSpread locale={locale} character={params.c} />
          ) : (
            <ReadingCreatorPicker content="tarot/spread" locale={locale} />
          )}
        </FanContentContainer>
      </ReadingCopyProvider>
    </FanAppFrame>
  );
}
