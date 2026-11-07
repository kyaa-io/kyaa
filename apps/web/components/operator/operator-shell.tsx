"use client";

import { CalendarDays, Megaphone } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import styles from "@/components/admin/operations.module.css";
import { fanLoginHref } from "@/components/login-href";
import { useOperatorChannels, type OperatorChannel, type OperatorChannelsState } from "./use-operator-channels";

type Locale = "ko" | "en";
type Ready = Extract<OperatorChannelsState, { status: "authorized" }>;
const suffix = (locale: Locale) => (locale === "en" ? "?lang=en" : "");
export const operatorChannelName = (channel: OperatorChannel, locale: Locale) => (locale === "ko" ? channel.nameKo : channel.nameEn);
export const operatorMenu = [
  { key: "notices", icon: Megaphone, ko: "공지", en: "Notices" },
  { key: "schedules", icon: CalendarDays, ko: "공식 일정", en: "Official schedule" },
] as const;

export function OperatorFrame({ locale, channelId, children }: { locale: Locale; channelId?: string; children: (session: Ready, channel: OperatorChannel | null) => ReactNode }) {
  const session = useOperatorChannels();
  const pathname = usePathname();
  const ko = locale === "ko";
  if (session.status !== "authorized") return <OperatorAccessState status={session.status} locale={locale} />;
  const channel = channelId ? session.channels.find(item => item.id === channelId) ?? null : null;
  if (channelId && !channel) return <OperatorAccessState status="denied" locale={locale} />;
  return <div className={styles.adminPage}>
    <header className={styles.topbar}><Link className={styles.brand} href={`/operator${suffix(locale)}` as Route}>kyaa <span>{ko ? "채널 운영" : "Channel operations"}</span></Link></header>
    <div className={styles.layout} style={{ gridTemplateColumns: "minmax(0, 1fr)" }}><main className={styles.workspace} style={{ width: "100%", maxWidth: 1120, marginInline: "auto" }}>
      {channel && <nav aria-label={ko ? "채널 운영 메뉴" : "Channel operations menu"} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {operatorMenu.map(item => { const href = `/operator/${channel.id}/${item.key}`; const current = pathname === href; return <Link key={item.key} className={styles.primaryLink} aria-current={current ? "page" : undefined} style={current ? undefined : { background: "var(--control)", color: "var(--ink)" }} href={`${href}${suffix(locale)}` as Route}>{ko ? item.ko : item.en}</Link>; })}
      </nav>}
      {children(session, channel)}
    </main></div>
  </div>;
}

export function OperatorAccessState({ status, locale }: { status: "loading" | "unauthenticated" | "denied"; locale: Locale }) {
  const ko = locale === "ko";
  // 로그인 뒤 보던 채널 운영 화면으로 돌아온다(2회차 버튼 표: 로그인 링크에 복귀 주소 없음).
  const pathname = usePathname() || "/operator";
  const actionHref: string = status === "unauthenticated" ? String(fanLoginHref(locale, `${pathname}${ko ? "" : "?lang=en"}`)) : "/";
  const title = status === "loading" ? (ko ? "채널 운영 권한 확인 중" : "Checking channel access")
    : status === "unauthenticated" ? (ko ? "로그인이 필요합니다" : "Sign-in required")
      : (ko ? "채널 운영 권한이 없습니다" : "No channel operator access");
  return <main className={styles.accessPage}><section className={styles.accessPanel} aria-live="polite"><h1>{title}</h1>{status !== "loading" && <Link className={styles.primaryLink} href={actionHref as Route}>{status === "unauthenticated" ? (ko ? "로그인" : "Sign in") : (ko ? "홈으로" : "Home")}</Link>}</section></main>;
}

export function OperatorHome({ locale }: { locale: Locale }) {
  const ko = locale === "ko";
  return <OperatorFrame locale={locale}>{session => <>
    <div className={styles.pageHeading}><h1>{ko ? "채널 운영" : "Channel operations"}</h1></div>
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 16 }}>
      {session.channels.map(channel => <li key={channel.id} style={{ border: "1px solid var(--line)", borderRadius: 12, background: "#fff", padding: 16 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>{operatorChannelName(channel, locale)}</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{operatorMenu.map(item => { const Icon = item.icon; return <Link key={item.key} className={styles.primaryLink} href={`/operator/${channel.id}/${item.key}${suffix(locale)}` as Route}><Icon size={16} aria-hidden="true" style={{ marginRight: 8 }} />{ko ? item.ko : item.en}</Link>; })}</div>
      </li>)}
    </ul>
  </>}</OperatorFrame>;
}
