import { FanAction } from "@/components/fan-ui/fan-action";
import { ReadingCopyProvider } from "@/features/chemi/i18n/reading-ui";
import { notFound } from "next/navigation";
import {
  FanAppFrame,
  FanContentContainer,
} from "@/components/fan-shell/fan-app-shell";
import { chemiEnabled } from "@/features/chemi/domain/availability";
import { parseFortuneStep } from "@/features/chemi/domain/step";
import { parseAppLocale } from "@/i18n/locales";
import { FortuneFlow } from "./flow";
import { FortuneResult } from "./result";

export const dynamic = "force-dynamic";
export default async function FortunePage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string; from?: string; step?: string; r?: string }>;
}) {
  if (!chemiEnabled()) notFound();
  const params = await searchParams;
  const locale = parseAppLocale(params.locale);
  // 결과 주소를 새로 열면 저장된 결과를 불러오는 동안 입장 화면이 아니라 불러오는 모양을 보인다.
  const restoring = Boolean(params.r) && parseFortuneStep(params.step) !== "enter";
  const catalog = (await import(`@/features/chemi/i18n/locales/${locale}/chemi.json`)).default;
  return (
    <FanAppFrame currentPath="/chemi" locale={locale} mainId="fortune-main">
      <ReadingCopyProvider value={catalog}>
        <FanContentContainer as="main" id="fortune-main">
          <div data-chemi-list-link=""><FanAction variant="text" href={`/chemi?locale=${locale}`}>← {catalog.readingUi.chemiList}</FanAction></div>
          {params.from ? (
            <FortuneResult key={params.from} locale={locale} from={params.from} />
          ) : (
            <FortuneFlow locale={locale} restoring={restoring} paidPreview />
          )}
        </FanContentContainer>
      </ReadingCopyProvider>
    </FanAppFrame>
  );
}
