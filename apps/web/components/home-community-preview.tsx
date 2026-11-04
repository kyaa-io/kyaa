"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { paginationCopy } from "@/i18n/catalogs/common__pagination";
import { toContentLocale, type AppLocale } from "@/i18n/locales";
import { feedCopy } from "@/i18n/catalogs/features__fan_posts__feed";
import { contentCopy } from "@/i18n/catalogs/features__fan_posts__ui";
import { popularPostsPageSchema } from "@/features/popular-board/domain/popular-posts";
import { useCommunityResource } from "@/features/fanpage/ui/use-community-resource";
import { FanSectionHeader } from "./fan-ui/fan-heading";
import { FanAction } from "@/components/fan-ui/fan-action";
import { PublicBoardTable } from "./public-board-table";
import styles from "./home-community-preview.module.css";

const parse = (value: unknown) => popularPostsPageSchema.parse(value);

export function HomeCommunityPreview({ locale }: { locale: AppLocale }) {
  const [page, setPage] = useState(1);
  const pagination = paginationCopy(locale);
  const copy = contentCopy(locale), feed = feedCopy(locale);
  const { state, retry } = useCommunityResource(`/api/public/popular-posts?locale=${toContentLocale(locale)}&page=${page}`, parse, true, true);
  return <section className={styles.section} aria-labelledby="home-community-heading">
    <FanSectionHeader variant="editorial" id="home-community-heading" title={feed.fanBoard} />
    {state.status === "ready" && state.data.items.length > 0 ? <PublicBoardTable posts={state.data.items} locale={locale} photoLabel={copy.photo} /> : <p className={styles.status} role={state.status === "error" ? "alert" : "status"}>{state.status === "loading" ? copy.loading : state.status === "error" ? copy.failed : copy.empty}</p>}
    {(page > 1 || (state.status === "ready" && state.data.hasMore)) && <nav className={styles.pagination} aria-label={feed.fanBoard}>
      <button type="button" disabled={page === 1} onClick={() => setPage(value => value - 1)} aria-label={pagination.previous}><ChevronLeft aria-hidden="true" /></button>
      <span aria-current="page" aria-live="polite">{new Intl.NumberFormat(locale).format(page)}</span>
      <button type="button" disabled={state.status !== "ready" || !state.data.hasMore || page >= 1000} onClick={() => setPage(value => value + 1)} aria-label={pagination.next}><ChevronRight aria-hidden="true" /></button>
    </nav>}
    {state.status === "error" && <div className={styles.status}><FanAction variant="text" onClick={retry}>{copy.retry}</FanAction></div>}
    {state.status === "ready" && state.data.items.length === 0 && <Link className={styles.emptyAction} href={`/community?locale=${locale}`}>{feed.fanBoard}<span aria-hidden="true"> →</span></Link>}
  </section>;
}
