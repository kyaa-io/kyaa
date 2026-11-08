"use client";
import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { FanTabs } from "@/components/fan-ui/fan-tabs";
import { FanSkeletonRows } from "@/components/fan-ui/fan-skeleton";
import { BadgeCheck, Bell, ChevronDown, ChevronRight, MessageCircle, Settings, Star, UserPlus, type LucideIcon } from "@/components/fan-ui/inbox-icons";
import { withLocalePath } from "@/components/locale-path";
import { TranslatedText } from "@/features/content-safety/ui/use-automatic-translation";
import { GuestLoginAction } from "@/features/my/ui/guest-login";
import type { AppLocale } from "@/i18n/locales";
import { eventReviewText } from "../event-review-copy";
import type { NotificationItem } from "../domain/notification-model";
import {
  filterInbox, formalKo, groupInbox, isActionNotification, notificationChip, notificationChips, notificationDate, notificationTime, targetLabel,
  attachHonorific, limitInbox, type InboxEntry, type NotificationChip,
} from "../domain/notification-inbox";
import { actorSentence, inboxCopy } from "./notification-inbox-copy";
import type { useNotificationInbox } from "./use-notification-inbox";
import styles from "./notification-inbox.module.css";

type Inbox = ReturnType<typeof useNotificationInbox>;
const PAGE = 20;
const chipIcon: Record<Exclude<NotificationChip, "all">, LucideIcon> = { favorite: Star, stamp: BadgeCheck, friend: UserPlus, system: Bell };

/** 1줄 `주체·행동·대상`. 주체 템플릿이 없으면 서버 제목(한국어는 습니다체로 끝만 맞춤). 대상은 target.label 하나만 쓴다. */
export function notificationSentence(item: NotificationItem, locale: AppLocale) {
  const said = actorSentence(locale, item.kind, item.actor?.nickname, targetLabel(item));
  if (said) return { text: locale === "ko" ? attachHonorific(said) : said, translated: false };
  const title = item.eventReview ? eventReviewText(locale, item.eventReview).title : item.title;
  return { text: locale === "ko" ? attachHonorific(formalKo(title)) : title, translated: locale !== "ko" && locale !== "en" && !item.eventReview };
}

/** 2줄 `출처`: 공식 글은 크리에이터 이름, 그 밖에는 칩 이름(최애 칩은 최애 이름). */
export function notificationSource(item: NotificationItem, locale: AppLocale, favoriteName: string | null) {
  const chip = notificationChip(item.kind);
  if (chip === "favorite" && item.actor && item.actor.profileId === null) return item.actor.nickname;
  if (chip === "favorite" && item.target?.type === "celebrity" && item.target.label) return item.target.label;
  return chip === "favorite" ? favoriteName ?? inboxCopy(locale).chips.favorite : inboxCopy(locale).chips[chip];
}

export function NotificationInbox({ locale, inbox, favoriteName = null, headingLevel = "h2", showTitle = true, onNavigate, returnTo }: Readonly<{
  locale: AppLocale;
  inbox: Inbox;
  favoriteName?: string | null;
  headingLevel?: "h1" | "h2";
  /** 시트는 자기 머리에 제목이 있어 숨긴다. */
  showTitle?: boolean;
  onNavigate?: () => void;
  returnTo: string;
}>) {
  const c = inboxCopy(locale);
  const [chip, setChip] = useState<NotificationChip>("all");
  const [limit, setLimit] = useState(PAGE);
  const { state, unread } = inbox;
  const items = state.kind === "ready" ? state.items : null;
  const groups = useMemo(() => items ? groupInbox(filterInbox(items, chip)) : [], [items, chip]);
  const chipItems = notificationChips.map((key) => ({ key, label: key === "favorite" && favoriteName ? <span className={styles.chipName} title={favoriteName}>{favoriteName}</span> : c.chips[key], onSelect: () => { setChip(key); setLimit(PAGE); } }));
  const total = groups.reduce((sum, group) => sum + group.entries.length, 0);
  const shown = useMemo(() => limitInbox(groups, limit), [groups, limit]);
  // 비로그인(검토 VISUAL-K ①): 문구와 로그인 버튼만. 칩·설정·잠금 뼈대는 그리지 않는다.
  const guest = state.kind === "auth";
  return <div className={styles.inbox} data-inbox="" data-guest={guest || undefined}>
    <header className={styles.head} data-show-title={showTitle || undefined}>
      {showTitle ? <FanHeading as={headingLevel}>{c.title}</FanHeading> : null}
      {unread > 0 ? <span className={styles.unread} data-metric="count">{c.unread(unread)}</span> : null}
      <span className={styles.headEnd}>
        {unread > 0 ? <FanAction variant="text" size="sm" className={styles.textAction} onClick={() => void inbox.readAll()} disabled={inbox.readingAll}>{c.readAll}</FanAction> : null}
        {guest ? null : <Link className={styles.iconLink} href={`/settings?locale=${locale}&section=notifications` as Route} aria-label={c.settings} title={c.settings} onClick={onNavigate}><FanIcon icon={Settings} size={20} /></Link>}
      </span>
    </header>
    {guest ? null : <ChipRow><FanTabs variant="chip" label={c.filter} current={chip} items={chipItems} className={styles.kindFilter} /></ChipRow>}
    {state.kind === "loading" ? <FanSkeletonRows rows={5} variant="entity" ariaLabel={c.title} />
      : state.kind === "auth" ? <div className={styles.guest}><p className={styles.state}>{c.signIn}</p><GuestLoginAction locale={locale} returnTo={returnTo} variant="primary" fullWidth /></div>
      : state.kind === "error" ? <div className={styles.stateRow} role="alert"><span>{c.loadError}</span><FanAction variant="text" size="sm" className={styles.textAction} onClick={() => void inbox.reload()}>{c.retry}</FanAction></div>
      : !groups.length ? <p className={styles.state} role="status">{chip === "all" ? c.empty : c.chipEmpty}</p>
      : <>
        {shown.map((group) => {
          const entries = group.entries;
          return <section key={group.day} className={styles.group} data-block="list" aria-labelledby={`inbox-day-${group.day}`}>
            <p className={styles.day} id={`inbox-day-${group.day}`}>{group.label === "today" ? c.today : group.date}</p>
            <ul className={styles.rows}>{entries.map((entry) => <Entry key={entryKey(entry)} entry={entry} locale={locale} favoriteName={favoriteName} inbox={inbox} onNavigate={onNavigate} />)}</ul>
          </section>;
        })}
        {total > limit ? <FanAction variant="text" size="sm" className={styles.more} onClick={() => setLimit((value) => value + PAGE)}>{c.more}</FanAction> : null}
      </>}
  </div>;
}

/** 칩 줄이 오른쪽으로 더 있을 때 끝을 흐리게 해 가로로 밀 수 있음을 보인다(검토 VISUAL-K ① 낮음). 끝까지 밀면 흐림이 사라진다. */
function ChipRow({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const row = ref.current?.firstElementChild as HTMLElement | null;
    if (!row) return;
    const sync = () => setMore(row.scrollLeft + row.clientWidth < row.scrollWidth - 1);
    sync();
    row.addEventListener("scroll", sync, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(sync);
    observer?.observe(row);
    return () => { row.removeEventListener("scroll", sync); observer?.disconnect(); };
  }, []);
  return <div ref={ref} className={styles.chipRow} data-more={more || undefined}>{children}</div>;
}

const entryKey = (entry: InboxEntry) => entry.type === "item" ? entry.item.id : `bundle-${entry.items[0].id}`;

function Leading({ item }: { item: NotificationItem }) {
  if (item.actor?.avatarUrl) return <img className={styles.avatar} src={item.actor.avatarUrl} alt="" width={32} height={32} loading="lazy" />;
  return <span className={styles.kindIcon} data-chip={notificationChip(item.kind)}><FanIcon icon={item.kind === "content_reply" || item.kind === "artist_comment" || item.kind === "fan_dm_message" ? MessageCircle : chipIcon[notificationChip(item.kind)]} size={20} /></span>;
}

function Line({ text, translated, locale }: { text: string; translated: boolean; locale: AppLocale }) {
  return translated ? <TranslatedText text={text} locale={locale} controls={false} className={styles.line1} /> : <span className={styles.line1}>{text}</span>;
}

function Entry({ entry, locale, favoriteName, inbox, onNavigate }: { entry: InboxEntry; locale: AppLocale; favoriteName: string | null; inbox: Inbox; onNavigate?: () => void }) {
  const c = inboxCopy(locale);
  const [open, setOpen] = useState(false);
  if (entry.type === "item") return <li data-row="notice"><Row item={entry.item} locale={locale} favoriteName={favoriteName} inbox={inbox} onNavigate={onNavigate} /></li>;
  const first = entry.items[0];
  const unread = entry.items.some((item) => !item.readAt);
  const said = notificationSentence(first, locale);
  const text = entry.kind === "stamp_issued" ? c.stampBundle(entry.items.length) : c.bundle(said.text, entry.items.length - 1);
  return <li data-row="notice" data-bundle={entry.items.length}>
    <details className={styles.bundle} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className={styles.row} data-unread={unread || undefined}>
        <Leading item={first} />
        <span className={styles.copy}>
          <Line text={text} translated={entry.kind !== "stamp_issued" && said.translated} locale={locale} />
          <span className={styles.line2} data-meta="">{notificationSource(first, locale, favoriteName)} · {notificationDate(first.createdAt)}</span>
        </span>
        <span className={styles.end} data-row-end="">
          {unread ? <span className={styles.dot} data-dot="" aria-hidden="true" /> : null}
          <FanIcon icon={ChevronDown} size={16} className={styles.chevron} label={open ? c.collapse : c.expand} />
        </span>
      </summary>
      {open ? <ul className={styles.bundleRows}>{entry.items.map((item) => <li key={item.id} data-row="notice"><Row item={item} locale={locale} favoriteName={favoriteName} inbox={inbox} onNavigate={onNavigate} /></li>)}</ul> : null}
    </details>
  </li>;
}

function Row({ item, locale, favoriteName, inbox, onNavigate }: { item: NotificationItem; locale: AppLocale; favoriteName: string | null; inbox: Inbox; onNavigate?: () => void }) {
  const c = inboxCopy(locale);
  const said = notificationSentence(item, locale);
  const action = isActionNotification(item.kind);
  const end: ReactNode = action
    ? <span className={styles.action}>{c.action}<FanIcon icon={ChevronRight} size={16} /></span>
    : item.thumbnailUrl ? <img className={styles.thumb} src={item.thumbnailUrl} alt="" width={40} height={40} loading="lazy" /> : null;
  return <Link
    className={styles.row}
    href={withLocalePath(item.deepLink, locale) as Route}
    data-unread={!item.readAt || undefined}
    data-kind={item.kind}
    onClick={(event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      inbox.markRead([item]);
      onNavigate?.();
    }}
  >
    <Leading item={item} />
    <span className={styles.copy}>
      <Line text={said.text} translated={said.translated} locale={locale} />
      <span className={styles.line2} data-meta=""><span className={styles.source}>{notificationSource(item, locale, favoriteName)}</span> · <time dateTime={item.createdAt}>{notificationTime(item.createdAt)}</time></span>
    </span>
    <span className={styles.end} data-row-end="">
      {end}
      {!item.readAt ? <span className={styles.dot} data-dot="" aria-hidden="true" /> : null}
    </span>
  </Link>;
}
