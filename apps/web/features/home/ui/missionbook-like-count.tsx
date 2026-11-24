"use client";

import { FanIcon } from "@/components/fan-ui/fan-icon";
import { ThumbsUp } from "@/components/fan-ui/fan-icons";
import numberStyles from "@/components/fan-ui/fan-number.module.css";
import { FanText } from "@/components/fan-ui/fan-text";
import { RollingNumber } from "@/components/fan-ui/rolling-number";
import type { AppLocale } from "@/i18n/locales";
import { useMissionbookEventLikeCount } from "./use-missionbook-event-like";
import styles from "./missionbook-like-count.module.css";

/** `{0}` is the number; the words around it stay small. Same word as the like button (post-reaction-copy). */
export const missionbookLikeCopy: Record<AppLocale, string> = {
  ko: "좋아요 {0}명",
  get mn() { return this.en; },
  en: "{0} likes",
  ja: "いいね {0}人",
  "zh-Hans": "{0} 人点赞",
  "zh-Hant": "{0} 人按讚",
  es: "{0} me gusta",
  id: "{0} suka",
  vi: "{0} lượt thích",
  th: "ถูกใจ {0} คน",
  pt: "{0} curtidas",
  fr: "{0} J’aime",
  ru: "Нравится: {0}",
};

/**
 * 덕질미션북 좋아요 수(홈 배너·미션북 페이지 머리). X 오픈 이벤트(/follow) 참여 수 + MISSIONBOOK_LIKE_DISPLAY_START로 보인다(사용자 11/16).
 * The viewer's own like is part of the event count, so the read is anonymous and starts at once. The line keeps its height
 * while loading or after a failed read so the banner copy never jumps.
 */
export function MissionbookLikeCount({ locale, tone = "page" }: { locale: AppLocale; tone?: "page" | "banner" }) {
  const value = useMissionbookEventLikeCount();
  const [before, after] = missionbookLikeCopy[locale].split("{0}");
  const format = (count: number) => count.toLocaleString(locale);
  return <p className={styles.count} data-tone={tone} data-missionbook-likes={value === null ? "loading" : "ready"}>
    {value === null ? null : <>
      <span className={styles.srOnly}>{missionbookLikeCopy[locale].replace("{0}", format(value))}</span>
      <span className={styles.line} aria-hidden="true">
        <FanIcon icon={ThumbsUp} size={24} className={styles.icon} />
        <FanText role="item" className={styles.text}>{before}<span className={`${numberStyles.number} ${numberStyles[tone === "banner" ? "xl" : "lg"]} ${styles.value}`}><RollingNumber value={value} format={format} initialFromZero /></span>{after}</FanText>
      </span>
    </>}
  </p>;
}
