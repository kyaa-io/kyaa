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
  searchParams: Promise<{ locale?: string; from?: string; step?: string; r?: string }>;
}) {
  if (!chemiEnabled()) notFound();
  const params = await searchParams;
  const locale = parseAppLocale(params.locale);
  // 결과 주소를 새로 열면 저장된 결과를 불러오는 동안 입장 화면이 아니라 불러오는 모양을 보인다.
  const catalog = (await import(`@/features/chemi/i18n/locales/${locale}/chemi.json`)).default;
  const birthCopy = mergeMyBirthCopy(koCatalog.myBirth, catalog.myBirth);
  const restoring = Boolean(params.r) && params.step === "result";
  return (
    <FanAppFrame currentPath="/chemi" locale={locale} mainId="saju-main">
      <ReadingCopyProvider value={{ home: catalog.home, sajuScene: catalog.sajuScene, readingUi: catalog.readingUi }}>
      <FanContentContainer as="main" id="saju-main">
        {params.from ? (
          <SajuShared key={params.from} locale={locale} from={params.from} />
        ) : (
          <SajuFlow locale={locale} sceneCopy={{ ...catalog.sajuScene, title: catalog.home.saju || koCatalog.home.saju }} birthCopy={birthCopy} restoring={restoring} />
        )}
      </FanContentContainer>
      </ReadingCopyProvider>
    </FanAppFrame>
  );
}
