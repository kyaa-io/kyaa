"use client";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import type { MouseEvent, MouseEventHandler, ReactNode } from "react";
import styles from "./fan-mission-row.module.css";

/** feedback D1 · F3: the one row of every 덕질 list — today's missions, more missions, certifications, the folded heads and the 오늘의 덕질 empty row.
 * Same box everywhere: a 40 circle with the art (28) · title (one line 22) with an optional line below at the same x (progress or state) ·
 * one fixed trailing column (96, 120 from 1024px) holding one thing: `+NP`, a short action or the done tag. No arrow. Height 64, padding 12. */
export function FanMissionRow({ href, art, title, detail, trailing, onClick, status, dataMission, done }: {
  href: string; art?: ReactNode; title: ReactNode; detail?: ReactNode; trailing?: ReactNode;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void; status?: string; dataMission?: string; done?: boolean;
}) {
  return <li className={styles.item} data-mission={dataMission} data-status={status} data-done={done === undefined ? undefined : String(done)}>
    <Link className={styles.row} href={href as Route} onClick={onClick} data-fan-mission-row="">
      <RowBody art={art} title={title} detail={detail} trailing={trailing} />
    </Link>
  </li>;
}

function RowBody({ art, title, detail, trailing }: { art?: ReactNode; title: ReactNode; detail?: ReactNode; trailing?: ReactNode }) {
  return <>
    <span className={styles.art} aria-hidden="true" data-mission-art="">{art}</span>
    <span className={styles.copy}>
      <span className={styles.title} data-mission-title="">{title}</span>
      {detail ? <span className={styles.detail} data-mission-detail="">{detail}</span> : null}
    </span>
    <span className={styles.trailing} data-mission-trailing="">{trailing}</span>
  </>;
}

/** F3: a folded group's head drawn as a mission row (same grid, height, circle and trailing column) so the fold reads as one more row.
 * `FanCollapsible` hands it the aria contract; the trailing column holds the count and the chevron. */
export function FanMissionFoldRow({ icon, title, meta, ...triggerProps }: {
  "aria-expanded": boolean; "aria-controls": string; onClick: MouseEventHandler<HTMLElement>;
  icon: ReactNode; title: ReactNode; meta?: ReactNode;
}) {
  return <button type="button" className={`${styles.row} ${styles.fold}`} data-fan-mission-row="fold" {...triggerProps}>
    <RowBody art={icon} title={title} trailing={<>{meta ? <span className={styles.foldMeta}>{meta}</span> : null}<ChevronDown size={16} className={styles.chevron} aria-hidden="true" /></>} />
  </button>;
}

/** The list the rows sit in: inside a fold it draws only the dividers; on its own (`framed`) it is the outlined card. */
export function FanMissionList({ framed = false, children, className, ...data }: { framed?: boolean; children: ReactNode; className?: string } & { [key: `data-${string}`]: string | undefined }) {
  return <ul className={[styles.list, framed ? styles.framed : "", className ?? ""].filter(Boolean).join(" ")} {...data}>{children}</ul>;
}

/** Stamp art image for a row (decorative), 28 inside the 40 circle. */
export function MissionArt({ src }: { src: string }) {
  return <img src={src} alt="" width={28} height={28} loading="lazy" />;
}
