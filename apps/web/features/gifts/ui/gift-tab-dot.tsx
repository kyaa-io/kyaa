"use client";

import { FanDot } from "@/components/fan-ui/fan-dot";
import type { AppLocale } from "@/i18n/locales";
import { giftText } from "./gift-text";
import { useGiftUnreadCount } from "./use-gift-unread";
import styles from "./gift-tab-dot.module.css";

/** MY 탭(하단·상단)의 새 선물 점. 숫자 없이 점 하나, 움직임 없음. 같은 요약 값으로 켜지고 꺼진다. */
export function GiftTabDot({ locale }: Readonly<{ locale: AppLocale }>) {
  const count = useGiftUnreadCount(locale);
  return count > 0 ? <FanDot className={styles.dot} label={giftText(locale, "iconLabelUnread", count.toLocaleString(locale))} /> : null;
}
