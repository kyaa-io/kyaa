"use client";

import Link from "next/link";
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
  TAROT_LINES,
  tarotAvatar,
  tarotCharacter,
  type TarotCharacter,
} from "@/features/chemi/tarot/script";
import { CardRail } from "./card-rail";
import type { TarotMeaning } from "./use-tarot-meaning";
import type { TarotDraw, TarotStep } from "./types";
import styles from "./tarot.module.css";

type Props = {
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
};

const DIRECTION = ["정방향", "역방향"] as const;

export function TarotStage(props: Props) {
  const { step, character, shown, draw, slot, offline, meaning, reduced } = props;
  const person = tarotCharacter(character);
  const lines = TAROT_LINES[person.voice];
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
    if (entry) return revisit ? { label: "오늘 카드 보기", onClick: props.onResult } : { label: "한 장 뽑을래", onClick: props.onStart };
    if (step === "think") return { label: "떠올렸어", onClick: props.onThought };
    if (step === "talk3") return { label: "풀이 볼래", onClick: props.onResult };
    return null;
  })();

  let dialogLine: string;
  if (entry) dialogLine = revisit ? lines.again : lines.hello;
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
          <img src={`/chemi/tarot/scene-${character}-p.webp`} alt={`촛불 켠 방, 탁자 건너편에 앉은 ${person.name}`} />
        </picture>
      </div>
      {entry ? (
        <>
          <FanAction className={`${styles.turn} ${styles.prev}`} variant="text" ariaLabel="이전 최애" leadingIcon={<FanIcon icon={ChevronLeft} />} onClick={() => turn(-1)} />
          <FanAction className={`${styles.turn} ${styles.next}`} variant="text" ariaLabel="다음 최애" leadingIcon={<FanIcon icon={ChevronRight} />} onClick={() => turn(1)} />
        </>
      ) : null}

      <div className={styles.table} data-pick={step === "pick" || undefined}>
        {revisit ? (
          <Link
            className={styles.onTable}
            data-reversed={shown.reversed || undefined}
            href={`#`}
            aria-label={`오늘 카드: ${tarotTitle(shown.card)}`}
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
        {step === "pick" ? <CardRail onPick={props.onPick} randomLabel="아무거나 뽑기" reduced={reduced} controlsHost={controlsHost} /> : null}
        {step === "lock" ? <LockedRail slot={slot ?? 1} cardRef={lockedEl} /> : null}
        {talking && draw ? <Flip draw={draw} turning={step === "flip" && !reduced} areaRef={areaEl} flipRef={flipEl} /> : null}
      </div>

      <div className={styles.panel}>
        {entry && !revisit ? (
          <div className={styles.title}>
            <FanHeading as="h1">오늘의 타로</FanHeading>
          </div>
        ) : null}
        {revisit ? <NameRow draw={shown} trailing="오늘 카드" /> : null}
        {talking && draw ? <NameRow draw={draw} trailing={draw.slot ? `${draw.slot}번째 카드` : null} /> : null}
        {step === "lock" ? (
          <div className={styles.picked}>
            <LockedBand slot={slot ?? 1} />
          </div>
        ) : null}

        {primary ? (
          <div className={styles.choices}>
            <FanAction variant="primary" onClick={primary.onClick}>
              {primary.label}
            </FanAction>
          </div>
        ) : null}

        {step === "pick" ? <div ref={setControlsHost} /> : null}

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
      </div>

      {offline || (talking && meaning.status === "error") ? (
        <div className={styles.offline} role="alert">
          <FanText role="body">연결이 끊겼습니다.</FanText>
          <FanAction size="sm" onClick={props.onRetry}>
            다시 시도
          </FanAction>
        </div>
      ) : null}
    </section>
  );
}

function NameRow({ draw, trailing }: { draw: TarotDraw; trailing: string | null }) {
  return (
    <div className={styles.nameRow}>
      <FanText as="p" role="item">
        {tarotTitle(draw.card)}
      </FanText>
      <FanTag tone="fan">{DIRECTION[Number(draw.reversed)]}</FanTag>
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
  return (
    <ul className={styles.rail} data-locked="">
      <li data-row="">
        <span className={styles.card} data-side="">
          <img src={TAROT_BACK} alt="" />
        </span>
      </li>
      <li data-row="">
        <span ref={cardRef} className={styles.card} aria-current="true" aria-label={`${slot}번째 카드`}>
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
  return (
    <>
      <div className={`${styles.band} ${styles.bandFixed}`} aria-hidden="true">
        {Array.from({ length: 78 }, (_, index) => (
          <i key={index} aria-current={index === slot - 1 ? "true" : undefined} />
        ))}
      </div>
      <FanText role="meta">{`78장 중 ${slot}번째 카드`}</FanText>
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
export function Pickband({ character, onSelect }: { character: TarotCharacter; onSelect: (key: TarotCharacter) => void }) {
  return (
    <div className={styles.pickband} role="group" aria-label="최애">
      {TAROT_CHARACTERS.map((item) => (
        <FanIconButton key={item.key} aria-label={item.name} aria-pressed={item.key === character} onClick={() => onSelect(item.key)}>
          <img src={tarotAvatar(item.key)} alt="" />
          <FanText role={item.key === character ? "label" : "meta"}>{item.name}</FanText>
        </FanIconButton>
      ))}
    </div>
  );
}
