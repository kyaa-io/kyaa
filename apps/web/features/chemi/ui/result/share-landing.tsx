"use client";

import { useEffect, useState } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { ChevronLeft } from "@/components/fan-ui/fan-icons";
import { FanNumber } from "@/components/fan-ui/fan-number";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { FanState } from "@/components/fan-ui/fan-state";
import { FanText } from "@/components/fan-ui/fan-text";
import { creatorName } from "@/features/fanpage/domain/creator-names";
import { ReadingText, useReadingCopy } from "@/features/chemi/i18n/reading-ui";
import type { AppLocale } from "@/i18n/locales";
import styles from "./share-landing.module.css";

const characters = ["changha", "elina", "yuna", "dosa"] as const;
type Character = (typeof characters)[number];

type Card = {
  gone?: boolean;
  character?: string;
  day?: string;
  line?: string;
  title?: string;
  score?: number;
  grade?: string;
  keywords?: { fandom?: number; color?: string; luckyHour?: { start: number; end: number } | null };
};

const art = (content: "fortune" | "saju", character: Character) =>
  content === "fortune"
    ? character === "changha"
      ? "/chemi/fortune/fortune-v1.webp"
      : `/chemi/fortune/fortune-${character}-wide-v2.webp`
    : character === "changha"
      ? "/chemi/saju/saju-changha-wide-v1.webp"
      : `/chemi/saju/saju-${character}-wide-v2.webp`;

/**
 * 공유 링크 착지(시트 11-1 · 11). 친구가 자랑한 결과 한 줄을 보여 주고, 로그인 없이 그 최애의 첫 장면으로 들어가게 한다(K-f65ac8).
 * 카드가 지났거나 줄이 없어도 빈 화면으로 끝내지 않고 같은 첫 장면 길을 둔다. 뒤로 가기는 케미 탭(K-7578e3).
 */
export function ShareLanding({ locale, from, content }: { locale: AppLocale; from: string; content: "fortune" | "saju" }) {
  const text = useReadingCopy();
  const [attempt, retry] = useState(0);
  const [card, setCard] = useState<Card | "loading" | "error">("loading");
  useEffect(() => {
    const controller = new AbortController();
    setCard("loading");
    void (async () => {
      const response = await fetch(`/api/chemi/shares/${encodeURIComponent(from)}`, { signal: controller.signal });
      if (!response.ok) throw Error();
      const body = (await response.json()) as Card;
      if (!controller.signal.aborted) setCard(body);
    })().catch(() => !controller.signal.aborted && setCard("error"));
    return () => controller.abort();
  }, [from, attempt]);

  const home = `/chemi?locale=${locale}`;
  const toolbar = (
    <div className={styles.toolbar}>
      <FanAction href={home} ariaLabel={text("back")} leadingIcon={<FanIcon icon={ChevronLeft} />} className={styles.round} />
    </div>
  );
  if (card === "loading")
    return (
      <section className={styles.layout} aria-busy="true">
        {toolbar}
        <FanSkeleton width="40%" />
        <FanSkeleton shape="block" className={styles.hero} />
        <FanSkeleton width="70%" />
      </section>
    );
  if (card === "error")
    return (
      <section className={styles.layout}>
        {toolbar}
        <FanState
          inline
          kind="error"
          title={text(content === "fortune" ? "fortuneFailure" : "sajuFailure")}
          actions={<FanAction size="sm" onClick={() => retry((n) => n + 1)}><ReadingText id="retry" /></FanAction>}
        />
      </section>
    );

  const character: Character = characters.find((id) => id === card.character) ?? "changha";
  const name = creatorName(character, locale);
  const start = `/chemi/${content}?locale=${locale}&c=${character}`;
  const live = !card.gone && Boolean(card.line);
  // 쉬어 가는 날(50~59)은 숫자 대신 등급 이름만 보인다(시트 04-3 · 12).
  const showScore = typeof card.score === "number" && card.score >= 60;
  const hour = card.keywords?.luckyHour;
  const keywords = card.keywords
    ? [
        typeof card.keywords.fandom === "number" ? `${text("fandom")} ${card.keywords.fandom}` : null,
        card.keywords.color ? text("luckyColor", { color: card.keywords.color }) : null,
        hour ? text("hourRange", { start: hour.start, end: hour.end }) : null,
      ].filter(Boolean)
    : [];
  return (
    <section className={styles.layout} data-share-landing={content}>
      {toolbar}
      {live && (
        <FanText as="p" role="meta" className={styles.kicker}>
          {text(content === "fortune" ? "sharedFortune" : "sharedSaju")}
          {card.day ? ` · ${Number(card.day.slice(5, 7))}.${Number(card.day.slice(8, 10))}` : ""}
        </FanText>
      )}
      <article className={styles.card}>
        <picture className={styles.hero}>
          <img src={art(content, character)} alt="" />
        </picture>
        <div className={styles.body}>
          {live ? (
            <>
              {card.grade && (
                <div className={styles.score}>
                  {showScore && <FanNumber size="xl" locale={locale} value={card.score!} />}
                  {card.title ? <FanText as="p" role="item">{card.grade}</FanText> : <FanHeading as="h1">{card.grade}</FanHeading>}
                </div>
              )}
              {card.grade && card.title && <FanHeading as="h1">{card.title}</FanHeading>}
              {!card.grade && <FanHeading as="h1">{card.line}</FanHeading>}
              {card.grade && (
                <figure className={styles.quote}>
                  <img src={`/chemi/fortune/avatar-${character}-v1.jpg`} alt="" />
                  <blockquote>
                    <FanText as="p" role="body">{card.line}</FanText>
                  </blockquote>
                  <figcaption><FanText role="meta">{name}</FanText></figcaption>
                </figure>
              )}
              {keywords.length > 0 && (
                <ul className={styles.keywords}>
                  {keywords.map((item) => (
                    <li data-row="" key={item}><FanText role="label">{item}</FanText></li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            // 줄 없이 만든 옛 카드는 무슨 카드였는지만, 지난 카드는 지났다는 것만 말한다.
            <FanHeading as="h1">{text(card.gone ? "sharedGone" : content === "fortune" ? "sharedFortune" : "sharedSaju")}</FanHeading>
          )}
        </div>
      </article>
      <div className={styles.cta}>
        <FanAction variant="primary" fullWidth href={start}>
          <ReadingText id={content === "fortune" ? "shareStartFortune" : "shareStartSaju"} />
        </FanAction>
      </div>
    </section>
  );
}
