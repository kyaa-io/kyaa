"use client";

import { useEffect, useRef, useState } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import type { AppLocale } from "@/i18n/locales";
import { GiftGlowIcon } from "./gift-glow";
import { giftText } from "./gift-text";
import styles from "./gift-nav-link.module.css";

/** MY 프로필 줄의 선물 링크. 안 읽은 선물이 있으면 아이콘 뒤가 빛나고 이름에 개수가 들어간다. 개수가 늘어나는 순간만 한 번 알려 준다. */
export function GiftNavLink({ locale, unreadCount }: Readonly<{ locale: AppLocale; unreadCount: number }>) {
  const unread = unreadCount > 0;
  const label = unread ? giftText(locale, "iconLabelUnread", unreadCount.toLocaleString(locale)) : giftText(locale, "iconLabel");
  const previous = useRef(unreadCount);
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    if (unreadCount > previous.current) setAnnouncement(label);
    previous.current = unreadCount;
  }, [unreadCount, label]);
  return <>
    <FanAction variant="text" className={styles.link} href={`/my/gifts?locale=${locale}`} ariaLabel={label} trailingIcon={<GiftGlowIcon unread={unread} />}>
      <span data-nav-label="">{giftText(locale, "iconLabel")}</span>
    </FanAction>
    <span className={styles.live} aria-live="polite">{announcement}</span>
  </>;
}
