"use client";

import { useReadingCopy } from "@/features/chemi/i18n/reading-ui";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { FanText } from "@/components/fan-ui/fan-text";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { FanIconButton } from "@/components/fan-ui/fan-icon-button";
import { ChevronLeft, ChevronRight } from "@/components/fan-ui/fan-icons";
import { TAROT_BACK, TAROT_DECK_SIZE } from "@/features/chemi/tarot/deck";
import styles from "./tarot.module.css";

/** 가운데 카드에서 멀수록 흐려지는 불투명도(흐림 필터 없음). */
const OPACITY = [1, 0.72, 0.5, 0.34, 0.22];
const START = Math.floor(TAROT_DECK_SIZE / 2);

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** 큰 카드 줄은 탁자에 놓이고, 덱 띠와 '아무거나 뽑기'는 대화 판 안(controlsHost)에 같은 상태로 그려진다. */
export function CardRail({
  onPick,
  randomLabel,
  reduced,
  controlsHost,
  showPosition = false,
  excluded = [],
}: {
  onPick: (slot: number) => void;
  randomLabel: string;
  reduced: boolean;
  controlsHost: HTMLElement | null;
  showPosition?: boolean;
  excluded?: readonly number[];
}) {
  const uiText = useReadingCopy();
  const slotLabel = (index: number) => uiText("deckSlot", { total: TAROT_DECK_SIZE, slot: index + 1 });
  const rail = useRef<HTMLUListElement>(null);
  const [initial] = useState(() => {
    let slot = START;
    while (excluded.includes(slot)) slot = (slot + 1) % TAROT_DECK_SIZE;
    return slot;
  });
  const [current, setCurrent] = useState(initial);
  const currentRef = useRef(initial);
  const [nudge, setNudge] = useState(false);
  const idle = useRef<ReturnType<typeof setTimeout>>(undefined);
  const nudges = useRef(0);
  const touching = useRef(false);
  const dragged = useRef(false);
  const pointer = useRef<{ id: number; x: number; left: number } | null>(null);
  const spinning = useRef(false);
  const [dragging, setDragging] = useState(false);

  const cards = useCallback(() => Array.from(rail.current?.querySelectorAll<HTMLElement>("[data-card]") ?? []), []);
  const offsetOf = useCallback(
    (index: number) => {
      const card = cards()[index];
      const list = rail.current;
      if (!card || !list) return 0;
      return (card.parentElement as HTMLElement).offsetLeft - (list.clientWidth - card.offsetWidth) / 2;
    },
    [cards],
  );
  const nearest = useCallback(() => {
    const list = rail.current;
    if (!list) return currentRef.current;
    const step = offsetOf(1) - offsetOf(0);
    return step > 0 ? Math.max(0, Math.min(TAROT_DECK_SIZE - 1, Math.round((list.scrollLeft - offsetOf(0)) / step))) : currentRef.current;
  }, [initial, offsetOf]);
  const resting = useCallback(() => Math.abs((rail.current?.scrollLeft ?? 0) - offsetOf(nearest())) < 2, [nearest, offsetOf]);

  const paint = useCallback((index: number) => {
    if (index !== currentRef.current && touching.current) navigator.vibrate?.(5);
    currentRef.current = index;
    setCurrent(index);
  }, []);
  const moveTo = useCallback(
    (index: number, smooth = true) => {
      const next = Math.max(0, Math.min(TAROT_DECK_SIZE - 1, index));
      rail.current?.scrollTo({ left: offsetOf(next), behavior: smooth && !reduced ? "smooth" : "instant" });
      paint(next);
    },
    [offsetOf, paint, reduced],
  );

  // 화면이 열리며 줄을 가운데에 놓는다(움직임으로 치지 않는다).
  useIsoLayoutEffect(() => {
    if (rail.current) rail.current.scrollLeft = offsetOf(initial);
  }, [initial, offsetOf]);

  // 2초 동안 아무것도 안 하면 가운데 카드가 한 번 들썩인다(세 번까지). 손을 대면 멈춘다.
  const restIdle = useCallback(() => {
    clearTimeout(idle.current);
    setNudge(false);
    if (reduced || nudges.current >= 3) return;
    idle.current = setTimeout(() => {
      nudges.current += 1;
      setNudge(true);
    }, 2000);
  }, [reduced]);
  useEffect(() => {
    restIdle();
    return () => clearTimeout(idle.current);
  }, [restIdle]);

  const press = (index: number) => {
    if (dragged.current || spinning.current) return;
    if (!resting()) return moveTo(nearest());
    if (index !== currentRef.current) return moveTo(index);
    if (!excluded.includes(index)) onPick(index);
  };

  const keys = (event: KeyboardEvent) => {
    const step = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (!step) return;
    event.preventDefault();
    moveTo(currentRef.current + step, false);
    cards()[currentRef.current]?.focus({ preventScroll: true });
  };

  const down = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    pointer.current = { id: event.pointerId, x: event.clientX, left: rail.current?.scrollLeft ?? 0 };
    dragged.current = false;
  };
  useEffect(() => {
    const move = (event: globalThis.PointerEvent) => {
      const grab = pointer.current;
      if (!grab || event.pointerId !== grab.id || !rail.current) return;
      if (Math.abs(event.clientX - grab.x) > 10) {
        dragged.current = true;
        setDragging(true);
      }
      if (dragged.current) rail.current.scrollLeft = grab.left - (event.clientX - grab.x);
    };
    const up = (event: globalThis.PointerEvent) => {
      const grab = pointer.current;
      if (!grab || event.pointerId !== grab.id) return;
      pointer.current = null;
      setDragging(false);
      if (dragged.current) {
        moveTo(nearest());
        setTimeout(() => (dragged.current = false), 0);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [moveTo, nearest]);

  // 덱 띠: 어디를 눌러 끌어도 가운데 카드가 손가락 위치의 카드로 바뀐다.
  const band = useRef<HTMLDivElement>(null);
  const scrub = (event: PointerEvent) => {
    const box = band.current?.getBoundingClientRect();
    if (box) moveTo(Math.floor(((event.clientX - box.left) / box.width) * TAROT_DECK_SIZE), false);
  };

  // 아무거나 뽑기: 줄이 빠르게 돌다가 한 장에서 멈추고 그 카드로 정해진다.
  const random = () => {
    if (spinning.current) return;
    const available = Array.from({ length: TAROT_DECK_SIZE }, (_, index) => index).filter((index) => !excluded.includes(index));
    const target = available[Math.floor(Math.random() * available.length)];
    if (reduced) {
      moveTo(target, false);
      return onPick(target);
    }
    spinning.current = true;
    setDragging(true);
    const list = rail.current!;
    const from = list.scrollLeft;
    const end = offsetOf(target);
    const lap = offsetOf(TAROT_DECK_SIZE - 1) - offsetOf(0);
    const start = performance.now();
    const spin = (now: number) => {
      const k = Math.min(1, (now - start) / 1200);
      const ease = 1 - (1 - k) ** 3;
      const sweep = from + (end - from) * ease + Math.sin(ease * Math.PI) * lap * 0.35 * Math.sign(end - from || 1);
      list.scrollLeft = Math.max(offsetOf(0), Math.min(offsetOf(TAROT_DECK_SIZE - 1), sweep));
      if (k < 1) return void requestAnimationFrame(spin);
      setDragging(false);
      moveTo(target, false);
      setTimeout(() => {
        spinning.current = false;
        onPick(target);
      }, 300);
    };
    requestAnimationFrame(spin);
  };

  const controls = (
    <>
      {showPosition && <FanText as="p" role="label" className={styles.deckPosition}>{slotLabel(current)}</FanText>}
      <div className={styles.pickRow}>
        <div
          ref={band}
          className={styles.band}
          role="slider"
          tabIndex={0}
          aria-label={uiText("pickCard")}
          aria-valuemin={1}
          aria-valuemax={TAROT_DECK_SIZE}
          aria-valuenow={current + 1}
          aria-valuetext={slotLabel(current)}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            scrub(event);
          }}
          onPointerMove={(event) => event.currentTarget.hasPointerCapture(event.pointerId) && scrub(event)}
          onKeyDown={(event) => {
            const step = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
            if (!step) return;
            event.preventDefault();
            moveTo(currentRef.current + step, false);
          }}
        >
          {Array.from({ length: TAROT_DECK_SIZE }, (_, index) => (
            <i key={index} aria-current={index === current ? "true" : undefined} />
          ))}
        </div>
        <FanAction onClick={random}>{randomLabel}</FanAction>
      </div>
    </>
  );

  return (
    <>
      <div className={styles.railBox}>
        <ul
          ref={rail}
          className={styles.rail}
          data-dragging={dragging || undefined}
          onKeyDown={keys}
          onPointerDown={down}
          onScroll={() => {
            if (!spinning.current) paint(nearest());
            restIdle();
          }}
          onTouchStart={() => {
            touching.current = true;
          }}
          onTouchEnd={() => setTimeout(() => (touching.current = false), 600)}
        >
          {Array.from({ length: TAROT_DECK_SIZE }, (_, index) => {
            const far = Math.abs(index - current);
            return (
              <li key={index} data-row="">
                <FanIconButton
                  data-card=""
                  className={styles.card}
                  aria-label={slotLabel(index)}
                  aria-disabled={excluded.includes(index) || undefined}
                  aria-current={far === 0 ? "true" : undefined}
                  data-nudge={far === 0 && nudge ? "" : undefined}
                  tabIndex={far === 0 ? 0 : -1}
                  style={{ "--o": far > 4 ? 0 : OPACITY[far] } as React.CSSProperties}
                  onClick={() => press(index)}
                  onAnimationEnd={() => setNudge(false)}
                >
                  <img src={TAROT_BACK} alt="" loading={far < 6 ? "eager" : "lazy"} draggable={false} />
                </FanIconButton>
              </li>
            );
          })}
        </ul>
        <FanAction
          className={`${styles.turn} ${styles.cardPrev}`}
          variant="text"
          ariaLabel={uiText("previousCard")}
          leadingIcon={<FanIcon icon={ChevronLeft} />}
          onClick={() => moveTo(currentRef.current - 1, !showPosition)}
        />
        <FanAction
          className={`${styles.turn} ${styles.cardNext}`}
          variant="text"
          ariaLabel={uiText("nextCard")}
          leadingIcon={<FanIcon icon={ChevronRight} />}
          onClick={() => moveTo(currentRef.current + 1, !showPosition)}
        />
      </div>
      {controlsHost ? createPortal(controls, controlsHost) : null}
    </>
  );
}
