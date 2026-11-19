import { notFound } from "next/navigation";
import { FanAppFrame, FanContentContainer } from "@/components/fan-shell/fan-app-shell";
import { chemiEnabled } from "@/features/chemi/domain/availability";
import { parseStarStep } from "@/features/chemi/domain/star-step";
import { parseAppLocale } from "@/i18n/locales";
import { StarFlow } from "./flow";

export const dynamic = "force-dynamic";
export default async function StarPage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string; step?: string; r?: string }>;
}) {
  if (!chemiEnabled()) notFound();
  const params = await searchParams;
  const locale = parseAppLocale(params.locale);
  // 결과 주소를 새로 열면 저장된 결과를 불러오는 동안 입장 화면이 아니라 불러오는 모양을 보인다.
  const restoring = Boolean(params.r) && parseStarStep(params.step) !== "enter";
  return (
    <FanAppFrame currentPath="/chemi" locale={locale} mainId="star-main">
      <FanContentContainer as="main" id="star-main">
        <StarFlow locale={locale} restoring={restoring} />
      </FanContentContainer>
    </FanAppFrame>
  );
}
