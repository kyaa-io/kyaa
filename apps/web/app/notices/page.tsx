import type { Metadata } from "next";
import { FanAppFrame, FanContentContainer } from "@/components/fan-shell/fan-app-shell";
import type { HomeNoticePage } from "@/features/home/domain/home-notice";
import { HomeNoticeListScreen, homeNoticePageCopy } from "@/features/home/ui/home-notice-pages";
import { parseAppLocale, toContentLocale } from "@/i18n/locales";
import { publicMetadata } from "@/seo/metadata";
import { createPublicHomeNoticeRepository } from "@/server/home-notice/home-notice-dependencies";

export const dynamic = "force-dynamic";
type Props = { searchParams: Promise<{ locale?: string | string[]; cursor?: string | string[] }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const locale = parseAppLocale((await searchParams).locale);
  const { title } = homeNoticePageCopy[locale];
  return publicMetadata({ path: "/notices", locale, title: `${title} | kyaa`, description: title });
}

export default async function HomeNoticesPage({ searchParams }: Props) {
  const params = await searchParams;
  const locale = parseAppLocale(params.locale);
  const cursor = typeof params.cursor === "string" ? params.cursor : null;
  // A bad cursor or a failed read shows the empty row, never an error page (plan §3.8).
  const page: HomeNoticePage = await createPublicHomeNoticeRepository().listPublished(toContentLocale(locale), { limit: 20, cursor })
    .catch(() => ({ items: [], nextCursor: null }));
  return <FanAppFrame locale={locale} currentPath="/notices" mainId="notices-main">
    <FanContentContainer as="main" id="notices-main" tabIndex={-1}>
      <HomeNoticeListScreen locale={locale} items={page.items} nextCursor={page.nextCursor} />
    </FanContentContainer>
  </FanAppFrame>;
}
