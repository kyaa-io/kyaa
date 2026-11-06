import type { ReactNode } from "react";

import { FanSkeleton } from "./fan-skeleton";
import styles from "./fan-state.module.css";

type FanStateProps = Readonly<{
  kind: "loading" | "empty" | "error" | "auth";
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
  /** 화면 일부 구역의 상태. 최소 높이·제목 수준 없이 문단으로 렌더한다. */
  inline?: boolean;
  /** 구역 안의 한 줄 상태: 제목과 행동이 한 줄(좁으면 줄바꿈)이고 제목은 소제목보다 크지 않다. `inline`과 함께 쓴다. */
  compact?: boolean;
}>;

export function FanState({
  kind,
  title,
  description,
  icon,
  actions,
  className,
  inline = false,
  compact = false,
}: FanStateProps) {
  return (
    <section
      className={[styles.state, inline ? styles.inline : "", compact ? styles.compact : "", className ?? ""].filter(Boolean).join(" ")}
      role={kind === "error" ? "alert" : "status"}
      aria-live={kind === "error" ? "assertive" : "polite"}
      aria-busy={kind === "loading"}
    >
      {icon}
      {kind === "loading" ? <p className={styles.srOnly}>{title}</p> : inline ? <p className={styles.title}>{compact ? title.replace(/[.。]$/, "") : title}</p> : <h2>{title}</h2>}
      {description ? <p>{description}</p> : null}
      {kind === "loading" ? <FanSkeleton width={120} height={16} /> : null}
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </section>
  );
}
