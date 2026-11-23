"use client";

import { ParticipationCount } from "../participation";
import { useReadingCopy } from "@/features/chemi/i18n/reading-ui";
import { ReadingText, ReadingTitle } from "@/features/chemi/i18n/reading-ui";
import Link from "@/components/fan-ui/hover-prefetch-link";
import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { FanIconButton } from "@/components/fan-ui/fan-icon-button";
import { ChevronDown, ChevronLeft, ChevronRight } from "@/components/fan-ui/fan-icons";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { FanTag } from "@/components/fan-ui/fan-tag";
import { FanText } from "@/components/fan-ui/fan-text";
import { TAROT_BACK, TAROT_DECK, tarotFace, tarotTitle } from "@/features/chemi/tarot/deck";
import {
  TAROT_CHARACTERS,
  tarotLines,
  tarotAvatar,
  tarotCharacter,
  type TarotCharacter,
} from "@/features/chemi/tarot/script";
import { showFanToast } from "@/components/fan-ui/fan-toast";
import { withTopic } from "@/features/chemi/domain/korean-particle";
import { CardRail } from "./card-rail";
import spread from "./spread/spread.module.css";
import type { TarotMeaning } from "./use-tarot-meaning";
import type { TarotDraw, TarotStep } from "./types";
import styles from "./tarot.module.css";
import { creatorName } from "@/features/fanpage/domain/creator-names";
import type { AppLocale } from "@/i18n/locales";

type Props = {
  locale: AppLocale;
  step: TarotStep;
  character: TarotCharacter;
  /** 회원이 오늘 이미 뽑은 카드. 있으면 입장 장면이 '다시 온 장면'이다. */
  shown: TarotDraw | null;
  draw: TarotDraw | null;
  slot: number | null;
  offline: boolean;
  meaning: TarotMeaning;
  reduced: boolean;
  onSelectCharacter: (key: TarotCharacter) => void;
  onStart: () => void;
  onThought: () => void;
  onPick: (position: number) => void;
  onAdvance: () => void;
  onResult: () => void;
  onRetry: () => void;
  /** 세 장 배열 입구(다시 온 장면). used: 첫 무료 1번을 이미 썼다. */
  spread?: { href: string; used: boolean };
};



export function TarotStage(props: Props) {
  const uiText = useReadingCopy();
  const { step, character, shown, draw, slot, offline, meaning, reduced } = props;
  const person = tarotCharacter(character, props.locale);
  const lines = tarotLines(character);
  const entry = step === "enter";
  const revisit = entry && shown;
  const talking = step === "flip" || step === "talk2" || step === "talk3";
  const swipe = useRef<number | null>(null);
  const [controlsHost, setControlsHost] = useState<HTMLElement | null>(null);
  const lockedEl = useRef<HTMLSpanElement>(null);
  const areaEl = useRef<HTMLDivElement>(null);
  const flipEl = useRef<HTMLDivElement>(null);
  const from = useRef<{ y: number; width: number } | null>(null);

  // 확정 화면에서 넘어오면 고른 카드가 서 있던 자리(--from-y) · 크기(--from-s)에서 커지며 뒤집힌다(transform 만).
  useLayoutEffect(() => {
    if (step === "lock") {
      const rect = lockedEl.current?.getBoundingClientRect();
      from.current = rect ? { y: rect.top + rect.height / 2, width: rect.width } : null;
    }
    if (step === "flip" && from.current && areaEl.current && flipEl.current) {
      const area = areaEl.current.getBoundingClientRect();
      flipEl.current.style.setProperty("--from-y", `${from.current.y - (area.top + area.height / 2)}px`);
      flipEl.current.style.setProperty("--from-s", String(from.current.width / area.width));
      from.current = null;
    }
  }, [step]);

  const turn = (offset: number) => {
    const index = TAROT_CHARACTERS.findIndex((item) => item.key === character);
    props.onSelectCharacter(TAROT_CHARACTERS[(index + offset + TAROT_CHARACTERS.length) % TAROT_CHARACTERS.length].key);
  };

  // 대화는 장면 어디를 눌러도 다음 대사로 간다(버튼·링크는 제 일을 한다).
  const tap = (event: React.MouseEvent) => {
    if (!talking || step === "talk3" || (event.target as Element).closest("button,a")) return;
    props.onAdvance();
  };

  // 단계마다 주 버튼은 하나: 입장 · 다시 온 장면 · 떠올리기 · 마지막 대사.
  const primary = (() => {
    if (entry) return revisit ? { label: uiText("viewCard"), onClick: props.onResult } : { label: uiText("drawCard"), onClick: props.onStart };
    if (step === "think") return { label: uiText("thought"), onClick: props.onThought };
    if (step === "talk3") return { label: uiText("seeReading"), onClick: props.onResult };
    return null;
  })();

  const spreadEntry = revisit ? props.spread : undefined;
  const voice = ({ ban: "Ban", yo: "Yo", hao: "Hao" } as const)[person.voice];
  const soon = (label: string) => () => showFanToast({ title: uiText("comingSoon", { subject: withTopic(label), label }) });
  let dialogLine: string;
  if (spreadEntry) dialogLine = uiText(`${spreadEntry.used ? "saySpreadUsed" : "saySpreadAsk"}${voice}`);
  else if (entry) dialogLine = revisit ? lines.again : lines.hello;
  else if (step === "think") dialogLine = lines.think;
  else if (step === "shuffle") dialogLine = lines.shuffle;
  else if (step === "pick") dialogLine = lines.pick;
  else if (step === "lock") dialogLine = lines.lock;
  else dialogLine = "";
  const talkLine = (() => {
    if (!draw) return "";
    const [, name] = TAROT_DECK[draw.card];
    if (step === "flip") return lines.drawn(name, draw.reversed);
    if (meaning.status !== "ready") return "";
    const direction = meaning.card.dir[draw.reversed ? "down" : "up"];
    return direction.talk[person.voice][step === "talk2" ? 0 : 1];
  })();

  return (
    <section
      className={styles.stage}
      data-near={entry || undefined}
      data-settle={step === "think" || undefined}
      data-talk={talking || undefined}
      onClick={tap}
      onTouchStart={(event) => {
        swipe.current = entry ? event.changedTouches[0].clientX : null;
      }}
      onTouchEnd={(event) => {
        if (swipe.current === null) return;
        const delta = event.changedTouches[0].clientX - swipe.current;
        swipe.current = null;
        if (Math.abs(delta) > 44) turn(-Math.sign(delta));
      }}
    >
      <div className={styles.scene}>
        <picture key={character}>
          <source media="(min-width: 48rem)" srcSet={`/chemi/tarot/scene-${character}-l.webp`} />
          <img src={`/chemi/tarot/scene-${character}-p.webp`} alt={uiText("candleRoom", { name: person.name })} />
        </picture>
      </div>
      {entry ? (
        <>
          <FanAction className={`${styles.turn} ${styles.prev}`} variant="text" ariaLabel={uiText("prevStar")} leadingIcon={<FanIcon icon={ChevronLeft} />} onClick={() => turn(-1)} />
          <FanAction className={`${styles.turn} ${styles.next}`} variant="text" ariaLabel={uiText("nextStar")} leadingIcon={<FanIcon icon={ChevronRight} />} onClick={() => turn(1)} />
        </>
      ) : null}

      <div className={styles.table} data-pick={step === "pick" || undefined}>
        {revisit ? (
          <Link
            className={styles.onTable}
            data-reversed={shown.reversed || undefined}
            href={`#`}
            aria-label={uiText("todayCardLabel", { card: tarotTitle(shown.card) })}
            onClick={(event) => {
              event.preventDefault();
              props.onResult();
            }}
          >
            <img src={tarotFace(shown.card)} alt={TAROT_DECK[shown.card][2]} />
          </Link>
        ) : null}
        {step === "think" || step === "shuffle" ? (
          <div className={styles.deck} data-split={step === "shuffle" || undefined}>
            <img src={TAROT_BACK} alt="" />
            <img src={TAROT_BACK} alt="" />
            <img src={TAROT_BACK} alt="" />
          </div>
        ) : null}
        {step === "pick" ? <CardRail onPick={props.onPick} randomLabel={uiText("randomCard")} reduced={reduced} controlsHost={controlsHost} /> : null}
        {step === "lock" ? <LockedRail slot={slot ?? 1} cardRef={lockedEl} /> : null}
        {talking && draw ? <Flip draw={draw} turning={step === "flip" && !reduced} areaRef={areaEl} flipRef={flipEl} /> : null}
      </div>

      <div className={styles.panel}>
        {entry && !revisit ? (
          <div className={styles.title}>
            <FanHeading as="h1"><ReadingTitle id="tarot" /></FanHeading>
                <ParticipationCount locale={props.locale} />
          </div>
        ) : null}
        {revisit ? <NameRow draw={shown} trailing={uiText("todayCard")} /> : null}
        {talking && draw ? <NameRow draw={draw} trailing={draw.slot ? uiText("nthCard", { slot: draw.slot }) : null} /> : null}
        {step === "lock" ? (
          <div className={styles.picked}>
            <LockedBand slot={slot ?? 1} />
          </div>
        ) : null}

        <section className={styles.dialog} aria-live="polite">
          <div className={styles.speaker}>
            <FanText as="p" role="item">
              {person.name}
            </FanText>
            {talking ? (
              step === "talk3" ? (
                <FanText role="meta">3/3</FanText>
              ) : (
                <FanAction className={styles.nextLine} variant="text" trailingIcon={<FanIcon icon={ChevronDown} size={16} />} onClick={props.onAdvance}>
                  {step === "flip" ? "1/3" : "2/3"}
                </FanAction>
              )
            ) : null}
          </div>
          {talking && !talkLine ? (
            <FanSkeleton width="70%" />
          ) : (
            <FanText as="p" role="body">
              {talking ? talkLine : dialogLine}
            </FanText>
          )}
        </section>
        {spreadEntry || primary ? (
          <div className={styles.choices}>
            <FanAction variant="primary" {...(spreadEntry ? { href: spreadEntry.href } : { onClick: primary!.onClick })}>
              {spreadEntry ? (
                <>
                  <ReadingText id={spreadEntry.used ? "spreadAgain" : "spreadAsk"} />
                  {spreadEntry.used ? null : (
                    <FanTag tone="neutral" className={spread.count}>
                      <ReadingText id="firstFree" />
                    </FanTag>
                  )}
                </>
              ) : (
                primary!.label
              )}
            </FanAction>
            {spreadEntry ? (
              <div className={spread.more}>
                <FanAction onClick={soon(uiText("tarotBook"))}>
                  <ReadingText id="tarotBook" />
                </FanAction>
                <FanAction onClick={soon(uiText("withFriend"))}>
                  <ReadingText id="withFriend" />
                </FanAction>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === "pick" ? <div ref={setControlsHost} /> : null}

      </div>

      {offline || (talking && meaning.status === "error") ? (
        <div className={styles.offline} role="alert">
          <FanText role="body"><ReadingText id="offline" /></FanText>
          <FanAction size="sm" onClick={props.onRetry}>
            <ReadingText id="retry" />
          </FanAction>
        </div>
      ) : null}
    </section>
  );
}

function NameRow({ draw, trailing }: { draw: TarotDraw; trailing: string | null }) {
  const uiText = useReadingCopy();
  return (
    <div className={styles.nameRow}>
      <FanText as="p" role="item">
        {tarotTitle(draw.card)}
      </FanText>
      <FanTag tone="fan">{uiText(draw.reversed ? "reversed" : "upright")}</FanTag>
      {trailing ? (
        <FanText className={styles.nameTrail} role="meta">
          {trailing}
        </FanText>
      ) : null}
    </div>
  );
}

/** 확정: 고른 자리의 카드가 위로 들리고 나머지 줄은 흐려진다. */
function LockedRail({ slot, cardRef }: { slot: number; cardRef: RefObject<HTMLSpanElement | null> }) {
  const uiText = useReadingCopy();
  return (
    <ul className={styles.rail} data-locked="">
      <li data-row="">
        <span className={styles.card} data-side="">
          <img src={TAROT_BACK} alt="" />
        </span>
      </li>
      <li data-row="">
        <span ref={cardRef} className={styles.card} aria-current="true" aria-label={uiText("nthCard", { slot: slot })}>
          <img src={TAROT_BACK} alt="" />
        </span>
      </li>
      <li data-row="">
        <span className={styles.card} data-side="">
          <img src={TAROT_BACK} alt="" />
        </span>
      </li>
    </ul>
  );
}

function LockedBand({ slot }: { slot: number }) {
  const uiText = useReadingCopy();
  return (
    <>
      <div className={`${styles.band} ${styles.bandFixed}`} aria-hidden="true">
        {Array.from({ length: 78 }, (_, index) => (
          <i key={index} aria-current={index === slot - 1 ? "true" : undefined} />
        ))}
      </div>
      <FanText role="meta">{uiText("deckSlot", { total: 78, slot })}</FanText>
    </>
  );
}

/** 뒤집힌 카드: 0.6초에 한 번 뒤집힌다. 역방향은 그림만 거꾸로 놓인다. */
function Flip({ draw, turning, areaRef, flipRef }: { draw: TarotDraw; turning: boolean; areaRef: RefObject<HTMLDivElement | null>; flipRef: RefObject<HTMLDivElement | null> }) {
  return (
    <div ref={areaRef} className={styles.drawn}>
      <div ref={flipRef} className={styles.flip} data-turning={turning || undefined} data-reversed={draw.reversed || undefined}>
        <img className={styles.rear} src={TAROT_BACK} alt="" />
        <img className={styles.face} src={tarotFace(draw.card)} alt={TAROT_DECK[draw.card][2]} />
      </div>
    </div>
  );
}

/** 입장·다시 온 장면의 최애 고르기 띠: 실제 사진 아바타 + 이름. 고른 최애는 핑크 고리와 굵은 이름. */
export function Pickband({ locale, character, onSelect }: { locale: AppLocale; character: TarotCharacter; onSelect: (key: TarotCharacter) => void }) {
  const uiText = useReadingCopy();
  return (
    <div className={styles.pickband} role="group" aria-label={uiText("favorite")}>
      {TAROT_CHARACTERS.map((item) => (
        <FanIconButton key={item.key} aria-label={creatorName(item.key, locale)} aria-pressed={item.key === character} onClick={() => onSelect(item.key)}>
          <img src={tarotAvatar(item.key)} alt="" />
          <FanText role={item.key === character ? "label" : "meta"}>{creatorName(item.key, locale)}</FanText>
        </FanIconButton>
      ))}
    </div>
  );
}
