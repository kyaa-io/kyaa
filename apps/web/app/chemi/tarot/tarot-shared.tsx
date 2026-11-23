"use client";

import { useEffect, useState } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { FanState } from "@/components/fan-ui/fan-state";
import { FanTag } from "@/components/fan-ui/fan-tag";
import { FanText } from "@/components/fan-ui/fan-text";
import { ReadingText, useReadingCopy } from "@/features/chemi/i18n/reading-ui";
import { TAROT_DECK_SIZE, tarotAlt, tarotFace, tarotTitle } from "@/features/chemi/tarot/deck";
import { isTarotCharacter, tarotCharacter, tarotFaceThumb, type TarotCharacter } from "@/features/chemi/tarot/script";
import type { AppLocale } from "@/i18n/locales";
import { tarotUrl } from "./types";
import { useTarotMeaning } from "./use-tarot-meaning";
import styles from "./tarot.module.css";

type Shared = { card: number; reversed: boolean; character: TarotCharacter };

const validCard = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value < TAROT_DECK_SIZE;

/**
 * 친구가 자랑한 타로 카드. 회원이 만든 공유 카드(from)는 서버에서 읽고,
 * 비회원 링크는 주소의 카드 번호와 방향만으로 그린다(서버 저장 없음).
 */
export function TarotShared({
  locale,
  from,
  card,
  reversed,
  character,
}: {
  locale: AppLocale;
  from?: string;
  card?: number;
  reversed?: boolean;
  character: TarotCharacter;
}) {
  const uiText = useReadingCopy();
  const direct: Shared | null = !from && validCard(card) ? { card, reversed: Boolean(reversed), character } : null;
  const [state, setState] = useState<Shared | "loading" | "empty">(direct ?? (from ? "loading" : "empty"));
  useEffect(() => {
    if (!from) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/chemi/shares/${encodeURIComponent(from)}`, { signal: controller.signal });
        if (!response.ok) throw Error();
        const saved = (await response.json()) as { card?: unknown; reversed?: unknown; character?: string };
        if (controller.signal.aborted) return;
        setState(
          validCard(saved.card)
            ? { card: saved.card, reversed: Boolean(saved.reversed), character: isTarotCharacter(saved.character) ? saved.character : character }
            : "empty",
        );
      } catch {
        if (!controller.signal.aborted) setState("empty");
      }
    })();
    return () => controller.abort();
  }, [from, character]);
  const meaning = useTarotMeaning(typeof state === "object" ? state.card : null, locale);

  if (state === "loading")
    return (
      <div className={styles.root} aria-busy="true">
        <div className={styles.shared}>
          <FanSkeleton width="40%" />
          <FanSkeleton shape="block" className={styles.hero} />
        </div>
      </div>
    );
  if (state === "empty")
    return <FanState kind="empty" title={uiText("loadFailure")} action={{ href: `/chemi?locale=${locale}`, label: uiText("chemi") }} />;

  const person = tarotCharacter(state.character, locale);
  const content = meaning.card?.dir[state.reversed ? "down" : "up"];
  return (
    <article className={styles.root} data-tarot-shared="">
      <div className={styles.shared}>
        <header className={styles.head}>
          <div className={styles.nameRow}>
            <FanHeading as="h1">{tarotTitle(state.card, locale)}</FanHeading>
            <FanTag tone="fan">{uiText(state.reversed ? "reversed" : "upright")}</FanTag>
          </div>
        </header>
        <div className={styles.hero} data-reversed={state.reversed || undefined}>
          <img className={styles.cloth} src="/chemi/tarot/cloth-390.webp" alt="" />
          <img className={styles.cardFace} src={tarotFace(state.card)} alt={tarotAlt(state.card, locale)} />
        </div>
        <div className={styles.said}>
          <div className={styles.react}>
            <img src={tarotFaceThumb(state.character)} alt="" />
            <span>
              <FanText role="label">{person.name}</FanText>
              {content ? <FanText role="body">{content.react[person.voice]}</FanText> : meaning.status === "error" ? null : <FanSkeleton width="80%" />}
            </span>
          </div>
          <FanAction variant="primary" fullWidth href={tarotUrl({ locale, character: state.character, step: "enter" })}>
            <ReadingText id="drawCard" />
          </FanAction>
        </div>
        {content ? (
          <section className={styles.mean}>
            <FanHeading><ReadingText id="meaning" /></FanHeading>
            <FanText as="p" role="item" className={styles.lead}>
              {content.lead}
            </FanText>
          </section>
        ) : null}
        <footer className={styles.legal}>
          <FanText as="p" role="meta">
            <ReadingText id="fun" />
          </FanText>
        </footer>
      </div>
    </article>
  );
}
