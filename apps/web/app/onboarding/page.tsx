import type { Metadata } from "next";

import { FanAppFrame, FanContentContainer } from "@/components/fan-shell/fan-app-shell";
import { FIRST_STEPS_PATH } from "@/features/onboarding/domain/first-steps";
import { firstStepsCopy } from "@/features/onboarding/ui/first-steps-copy";
import { FirstStepsScreen } from "@/features/onboarding/ui/first-steps-screen";
import { parseAppLocale } from "@/i18n/locales";
import { publicMetadata } from "@/seo/metadata";

type Props = { searchParams: Promise<{ locale?: string | string[] }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const locale = parseAppLocale((await searchParams).locale);
  const t = firstStepsCopy(locale);
  return publicMetadata({ path: FIRST_STEPS_PATH, locale, title: `${t.title} | kyaa`, description: Object.values(t.step).join(" · ") });
}

export default async function FirstStepsPage({ searchParams }: Props) {
  const locale = parseAppLocale((await searchParams).locale);
  return (
    <FanAppFrame locale={locale} currentPath={FIRST_STEPS_PATH} mainId="first-steps-main">
      <FanContentContainer as="main" id="first-steps-main" tabIndex={-1}>
        <FirstStepsScreen locale={locale} />
      </FanContentContainer>
    </FanAppFrame>
  );
}
