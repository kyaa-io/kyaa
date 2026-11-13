import { RewardIcon } from "@/components/fan-ui/reward-icon";
import { ThumbsUp } from "@/components/fan-ui/fan-icons";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import styles from "./rank-unit.module.css";

/** The unit of a ranking number as the asset the app already uses for it, never the letter P or a word: points are the coin, hearts the glossy heart, tickets the ticket. Page likes are the thumbs-up of the post reactions (대표 11/13 08:50: a heart read as hearts). */
export type RankUnitKind = "points" | "likes" | "hearts" | "tickets";
const SIZE = 16;
export function RankUnit({ unit }: { unit: RankUnitKind }) {
  if (unit === "points") return <RewardIcon kind="point" alt="" width={SIZE} height={SIZE} className={styles.mark} data-unit="points" />;
  if (unit === "tickets") return <RewardIcon kind="ticket" alt="" width={SIZE} height={SIZE} className={styles.mark} data-unit="tickets" />;
  if (unit === "hearts") return <RewardIcon kind="heart" alt="" width={SIZE} height={SIZE} className={styles.mark} data-unit="hearts" />;
  return <FanIcon icon={ThumbsUp} size={SIZE} className={styles.like} data-unit="likes" />;
}
