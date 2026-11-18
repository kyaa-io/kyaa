import { notFound } from "next/navigation";
import {
  FanAppFrame,
  FanContentContainer,
} from "@/components/fan-shell/fan-app-shell";
import { chemiEnabled } from "@/features/chemi/domain/availability";
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
  const restoring = Boolean(params.r) && params.step === "result";
  return (
    <FanAppFrame currentPath="/chemi" locale={locale} mainId="saju-main">
      <FanContentContainer as="main" id="saju-main">
        {params.from ? (
          <SajuShared key={params.from} locale={locale} from={params.from} />
        ) : (
          <SajuFlow locale={locale} restoring={restoring} />
        )}
      </FanContentContainer>
    </FanAppFrame>
  );
}
