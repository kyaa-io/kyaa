"use client";
import Link from "next/link";
import type { Route } from "next";
import { Bell } from "lucide-react";
import { useOwnedFanResource } from "@/components/fan-ui/use-owned-fan-resource";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { mySummaryPath, mySummarySchema } from "@/features/my/domain/my-summary";
import { toContentLocale, type AppLocale } from "@/i18n/locales";
import { translate } from "@/i18n/messages";
import { messages } from "@/i18n/catalogs/features__notification__ui__header-notification-link";
import styles from "./header-notification-link.module.css";

const parseSummary = (body: unknown) => mySummarySchema.parse((body as { summary?: unknown } | null)?.summary);

/** Shown on the badge: 1–99 as is, more as 99+. The accessible name always carries the exact count. */
export function unreadBadgeText(count: number) { return count > 99 ? "99+" : String(count); }

export function unreadLabel(locale: AppLocale, label: string, count: number) {
  if (count <= 0) return label;
  const n = count.toLocaleString(locale);
  return `${label}, ${locale === "ko" ? `안 읽은 알림 ${n}개` : translate(locale, messages.headerUnreadNotifications, "{0} unread", [n])}`;
}

/** Header bell (E6): the unread count from the one shared summary read (`unreadNotificationCount`, one row per notification, so a bundle of
 * artist comments counts once). The header already reads the same summary for the favorite, so this adds no request. Signed out or while
 * loading: the plain bell. */
export function HeaderNotificationLink({ locale, label, className }: { locale: AppLocale; label: string; className?: string }) {
  const auth = useByUsAuth();
  const summary = useOwnedFanResource(auth.authenticated ? mySummaryPath(toContentLocale(locale)) : null, parseSummary, auth);
  const count = summary.state.status === "ready" ? summary.state.data.unreadNotificationCount : 0;
  const name = unreadLabel(locale, label, count);
  return <Link className={`${className ?? ""} ${styles.link}`} href={`/notifications?locale=${locale}` as Route} aria-label={name} title={name} data-unread={count}>
    <Bell aria-hidden="true" />
    {count > 0 ? <span className={styles.badge} aria-hidden="true">{unreadBadgeText(count)}</span> : null}
  </Link>;
}
