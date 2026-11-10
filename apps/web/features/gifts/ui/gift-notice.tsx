import { FanIcon } from "@/components/fan-ui/fan-icon";
import { Gift } from "@/components/fan-ui/fan-icons";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanSurface } from "@/components/fan-ui/fan-surface";
import type { AppLocale } from "@/i18n/locales";
import { giftPath } from "../domain/gift";
import { giftText } from "./gift-text";
import styles from "./gift-notice.module.css";

/** MY의 새 선물 알림. 서버가 센 안 읽은 선물이 있을 때만 그린다. 한 건이면 그 선물로, 여러 건이면 선물 목록으로 간다. 링크를 누르는 것은 읽음이 아니다. */
export function GiftNotice({ locale, unreadCount, singleUnreadId }: Readonly<{ locale: AppLocale; unreadCount: number; singleUnreadId: string | null }>) {
  if (unreadCount <= 0) return null;
  const title = giftText(locale, "bannerTitle");
  const href = singleUnreadId ? giftPath(singleUnreadId) : "/my/gifts";
  return <FanSurface tone="focus" className={styles.notice} aria-label={title} data-block="gift-notice">
    <span className={styles.icon} aria-hidden="true"><FanIcon icon={Gift} size={24} /></span>
    <div className={styles.copy}><FanHeading as="h2" variant="personal-section">{title}</FanHeading></div>
    <FanAction variant="primary" href={`${href}?locale=${locale}`}>{giftText(locale, "bannerAction")}</FanAction>
  </FanSurface>;
}
