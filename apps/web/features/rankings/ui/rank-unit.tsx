import { Heart } from "@/components/fan-ui/fan-icons";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import styles from "./rank-unit.module.css";

/** The unit of a ranking number as the asset the app already uses for it, never the letter P or a word: points are the coin, hearts the glossy heart, tickets the ticket, likes the filled heart. */
export type RankUnitKind = "points" | "likes" | "hearts" | "tickets";
const SIZE = 16;
export function RankUnit({ unit }: { unit: RankUnitKind }) {
  if (unit === "points") return <img src="/images/economy/point-coin.svg" alt="" width={SIZE} height={SIZE} className={styles.mark} data-unit="points" />;
  if (unit === "tickets") return <img src="/images/economy/ticket.svg" alt="" width={SIZE} height={SIZE} className={styles.mark} data-unit="tickets" />;
  if (unit === "hearts") return <img src="/images/economy/heart.svg" alt="" width={SIZE} height={SIZE} className={styles.mark} data-unit="hearts" />;
  return <FanIcon icon={Heart} size={SIZE} filled className={styles.like} />;
}
