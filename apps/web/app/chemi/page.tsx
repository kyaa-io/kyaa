import { notFound } from "next/navigation";
import {
  FanAppFrame,
  FanContentContainer,
} from "@/components/fan-shell/fan-app-shell";
import { chemiEnabled } from "@/features/chemi/domain/availability";
import { parseAppLocale } from "@/i18n/locales";

import { FanTabs } from "@/components/fan-ui/fan-tabs";
import { ChemiHome } from "./home";

export const dynamic = "force-dynamic";
export default async function ChemiPage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string | string[]; tab?: string }>;
}) {
  if (!chemiEnabled()) notFound();
  const params = await searchParams;
  const locale = parseAppLocale(params.locale);
  const { home: copy } = (
    await import(`@/features/chemi/i18n/locales/${locale}/chemi.json`)
  ).default;
  const growth = params.tab === "growth";
  return (
    <FanAppFrame locale={locale} currentPath="/chemi" mainId="chemi-main">
      <FanContentContainer
        as="main"
        id="chemi-main"
        tabIndex={-1}
        data-chemi-tab=""
      >
        <FanTabs
          label="케미"
          current={growth ? "growth" : "play"}
          items={[
            { key: "play", label: copy.play, href: `/chemi?locale=${locale}` },
            {
              key: "growth",
              label: copy.growth,
              href: `/chemi?tab=growth&locale=${locale}`,
            },
          ]}
        />
        <ChemiHome copy={copy} locale={locale} growth={growth} />
      </FanContentContainer>
    </FanAppFrame>
  );
}
