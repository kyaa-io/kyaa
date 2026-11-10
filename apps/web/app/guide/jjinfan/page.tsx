import type { Metadata } from "next";

import { FanAppFrame, FanContentContainer } from "@/components/fan-shell/fan-app-shell";
import { guideText } from "@/features/dukjil-guide/ui/guide-copy";
import { JjinfanGuideContent } from "@/features/dukjil-guide/ui/guide-content";
import { loadGuideModel } from "@/features/dukjil-guide/server/load-guide-model";
import styles from "@/features/dukjil-guide/ui/guide-content.module.css";
import jjinfanStyles from "@/features/dukjil-guide/ui/jjinfan-guide.module.css";
import { parseAppLocale } from "@/i18n/locales";
import { publicMetadata } from "@/seo/metadata";

type Props = { searchParams: Promise<{ locale?: string | string[] }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const locale = parseAppLocale((await searchParams).locale);
  return publicMetadata({
    path: "/guide/jjinfan",
    locale,
    title: `${guideText(locale, "dkgJjMetaTitle")} | kyaa`,
    description: guideText(locale, "dkgJjMetaDesc"),
  });
}

export default async function JjinfanGuidePage({ searchParams }: Props) {
  const locale = parseAppLocale((await searchParams).locale);
  const model = await loadGuideModel(locale);
  return (
    <FanAppFrame locale={locale} currentPath="/guide/jjinfan" mainId="jjinfan-guide-main">
      <FanContentContainer as="main" id="jjinfan-guide-main" tabIndex={-1} className={`${styles.page} ${jjinfanStyles.page}`}>
        <JjinfanGuideContent locale={locale} model={model} />
      </FanContentContainer>
    </FanAppFrame>
  );
}
