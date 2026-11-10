import { FanIcon } from "@/components/fan-ui/fan-icon";
import { Check } from "@/components/fan-ui/fan-icons";
import type { OwnedRaffleResult } from "../../benefit/domain/raffle-result";
import type { AppLocale } from "@/i18n/locales";
import { giftText, type GiftTextKey } from "./gift-text";
import styles from "./gift-stages.module.css";

type Track = { steps: readonly GiftTextKey[]; at: number };

/** The delivery track of a win and where it stands now. Each fulfillment method has its own steps; the current one is the only one marked. */
export function giftTrack(result: Pick<OwnedRaffleResult, "method" | "fulfillmentStatus">): Track | null {
  const status = result.fulfillmentStatus;
  if (!status) return null;
  if (result.method === "digital") return { steps: ["stageDigitalWait", "stageDigitalDone"], at: status === "digital_delivered" ? 1 : 0 };
  if (result.method === "on_site_pickup") {
    return { steps: ["stageInfo", "stageReady", "stagePickup", "stagePickedUp"], at: ({ information_required: 0, ready: 1, pickup_available: 2, pickup_completed: 3 } as Record<string, number>)[status] ?? 1 };
  }
  return { steps: ["stageInfo", "stageShipPrep", "stageTransit", "stageDelivered"], at: ({ information_required: 0, ready: 1, shipping_preparing: 1, shipping_in_transit: 2, shipping_completed: 3 } as Record<string, number>)[status] ?? 1 };
}

export function GiftStages({ result, locale }: Readonly<{ result: OwnedRaffleResult; locale: AppLocale }>) {
  const track = giftTrack(result);
  if (!track) return null;
  return <ol className={styles.steps} aria-label={giftText(locale, "steps")}>
    {track.steps.map((key, index) => <li key={key} data-row="" data-state={index < track.at ? "done" : index === track.at ? "current" : "next"} aria-current={index === track.at ? "step" : undefined}>
      <span className={styles.mark} aria-hidden="true">{index < track.at ? <FanIcon icon={Check} size={16} /> : index + 1}</span>
      <span className={styles.label}>{giftText(locale, key)}</span>
    </li>)}
  </ol>;
}
