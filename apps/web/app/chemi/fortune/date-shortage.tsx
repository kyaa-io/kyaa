"use client";
import { FanAction } from "@/components/fan-ui/fan-action";
import styles from "./result.module.css";

/** Not enough points: DEV offers the test top-up first, every environment offers attendance. */
export function DateShortage({
  shortBy,
  topupHref,
  locale,
  busy,
  onCancel,
}: {
  shortBy: number;
  topupHref?: string;
  locale: string;
  busy: boolean;
  onCancel: () => void;
}) {
  return (
    <>
      <p>{shortBy}P가 부족해요.</p>
      <div className={styles.purchaseActions}>
        {topupHref && (
          <FanAction
            variant="primary"
            size="lg"
            href={topupHref}
            onClick={(event) => {
              // The payment SDK is allowed only by the top-up document's security policy, so load that page fresh.
              event.preventDefault();
              window.location.assign(event.currentTarget.href);
            }}
          >
            시험 포인트 충전
          </FanAction>
        )}
        <FanAction href={`/my/wallet?view=attendance&locale=${locale}`}>
          출석하고 포인트 받기
        </FanAction>
        <FanAction variant="text" disabled={busy} onClick={onCancel}>
          취소
        </FanAction>
      </div>
    </>
  );
}
