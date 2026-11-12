"use client";
import { z } from "zod";
import { ArrowLeft } from "lucide-react";
import Link from "../fan-ui/hover-prefetch-link";
import type { Route } from "next";
import { useSearchParams } from "next/navigation";
import { sanitizeReturnTo } from "@/components/login-intent";
import { type AppLocale, toContentLocale } from "@/i18n/locales";
import { messages } from "@/i18n/catalogs/app__c___slug___notices___noticeSlug___page";
import { translate } from "@/i18n/messages";
import { contentCopy } from "@/i18n/catalogs/features__fan_posts__ui";
import { creatorHomeHref } from "@/features/creator/domain/creator-navigation";
import { noticeSchema } from "@/features/fan-posts/domain/content";
import { useCommunityResource } from "@/features/fanpage/ui/use-community-resource";
import { NoticeComments } from "@/features/fanpage/ui/notice-comments";
import { ContentActions } from "@/features/content-safety/ui/content-actions";
import { parseNoticeDocument } from "@/server/notice/notice-domain";
import { TranslatedText } from "@/features/content-safety/ui/use-automatic-translation";
import { NoticeBody, NoticeTitle, NoticeTranslation, NoticeTranslationControl } from "./notice-body";
import { NoticeReactions } from "./notice-reactions";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanSkeleton, FanSkeletonStatus } from "@/components/fan-ui/fan-skeleton";
import styles from "./notice-detail.module.css";

const parseNotice = (value: unknown) => { const item = noticeSchema.parse(value); return { ...item, body: parseNoticeDocument(item.body) }; };
const parseRecent = (value: unknown) => z.object({ notices: z.array(noticeSchema.omit({ body: true })), nextCursor: z.string().nullable() }).parse(value);
export function NoticeDetail({ slug, noticeSlug, locale, officialPostLabel }: { slug: string; noticeSlug: string; locale: AppLocale; officialPostLabel?: string }) {
  const copy = contentCopy(locale), base = `/api/celebrities/${slug}/notices`;
  const requestedReturn = useSearchParams().get("returnTo"), safeReturn = sanitizeReturnTo(requestedReturn);
  const returnTo = requestedReturn && (safeReturn !== "/" || requestedReturn === "/") ? safeReturn : `${creatorHomeHref(slug)}?tab=notice&locale=${locale}`;
  const detail = useCommunityResource(`${base}/${noticeSlug}?locale=${toContentLocale(locale)}`, parseNotice);
  const recent = useCommunityResource(`${base}?locale=${toContentLocale(locale)}&limit=6`, parseRecent);
  const format = (value: string) => new Intl.DateTimeFormat(locale, { calendar: "gregory", dateStyle: "long", timeStyle: "short", timeZone: "Asia/Seoul", hour12: locale !== "ko" }).format(new Date(value));
  const related = recent.state.status === "ready" ? recent.state.data.notices.filter(item => item.slug !== noticeSlug).slice(0, 5) : [];
  const notice = detail.state.status === "ready" ? detail.state.data : null;
  return <div className={`${styles.page} ${related.length ? styles.withRecent : styles.standalone}`}>
    <Link className={styles.back} href={returnTo as Route}><ArrowLeft aria-hidden="true" />{copy.back}</Link>
    {!notice ? detail.state.status === "error" ? <p role="alert">{copy.unavailable}<FanAction variant="text" onClick={detail.retry}>{copy.retry}</FanAction></p> : <div aria-busy="true"><FanSkeletonStatus locale={locale} /><FanSkeleton width="60%" height={32} /><FanSkeleton shape="block" height={160} /></div> :
      <div className={`${styles.layout} ${related.length ? styles.relatedLayout : ""}`}>
        <article className={styles.article}>
          <NoticeTranslation title={notice.title} document={notice.body} locale={locale}>
          <header className={styles.header}><span>{notice.postType === "artist_post" ? officialPostLabel ?? copy.artistPost : copy.notice} · {copy[notice.visibility]}</span><NoticeTitle locale={locale} /><div className={styles.meta}><time dateTime={notice.publishedAt}>{format(notice.publishedAt)}</time><span className={styles.metaActions}><ContentActions targetType="notice" targetId={notice.id} locale={locale} canBlock={false} onChanged={detail.retry} /></span></div><NoticeTranslationControl locale={locale} /></header>
          {detail.refreshFailed && <p role="status">{copy.failed}<FanAction variant="text" onClick={detail.retry}>{copy.retry}</FanAction></p>}
          <NoticeBody document={notice.body} locale={locale} />
          </NoticeTranslation>
          <NoticeReactions slug={slug} noticeSlug={noticeSlug} title={notice.title} locale={locale} />
          <NoticeComments slug={slug} noticeSlug={noticeSlug} locale={locale} welcome={notice.kind === "welcome"} />
        </article>
        {related.length > 0 && <aside className={styles.recent} aria-labelledby="recent-notices"><h2 id="recent-notices">{locale === "ko" ? "최근 공지" : translate(locale, messages.mc51097f53111, "Recent Notices")}</h2>{related.map(item => <Link key={item.id} href={`/c/${slug}/notices/${item.slug}?locale=${locale}&returnTo=${encodeURIComponent(returnTo)}`}><strong><TranslatedText text={item.title} locale={locale} controls={false} /></strong><small>{format(item.publishedAt)}</small></Link>)}</aside>}
      </div>}
  </div>;
}
