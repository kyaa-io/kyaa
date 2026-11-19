"use client";
import type { Route } from "next";
import { useState } from "react";
import Link from "@/components/fan-ui/hover-prefetch-link";
import { FanIconButton } from "@/components/fan-ui/fan-icon-button";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { X } from "@/components/fan-ui/fan-icons";
import { FanText } from "@/components/fan-ui/fan-text";
import type { AppLocale } from "@/i18n/locales";
import { eventDayCloseLabel, eventDayLabel, eventStripClosedCookie } from "../domain/event-day";
import { localizedBannerHref } from "../domain/home-banner";
import { useEventDayRemaining } from "./use-event-day-remaining";
import styles from "./home-event-strip.module.css";

/**
 * 홈 헤더 아래 이벤트 띠: 관리자 '이벤트' 1번 배너의 제목 + 오늘 자정까지 남은 시간, 줄 전체가 그 배너 링크.
 * 들어올 때 면이 3번 깜박이고 멈춘다(움직임 줄이기는 깜박임 없음). 닫으면 그 배너 id를 쿠키에 남겨 서버가 다음부터 그리지 않는다. `now`는 시험용이다.
 */
export function HomeEventStrip({ banner, locale, now }: { banner: { id: string; title: string; href: string }; locale: AppLocale; now?: Date }) {
  const [closed, setClosed] = useState(false);
  const remaining = useEventDayRemaining(locale, now);
  if (closed) return null;
  const close = () => {
    try { document.cookie = eventStripClosedCookie(banner.id); } catch { /* cookies blocked: the strip comes back on the next visit */ }
    setClosed(true);
  };
  return <div className={styles.slot}><div className={styles.strip} data-home-event-strip={banner.id} data-motion="home-event-strip">
    <Link className={styles.link} href={localizedBannerHref(banner.href, locale) as Route}>
      <FanText role="label" className={styles.title}>{banner.title}</FanText>
      <FanText role="meta" className={styles.meta}>
        <span className={styles.label}>{eventDayLabel(locale)}</span>
        {remaining === null ? null : <span>{remaining}</span>}
      </FanText>
    </Link>
    <FanIconButton className={styles.close} aria-label={eventDayCloseLabel(locale)} onClick={close}><FanIcon icon={X} size={16} /></FanIconButton>
  </div></div>;
}
