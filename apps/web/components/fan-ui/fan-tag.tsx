import { BadgeCheck } from "lucide-react";
import type { ReactNode } from "react";

import styles from "./fan-tag.module.css";

export type FanTagTone = "fan" | "neutral" | "notice" | "artist";

/** 유형·공지·인증 표시. 숫자와 설명을 넣지 않고 한 자리에 하나만 둔다. */
export function FanTag({ tone, icon, className, children }: Readonly<{ tone: FanTagTone; icon?: ReactNode; className?: string; children: ReactNode }>) {
  const leading = icon ?? (tone === "artist" ? <BadgeCheck size={12} aria-hidden="true" /> : null);
  return <span className={[styles.tag, styles[tone], className ?? ""].filter(Boolean).join(" ")} data-fan-tag={tone}>{leading}{children}</span>;
}
