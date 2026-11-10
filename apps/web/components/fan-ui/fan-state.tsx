import type { ReactNode } from "react";

import { FanAction } from "./fan-action";
import { FanSkeleton } from "./fan-skeleton";
import styles from "./fan-state.module.css";

type StateBase = Readonly<{
  title: string;
  className?: string;
  /** 화면 일부 구역의 상태. 최소 높이·제목 수준 없이 문단으로 렌더한다. */
  inline?: boolean;
  /** 구역 안의 한 줄 상태: 제목과 행동이 한 줄(좁으면 줄바꿈)이고 제목은 소제목보다 크지 않다. `inline`과 함께 쓴다. */
  compact?: boolean;
}>;

type StateSlots = Readonly<{ description?: string; icon?: ReactNode; actions?: ReactNode }>;

/**
 * 빈 상태(DESIGN.md "빈 상태" 행, C6·C8, 게이트 D2 2026-11-09, 2026-11-10 R7 개정): 구역 안이든 페이지 전체든 한 문장 14/400 회색. 아이콘·설명·임의 행동 슬롯은 받지 않는다.
 * 다음 행동은 `action` 하나(실제 이동 경로 링크 1개)만 받는다. 채운 상태와 같은 카드 구조를 유지하고 행동 2개 이상은 만들지 않는다.
 */
type SectionEmptyProps = StateBase & Readonly<{ kind: "empty"; action?: Readonly<{ label: string; href: string }>; description?: never; icon?: never; actions?: never }>;

type OtherStateProps = StateBase & StateSlots & Readonly<{
  /** `loading`은 폐기 예정(DESIGN.md 로딩 행, design-lint C6): 새 코드는 `FanSkeleton`·`FanSkeletonRows`. 남은 사용처는 로그인 세션 동기화 한 곳. */
  kind: "loading" | "error" | "auth";
}>;

type FanStateProps = SectionEmptyProps | OtherStateProps;

export function FanState(props: FanStateProps) {
  const { kind, title, className } = props;
  if (kind === "empty") {
    return (
      <section className={[styles.state, styles.section, className ?? ""].filter(Boolean).join(" ")} role="status" aria-live="polite" data-empty-state="section">
        <p className={styles.title}>{title.replace(/[.。]$/, "")}</p>
        {props.action ? <FanAction variant="primary" href={props.action.href}>{props.action.label}</FanAction> : null}
      </section>
    );
  }
  const { description, icon, actions, inline = false, compact = false } = props as StateBase & StateSlots;
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
