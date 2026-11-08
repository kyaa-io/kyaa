"use client";
import { ChevronRight } from "@/components/fan-ui/stan-icons";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import Link from "next/link";
import type { Route } from "next";
import { useEffect, useRef, useState } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { fanLoginHref } from "@/components/login-href";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanLockedRows, FanLockedValue } from "@/components/fan-ui/fan-locked-value";
import { FanNumber } from "@/components/fan-ui/fan-number";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { dukjilText } from "@/features/dukjil/ui/dukjil-copy";
import { groupsCopy } from "@/features/groups/ui/copy";
import { seeAllLabel } from "@/features/groups/ui/group-directory";
import { HistoryTabs } from "@/features/groups/ui/history-tabs";
import { GROUP_WALLET_CHANGED_EVENT, useGroupResource } from "@/features/groups/ui/use-group-resource";
import type { AppLocale } from "@/i18n/locales";
import { historySchema, walletSchema } from "@/server/group-wallet/domain";
import { ticketSingular, walletCopy } from "./copy";
import { walletHistoryLabel } from "./history-label";
import styles from "./stan-history.module.css";

type Entry = ReturnType<typeof historySchema.parse>["entries"][number];
const parseHistory = (value: unknown) => historySchema.parse(value);
const parseWallet = (value: unknown) => walletSchema.parse(value);
const t = (locale: AppLocale, key: Parameters<typeof dukjilText>[1], values?: unknown[]) => dukjilText(locale, key, values);
/** Rows the history tab shows before 더 보기 (plan-ux r5.1 3.3). */
export const HISTORY_TAB_ROWS = 20;
const isTicket = (asset: string) => asset === "ticket" || asset === "support_voucher";

/** Ledger dates (DESIGN §4 날짜): `2026.11.08` in Seoul time. */
export function ledgerDate(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Seoul" }).formatToParts(new Date(value));
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}.${part("month")}.${part("day")}`;
}

function amountText(locale: AppLocale, entry: Entry) {
  const sign = entry.amount > 0 ? "+" : "", value = `${sign}${entry.amount.toLocaleString(locale)}`;
  if (entry.asset === "fan_point") return `${value}P`;
  if (isTicket(entry.asset)) return locale === "ko" ? `${value}장` : `${value} ${Math.abs(entry.amount) === 1 ? ticketSingular[locale] ?? walletCopy(locale).tickets : walletCopy(locale).tickets}`;
  return value;
}

/** One transaction row (72 / 100 from 1024 in the tab): what happened (15/700) over where and when (12), the signed amount on the right in ink (no colour split). */
function TransactionRow({ locale, entry, withDate }: { locale: AppLocale; entry: Entry; withDate: boolean }) {
  const label = walletHistoryLabel(locale, entry.sourceType, entry) ?? walletCopy(locale).history;
  const time = new Date(entry.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Seoul" });
  // Aside: where · day; tab rows sit under their day head, so where · time.
  const meta = [entry.pageName, withDate ? ledgerDate(entry.createdAt) : time].filter(Boolean).join(" · ");
  return <li className={styles.row} data-row="transaction">
    <span className={styles.rowCopy}><span className={styles.rowTitle}>{label}</span>{meta ? <span className={styles.rowMeta} data-meta=""><time dateTime={entry.createdAt}>{meta}</time></span> : null}</span>
    <strong className={styles.amount}>{amountText(locale, entry)}</strong>
  </li>;
}

function useHistory(url: string | null) {
  const history = useGroupResource(url, parseHistory);
  useEffect(() => { window.addEventListener(GROUP_WALLET_CHANGED_EVENT, history.retry); return () => window.removeEventListener(GROUP_WALLET_CHANGED_EVENT, history.retry); }, [history.retry]);
  return history;
}

function ErrorLine({ locale, retry }: { locale: AppLocale; retry: () => void }) {
  return <div className={styles.error} role="alert"><span>{walletCopy(locale).error}</span><FanAction variant="text" onClick={retry}>{walletCopy(locale).retry}</FanAction></div>;
}

/** 내역 card of the 덕질 aside (plan-ux r5.1 3.2, 보조 2): the last three rows and `전체 보기 ›` to the history tab. Guests see three locked rows in the same outline. */
export function StanHistoryCard({ locale, guest, href, onAll, onFailure }: { locale: AppLocale; guest: boolean; href: string; onAll?: () => void; onFailure?: (failed: boolean, retry: () => void) => void }) {
  const history = useHistory(guest ? null : "/api/me/wallet/history");
  const failed = Boolean(history.error), settled = !history.loading, report = useRef(onFailure), retry = useRef(history.retry);
  useEffect(() => { report.current = onFailure; retry.current = history.retry; });
  useEffect(() => { if (!guest && settled) report.current?.(failed, () => retry.current()); }, [guest, settled, failed]);
  const entries = history.data?.entries.slice(0, 3) ?? [];
  return <section className={styles.card} id="stan-history" tabIndex={-1} aria-labelledby="stan-history-title" data-block="aside-card">
    <div className={styles.head}><FanHeading id="stan-history-title">{t(locale, "stanTabHistory")}</FanHeading>{guest ? <FanLockedValue locale={locale} /> : <Link className={styles.all} href={href as Route} scroll={false} onClick={onAll}>{seeAllLabel[locale]}<FanIcon icon={ChevronRight} size={16} /></Link>}</div>
    <div className={styles.box}>
      {guest ? <FanLockedRows rows={3} className={styles.locked} />
        : history.loading ? <ul className={styles.list} aria-busy="true">{[0, 1, 2].map(index => <li key={index} className={styles.row} data-row="transaction"><span className={styles.rowCopy}><FanSkeleton width={96} height={16} /><FanSkeleton width={120} height={12} /></span><FanSkeleton width={40} height={16} /></li>)}</ul>
        : failed ? <ErrorLine locale={locale} retry={history.retry} />
        : entries.length === 0 ? <p className={styles.empty}>{t(locale, "historyEmpty")}</p>
        : <ul className={styles.list}>{entries.map(entry => <TransactionRow key={entry.id} locale={locale} entry={entry} withDate />)}</ul>}
    </div>
  </section>;
}

/** 덕질 내역 탭 (plan-ux r5.1 3.3, `?tab=history`): the balance line, the segment (적립·사용 │ 참여), rows grouped by day, 20 then 더 보기. One column, 720 wide. */
export function StanHistoryTab({ locale, guest }: { locale: AppLocale; guest: boolean }) {
  const w = walletCopy(locale);
  const [all, setAll] = useState(false);
  const wallet = useGroupResource(guest ? null : "/api/me/wallet", parseWallet);
  const history = useHistory(guest ? null : all ? "/api/me/wallet/history?limit=100" : "/api/me/wallet/history");
  const entries = history.data?.entries ?? [];
  const shown = all ? entries : entries.slice(0, HISTORY_TAB_ROWS);
  const more = !all && entries.length > HISTORY_TAB_ROWS || (!all && entries.length >= 30);
  const days: Array<[string, Entry[]]> = [];
  for (const entry of shown) { const day = ledgerDate(entry.createdAt), last = days.at(-1); if (last && last[0] === day) last[1].push(entry); else days.push([day, [entry]]); }
  return <section className={styles.tab} aria-labelledby="stan-history-tab-title" data-block="list">
    <div className={styles.srOnly}><FanHeading id="stan-history-tab-title">{t(locale, "stanTabHistory")}</FanHeading></div>
    <div className={styles.balanceLine} data-row="balance">
      <span className={styles.balanceMain}><span>{t(locale, "historyBalance")}</span>{guest ? <FanLockedValue locale={locale} /> : wallet.data ? <FanNumber value={wallet.data.points} size="md" countUp locale={locale} unit="P" className={styles.balanceNumber} /> : wallet.loading ? <FanSkeleton width={96} height={24} /> : null}</span>
      <span className={styles.balanceSide}><span>{w.tickets}</span>{guest ? <FanLockedValue locale={locale} /> : wallet.data ? <strong>{t(locale, "walletTicketsValue", [wallet.data.tickets.toLocaleString(locale)])}</strong> : null}</span>
    </div>
    <HistoryTabs locale={locale} active="ledger" />
    <div className={styles.box}>
      {guest ? <FanLockedRows rows={3} className={styles.locked} />
        : history.loading && !history.data ? <ul className={styles.list} aria-busy="true">{[0, 1, 2, 3, 4].map(index => <li key={index} className={`${styles.row} ${styles.tabRow}`} data-row="transaction"><span className={styles.rowCopy}><FanSkeleton width={120} height={16} /><FanSkeleton width={80} height={12} /></span><FanSkeleton width={48} height={16} /></li>)}</ul>
        : history.error ? <ErrorLine locale={locale} retry={history.retry} />
        : entries.length === 0 ? <p className={styles.empty}>{t(locale, "historyEmpty")}</p>
        : days.map(([day, list]) => <div key={day} className={styles.day}>
          <p className={styles.dayHead} id={`stan-day-${day}`}>{day}</p>
          <ul className={`${styles.list} ${styles.tabList}`} aria-labelledby={`stan-day-${day}`}>{list.map(entry => <TransactionRow key={entry.id} locale={locale} entry={entry} withDate={false} />)}</ul>
        </div>)}
    </div>
    {guest ? <FanAction variant="primary" fullWidth href={fanLoginHref(locale, `/benefits?tab=history&locale=${locale}`)}>{w.login}</FanAction> : null}
    {more && !guest && !history.error ? <FanAction variant="text" className={styles.more} onClick={() => setAll(true)}>{groupsCopy(locale).more}</FanAction> : null}
  </section>;
}
