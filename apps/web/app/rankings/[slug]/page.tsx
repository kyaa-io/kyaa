import type { Metadata } from "next";

import { FanAppFrame, FanContentContainer } from "@/components/fan-shell/fan-app-shell";
import { rankingsText } from "@/features/rankings/ui/rankings-copy";
import { FanRankingScreen } from "@/features/rankings/ui/rankings-screens";
import styles from "@/features/rankings/ui/rankings.module.css";
import { parseAppLocale } from "@/i18n/locales";
import { publicMetadata } from "@/seo/metadata";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ locale?: string | string[] }> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const locale = parseAppLocale(query.locale);
  return publicMetadata({ path: `/rankings/${slug}`, locale, title: `${rankingsText(locale, "rkFanTitle")} | kyaa`, description: rankingsText(locale, "rkFanTitle") });
}

export default async function FanRankingsPage({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const locale = parseAppLocale(query.locale);
  return (
    <FanAppFrame locale={locale} currentPath="/rankings" mainId="rankings-main">
      <FanContentContainer as="main" id="rankings-main" tabIndex={-1} className={styles.page}>
        <FanRankingScreen locale={locale} slug={slug} />
      </FanContentContainer>
    </FanAppFrame>
  );
}
