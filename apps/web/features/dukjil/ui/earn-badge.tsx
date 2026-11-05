"use client";
import { Check, Stamp } from "lucide-react";
import type { AppLocale } from "@/i18n/locales";
import type { DukjilActionKey } from "@/features/passport/domain/dukjil-types";
import { todayItem } from "../domain/dukjil-ui";
import { dukjilText } from "./dukjil-copy";
import { useDukjil } from "./dukjil-provider";
import styles from "./dukjil.module.css";

export type EarnBadgeProps = {
  variant: "icon" | "inline" | "done";
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

/** Badge fed by the catalog (points, stamp) and the shared `today` read (remaining, done). Nothing renders until the server has answered, and a finished action shows the done badge. */
export function EarnActionBadge({ action, locale, variant = "inline", stamp = false, className }: { action: DukjilActionKey; locale: AppLocale; variant?: "icon" | "inline"; stamp?: boolean; className?: string }) {
  const state = useDukjil();
  const item = todayItem(state?.today, action);
  const rule = state?.catalog?.rules[action] as { points?: unknown; stamp?: unknown } | undefined;
  if (!item || !rule) return null;
  const points = typeof rule.points === "number" ? rule.points : undefined;
  if (item.remaining === 0) return <EarnBadge variant="done" locale={locale} className={className} />;
  return <EarnBadge variant={variant} locale={locale} points={points} stamp={stamp && typeof rule.stamp === "string"} remaining={item.remaining} className={className} />;
}
