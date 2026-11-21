import { notFound } from "next/navigation";
import { FanAppFrame, FanContentContainer } from "@/components/fan-shell/fan-app-shell";
import { chemiEnabled } from "@/features/chemi/domain/availability";
import { ReadingCopyProvider } from "@/features/chemi/i18n/reading-ui";
import { parseAppLocale } from "@/i18n/locales";
import { fortuneCharacters } from "../lines";
import { FortuneCard } from "./screen";

export const dynamic = "force-dynamic";

const readingId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 오늘의 기념 카드·응원 부적 상세(저장·자랑하기). */
export default async function FortuneCardPage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string; c?: string; r?: string }>;
}) {
  if (!chemiEnabled()) notFound();
  const params = await searchParams;
  const locale = parseAppLocale(params.locale);
  const character = fortuneCharacters.find((item) => item.id === params.c)?.id ?? "changha";
  const catalog = (await import(`@/features/chemi/i18n/locales/${locale}/chemi.json`)).default;
  return (
    <FanAppFrame currentPath="/chemi" locale={locale} mainId="fortune-card-main">
      <ReadingCopyProvider value={catalog}>
        <FanContentContainer as="main" id="fortune-card-main">
          <FortuneCard
            character={character}
            locale={locale}
            readingId={params.r && readingId.test(params.r) ? params.r : undefined}
          />
        </FanContentContainer>
      </ReadingCopyProvider>
    </FanAppFrame>
  );
}
