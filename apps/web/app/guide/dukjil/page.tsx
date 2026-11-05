import type { Metadata } from "next";

import { FanAppFrame, FanContentContainer } from "@/components/fan-shell/fan-app-shell";
import { guideText } from "@/features/dukjil-guide/ui/guide-copy";
import { DukjilGuideContent } from "@/features/dukjil-guide/ui/guide-content";
import { loadGuideModel } from "@/features/dukjil-guide/server/load-guide-model";
import styles from "@/features/dukjil-guide/ui/guide-content.module.css";
import { parseAppLocale } from "@/i18n/locales";
import { publicMetadata } from "@/seo/metadata";

type Props = { searchParams: Promise<{ locale?: string | string[] }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const locale = parseAppLocale((await searchParams).locale);
  return publicMetadata({
    path: "/guide/dukjil",
    locale,
    title: `${guideText(locale, "dkgDkMetaTitle")} | kyaa`,
    description: guideText(locale, "dkgDkMetaDesc"),
  });
}

export default async function DukjilGuidePage({ searchParams }: Props) {
  const locale = parseAppLocale((await searchParams).locale);
  const model = await loadGuideModel(locale);
  return (
    <FanAppFrame locale={locale} currentPath="/guide/dukjil" mainId="dukjil-guide-main">
      <FanContentContainer as="main" id="dukjil-guide-main" tabIndex={-1} className={styles.page}>
        <DukjilGuideContent locale={locale} model={model} />
      </FanContentContainer>
    </FanAppFrame>
  );
}
