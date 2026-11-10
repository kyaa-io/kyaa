import { FanDot } from "@/components/fan-ui/fan-dot";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { Gift } from "@/components/fan-ui/fan-icons";
import styles from "./gift-glow.module.css";

/** 선물 아이콘. 안 읽은 선물이 있으면 뒤에 빛(래스터 애셋)이 켜지고, 읽으면 평소 아이콘만 남는다. 움직임은 CSS가 12초 안에 끝낸다. 겹침 순서는 문서 순서(빛 → 아이콘 → 띠 → 점). */
export function GiftGlowIcon({ unread }: Readonly<{ unread: boolean }>) {
  return <span className={styles.icon} data-gift-glow={unread ? "" : undefined} aria-hidden="true">
    {unread ? <img className={styles.halo} src="/images/gift/gift-halo.png" alt="" width={56} height={56} decoding="async" /> : null}
    <FanIcon icon={Gift} size={20} />
    {unread ? <>
      <span className={styles.clip}><img className={styles.shine} src="/images/gift/gift-shine.png" alt="" decoding="async" /></span>
      <FanDot className={styles.forcedDot} />
    </> : null}
  </span>;
}
