import { RewardIcon } from "@/components/fan-ui/reward-icon";
import { Star } from "@/components/fan-ui/fan-icons";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import styles from "./rank-unit.module.css";

/** The unit of a ranking number as the asset the app already uses for it, never the letter P or a word: points are the coin, hearts the glossy heart, tickets the ticket. Page likes are an outlined star, never a heart (대표 11/15 16:45: page likes are given like star ratings; hearts stay the 찐팬 hearts). */
export type RankUnitKind = "points" | "likes" | "hearts" | "tickets";
const SIZE = 16;
/** `size` is 20 only for the 찐팬 hearts in a creator's opened row (대표 11/14 02:11: too small); everywhere else the unit is 16. */
export function RankUnit({ unit, size = SIZE }: { unit: RankUnitKind; size?: 16 | 20 }) {
  if (unit === "points") return <RewardIcon kind="point" alt="" width={SIZE} height={SIZE} className={styles.mark} data-unit="points" />;
  if (unit === "tickets") return <RewardIcon kind="ticket" alt="" width={SIZE} height={SIZE} className={styles.mark} data-unit="tickets" />;
  if (unit === "hearts") return <RewardIcon kind="heart" alt="" width={size} height={size} className={styles.mark} data-unit="hearts" />;
  return <FanIcon icon={Star} size={SIZE} className={styles.like} data-unit="likes" />;
}
