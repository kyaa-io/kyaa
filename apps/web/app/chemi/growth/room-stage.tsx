"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { Heart } from "@/components/fan-ui/fan-icons";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { FanText } from "@/components/fan-ui/fan-text";
import { getRoomLines } from "./room-lines";
import styles from "./growth.module.css";

/** 미니 최애가 지금 하는 일. stand 에서만 다음 행동을 무작위로 고른다. */
type Mode = "stand" | "walk" | "look" | "sit" | "hop" | "pet" | "dizzy";
type Prop = "cat" | "tea" | "lamp";

/** 위치는 모두 방 폭에 대한 %. 미니 최애는 방 폭의 36%이고 x 는 그 왼쪽 끝이다. */
const MINI = 36;
const MIN_X = 4;
const MAX_X = 60;
const HOME_X = 32;
/** 어린이 방 기준 배치: 왼쪽 아래 자는 고양이, 오른쪽 탁자의 찻잔, 오른쪽 책상 위 램프. */
const PROPS: Record<Prop, { x: number; y: number; r: number; stand: number }> = {
  cat: { x: 27, y: 84, r: 9, stand: 34 },
  tea: { x: 80, y: 66, r: 8, stand: 36 },
  lamp: { x: 86, y: 30, r: 8, stand: 44 },
};
/** 단계별 방 그림에 실제로 있는 소품. 아기 방은 침대와 창문뿐이고, 스타 방에는 자는 고양이가 없다. */
const STAGE_PROPS: Record<string, readonly Prop[]> = { baby: [], kid: ["cat", "tea", "lamp"], star: ["tea", "lamp"] };
/** 걷는 속도: 방 폭 1%를 가는 데 걸리는 시간. 방 폭의 36%를 2초 안팎에 간다. */
const WALK_MS_PER_UNIT = 55;
const PET_AFTER_MS = 450;
const DIZZY_TAPS = 4;
const DIZZY_WINDOW_MS = 2500;

const random = (min: number, max: number) => min + Math.random() * (max - min);
const clamp = (value: number) => Math.min(MAX_X, Math.max(MIN_X, value));

export function RoomStage({
  character,
  stage,
  locale,
  label,
  line: firstLine,
}: {
  character: string;
  stage: string;
  locale: string;
  label: string;
  line: string;
}) {
  const lines = getRoomLines(locale, character);
  const room = useRef<HTMLDivElement>(null);
  const walker = useRef<HTMLDivElement>(null);
  const timer = useRef<number>(undefined);
  const idle = useRef<number>(undefined);
  const press = useRef<{ timer?: number; petted: boolean }>({ petted: false });
  const taps = useRef<number[]>([]);
  const lastTap = useRef(-1);
  const [mode, setMode] = useState<Mode>("stand");
  const [x, setX] = useState(HOME_X);
  const [walkMs, setWalkMs] = useState(0);
  const [face, setFace] = useState<"left" | "right">("right");
  const [line, setLine] = useState({ text: firstLine, key: 0 });
  const [effect, setEffect] = useState<{ prop: Prop; key: number }>();
  const [visible, setVisible] = useState(true);
  const [onScreen, setOnScreen] = useState(true);
  const [calm, setCalm] = useState(false);

  useEffect(() => setLine((current) => ({ text: firstLine, key: current.key + 1 })), [firstLine]);

  // 움직임 줄이기·데이터 절약·메모리 2GB 이하 기기에서는 혼자 돌아다니지 않는다(누르면 대사는 바뀜).
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const device = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
    const update = () => setCalm(reduced.matches || Boolean(device.connection?.saveData) || (device.deviceMemory ?? 8) <= 2);
    update();
    reduced.addEventListener("change", update);
    return () => reduced.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const update = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    const node = room.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(Boolean(entry?.isIntersecting)));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => {
    window.clearTimeout(timer.current);
    window.clearTimeout(idle.current);
    window.clearTimeout(press.current.timer);
  }, []);

  const after = useCallback((ms: number, next: () => void) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(next, ms);
  }, []);

  /** 걷는 도중에 멈추면 지금 보이는 자리에 세운다. */
  const stopHere = useCallback(() => {
    const node = walker.current;
    const width = room.current?.clientWidth;
    if (!node || !width) return undefined;
    const shown = clamp(((Number.parseFloat(getComputedStyle(node).translate) || 0) / width) * 100);
    setWalkMs(0);
    setX(shown);
    return shown;
  }, []);

  const walkTo = useCallback(
    (target: number, then?: () => void, from = x) => {
      const to = clamp(target);
      const distance = Math.abs(to - from);
      if (distance < 1) {
        setMode("stand");
        then?.();
        return;
      }
      const ms = calm ? 0 : Math.round(distance * WALK_MS_PER_UNIT);
      setFace(to < from ? "left" : "right");
      setWalkMs(ms);
      setX(to);
      setMode("walk");
      after(ms, () => {
        setMode("stand");
        then?.();
      });
    },
    [after, calm, x],
  );

  const say = useCallback((text: string) => setLine((current) => ({ text, key: current.key + 1 })), []);

  // 혼자 돌아다니기: 서 있으면 2.5~6초 뒤 걷기 55 · 두리번 20 · 앉기 25 중 하나.
  const active = visible && onScreen && !calm;
  useEffect(() => {
    if (!active || mode !== "stand") return;
    idle.current = window.setTimeout(() => {
      const roll = Math.random() * 100;
      if (roll < 55) {
        let target = random(MIN_X, MAX_X);
        if (Math.abs(target - x) < 12) target = x < HOME_X ? clamp(x + random(14, 26)) : clamp(x - random(14, 26));
        walkTo(target);
      } else if (roll < 75) {
        setMode("look");
        after(1800, () => setMode("stand"));
      } else {
        setMode("sit");
        after(random(2500, 4000), () => setMode("stand"));
      }
    }, random(2500, 6000));
    return () => window.clearTimeout(idle.current);
  }, [active, mode, after, walkTo, x]);

  const tap = () => {
    if (press.current.petted) {
      press.current.petted = false;
      return;
    }
    if (mode === "walk") stopHere();
    const now = performance.now();
    taps.current = [...taps.current.filter((time) => now - time < DIZZY_WINDOW_MS), now];
    if (taps.current.length >= DIZZY_TAPS) {
      taps.current = [];
      setMode("dizzy");
      say(lines.dizzy);
      after(900, () => setMode("stand"));
      return;
    }
    let pick = Math.floor(Math.random() * lines.tap.length);
    if (pick === lastTap.current) pick = (pick + 1) % lines.tap.length;
    lastTap.current = pick;
    setMode("hop");
    say(lines.tap[pick]!);
    after(420, () => setMode("stand"));
  };

  const pressStart = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    press.current.petted = false;
    window.clearTimeout(press.current.timer);
    press.current.timer = window.setTimeout(() => {
      if (mode === "walk") stopHere();
      window.clearTimeout(timer.current);
      press.current.petted = true;
      setMode("pet");
      say(lines.pet);
    }, PET_AFTER_MS);
  };

  const pressEnd = () => {
    window.clearTimeout(press.current.timer);
    if (press.current.petted) after(300, () => setMode("stand"));
  };

  // 방을 누르면: 소품이면 그 옆으로 가서 반응, 바닥이면 그쪽으로 걸어온다.
  const callTo = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    const box = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * 100;
    const py = ((event.clientY - box.top) / box.height) * 100;
    const from = (mode === "walk" ? stopHere() : undefined) ?? x;
    const prop = (STAGE_PROPS[stage] ?? []).find((key) => Math.hypot(PROPS[key].x - px, PROPS[key].y - py) <= PROPS[key].r);
    if (prop) {
      walkTo(PROPS[prop].stand, () => {
        setFace(PROPS[prop].x < PROPS[prop].stand + MINI / 2 ? "left" : "right");
        setEffect((current) => ({ prop, key: (current?.key ?? 0) + 1 }));
        say(lines[prop]);
      }, from);
      return;
    }
    if (py > 55) walkTo(px - MINI / 2, undefined, from);
  };

  // PC: 서 있거나 앉아 있을 때 마우스 쪽으로 몸을 돌린다.
  const follow = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || (mode !== "stand" && mode !== "sit")) return;
    const box = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * 100;
    const side = px < x + MINI / 2 - 4 ? "left" : px > x + MINI / 2 + 4 ? "right" : face;
    if (side !== face) setFace(side);
  };

  return (
    <div
      ref={room}
      className={styles.floor}
      onPointerDown={callTo}
      onPointerMove={follow}
      data-moving={active || undefined}
    >
      <div
        ref={walker}
        className={styles.walker}
        data-mode={mode}
        data-face={face}
        data-stage={stage}
        style={{ "--x": x, "--walk": `${walkMs}ms` } as CSSProperties}
        onPointerDown={pressStart}
        onPointerUp={pressEnd}
        onPointerCancel={pressEnd}
        onPointerLeave={pressEnd}
        onContextMenu={(event) => event.preventDefault()}
      >
        <FanAction key={`${character}-${stage}`} variant="text" className={styles.mini} ariaLabel={label} onClick={tap}>
          <span className={styles.body}>
            <img src={`/chemi/grow/mini-${character}-${stage}-v1.webp`} alt="" width={400} height={580} draggable={false} />
          </span>
        </FanAction>
        {mode === "pet" && (
          <span className={styles.hearts} aria-hidden="true">
            <FanIcon icon={Heart} size={20} />
            <FanIcon icon={Heart} size={20} />
          </span>
        )}
      </div>
      {effect && (
        <span
          key={effect.key}
          className={styles.effect}
          data-prop={effect.prop}
          style={{ "--px": PROPS[effect.prop].x, "--py": PROPS[effect.prop].y } as CSSProperties}
          aria-hidden="true"
        >
          <i />
          <i />
          <i />
        </span>
      )}
      <div className={styles.line} aria-live="polite">
        <FanText key={line.key} as="p" role="meta">{line.text}</FanText>
      </div>
    </div>
  );
}
