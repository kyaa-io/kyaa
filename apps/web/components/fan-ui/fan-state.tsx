import type { ReactNode } from "react";

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
}>;

export function FanState({
  kind,
  title,
  description,
  icon,
  actions,
  className,
  inline = false,
}: FanStateProps) {
  return (
    <section
      className={[styles.state, inline ? styles.inline : "", className ?? ""].filter(Boolean).join(" ")}
      role={kind === "error" ? "alert" : "status"}
      aria-live={kind === "error" ? "assertive" : "polite"}
      aria-busy={kind === "loading"}
    >
      {icon}
      {kind === "loading" ? <p>{title}</p> : inline ? <p className={styles.title}>{title}</p> : <h2>{title}</h2>}
      {description ? <p>{description}</p> : null}
      {kind === "loading" ? <span className={styles.loadingBar} aria-hidden="true" /> : null}
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </section>
  );
}
