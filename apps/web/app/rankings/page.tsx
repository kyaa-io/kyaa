import type { Metadata } from "next";

import { FanAppFrame, FanContentContainer } from "@/components/fan-shell/fan-app-shell";
import { rankingsText } from "@/features/rankings/ui/rankings-copy";
import { CreatorRankingScreen } from "@/features/rankings/ui/rankings-screens";
import styles from "@/features/rankings/ui/rankings.module.css";
import { parseAppLocale } from "@/i18n/locales";
import { publicMetadata } from "@/seo/metadata";

type Props = { searchParams: Promise<{ locale?: string | string[] }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const locale = parseAppLocale((await searchParams).locale);
  return publicMetadata({ path: "/rankings", locale, title: `${rankingsText(locale, "rkTitle")} | kyaa`, description: rankingsText(locale, "rkTitle") });
}

export default async function RankingsPage({ searchParams }: Props) {
  const locale = parseAppLocale((await searchParams).locale);
  return (
    <FanAppFrame locale={locale} currentPath="/rankings" mainId="rankings-main">
      <FanContentContainer as="main" id="rankings-main" tabIndex={-1} className={styles.page}>
        <CreatorRankingScreen locale={locale} />
      </FanContentContainer>
    </FanAppFrame>
  );
}
