import { Check } from "@/components/fan-ui/fan-icons";
import { RewardIcon } from "@/components/fan-ui/reward-icon";
import pill from "@/components/fan-ui/earn-corner.module.css";
import earned from "@/features/dukjil/ui/dukjil.module.css";
import styles from "./affinity-badge.module.css";

export type AffinityBadgeProps = {
  amount: number;
  label: string;
  doneLabel?: string;
  size?: "sm" | "default";
  slot?: boolean;
};

export function AffinityBadge({ amount, label, doneLabel, size, slot }: AffinityBadgeProps) {
  const iconSize = size === "sm" ? 12 : 16;
  if (doneLabel) {
    return <span role="img" aria-label={label} className={[earned.badge, earned.done, slot && pill.slot].filter(Boolean).join(" ")}>
      <Check size={12} strokeWidth={1.5} aria-hidden="true" /><span>{doneLabel}</span>
    </span>;
  }
  return <span role="img" aria-label={label} className={[pill.pill, styles.affinity, size === "sm" && pill.small, slot && pill.slot].filter(Boolean).join(" ")}>
    <RewardIcon kind="heart" size={iconSize} />
    <span data-point-value="">+{amount}</span>
  </span>;
}
