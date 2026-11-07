"use client";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import styles from "./reward-done.module.css";

/** Finished reward inside an open dialog: one picture popping in, what was received, what it cost, one action. Shared by the ad exchange and the missions all-clear. */
export function RewardDone({ image, title, value, detail, actionLabel, onAction }: { image: string; title: string; value: string; detail?: string; actionLabel: string; onAction: () => void }) {
  return <section className={styles.done} role="status" data-reward-done>
    <span className={styles.art} aria-hidden="true"><i /><i /><i /><i /><i /><i /><img src={image} alt="" width={96} height={96} /></span>
    <FanHeading as="h3">{title}</FanHeading>
    <strong className={styles.value}>{value}</strong>
    {detail && <p className={styles.detail}>{detail}</p>}
    <FanAction variant="primary" fullWidth onClick={onAction}>{actionLabel}</FanAction>
  </section>;
}
