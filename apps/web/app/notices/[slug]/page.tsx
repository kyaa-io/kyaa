import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FanAppFrame, FanContentContainer } from "@/components/fan-shell/fan-app-shell";
import { HomeNoticeDetailScreen, homeNoticePageCopy } from "@/features/home/ui/home-notice-pages";
import { parseAppLocale, toContentLocale } from "@/i18n/locales";
import { publicMetadata } from "@/seo/metadata";
import { createPublicHomeNoticeRepository } from "@/server/home-notice/home-notice-dependencies";
import { noticeSlugSchema } from "@/server/notice/notice-domain";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ locale?: string | string[] }> };

async function load(slug: string, locale: "ko" | "en") {
  return noticeSlugSchema.safeParse(slug).success ? createPublicHomeNoticeRepository().findPublished(locale, slug) : null;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const locale = parseAppLocale(query.locale);
  const notice = await load(slug, toContentLocale(locale)).catch(() => null);
  const title = notice?.title ?? homeNoticePageCopy[locale].title;
  return publicMetadata({ path: `/notices/${slug}`, locale, title: `${title} | kyaa`, description: title });
}

export default async function HomeNoticeDetailPage({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const locale = parseAppLocale(query.locale);
  const notice = await load(slug, toContentLocale(locale));
  if (!notice) notFound();
  return <FanAppFrame locale={locale} currentPath="/notices" mainId="notice-main">
    <FanContentContainer as="main" id="notice-main" tabIndex={-1}>
      <HomeNoticeDetailScreen locale={locale} notice={notice} />
    </FanContentContainer>
  </FanAppFrame>;
}
