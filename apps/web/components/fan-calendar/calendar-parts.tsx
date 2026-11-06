import Link from "next/link";
import type { Route } from "next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./calendar-parts.module.css";

type MonthControl = { label: string } & ({ href: Route; onClick?: never } | { href?: never; onClick: () => void });

/** Visual ownership only: callers retain their existing URL or local-state navigation. */
export function CalendarMonthHeader({ month, label, previous, next, headingId, density = "standard", art }: {
  month: string; label: string; previous: MonthControl; next: MonthControl; headingId?: string;
  density?: "standard" | "compact";
  /** 월 그림. 있으면 글자는 스크린리더용으로만 두고 화살표 사이 가운데에 그림을 그린다. */
  art?: ReactNode;
}) {
  function control(value: MonthControl, direction: "previous" | "next") {
    const icon = direction === "previous" ? <ChevronLeft aria-hidden="true" /> : <ChevronRight aria-hidden="true" />;
    return value.href
      ? <Link className={styles.control} href={value.href} aria-label={value.label}>{icon}</Link>
      : <button className={styles.control} type="button" onClick={value.onClick} aria-label={value.label}>{icon}</button>;
  }
  const text = <><time dateTime={month}>{label}</time>{" "}<span className={styles.zone}>KST</span></>;
  const content = art ? <><span className={styles.srOnly}>{text}</span>{art}</> : text;
  return <div className={styles.header} data-calendar-header={density} data-calendar-art-header={art ? "true" : undefined}>
    {control(previous, "previous")}
    {headingId ? <h2 id={headingId} className={styles.month}>{content}</h2> : <div className={styles.month}>{content}</div>}
    {control(next, "next")}
  </div>;
}

/** Today is always a ring around the numeral, never the reservation border. */
export function CalendarDayNumber({ date, today }: { date: string; today: string }) {
  return <time className={styles.dayNumber} dateTime={date} aria-current={date === today ? "date" : undefined}
    data-calendar-today={date === today ? "true" : undefined}>{Number(date.slice(-2))}</time>;
}
