"use client";
import { ReadingText, useReadingCopy } from "@/features/chemi/i18n/reading-ui";
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
  const text = useReadingCopy();
  return (
    <>
      <p>{text("pointsShort", { points: shortBy })}</p>
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
            <ReadingText id="testTopup" />
          </FanAction>
        )}
        <FanAction href={`/my/wallet?view=attendance&locale=${locale}`}>
          <ReadingText id="attend" />
        </FanAction>
        <FanAction variant="text" disabled={busy} onClick={onCancel}>
          <ReadingText id="cancel" />
        </FanAction>
      </div>
    </>
  );
}
