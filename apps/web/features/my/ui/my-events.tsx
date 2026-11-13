"use client";
import type { Route } from "next";
import { useEffect, useState } from "react";
import Link from "../../../components/fan-ui/hover-prefetch-link";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanText } from "@/components/fan-ui/fan-text";
import { FanPrintStamp } from "@/components/fan-ui/fan-print";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { ChevronRight } from "@/components/fan-ui/fan-icons";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { rafflePolicySchema, signupEvent } from "@/features/benefit/domain/signup-event";
import { signupRaffleText } from "@/i18n/catalogs/signup-raffle";
import type { AppLocale } from "@/i18n/locales";
import { myHomeText } from "./my-home-copy";
import styles from "./my-events.module.css";

/** 이벤트 현황 한 줄. 래플·럭키드로우·찐팬100 하트 후원이 같은 줄을 쓴다. 값은 모두 서버가 준 것이다. */
export type MyEventRow = {
  key: string;
  href: string;
  title: string;
  entered: boolean;
  /** 서버가 센 내 기회 수. 받지 못했으면 없다(화면이 지어내지 않는다). */
  chances?: number;
  closesAt: number;
};

const dayMs = 86_400_000;
const seoulDay = (time: number) => {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(time)).split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!);
};
/** 마감까지 남은 날(한국 날짜 기준). 마감 당일은 D-day, 지나면 null. */
export function eventDday(closesAt: number, now: number): string | null {
  if (now > closesAt) return null;
  const days = Math.round((seoulDay(closesAt) - seoulDay(now)) / dayMs);
  return days <= 0 ? "D-day" : `D-${days}`;
}

type EntryStatus = { entered?: unknown; chances?: unknown };
const count = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;

/** 내 래플 응모 상태(GET /api/signup-event/entry). 이벤트가 꺼져 있거나 읽지 못하면 줄을 만들지 않는다. 마감 뒤에는 응모한 회원에게만 남는다. */
export function useMyEventRows(locale: AppLocale): MyEventRow[] {
  const { ready, authenticated, getAccessToken } = useByUsAuth();
  const [rows, setRows] = useState<MyEventRow[]>([]);
  useEffect(() => {
    if (!ready || !authenticated) { setRows([]); return; }
    let live = true;
    void (async () => {
      try {
        const token = await getAccessToken(); if (!token) return;
        const response = await fetch("/api/signup-event/entry", { headers: { authorization: `Bearer ${token}` } });
        if (!response.ok) return;
        const status = await response.json() as EntryStatus;
        const closesAt = Date.parse(rafflePolicySchema.parse({}).closesAt);
        const entered = status.entered === true;
        if (!live || (!entered && Date.now() > closesAt)) return;
        setRows([{ key: signupEvent.id, href: signupEvent.href, title: signupRaffleText(locale, "title"), entered, chances: entered ? count(status.chances) : undefined, closesAt }]);
      } catch { /* 못 읽으면 구역을 그리지 않는다 */ }
    })();
    return () => { live = false; };
  }, [ready, authenticated, getAccessToken, locale]);
  return rows;
}

export function MyEventRowLink({ row, locale, now }: { row: MyEventRow; locale: AppLocale; now: number }) {
  const dday = eventDday(row.closesAt, now);
  const status = row.entered ? myHomeText(locale, "eventEntered") : myHomeText(locale, "eventNotEntered");
  return <Link className={styles.row} href={`${row.href}?locale=${locale}` as Route} data-event={row.key} data-entered={row.entered}>
    <span className={styles.mark}>
      {row.entered
        ? <FanPrintStamp label="ENTERED" className={styles.stamp} />
        : <span className={styles.empty} data-empty-stamp />}
    </span>
    <span className={styles.copy}>
      <FanText role="item">{row.title}</FanText>
      <FanText role="meta">{status}{row.chances ? <> · <span className={styles.chances}>{myHomeText(locale, "eventChances", [row.chances])}</span></> : null}</FanText>
    </span>
    <FanText role="meta" className={styles.dday} data-closed={!dday || undefined}>{dday ?? myHomeText(locale, "eventClosed")}</FanText>
    <FanIcon icon={ChevronRight} className={styles.chevron} />
  </Link>;
}

/** MY 이벤트 현황: 참여할 수 있거나 참여 중인 이벤트만. 줄이 없으면(비로그인·이벤트 없음) 구역을 그리지 않는다. */
export function MyEvents({ locale, rows }: { locale: AppLocale; rows: MyEventRow[] }) {
  const [now] = useState(() => Date.now());
  if (rows.length === 0) return null;
  return <section className={styles.section} aria-labelledby="my-events-title">
    <FanHeading id="my-events-title">{myHomeText(locale, "eventsTitle")}</FanHeading>
    <ul className={styles.list}>{rows.map(row => <li key={row.key} data-row><MyEventRowLink row={row} locale={locale} now={now} /></li>)}</ul>
  </section>;
}

export function MyEventsSection({ locale }: { locale: AppLocale }) {
  return <MyEvents locale={locale} rows={useMyEventRows(locale)} />;
}
