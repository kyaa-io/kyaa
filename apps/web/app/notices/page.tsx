import type { Metadata } from "next";
import { FanAppFrame, FanContentContainer } from "@/components/fan-shell/fan-app-shell";
import type { HomeNoticePage } from "@/features/home/domain/home-notice";
import { HomeNoticeListScreen, homeNoticePageCopy } from "@/features/home/ui/home-notice-pages";
import { parseAppLocale, toContentLocale } from "@/i18n/locales";
import { publicMetadata } from "@/seo/metadata";
import { redirect } from "next/navigation";
import { createPublicHomeNoticeRepository } from "@/server/home-notice/home-notice-dependencies";
import { decodeHomeNoticeCursor } from "@/server/home-notice/home-notice-repository";
import styles from "@/features/home/ui/home-notice-pages.module.css";

export const dynamic = "force-dynamic";
type Props = { searchParams: Promise<{ locale?: string | string[]; cursor?: string | string[]; page?: string | string[] }> };

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
  const requestedPage = typeof params.page === "string" && /^[1-9]\d*$/.test(params.page) && Number.isSafeInteger(Number(params.page)) ? Number(params.page) : 1;
  const repository = createPublicHomeNoticeRepository();
  let currentPage = 1;
  let pageCount = 1;
  let page: HomeNoticePage;
  if (cursor) {
    page = await repository.listPublished(toContentLocale(locale), { limit: 10, cursor });
  } else {
    const items: HomeNoticePage["items"][number][] = [];
    const seen = new Set<string>();
    let next: string | null = null;
    do {
      const batch = await repository.listPublished(toContentLocale(locale), { limit: 20, cursor: next });
      items.push(...batch.items);
      next = batch.nextCursor;
      if (next && seen.has(next)) throw new Error("Repeated notice cursor");
      if (next) seen.add(next);
    } while (next);
    pageCount = Math.max(1, Math.ceil(items.length / 10));
    currentPage = Math.min(requestedPage, pageCount);
    if (currentPage !== requestedPage) redirect(`/notices?locale=${locale}&page=${currentPage}`);
    page = { items: items.slice((currentPage - 1) * 10, currentPage * 10), nextCursor: null };
  }
  return <FanAppFrame locale={locale} currentPath="/notices" mainId="notices-main" className={styles.listFrame}>
    <FanContentContainer as="main" id="notices-main" tabIndex={-1} className={styles.listContainer}>
      <HomeNoticeListScreen locale={locale} items={page.items} nextCursor={page.nextCursor} page={currentPage} pageCount={pageCount} legacyCursor={Boolean(cursor)} />
    </FanContentContainer>
  </FanAppFrame>;
}
