import { notFound } from "next/navigation";
import {
  FanAppFrame,
  FanContentContainer,
} from "@/components/fan-shell/fan-app-shell";
import { chemiEnabled } from "@/features/chemi/domain/availability";
import { parseAppLocale } from "@/i18n/locales";
import { FortuneFlow } from "./flow";
import { FortuneResult } from "./result";

export const dynamic = "force-dynamic";
export default async function FortunePage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string; from?: string }>;
}) {
  if (!chemiEnabled()) notFound();
  const params = await searchParams;
  const locale = parseAppLocale(params.locale);
  return (
    <FanAppFrame currentPath="/chemi" locale={locale} mainId="fortune-main">
      <FanContentContainer as="main" id="fortune-main">
        {params.from ? (
          <FortuneResult key={params.from} locale={locale} from={params.from} />
        ) : (
          <FortuneFlow locale={locale} />
        )}
      </FanContentContainer>
    </FanAppFrame>
  );
}
