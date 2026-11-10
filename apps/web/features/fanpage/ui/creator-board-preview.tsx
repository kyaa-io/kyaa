"use client";
import Link from "next/link";
import type { Route } from "next";
import { ChevronRight, FileText, MessageCircle, Pencil, Play } from "lucide-react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { ContentAssetImage } from "@/features/content-safety/ui/content-asset";
import { feedPageSchema, type FeedItem } from "@/features/fan-posts/domain/feed";
import { contentCopy } from "@/i18n/catalogs/features__fan_posts__ui";
import { feedCopy } from "@/i18n/catalogs/features__fan_posts__feed";
import { messages as newsMessages } from "@/i18n/catalogs/features__fanpage__ui__chzzk-posts";
import { translate } from "@/i18n/messages";
import { toContentLocale, type AppLocale } from "@/i18n/locales";
import { boardHref } from "../domain/board-navigation";
import { useCommunityResource } from "./use-community-resource";
import styles from "./creator-board-preview.module.css";

const PREVIEW_LIMIT = 5;
const parse = (value: unknown) => feedPageSchema.parse(value);
const kstDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });
const kstTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false });

/** Today's posts show `HH:mm`, older ones `MM. DD.` (KST), as on the board rows in main. */
export function boardPreviewTime(value: string, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const day = kstDay.format(date);
  return day === kstDay.format(now) ? kstTime.format(date) : `${day.slice(5, 7)}. ${day.slice(8, 10)}.`;
}

/** Board rows only exist for fan posts and cheers here: the preview reads the fans source. */
function rowView(item: FeedItem, slug: string, locale: AppLocale, returnTo: string) {
  if (item.kind === "fan_post") return { title: item.body.split("\n")[0] ?? "", author: item.author.nickname, date: item.createdAt, comments: item.commentCount, href: `/c/${slug}/community/${item.id}?locale=${locale}&returnTo=${encodeURIComponent(returnTo)}` };
  if (item.kind === "cheer") return { title: item.body.split("\n")[0] ?? "", author: item.nickname, date: item.createdAt, comments: item.replyCount, href: `${returnTo.split("#")[0]}#cheer-${item.id}` };
  return null;
}

export function CreatorBoardPreview({ slug, locale }: { slug: string; locale: AppLocale }) {
  const copy = contentCopy(locale), feed = feedCopy(locale);
  const query = new URLSearchParams({ locale: toContentLocale(locale), source: "fans", limit: String(PREVIEW_LIMIT) });
  const { state, retry } = useCommunityResource(`/api/celebrities/${encodeURIComponent(slug)}/feed?${query}`, parse);
  const allHref = boardHref(slug, locale, { source: "fans" });
  const writeHref = allHref.replace("#", "&compose=1#");
  const writeLabel = locale === "ko" ? "글쓰기" : copy.writePost;
  const rows = state.status === "ready" ? state.data.items.slice(0, PREVIEW_LIMIT).map(item => ({ item, view: rowView(item, slug, locale, allHref) })).filter(row => row.view) : [];
  // An empty board keeps the card and offers writing once, inside it.
  const empty = state.status === "ready" && rows.length === 0;
  return <section className={styles.section} aria-labelledby={`${slug}-board-preview-heading`} data-creator-board-preview={slug}>
    <div className={styles.header}>
      <FanHeading id={`${slug}-board-preview-heading`}>{feed.fanBoard}</FanHeading>
      <div className={styles.actions}>
        {!empty && <Link className={styles.write} href={writeHref as Route}><Pencil aria-hidden="true" /><span>{writeLabel}</span></Link>}
        <Link className={styles.all} href={allHref as Route}><span>{locale === "ko" ? "전체 보기" : translate(locale, newsMessages.m3e5383762d51, "View all")}</span><ChevronRight aria-hidden="true" /></Link>
      </div>
    </div>
    <div className={styles.card}>
      {state.status === "ready" ? rows.length > 0 ? <ul className={styles.rows}>{rows.map(({ item, view }) => <li key={`${item.kind}:${item.id}`} className={styles.row}>
        <span className={styles.thumb} aria-hidden="true">{item.kind === "fan_post" && item.video ? <Play size={16} /> : item.kind === "fan_post" && item.assets[0] ? <ContentAssetImage asset={item.assets[0]} locale={locale} alt="" loading="lazy" thumbnail failure="icon" /> : <FileText size={16} />}</span>
        <span className={styles.head}>
          <Link className={styles.title} href={view!.href as Route}>{view!.title || feed.fanBoard}</Link>
          {view!.comments > 0 && <span className={styles.comments} aria-label={`${copy.comments} ${view!.comments.toLocaleString(locale)}`}>[{view!.comments.toLocaleString(locale)}]</span>}
        </span>
        <span className={styles.meta}><span className={styles.author}>{view!.author}</span><time dateTime={view!.date} suppressHydrationWarning>{boardPreviewTime(view!.date)}</time></span>
      </li>)}</ul>
        : <div className={styles.empty}><MessageCircle size={24} aria-hidden="true" /><FanAction href={writeHref} variant="primary" leadingIcon={<Pencil aria-hidden="true" />}>{writeLabel}</FanAction></div>
        : <div className={styles.status} role={state.status === "error" ? "alert" : "status"}>{state.status === "error" ? <><span>{copy.failed}</span><FanAction variant="text" onClick={retry}>{copy.retry}</FanAction></> : <span>{copy.loading}</span>}</div>}
    </div>
  </section>;
}
