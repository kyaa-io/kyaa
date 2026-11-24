import { needsCreatorChoice, ReadingCreatorPicker } from "@/features/chemi/ui/reading-creator-picker";
import { FanAction } from "@/components/fan-ui/fan-action";
import { ReadingCopyProvider } from "@/features/chemi/i18n/reading-ui";
import { notFound } from "next/navigation";
import {
  FanAppFrame,
  FanContentContainer,
} from "@/components/fan-shell/fan-app-shell";
import { chemiEnabled } from "@/features/chemi/domain/availability";
import koCatalog from "@/features/chemi/i18n/locales/ko/chemi.json";
import { mergeMyBirthCopy } from "@/features/chemi/ui/frame/birth-copy";
import { parseAppLocale } from "@/i18n/locales";
import { SajuFlow } from "./flow";
import { SajuShared } from "./shared";

export const dynamic = "force-dynamic";
export default async function SajuPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; locale?: string; from?: string; step?: string; r?: string }>;
}) {
  if (!chemiEnabled()) notFound();
  const params = await searchParams;
  const locale = parseAppLocale(params.locale);
  // 결과 주소를 새로 열면 저장된 결과를 불러오는 동안 입장 화면이 아니라 불러오는 모양을 보인다.
  const catalog = (await import(`@/features/chemi/i18n/locales/${locale}/chemi.json`)).default;
  const birthCopy = mergeMyBirthCopy(koCatalog.myBirth, catalog.myBirth);
  const restoring = Boolean(params.r) && Boolean(params.step && params.step !== "enter");
  return (
    <FanAppFrame currentPath="/chemi" locale={locale} mainId="saju-main">
      <ReadingCopyProvider value={catalog}>
        <FanContentContainer as="main" id="saju-main">
          <div data-chemi-list-link=""><FanAction variant="text" href={`/chemi?locale=${locale}`}>← {catalog.readingUi.chemiList}</FanAction></div>
          {params.from ? (
            <SajuShared key={params.from} locale={locale} from={params.from} />
          ) : needsCreatorChoice(params.c, restoring) ? (
            <ReadingCreatorPicker content="saju" locale={locale} />
          ) : (
            <SajuFlow locale={locale} birthCopy={birthCopy} restoring={restoring} />
          )}
        </FanContentContainer>
      </ReadingCopyProvider>
    </FanAppFrame>
  );
}
