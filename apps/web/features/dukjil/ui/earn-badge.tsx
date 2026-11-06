"use client";
import { Check, Stamp } from "lucide-react";
import type { ReactNode } from "react";
import type { AppLocale } from "@/i18n/locales";
import type { DukjilActionKey } from "@/features/passport/domain/dukjil-types";
import { todayItem } from "../domain/dukjil-ui";
import { dukjilText } from "./dukjil-copy";
import { useDukjil } from "./dukjil-provider";
import cornerStyles from "@/components/fan-ui/earn-corner.module.css";
import styles from "./dukjil.module.css";

export type EarnBadgeProps = {
  /** `corner`: 버튼 모서리에 걸치는 코인 + `+20`. `EarnBadgeCorner`로 버튼을 감싸서 쓴다. */
  variant: "icon" | "inline" | "done" | "corner";
  locale: AppLocale;
  points?: number;
  stamp?: boolean;
  /** Remaining count exactly as the `today` response returns it. */
  remaining?: number | null;
  className?: string;
};

/** Point badge for buttons and tiles. State is carried by shape and text, never by colour alone; the hidden text names the points for screen readers. */
export function EarnBadge({ variant, locale, points, stamp = false, remaining = null, className = "" }: EarnBadgeProps) {
  const cls = `${styles.badge} ${styles[variant]} ${className}`;
  if (variant === "done") {
    return <span className={cls} data-earn-badge="done"><Check size={12} aria-hidden="true" /><span>{dukjilText(locale, "dukjilBadgeDone")}</span></span>;
  }
  const label = points === undefined ? undefined : dukjilText(locale, "dukjilEarnLabel", [points.toLocaleString(locale)]);
  if (variant === "corner") {
    return <span className={[cornerStyles.badge, className].filter(Boolean).join(" ")} data-earn-badge="corner"><img src="/images/economy/point-coin.svg" width={16} height={16} alt="" aria-hidden="true" />{points !== undefined && <span aria-hidden="true">+{points.toLocaleString(locale)}</span>}{label && <span className={styles.srOnly}>{label}</span>}</span>;
  }
  if (variant === "icon") {
    return <span className={cls} data-earn-badge="icon"><span aria-hidden="true">P</span>{label && <span className={styles.srOnly}>{label}</span>}</span>;
  }
  return (
    <span className={cls} data-earn-badge="inline">
      {points !== undefined && <span aria-hidden="true">+{points.toLocaleString(locale)}P</span>}
      {stamp && <span aria-hidden="true" className={styles.stampPart}>{points !== undefined && "· "}<Stamp size={12} />{dukjilText(locale, "dukjilStamp")}</span>}
      {remaining !== null && remaining > 0 && <span aria-hidden="true" className={styles.remaining}>×{remaining}</span>}
      {label && <span className={styles.srOnly}>{label}</span>}
    </span>
  );
}

/** Badge fed by the catalog (points, stamp) and the shared `today` read (remaining, done). A signed-in viewer sees nothing until `today` has answered, and a finished action shows the done badge.
 * A signed-out viewer sees the policy points only: the remaining count and `done` are personal values. An inactive catalog draws nothing. */
export function EarnActionBadge({ action, locale, variant = "inline", stamp = false, className }: { action: DukjilActionKey; locale: AppLocale; variant?: "icon" | "inline" | "corner"; stamp?: boolean; className?: string }) {
  const state = useDukjil();
  const item = todayItem(state?.today, action);
  const rule = state?.catalog?.rules[action] as { points?: unknown; stamp?: unknown } | undefined;
  if (!rule) return null;
  const points = typeof rule.points === "number" ? rule.points : undefined;
  if (!state?.authenticated) return <EarnBadge variant={variant} locale={locale} points={points} stamp={stamp && typeof rule.stamp === "string"} className={className} />;
  if (!item) return null;
  if (item.remaining === 0) return <EarnBadge variant="done" locale={locale} className={className} />;
  return <EarnBadge variant={variant} locale={locale} points={points} stamp={stamp && typeof rule.stamp === "string"} remaining={item.remaining} className={className} />;
}

/** 버튼 오른쪽 위에 `corner` 뱃지를 걸친다. 뱃지가 버튼 밖 형제라 버튼이 비활성이어도 색을 유지하고, 누름은 버튼으로 통과한다. */
export function EarnBadgeCorner({ action, locale, className, children }: { action: DukjilActionKey; locale: AppLocale; className?: string; children: ReactNode }) {
  return <span className={[cornerStyles.host, className ?? ""].filter(Boolean).join(" ")}>{children}<EarnActionBadge action={action} locale={locale} variant="corner" /></span>;
}
