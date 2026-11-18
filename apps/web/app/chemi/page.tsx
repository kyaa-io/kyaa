import { notFound } from "next/navigation";
import {
  FanAppFrame,
  FanContentContainer,
} from "@/components/fan-shell/fan-app-shell";
import { chemiEnabled } from "@/features/chemi/domain/availability";
import { parseAppLocale } from "@/i18n/locales";

import { FanTabs } from "@/components/fan-ui/fan-tabs";
import { FanAction } from "@/components/fan-ui/fan-action";

export const dynamic = "force-dynamic";
export default async function ChemiPage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string | string[]; tab?: string }>;
}) {
  if (!chemiEnabled()) notFound();
  const params = await searchParams;
  const locale = parseAppLocale(params.locale);
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
            { key: "play", label: "놀기", href: `/chemi?locale=${locale}` },
            {
              key: "growth",
              label: "성장",
              href: `/chemi?tab=growth&locale=${locale}`,
            },
          ]}
        />
        {!growth && (
          <FanAction href={`/chemi/fortune?locale=${locale}`}>
            오늘의 운세
          </FanAction>
        )}
      </FanContentContainer>
    </FanAppFrame>
  );
}
