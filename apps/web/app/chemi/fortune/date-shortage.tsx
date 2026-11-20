"use client";
import { ReadingText, useReadingCopy } from "@/features/chemi/i18n/reading-ui";
import { FanAction } from "@/components/fan-ui/fan-action";
import styles from "./result.module.css";

<<<<<<< HEAD
/** Not enough points: an enabled checkout offers the test top-up first, every environment offers attendance. */
=======
>>>>>>> 4f1d47ae8
export function DateShortage({
  shortBy,
  locale,
  busy,
  onCancel,
}: {
  shortBy: number;
  locale: string;
  busy: boolean;
  onCancel: () => void;
}) {
  const text = useReadingCopy();
  return (
    <>
      <p>{text("pointsShort", { points: shortBy })}</p>
      <div className={styles.purchaseActions}>
<<<<<<< HEAD
        {topupHref && (
          <FanAction
            variant="primary"
            size="lg"
            href={topupHref}
          >
            <ReadingText id="testTopup" />
          </FanAction>
        )}
=======
>>>>>>> 4f1d47ae8
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
