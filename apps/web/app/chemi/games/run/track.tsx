"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { FanIconButton } from "@/components/fan-ui/fan-icon-button";
import { ArrowDown, ArrowUp, Pause, Volume2, VolumeX } from "@/components/fan-ui/fan-icons";
import { FanPixelText, fanPixelTextClassName } from "@/components/fan-ui/fan-pixel-text";
import { FanText } from "@/components/fan-ui/fan-text";
import { FPS } from "@/features/chemi/games/engine";
import { FEVER_NOTES, FEVER_TICKS, RUN_INPUT, RUN_TITLES, runRound, type RunInput } from "@/features/chemi/games/run";
import { fill, type RunCopy } from "./copy";
import { drawField, loadArt, originOf, PROPS, type Art, type PropName } from "./render";
import type { RunSound } from "./sound";
import styles from "./run.module.css";

export type Ticket = { playId: string; seed: number; trial?: boolean };
export type Submission = { playId: string; ticks: number; inputs: RunInput[]; score: number };
export type RunStats = { score: number; meters: number; notes: number; bestCombo: number; fevers: number; left: boolean };
type Stage = "ready" | "play" | "paused" | "over";

/** One sprite from the props sheet, drawn at a whole-number scale so its dots match the field. */
export function Prop({ name, label }: { name: PropName; label?: string }) {
  const [x, , w, h] = PROPS[name];
  return <span className={styles.prop} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}
    style={{ "--x": x, "--w": w, "--h": h } as CSSProperties} />;
}

export function Legend({ copy, layout }: { copy: RunCopy; layout: "veil" | "list" }) {
  const rows: readonly [PropName, string, string][] = [
    ["cone", copy.jump, copy.jumpWhat], ["crateIcon", copy.double, copy.doubleWhat],
    ["barIcon", copy.slide, copy.slideWhat], ["note", copy.notes, copy.notesWhat],
  ];
  return <dl className={styles.legend} data-layout={layout}>
    {rows.map(([name, action, what]) => <div key={name}>
      <span className={styles.legendIcon}><Prop name={name} /></span>
      <FanText as="dt" role="item">{action}</FanText>
      <FanText as="dd" role="meta">{what}</FanText>
    </div>)}
  </dl>;
}

export function Track({ ticket, copy, locale, name, sound, soundOn, onToggleSound, pauseRequest, onFinish }: {
  ticket: Ticket; copy: RunCopy; locale: string; name: string; sound: RunSound; soundOn: boolean;
  onToggleSound: () => void; pauseRequest: number; onFinish: (body: Submission, stats: RunStats) => void;
}) {
  const [stage, setStage] = useState<Stage>("ready");
  const [hud, setHud] = useState({ score: 0, meters: 0, level: 1, hearts: 3, notes: 0, feverNotes: 0, fever: 0, shield: false });
  const [say, setSay] = useState<{ text: string; id: number }>();
  const [held, setHeld] = useState({ jump: false, slide: false });
  const [artReady, setArtReady] = useState(false);
  const field = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const effects = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Stage>("ready");
  const pending = useRef(0);
  const finishNow = useRef<(left: boolean) => void>(() => {});
  const controls = useRef({ start() {}, resume() {} });
  const finishRef = useRef(onFinish);
  const copyRef = useRef(copy);
  finishRef.current = onFinish;
  copyRef.current = copy;
  const number = new Intl.NumberFormat(locale);

  function go(next: Stage) {
    stageRef.current = next;
    setStage(next);
  }
  function press(mask: number) {
    if (stageRef.current === "play") pending.current |= mask;
  }

  useEffect(() => {
    if (pauseRequest && stageRef.current === "play") go("paused");
  }, [pauseRequest]);

  useEffect(() => {
    const sim = runRound(ticket.seed);
    const inputs: RunInput[] = [];
    const node = canvas.current!;
    const box = field.current!;
    const context = node.getContext("2d")!;
    let art: Art | undefined;
    let scale = 2;
    let frameId = 0;
    let last = performance.now();
    let fraction = 0;
    let freeze = 0;
    let hitFor = 0;
    let sayId = 0;
    let shown = "";
    let finished = false;
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (work: () => void, ms: number) => { const id = setTimeout(() => { timers.delete(id); work(); }, ms); timers.add(id); };

    function resize() {
      scale = innerWidth >= 1024 ? 3 : 2;
      node.width = Math.ceil(box.clientWidth / scale);
      node.height = Math.ceil(box.clientHeight / scale);
      node.style.width = `${node.width * scale}px`;
      node.style.height = `${node.height * scale}px`;
      box.style.setProperty("--run-cell", `${scale}px`);
    }
    function float(text: string, x: number, y: number) {
      const layer = effects.current;
      if (!layer) return;
      const item = document.createElement("span");
      item.className = fanPixelTextClassName("float", styles.float);
      item.textContent = text;
      const left = Math.min(node.width - 24, Math.max(4, x - sim.state.distance + originOf(node.width)));
      item.style.left = `${left * scale}px`;
      item.style.bottom = `${(40 + y + 14) * scale}px`;
      layer.append(item);
      later(() => item.remove(), 650);
    }
    function announce(text: string) {
      const id = ++sayId;
      setSay({ text, id });
      later(() => setSay((current) => current?.id === id ? undefined : current), 1100);
    }
    function finish(left: boolean) {
      if (finished || sim.state.tick < 1) return;
      finished = true;
      go("over");
      const { score, meters, notes, bestCombo, fevers, tick } = sim.state;
      finishRef.current({ playId: ticket.playId, ticks: tick, inputs, score }, { score, meters, notes, bestCombo, fevers, left });
    }
    finishNow.current = finish;
    // Development builds let the capture script read the round and press for it.
    if (process.env.NODE_ENV !== "production") (window as unknown as { __chemiRun?: unknown }).__chemiRun = { sim, press };

    function frame(now: number) {
      frameId = requestAnimationFrame(frame);
      const elapsed = Math.min(100, now - last);
      last = now;
      if (stageRef.current === "play" && !sim.state.done) {
        if (freeze > 0) freeze--;
        else fraction += elapsed * FPS / 1000;
        let steps = 0;
        while (fraction >= 1 && !sim.state.done && steps++ < 6 && freeze === 0) {
          fraction--;
          const mask = pending.current;
          pending.current = 0;
          if (mask) inputs.push([sim.state.tick + 1, mask]);
          sim.step(mask);
          if (hitFor > 0) hitFor--;
          for (const event of sim.events) {
            const text = copyRef.current;
            sound.play(event.type);
            if (event.type === "note" || event.type === "dodge") float(`+${event.points}`, event.x, event.y);
            else if (event.type === "combo") announce(fill(text.combo, { n: event.count }));
            else if (event.type === "fever") announce(`${text.fever}!`);
            else if (event.type === "boost") announce(text.boost);
            else if (event.type === "block") announce(text.shield);
            else if (event.type === "hit" || event.type === "fall") {
              announce(text.crash);
              hitFor = 24;
              if (!calm) {
                freeze = 5;
                box.dataset.hit = "true";
                later(() => { delete box.dataset.hit; }, 320);
              }
            }
          }
        }
        if (fraction > 6) fraction = 0;
        const s = sim.state;
        const key = `${s.score}|${s.meters}|${s.hearts}|${s.notes}|${s.feverNotes}|${Math.ceil(s.fever / 6)}|${s.shield}`;
        if (key !== shown) {
          shown = key;
          setHud({ score: s.score, meters: s.meters, level: s.level, hearts: s.hearts, notes: s.notes, feverNotes: s.feverNotes, fever: s.fever, shield: s.shield });
        }
        if (s.done) {
          sound.play("over");
          later(() => finish(false), calm ? 0 : 500);
        }
      }
      if (art) drawField(context, art, node, sim, hitFor);
    }
    function keyDown(event: KeyboardEvent) {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      const onButton = event.target instanceof HTMLButtonElement || event.target instanceof HTMLAnchorElement;
      if (["Space", "ArrowUp", "KeyW"].includes(event.code)) {
        if (event.code === "Space" && onButton) return;
        event.preventDefault();
        if (stageRef.current === "ready") start();
        else { press(RUN_INPUT.jump); setHeld((now) => ({ ...now, jump: true })); }
      } else if (["ShiftLeft", "ShiftRight", "ArrowDown", "KeyS"].includes(event.code)) {
        event.preventDefault();
        press(RUN_INPUT.slideDown);
        setHeld((now) => ({ ...now, slide: true }));
      } else if (event.code === "KeyP") {
        if (stageRef.current === "play") go("paused");
        else if (stageRef.current === "paused") resume();
      }
    }
    function keyUp(event: KeyboardEvent) {
      if (["Space", "ArrowUp", "KeyW"].includes(event.code)) setHeld((now) => ({ ...now, jump: false }));
      if (["ShiftLeft", "ShiftRight", "ArrowDown", "KeyS"].includes(event.code)) {
        press(RUN_INPUT.slideUp);
        setHeld((now) => ({ ...now, slide: false }));
      }
    }
    // Leaving the tab or the app ends the run where it stands; there is no resuming later.
    function leave() {
      if (document.hidden && (stageRef.current === "play" || stageRef.current === "paused")) finish(true);
    }
    function turned() {
      if (stageRef.current === "play" && matchMedia("(orientation: landscape) and (pointer: coarse) and (height < 30rem)").matches) go("paused");
    }
    function start() {
      sound.play("start");
      last = performance.now();
      go("play");
    }
    function resume() {
      last = performance.now();
      fraction = 0;
      go("play");
    }
    controls.current = { start, resume };

    const observer = new ResizeObserver(resize);
    observer.observe(box);
    resize();
    void loadArt().then((loaded) => { art = loaded; setArtReady(true); }).catch(() => {});
    addEventListener("keydown", keyDown);
    addEventListener("keyup", keyUp);
    addEventListener("resize", turned);
    document.addEventListener("visibilitychange", leave);
    frameId = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      timers.forEach(clearTimeout);
      removeEventListener("keydown", keyDown);
      removeEventListener("keyup", keyUp);
      removeEventListener("resize", turned);
      document.removeEventListener("visibilitychange", leave);
    };
  }, [ticket, sound]);

  const nextTitle = RUN_TITLES.find((title) => title > hud.score);
  const previousTitle = [...RUN_TITLES].reverse().find((title) => title <= hud.score) ?? 0;
  const goal = nextTitle ? (hud.score - previousTitle) / (nextTitle - previousTitle) : 1;
  const feverOn = hud.fever > 0;
  const hold = (key: "jump" | "slide", down: boolean) => (event: ReactPointerEvent<HTMLDivElement>) => {
    if (down) event.currentTarget.setPointerCapture(event.pointerId);
    if (held[key] === down) return;
    setHeld((now) => ({ ...now, [key]: down }));
    if (key === "jump") { if (down) press(RUN_INPUT.jump); }
    else press(down ? RUN_INPUT.slideDown : RUN_INPUT.slideUp);
  };

  return <section className={styles.play} data-fever={feverOn} data-stage={stage}>
    <header className={styles.playTop}>
      <FanIconButton aria-label={copy.pause} disabled={stage !== "play"} onClick={() => go("paused")}><FanIcon icon={Pause} /></FanIconButton>
      <FanText role="label">{name} · {copy.map}</FanText>
      <FanIconButton aria-label={copy.sound} aria-pressed={soundOn} onClick={onToggleSound}><FanIcon icon={soundOn ? Volume2 : VolumeX} /></FanIconButton>
    </header>
    <div className={styles.hud}>
      <div className={styles.hudScore}>
        <FanText role="meta">{copy.score}</FanText>
        <FanPixelText as="strong" role="score" data-run-score="">{number.format(hud.score)}</FanPixelText>
        <FanPixelText role="sub">{number.format(hud.meters)}m · LV.{hud.level}</FanPixelText>
      </div>
      <div className={styles.hudMid}>
        <span className={styles.hearts} role="img" aria-label={`${hud.hearts} / 3`}>
          {[0, 1, 2].map((i) => <Prop key={i} name={i < hud.hearts ? "heart" : "heartEmpty"} />)}
          {hud.shield && <Prop name="shield" />}
        </span>
        <FanText role="label" className={styles.noteCount}><Prop name="note" />{number.format(hud.notes)}</FanText>
      </div>
      <div className={styles.hudFever}>
        <FanText role="label">{feverOn ? `${copy.fever} · ${fill(copy.seconds, { n: (hud.fever / FPS).toFixed(1) })}` : `${copy.fever} ${hud.feverNotes} / ${FEVER_NOTES}`}</FanText>
        <span className={styles.bar}><i style={{ "--fill": feverOn ? hud.fever / FEVER_TICKS : hud.feverNotes / FEVER_NOTES } as CSSProperties} /></span>
      </div>
    </div>
    <div className={styles.goal}>
      <FanText role="meta">{copy.nextTitle} <b>{fill(copy.points, { n: number.format(nextTitle ?? RUN_TITLES[2]) })}</b></FanText>
      <span className={styles.goalTrack}><i style={{ "--fill": goal } as CSSProperties} /></span>
    </div>
    <div className={styles.field} ref={field} data-art={artReady}>
      <canvas ref={canvas} role="img" aria-label={`${name} · ${copy.map}`} />
      <div className={styles.streaks} aria-hidden="true"><i /><i /><i /></div>
      <div className={styles.effects} ref={effects} aria-hidden="true" />
      <div className={styles.flash} aria-hidden="true" />
      {say && <FanPixelText as="p" role="say" className={styles.say} key={say.id}>{say.text}</FanPixelText>}
      {(stage === "ready" || stage === "paused") && <div className={styles.veil}>
        <FanHeading as="h2">{stage === "ready" ? fill(copy.ready, { name }) : copy.paused}</FanHeading>
        {stage === "ready" ? <Legend copy={copy} layout="veil" /> : <FanText className={styles.rotate} role="meta">{copy.rotate}</FanText>}
        <FanAction variant="primary" onClick={() => stage === "ready" ? controls.current.start() : controls.current.resume()}>{stage === "ready" ? copy.go : copy.resume}</FanAction>
        {stage === "paused" && <FanAction onClick={() => finishNow.current(false)}>{copy.quit}</FanAction>}
      </div>}
    </div>
    {/* 출발 준비 덮개가 장애물과 동작을 알려 주는 동안에는 버튼 아래 설명을 겹쳐 적지 않는다. */}
    <div className={styles.controls}>
      <div data-held={held.jump} onPointerDown={hold("jump", true)} onPointerUp={hold("jump", false)} onPointerCancel={hold("jump", false)}>
        <FanAction className={styles.control} leadingIcon={<FanIcon icon={ArrowUp} />}
          helperText={<><kbd>Space</kbd>{stage !== "ready" && copy.jumpHint}</>}
          onClick={(event) => { if (event.detail === 0) press(RUN_INPUT.jump); }}>{copy.jump}</FanAction>
      </div>
      <div data-held={held.slide} onPointerDown={hold("slide", true)} onPointerUp={hold("slide", false)} onPointerCancel={hold("slide", false)}>
        <FanAction className={styles.control} leadingIcon={<FanIcon icon={ArrowDown} />}
          helperText={<><kbd>Shift</kbd>{stage !== "ready" && copy.slideHint}</>}
          onClick={(event) => { if (event.detail === 0) press(RUN_INPUT.slideDown | RUN_INPUT.slideUp); }}>{copy.slide}</FanAction>
      </div>
    </div>
  </section>;
}
