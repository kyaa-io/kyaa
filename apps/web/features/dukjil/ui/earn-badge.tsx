"use client";
import { REWARD_ICON_SRC } from "@/components/fan-ui/reward-icon";
import { Check, Stamp } from "lucide-react";
import type { ReactNode } from "react";
import type { AppLocale } from "@/i18n/locales";
import type { DukjilActionKey } from "@/features/passport/domain/dukjil-types";
import { capPeriod, todayItem } from "../domain/dukjil-ui";
import { dukjilText } from "./dukjil-copy";
import { useDukjil } from "./dukjil-provider";
import cornerStyles from "@/components/fan-ui/earn-corner.module.css";
import { fanUiText } from "@/components/fan-ui/fan-ui-copy";
import { FanRewardPop } from "@/components/fan-ui/fan-motion";
import styles from "./dukjil.module.css";

export type EarnBadgeProps = {
  /** `corner`: 버튼 모서리에 걸치는 코인 + `+20`. `EarnBadgeCorner`로 버튼을 감싸서 쓴다. */
  variant: "icon" | "inline" | "done" | "corner" | "balance";
  locale: AppLocale;
  points?: number;
  stamp?: boolean;
  /** Remaining count exactly as the `today` response returns it. S4: 배지에는 그리지 않는다(화면 판독기 이름에만).
   * 보이는 남은 횟수는 행 아래 `EarnRemaining`이나 `FanGauge`가 말한다. */
  remaining?: number | null;
  /** The window `remaining` counts in: a monthly cap says "this month", never "today". */
  remainingPer?: "day" | "month";
  /** `inline`: the value is what was earned today, shown as `오늘 +22P`. */
  today?: boolean;
  /** `inline`: the small form inside the 7-day cells. */
  size?: "sm";
  className?: string;
};

/** The one coin image of every point display. */
export const POINT_COIN_SRC = REWARD_ICON_SRC.point;

/** Point badge for buttons and tiles. State is carried by shape and text, never by colour alone; the hidden text names the points for screen readers. */
export function EarnBadge({ variant, locale, points, stamp = false, remaining = null, remainingPer = "day", today = false, size, className = "" }: EarnBadgeProps) {
  const cls = `${styles.badge} ${styles[variant]} ${size === "sm" ? styles.small : ""} ${className}`;
  // S4 규칙 3: 오늘 받은 포인트가 0이면 배지를 그리지 않는다.
  if (variant === "inline" && today && (points ?? 0) <= 0) return null;
  if (variant === "done") {
    return <span className={cls} data-earn-badge="done"><Check size={12} aria-hidden="true" /><span>{dukjilText(locale, "dukjilBadgeDone")}</span></span>;
  }
  const label = points === undefined ? undefined : dukjilText(locale, "dukjilEarnLabel", [points.toLocaleString(locale)]);
  if (variant === "corner") {
    return <span className={[cornerStyles.badge, className].filter(Boolean).join(" ")} data-earn-badge="corner"><img src={POINT_COIN_SRC} width={16} height={16} alt="" aria-hidden="true" />{points !== undefined && <span aria-hidden="true">+{points.toLocaleString(locale)}</span>}{label && <span className={styles.srOnly}>{label}</span>}</span>;
  }
  if (variant === "icon") {
    return <span className={cls} data-earn-badge="icon"><span aria-hidden="true">P</span>{label && <span className={styles.srOnly}>{label}</span>}</span>;
  }
  if (variant === "balance") {
    return <span className={cls} data-earn-badge="balance"><img src={POINT_COIN_SRC} width={20} height={20} alt="" aria-hidden="true" /><span className={styles.balanceValue}>{(points ?? 0).toLocaleString(locale)}</span><span className={styles.balanceUnit}>P</span></span>;
  }
  const coin = size === "sm" ? 12 : 16;
  return (
    <span className={cls} data-earn-badge="inline">
      {points !== undefined && <img src={POINT_COIN_SRC} width={coin} height={coin} alt="" aria-hidden="true" />}
      {points !== undefined && <span aria-hidden="true">{today ? dukjilText(locale, "missionsTodayEarned", [points.toLocaleString(locale)]) : `+${points.toLocaleString(locale)}P`}</span>}
      {stamp && <span aria-hidden="true" className={styles.stampPart}>{points !== undefined && "· "}<Stamp size={12} />{dukjilText(locale, "dukjilStamp")}</span>}
      {label && <span className={styles.srOnly}>{remaining !== null && remaining > 0 ? `${label}, ${fanUiText(locale, remainingPer === "month" ? "earnRemainingMonth" : "earnRemainingToday", [remaining.toLocaleString(locale)])}` : label}</span>}
    </span>
  );
}

/** S4 보조 글자(13 muted): `오늘 3번 남음` / `3 left today`, 또는 한도 `5명까지` / `up to 5`. 배지 밖, 행 아래에 둔다.
 * 남은 횟수가 0이거나 없으면 그리지 않는다(완료는 `done` 배지가 말한다). */
export function EarnRemaining({ locale, remaining, limit, per = "day", className }: { locale: AppLocale; remaining?: number | null; limit?: number | null; per?: "day" | "month"; className?: string }) {
  const text = limit != null && limit > 0
    ? fanUiText(locale, "earnUpTo", [limit.toLocaleString(locale)])
    : remaining != null && remaining > 0
      ? fanUiText(locale, per === "month" ? "earnRemainingMonth" : "earnRemainingToday", [remaining.toLocaleString(locale)])
      : null;
  if (!text) return null;
  return <span className={[cornerStyles.remaining, className ?? ""].filter(Boolean).join(" ")} data-earn-remaining="">{text}</span>;
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
  // 미션 완료(S3): 완료로 바뀐 순간 한 번만 스탬프처럼 scale .6→1. 처음부터 완료면 연출 없음.
  // 버튼 모서리(corner) 배지는 절대 위치라 연출 중 transform이 기준 상자를 바꾼다. 연출은 타일·행 배지에만.
  const pop = variant === "corner" ? "static" : null;
  if (item.remaining === 0) return <FanRewardPop trigger={pop ?? "done"} kind="complete"><EarnBadge variant="done" locale={locale} className={className} /></FanRewardPop>;
  return <FanRewardPop trigger={pop ?? "open"} kind="complete"><EarnBadge variant={variant} locale={locale} points={points} stamp={stamp && typeof rule.stamp === "string"} remaining={item.remaining} remainingPer={capPeriod(rule)} className={className} /></FanRewardPop>;
}

/** 버튼 오른쪽 위에 `corner` 뱃지를 걸친다. 뱃지가 버튼 밖 형제라 버튼이 비활성이어도 색을 유지하고, 누름은 버튼으로 통과한다.
 * 포인트를 주는 모든 버튼(좋아요·싫어요·공유·댓글·글쓰기)의 표시는 이 한 부품, 한 자리다. `action`은 정책 카탈로그와 오늘 상태에서,
 * `points`는 호출하는 쪽이 지급 조건을 이미 판정한 값에서 그린다(공유처럼 조건이 따로 있는 행동). */
export function EarnBadgeCorner({ locale, className, children, ...source }: { locale: AppLocale; className?: string; children: ReactNode } & ({ action: DukjilActionKey; points?: never } | { points: number | undefined; action?: never })) {
  return <span className={[cornerStyles.host, className ?? ""].filter(Boolean).join(" ")}>{children}{source.action ? <EarnActionBadge action={source.action} locale={locale} variant="corner" /> : source.points !== undefined && <EarnBadge variant="corner" locale={locale} points={source.points} />}</span>;
}
