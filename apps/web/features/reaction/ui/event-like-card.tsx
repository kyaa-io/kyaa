"use client";
import { useEffect, useState } from "react";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanText } from "@/components/fan-ui/fan-text";
import { FanNumUnit } from "@/components/fan-ui/fan-num-unit";
import { fanUiText } from "@/components/fan-ui/fan-ui-copy";
import { FanSurface } from "@/components/fan-ui/fan-surface";
import { useOptionalGroupPage } from "@/features/groups/ui/group-page-context";
import type { AppLocale } from "@/i18n/locales";
import { openPageLikeEvent, pageLikeEventTitle } from "../domain/page-like-event";
import { ReactionAction } from "./reaction-action";
import styles from "./event-like-card.module.css";

/**
 * 팬페이지 홈의 이벤트 좋아요 카드. 그 크리에이터의 좋아요 이벤트 창이 열려 있는 동안만 머리 아래·갤러리 위에 보인다.
 * 버튼은 머리의 좋아요 칩과 같은 ReactionAction이라 같은 reactions 요청·같은 상태를 쓰고, 집계는 기존 관리자 이벤트 집계가 그대로 센다.
 * 지금 시각은 마운트 뒤에 읽어 서버·브라우저 첫 그림이 같다. `now`는 시험용이다.
 */
export function EventLikeCard({ slug, locale, now }: { slug: string; locale: AppLocale; now?: Date }) {
  const [current, setCurrent] = useState<number | null>(now ? now.getTime() : null);
  useEffect(() => { if (!now) setCurrent(Date.now()); }, [now]);
  const frame = useOptionalGroupPage();
  const title = pageLikeEventTitle(slug, locale);
  if (current === null || !title || !openPageLikeEvent(slug, current)) return null;
  // 머리의 '팬 N'과 같은 값(팬페이지는 좋아요를 남긴 사람 수).
  const likeCount = frame?.page?.kind === "fan" && frame.page.likeCount !== undefined ? frame.page.likeCount : frame?.page?.memberCount;
  return <FanSurface className={styles.card} aria-labelledby="event-like-title" data-event-like-card="">
    <div className={styles.head}>
      <FanHeading id="event-like-title">{title}</FanHeading>
      {likeCount === undefined ? null : <FanText role="meta" as="p"><FanNumUnit>{fanUiText(locale, "fanCount", [likeCount.toLocaleString(locale)])}</FanNumUnit></FanText>}
    </div>
    <div className={styles.action}><ReactionAction slug={slug} locale={locale} variant="event" /></div>
  </FanSurface>;
}
