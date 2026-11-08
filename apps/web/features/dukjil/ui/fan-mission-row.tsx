"use client";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import type { MouseEvent, ReactNode } from "react";
import styles from "./fan-mission-row.module.css";

/** feedback D1: the one row of every 덕질 list — today's missions, more missions, certifications and the 오늘의 덕질 empty row.
 * Same box everywhere: stamp art 40 (48 from 1024px) · title with its reward badge on the right · one line below (progress or state) · one
 * trailing slot (an arrow by default, a short action or the done tag). Height 64 at least, padding 12, divider lines from the list. */
export function FanMissionRow({ href, art, title, badge, detail, trailing, onClick, status, dataMission, done }: {
  href: string; art?: ReactNode; title: ReactNode; badge?: ReactNode; detail?: ReactNode; trailing?: ReactNode;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void; status?: string; dataMission?: string; done?: boolean;
}) {
  return <li className={styles.item} data-mission={dataMission} data-status={status} data-done={done === undefined ? undefined : String(done)}>
    <Link className={styles.row} href={href as Route} onClick={onClick} data-fan-mission-row="">
      <span className={styles.art} aria-hidden="true">{art}</span>
      <span className={styles.copy}>
        <span className={styles.titleRow}><strong>{title}</strong>{badge ? <span className={styles.badge}>{badge}</span> : null}</span>
        {detail ? <span className={styles.detail}>{detail}</span> : null}
      </span>
      <span className={styles.trailing}>{trailing ?? <ArrowRight size={16} aria-hidden="true" className={styles.arrow} />}</span>
    </Link>
  </li>;
}

/** The list the rows sit in: inside a fold it draws only the dividers; on its own (`framed`) it is the outlined card. */
export function FanMissionList({ framed = false, children, className, ...data }: { framed?: boolean; children: ReactNode; className?: string } & { [key: `data-${string}`]: string | undefined }) {
  return <ul className={[styles.list, framed ? styles.framed : "", className ?? ""].filter(Boolean).join(" ")} {...data}>{children}</ul>;
}

/** Stamp art image for a row (decorative). */
export function MissionArt({ src }: { src: string }) {
  return <img src={src} alt="" width={40} height={40} loading="lazy" />;
}
