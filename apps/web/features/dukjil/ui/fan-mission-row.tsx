"use client";
import { Check, ChevronDown } from "@/components/fan-ui/stan-icons";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import Link from "next/link";
import type { Route } from "next";
import type { MouseEvent, ReactNode } from "react";
import { FanCollapsibleTrigger, type FanCollapsibleTriggerProps } from "@/components/fan-ui/fan-collapsible";
import styles from "./fan-mission-row.module.css";

/** r5.1 미션 행 (plan-ux 4-B, DESIGN 목록 행 템플릿 mission 64): `40 (1px line circle, lucide 20) │ 1fr │ 96/120`, gap 12, padding 12·16.
 * Title 15/700 with `0/3` 12 beside it (gap 8), the 2px bar 4 below at the title's x (64), one trailing thing: `+20P` 15/700 in ink or `✓ 완료`.
 * The whole row is the link (출석 too: no button inside). Used by every 덕질 list — today's missions, more missions, certifications. */
export function FanMissionRow({ href, art, title, detail, trailing, onClick, status, dataMission, done }: {
  href: string; art?: ReactNode | null; title: ReactNode; detail?: ReactNode; trailing?: ReactNode;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void; status?: string; dataMission?: string; done?: boolean;
}) {
  return <li className={styles.item} data-mission={dataMission} data-status={status} data-done={done === undefined ? undefined : String(done)}>
    <Link className={styles.row} href={href as Route} onClick={onClick} data-fan-mission-row="" data-row="mission">
      <RowBody art={art} title={title} detail={detail} trailing={trailing} />
    </Link>
  </li>;
}

function RowBody({ art, title, detail, trailing }: { art?: ReactNode; title: ReactNode; detail?: ReactNode; trailing?: ReactNode }) {
  return <>
    {art === null ? null : <span className={styles.art} aria-hidden="true" data-mission-art="">{art}</span>}
    <span className={styles.copy}>
      <span className={styles.title} data-mission-title="">{title}</span>
      {detail ? <span className={styles.detail} data-mission-detail="">{detail}</span> : null}
    </span>
    <span className={styles.trailing} data-mission-trailing="">{trailing}</span>
  </>;
}

/** A folded group's head drawn as a mission row of the same height without the circle (title at x = 16): `그 밖의 미션 9개 … +465P ˅`.
 * `FanCollapsible` hands it the aria contract; `count` sits beside the title, `points` and the chevron in the trailing column. */
export function FanMissionFoldRow({ title, count, points, ...triggerProps }: FanCollapsibleTriggerProps & { title: ReactNode; count?: ReactNode; points?: ReactNode }) {
  return <FanCollapsibleTrigger {...triggerProps} className={`${styles.row} ${styles.fold}`} data-fan-mission-row="fold" data-row="mission">
    <RowBody art={null} title={<><span>{title}</span>{count ? <span className={styles.count}>{count}</span> : null}</>} trailing={<>{points ? <span className={styles.reward}>{points}</span> : null}<FanIcon icon={ChevronDown} size={16} className={styles.chevron} /></>} />
  </FanCollapsibleTrigger>;
}

/** The reward in the trailing column: `+20P` in ink, no coin (8장 ⑥). */
export function MissionReward({ points, locale }: { points: number; locale: string }) {
  return <span className={styles.reward} data-mission-reward="">+{points.toLocaleString(locale)}P</span>;
}

/** The done tag: `✓ 완료`, a grey pill of 20 (11/700). */
export function MissionDone({ label }: { label: string }) {
  return <span className={styles.done} data-badge="" data-mission-done=""><FanIcon icon={Check} size={16} />{label}</span>;
}

/** The progress under a title: a 2px bar (160 / 240 from 1024) at the title's x. */
export function MissionBar({ value, max, label }: { value: number; max: number; label: string }) {
  return <span className={styles.bar} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(value, max)}><i style={{ width: `${Math.min(100, Math.round((value / Math.max(1, max)) * 100))}%` }} /></span>;
}

/** The list the rows sit in: inside a fold it draws only the dividers; on its own (`framed`) it is the outlined card. */
export function FanMissionList({ framed = false, children, className, ...data }: { framed?: boolean; children: ReactNode; className?: string } & { [key: `data-${string}`]: string | undefined }) {
  return <ul className={[styles.list, framed ? styles.framed : "", className ?? ""].filter(Boolean).join(" ")} {...data}>{children}</ul>;
}

/** Stamp art image for a row (decorative), 28 inside the 40 circle. */
export function MissionArt({ src }: { src: string }) {
  return <img src={src} alt="" width={28} height={28} loading="lazy" />;
}
