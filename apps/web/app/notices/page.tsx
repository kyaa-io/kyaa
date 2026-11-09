import type { Metadata } from "next";
import { FanAppFrame, FanContentContainer } from "@/components/fan-shell/fan-app-shell";
import type { HomeNoticePage } from "@/features/home/domain/home-notice";
import { HomeNoticeListScreen, homeNoticePageCopy } from "@/features/home/ui/home-notice-pages";
import { parseAppLocale, toContentLocale } from "@/i18n/locales";
import { publicMetadata } from "@/seo/metadata";
import { redirect } from "next/navigation";
import { createPublicHomeNoticeRepository } from "@/server/home-notice/home-notice-dependencies";
import { decodeHomeNoticeCursor } from "@/server/home-notice/home-notice-repository";

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
  // A cursor we did not issue goes back to the first page; a failed read goes to the error screen with retry (app/error.tsx),
  // never to "아직 공지 없음" (plan §3.8, 2026-11-09 20:52).
  if (cursor !== null && decodeHomeNoticeCursor(cursor) === null) redirect(`/notices?locale=${locale}`);
  const page: HomeNoticePage = await createPublicHomeNoticeRepository().listPublished(toContentLocale(locale), { limit: 20, cursor });
  return <FanAppFrame locale={locale} currentPath="/notices" mainId="notices-main">
    <FanContentContainer as="main" id="notices-main" tabIndex={-1}>
      <HomeNoticeListScreen locale={locale} items={page.items} nextCursor={page.nextCursor} />
    </FanContentContainer>
  </FanAppFrame>;
}
