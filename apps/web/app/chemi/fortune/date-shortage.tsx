"use client";
import { ReadingText, useReadingCopy } from "@/features/chemi/i18n/reading-ui";
import { FanAction } from "@/components/fan-ui/fan-action";
import styles from "./result.module.css";

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
