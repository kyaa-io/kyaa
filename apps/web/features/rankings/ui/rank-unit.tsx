import { RewardIcon } from "@/components/fan-ui/reward-icon";
import { Heart } from "@/components/fan-ui/fan-icons";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import styles from "./rank-unit.module.css";

/** The unit of a ranking number as the asset the app already uses for it, never the letter P or a word: points are the coin, hearts the glossy heart, tickets the ticket. Page likes are the flat heart of the post list's like count (대표 11/14 02:14: a thumbs-up is not the like count; the glossy heart stays the 찐팬 hearts). */
export type RankUnitKind = "points" | "likes" | "hearts" | "tickets";
const SIZE = 16;
/** `size` is 20 only for the 찐팬 hearts in a creator's opened row (대표 11/14 02:11: too small); everywhere else the unit is 16. */
export function RankUnit({ unit, size = SIZE }: { unit: RankUnitKind; size?: 16 | 20 }) {
  if (unit === "points") return <RewardIcon kind="point" alt="" width={SIZE} height={SIZE} className={styles.mark} data-unit="points" />;
  if (unit === "tickets") return <RewardIcon kind="ticket" alt="" width={SIZE} height={SIZE} className={styles.mark} data-unit="tickets" />;
  if (unit === "hearts") return <RewardIcon kind="heart" alt="" width={size} height={size} className={styles.mark} data-unit="hearts" />;
  return <FanIcon icon={Heart} size={SIZE} filled className={styles.like} data-unit="likes" />;
}
