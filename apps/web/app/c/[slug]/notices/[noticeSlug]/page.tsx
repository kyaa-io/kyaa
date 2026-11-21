import type { Metadata } from "next";
import { cache } from "react";
import { parseAppLocale, toContentLocale } from "@/i18n/locales";
import { FanAppFrame, FanContentContainer } from "@/components/fan-shell/fan-app-shell";
import { NoticeDetail } from "@/components/notice/notice-detail";
import { fanPageBrandCopy } from "@/i18n/catalogs/features__fanpage__brand";
import { noticeSchema } from "@/features/fan-posts/domain/content";
import { WAVE_FANPAGE_SLUG } from "@/features/fanpage/domain/wave-programs";
import { contentPageMetadata } from "@/seo/metadata";
import { createContentDependencies } from "@/server/fan-posts/dependencies";
import { createContentHandlers } from "@/server/fan-posts/routes";
import { parseNoticeDocument } from "@/server/notice/notice-domain";
import { loadSeoCreator } from "@/server/seo/public-content";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string; noticeSlug: string }>; searchParams: Promise<{ locale?: string }> };

/** The same anonymous read `GET /api/celebrities/:slug/notices/:noticeSlug` does without an Authorization header: a members-only or
 * unpublished notice, and every notice of the check-in-only event page, is `null` here and is read by the browser as before. */
const readPublicNotice = cache(async (slug: string, noticeSlug: string, locale: "ko" | "en") => {
  if (slug === WAVE_FANPAGE_SLUG) return null;
  try {
    const response = await createContentHandlers(createContentDependencies()).notice(new Request(`http://localhost/api/celebrities/${slug}/notices/${noticeSlug}?locale=${locale}`), slug, noticeSlug);
    if (!response.ok) return null;
    const notice = noticeSchema.parse(await response.json());
    return notice.visibility === "public" ? { ...notice, body: parseNoticeDocument(notice.body) } : null;
  } catch { return null; }
});

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug, noticeSlug }, query] = await Promise.all([params, searchParams]);
  const locale = parseAppLocale(query.locale);
  const [notice, celebrity] = await Promise.all([readPublicNotice(slug, noticeSlug, toContentLocale(locale)), loadSeoCreator(slug, locale).catch(() => null)]);
  if (!notice || !celebrity) return {};
  // A welcome notice is the same text on every fan page, and a post brought over from a social account is a copy of that post: both stay out of search.
  return contentPageMetadata({ path: `/c/${slug}/notices/${noticeSlug}`, locale, title: `${notice.title} | ${celebrity.name} | kyaa`, description: notice.title,
    image: celebrity.image.url, imageAlt: celebrity.image.alt, indexable: notice.kind === "standard" && !/^(?:instagram|tiktok)-/.test(notice.slug) });
}

export default async function NoticeDetailPage({ params, searchParams }: Props) {
  const { slug, noticeSlug } = await params;
  const locale = parseAppLocale((await searchParams).locale);
  const celebrity = await loadSeoCreator(slug, locale);
  if (!celebrity) notFound();
  const officialPostLabel = celebrity.roles.includes("brand") ? fanPageBrandCopy[locale].officialPost : undefined;
  const initialNotice = await readPublicNotice(slug, noticeSlug, toContentLocale(locale));
  return <FanAppFrame locale={locale} mainId="notice-detail-main"><FanContentContainer as="main" id="notice-detail-main" tabIndex={-1}>
    <NoticeDetail slug={slug} noticeSlug={noticeSlug} locale={locale} officialPostLabel={officialPostLabel} initialNotice={initialNotice ?? undefined} />
  </FanContentContainer></FanAppFrame>;
}
