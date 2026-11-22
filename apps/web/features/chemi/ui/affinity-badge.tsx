import { Check } from "@/components/fan-ui/fan-icons";
import { RewardIcon } from "@/components/fan-ui/reward-icon";
import pill from "@/components/fan-ui/earn-corner.module.css";
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
  return <span role="img" aria-label={label} className={[pill.pill, styles.affinity, size === "sm" && pill.small, slot && pill.slot].filter(Boolean).join(" ")}>
    {doneLabel ? <Check size={iconSize} aria-hidden="true" /> : <RewardIcon kind="heart" size={iconSize} />}
    <span data-point-value="">{doneLabel ?? `+${amount}`}</span>
  </span>;
}
