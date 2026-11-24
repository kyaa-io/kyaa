"use client";

import { useEffect, useState } from "react";
import { DeepResultAsk, useDeepResultAsk } from "@/features/chemi/ask/deep-result-ask";
import { ReadingCreatorPicker } from "@/features/chemi/ui/reading-creator-picker";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { ChevronLeft } from "@/components/fan-ui/fan-icons";
import { FanSkeleton, FanSkeletonStatus } from "@/components/fan-ui/fan-skeleton";
import { FanState } from "@/components/fan-ui/fan-state";
import { FanTag } from "@/components/fan-ui/fan-tag";
import { FanText } from "@/components/fan-ui/fan-text";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { ReadingText, useReadingCopy } from "@/features/chemi/i18n/reading-ui";
import { TAROT_BACK, TAROT_DECK_SIZE, tarotAlt, tarotFace, tarotTitle } from "@/features/chemi/tarot/deck";
import { tarotCharacter, tarotFaceThumb, type TarotCharacter } from "@/features/chemi/tarot/script";
import type { AppLocale } from "@/i18n/locales";
import { CardRail } from "../card-rail";
import styles from "../tarot.module.css";
import { loginExpired, tarotDateLabel } from "../types";
import { useTarotMeaning } from "../use-tarot-meaning";
import spread from "./spread.module.css";

type Card = { card: number; reversed: boolean };
type Saved = { readingId: string; cards: Card[]; date: string; deckPositions?: number[] };
const positions = ["past", "present", "future"] as const;
const voiceKey = { ban: "Ban", yo: "Yo", hao: "Hao" } as const;

function parseSaved(body: any): Saved | null {
  const cards = body?.result?.cards;
  if (typeof body?.readingId !== "string" || !Array.isArray(cards) || cards.length !== 3) return null;
  if (!cards.every((item) => Number.isInteger(item?.card) && item.card >= 0 && item.card < TAROT_DECK_SIZE && typeof item.reversed === "boolean")) return null;
  const deckPositions = body.result.positions;
  const hasPositions = Array.isArray(deckPositions) && deckPositions.length === 3
    && deckPositions.every((slot) => Number.isInteger(slot) && slot >= 0 && slot < TAROT_DECK_SIZE)
    && new Set(deckPositions).size === 3;
  return { readingId: body.readingId, cards, date: String(body.kstDate ?? ""), deckPositions: hasPositions ? deckPositions : undefined };
}

/** 세 장 타로: 계정마다 첫 1번 무료. 본 배열은 다시 열어도 같은 세 장이다. */
export function TarotSpread({ locale, character }: { locale: AppLocale; character: TarotCharacter }) {
  const text = useReadingCopy();
  const { ready, authenticated, user, getAccessToken, login } = useByUsAuth();
  const [status, setStatus] = useState<"loading" | "guest" | "pick" | "saving" | "result" | "error" | "expired">("loading");
  const [picked, setPicked] = useState<number[]>([]);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [controlsHost, setControlsHost] = useState<HTMLElement | null>(null);
  const [reduced, setReduced] = useState(false);
  const ask = useDeepResultAsk(locale, "tarot", character);
  const person = tarotCharacter(character, locale);
  const voice = voiceKey[person.voice];
  const home = `/chemi/tarot?locale=${locale}&c=${character}`;

  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!authenticated) {
      setStatus("guest");
      return;
    }
    const controller = new AbortController();
    setStatus("loading");
    void (async () => {
      const response = await fetch("/api/chemi/tarot/spread", {
        headers: { Authorization: `Bearer ${await getAccessToken()}` },
        signal: controller.signal,
      });
      if (await loginExpired(response)) return setStatus("expired");
      if (!response.ok) throw Error();
      const body = await response.json();
      if (controller.signal.aborted) return;
      const found = parseSaved(body);
      setSaved(found);
      setStatus(found ? "result" : "pick");
    })().catch(() => {
      if (!controller.signal.aborted) setStatus("error");
    });
    return () => controller.abort();
  }, [ready, authenticated, user?.id, getAccessToken, attempt]);

  async function draw(all: number[]) {
    setStatus("saving");
    try {
      const response = await fetch("/api/chemi/tarot/spread", {
        method: "POST",
        headers: { Authorization: `Bearer ${await getAccessToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ character, positions: all }),
      });
      if (await loginExpired(response)) return setStatus("expired");
      const found = response.ok ? parseSaved(await response.json()) : null;
      if (!found) throw Error();
      setSaved(found);
      setStatus("result");
    } catch {
      setStatus("error");
    }
  }
  function pick(position: number) {
    if (picked.includes(position)) return;
    const all = [...picked, position];
    setPicked(all);
    if (all.length === 3) void draw(all);
  }

  const chips = (meta?: string) => (
    <div className={styles.chips}>
      <FanAction variant="text" href={home} ariaLabel={text("back")} leadingIcon={<FanIcon icon={ChevronLeft} size={16} />} className={`${styles.back} ${spread.backLink}`} />
      <span className={styles.who}>
        <FanText role="label">{person.name}</FanText>
      </span>
      {meta && (
        <FanText role="meta" className={spread.meta}>
          {meta}
        </FanText>
      )}
    </div>
  );

  if (character === "dosa" && (status === "pick" || status === "guest"))
    return <ReadingCreatorPicker content="tarot/spread" locale={locale} />;
  if (ask) return ask;
  if (status === "expired")
    return (
      <div className={styles.root}>
        <FanState
          kind="auth"
          title={text("expired")}
          actions={<FanAction variant="primary" onClick={login}><ReadingText id="login" /></FanAction>}
        />
      </div>
    );
  if (status === "guest")
    return (
      <FanState
        kind="auth"
        title={text("spreadLogin")}
        actions={<FanAction onClick={login}><ReadingText id="login" /></FanAction>}
      />
    );
  if (status === "error")
    return (
      <div className={styles.root}>
        <FanState
          kind="error"
          title={text("spreadFailure")}
          actions={
            <FanAction
              size="sm"
              onClick={() => {
                setPicked([]);
                setAttempt((value) => value + 1);
              }}
            >
              <ReadingText id="retry" />
            </FanAction>
          }
        />
      </div>
    );
  if (status === "loading" || status === "saving")
    return (
      <div className={styles.loading} role="status">
        <FanSkeletonStatus locale={locale} />
        <FanSkeleton shape="block" className={styles.loadbar} />
      </div>
    );
  if (status === "result" && saved) return <SpreadResult locale={locale} character={character} saved={saved} chips={chips(text("spreadTitle"))} home={home} />;

  const step = picked.length + 1;
  return (
    <div className={styles.root} data-chemi-immersive="" data-step="pick" data-tarot-spread="pick">
      {chips(text("spreadStep", { step }))}
      <section className={styles.stage}>
        <div className={styles.scene}>
          <picture>
            <source media="(min-width: 48rem)" srcSet={`/chemi/tarot/scene-${character}-l.webp`} />
            <img src={`/chemi/tarot/scene-${character}-p.webp`} alt={text("candleRoom", { name: person.name })} />
          </picture>
        </div>
        <div className={styles.table} data-pick="">
          <CardRail key={step} showPosition excluded={picked} onPick={pick} randomLabel={text("randomCard")} reduced={reduced} controlsHost={controlsHost} />
        </div>
        <div className={styles.panel}>
          <ol className={spread.slots} aria-label={text("spreadSlots")}>
            {positions.map((position, index) => (
              <li key={position} data-row="" data-done={index < picked.length || undefined} aria-current={index === picked.length ? "step" : undefined}>
                {index < picked.length ? <img src={TAROT_BACK} alt={text("pickedCard")} /> : <i />}
                <span className={spread.slotLabel}>
                  <FanText role="label">{text(position)}</FanText>
                  {index < picked.length && <FanText role="meta" aria-label={text("deckSlot", { slot: picked[index] + 1, total: TAROT_DECK_SIZE })}>{picked[index] + 1} / {TAROT_DECK_SIZE}</FanText>}
                </span>
              </li>
            ))}
          </ol>
          <div ref={setControlsHost} />
          <section className={styles.dialog} aria-live="polite">
            <div className={styles.speaker}>
              <FanText as="p" role="item">
                {person.name}
              </FanText>
            </div>
            <FanText as="p" role="body">
              {text(`sayPick${step as 1 | 2 | 3}${voice}`)}
            </FanText>
          </section>
        </div>
      </section>
    </div>
  );
}

function SpreadResult({
  locale,
  character,
  saved,
  chips,
  home,
}: {
  locale: AppLocale;
  character: TarotCharacter;
  saved: Saved;
  chips: React.ReactNode;
  home: string;
}) {
  const text = useReadingCopy();
  const person = tarotCharacter(character, locale);
  const meanings = [useTarotMeaning(saved.cards[0].card, locale), useTarotMeaning(saved.cards[1].card, locale), useTarotMeaning(saved.cards[2].card, locale)];
  const failed = meanings.some((meaning) => meaning.status === "error");
  const sides = saved.cards.map((card, index) => meanings[index].card?.dir[card.reversed ? "down" : "up"]);
  const future = sides[2];
  const [shareStatus, setShareStatus] = useState("");
  async function shareCards() {
    const summary = saved.cards.map((card, index) =>
      `${text(positions[index])} · ${tarotTitle(card.card, locale)} · ${text(card.reversed ? "reversed" : "upright")}`
    ).join("\n");
    try {
      if (navigator.share) await navigator.share({ text: summary });
      else {
        await navigator.clipboard.writeText(summary);
        setShareStatus(text("copied"));
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setShareStatus(text("copyFailed"));
    }
  }
  const date = saved.date
    ? tarotDateLabel(saved.date, locale)
    : "";
  return (
    <div className={styles.root} data-step="result" data-tarot-spread="result">
      {chips}
      <article className={spread.resultPage}>
        <div className={spread.resultMain}>
          <header className={spread.head}>
            <FanText as="p" role="meta">
              {text("spreadMeta", { date })}
            </FanText>
            {future ? <FanHeading as="h1">{future.share}</FanHeading> : failed ? null : <FanSkeleton width="70%" height={28} />}
          </header>
          <div className={`${styles.hero} ${spread.hero3}`}>
            <img className={styles.cloth} src="/chemi/tarot/cloth-390.webp" alt="" />
            <div className={spread.trio}>
              {saved.cards.map((card, index) => (
                <figure key={positions[index]} data-reversed={card.reversed || undefined}>
                  <img src={tarotFace(card.card)} alt={tarotAlt(card.card, locale)} />
                  <figcaption>
                    <FanText role="label">{text(positions[index])}</FanText>
                    {saved.deckPositions && (
                      <FanText role="meta">{text("deckSlot", { slot: saved.deckPositions[index] + 1, total: TAROT_DECK_SIZE })}</FanText>
                    )}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
          {failed ? (
            <div className={styles.retry} role="alert">
              <FanText as="p" role="body">
                <ReadingText id="loadFailure" />
              </FanText>
              <FanAction size="sm" onClick={() => meanings.forEach((meaning) => meaning.status === "error" && meaning.retry())}>
                <ReadingText id="retry" />
              </FanAction>
            </div>
          ) : (
            <>
              <section className={spread.section}>
                <FanHeading>
                  <ReadingText id="spreadTodo" />
                </FanHeading>
                <ol className={spread.todo}>
                  {sides.map((side, index) => (
                    <li key={positions[index]} data-row="">
                      <span className={spread.no}>
                        <FanText role="label">{index + 1}</FanText>
                      </span>
                      {side ? <FanText role="body">{side.rows[side.rows.length - 1][1]}</FanText> : <FanSkeleton width="70%" />}
                    </li>
                  ))}
                </ol>
              </section>
              <section className={spread.section}>
                <FanHeading>
                  <ReadingText id="spreadStory" />
                </FanHeading>
                <dl className={spread.story}>
                  {saved.cards.map((card, index) => (
                    <div key={positions[index]}>
                      <FanText as="dt" role="label">
                        {text(positions[index])}
                      </FanText>
                      <dd>
                        <span className={spread.cardName}>
                          <FanText as="strong" role="item">
                            {tarotTitle(card.card, locale)}
                          </FanText>
                          <FanTag tone={card.reversed ? "neutral" : "fan"}>{text(card.reversed ? "reversed" : "upright")}</FanTag>
                        </span>
                        {sides[index] ? <FanText role="body">{sides[index].lead}</FanText> : <FanSkeleton width="90%" />}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            </>
          )}
          <footer className={styles.legal}>
            <FanText as="p" role="meta">
              <ReadingText id="fun" />
            </FanText>
          </footer>
        </div>
        <div className={spread.resultSide}>
          <div className={styles.said}>
            <div className={styles.react}>
              <img src={tarotFaceThumb(character)} alt="" />
              <span>
                <FanText role="label">{person.name}</FanText>
                {future ? <FanText role="body">{future.react[person.voice]}</FanText> : failed ? null : <FanSkeleton width="80%" />}
              </span>
            </div>
            <DeepResultAsk name={person.name} reading={() => saved.readingId} />
            <div className={spread.actions}>
              <FanAction variant="text" onClick={shareCards}><ReadingText id="share" /></FanAction>
              <FanAction variant="text" href={home}>
                <ReadingText id="todayCard" />
              </FanAction>
            </div>
            {shareStatus && <p role="status">{shareStatus}</p>}
          </div>
        </div>
      </article>
    </div>
  );
}
