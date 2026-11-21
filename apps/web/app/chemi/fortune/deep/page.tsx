import { notFound } from "next/navigation";
import { FanAppFrame, FanContentContainer } from "@/components/fan-shell/fan-app-shell";
import { chemiEnabled, chemiPreview } from "@/features/chemi/domain/availability";
import { ReadingCopyProvider } from "@/features/chemi/i18n/reading-ui";
import { parseAppLocale } from "@/i18n/locales";
import { fortuneCharacters } from "../lines";
import { FortuneDeep } from "./screen";

export const dynamic = "force-dynamic";

const readingId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 운세 더 깊이: 내일(view=tomorrow)과 이번 주(view=week, 오늘부터 7일). 둘 다 무료. */
export default async function FortuneDeepPage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string; view?: string; c?: string; r?: string }>;
}) {
  if (!chemiEnabled()) notFound();
  const params = await searchParams;
  const locale = parseAppLocale(params.locale);
  const character = fortuneCharacters.find((item) => item.id === params.c)?.id ?? "changha";
  const catalog = (await import(`@/features/chemi/i18n/locales/${locale}/chemi.json`)).default;
  return (
    <FanAppFrame currentPath="/chemi" locale={locale} mainId="fortune-deep-main">
      <ReadingCopyProvider value={catalog}>
        <FanContentContainer as="main" id="fortune-deep-main">
          <FortuneDeep
            view={params.view === "week" ? "week" : "tomorrow"}
            character={character}
            locale={locale}
            readingId={params.r && readingId.test(params.r) ? params.r : undefined}
            paidPreview={chemiPreview()}
          />
        </FanContentContainer>
      </ReadingCopyProvider>
    </FanAppFrame>
  );
}
