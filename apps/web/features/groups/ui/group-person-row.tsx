"use client";
import type { ReactNode } from "react";
import { ChevronRight, UserRound } from "lucide-react";
import { FanAction } from "@/components/fan-ui/fan-action";
import styles from "./group-members.module.css";

/** One fan: 56px, avatar 40, a line between rows. A button only when the viewer may open the profile. */
export function GroupPersonRow({ nickname, avatarUrl, meta, rank, rankLabel, score, onOpen, selected }: {
  nickname: string;
  avatarUrl: string | null;
  meta?: ReactNode;
  rank?: number | null;
  rankLabel?: string;
  score?: ReactNode;
  onOpen?: () => void;
  selected?: boolean;
}) {
  const body = <span className={styles.personBody}>
    {rank != null && <span className={styles.rank} aria-label={rankLabel}>{rank}</span>}
    {avatarUrl ? <img src={avatarUrl} alt="" width={40} height={40} className={styles.avatar}/> : <span className={styles.avatar}><UserRound size={22} aria-hidden="true"/></span>}
    <span className={styles.identity}><strong>{nickname}</strong>{meta != null && <span className={styles.meta}>{meta}</span>}</span>
    {score != null && <strong className={styles.score}>{score}</strong>}
    {onOpen && score == null && <ChevronRight className={styles.chevron} size={18} aria-hidden="true"/>}
  </span>;
  return <li className={styles.item} data-selected={selected || undefined}>
    {onOpen ? <FanAction variant="text" className={styles.person} onClick={onOpen}>{body}</FanAction> : <div className={`${styles.person} ${styles.personStatic}`}>{body}</div>}
  </li>;
}
