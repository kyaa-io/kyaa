"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
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
import { readRunKey, RUN_KEYCAPS, RUN_PAUSE_SHORTCUT, runKeyAction } from "./keys";
import { drawField, pixelScale, loadArt, originOf, PROPS, SHIELD_FX_TICKS, type Art, type PropName } from "./render";
import type { RunSound } from "./sound";
import styles from "./run.module.css";

export type Ticket = { playId: string; seed: number; spentPoints?: number; trial?: boolean };
export type Submission = { playId: string; ticks: number; inputs: RunInput[]; score: number };
export type RunStats = { score: number; meters: number; notes: number; bestCombo: number; fevers: number; left: boolean };
type Stage = "ready" | "play" | "paused" | "over";
/** How long the key strip stays on the field after the first start. */
const HINT_MS = 4000;

/** One sprite from the props sheet, drawn at a whole-number scale so its dots match the field. */
export function Prop({ name, label }: { name: PropName; label?: string }) {
  const [x, , w, h] = PROPS[name];
  return <span className={styles.prop} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}
    style={{ "--x": x, "--w": w, "--h": h } as CSSProperties} />;
}

const FINE = "(pointer: fine)";
/** True with a mouse or trackpad. Key guides show only then; touch keeps the buttons and the legend. */
export function useKeyboardGuide() {
  return useSyncExternalStore((change) => {
    const query = matchMedia(FINE);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, () => matchMedia(FINE).matches, () => false);
}

export function Keys({ caps }: { caps: readonly string[] }) {
  return <FanText role="label" className={styles.keys}>
    {caps.map((cap, i) => <kbd key={i}>{cap}</kbd>)}
  </FanText>;
}

export function Legend({ copy, layout }: { copy: RunCopy; layout: "veil" | "list" }) {
  const keys = useKeyboardGuide();
  // 2단 점프는 같은 키를 두 번: Space 키캡 두 개.
  const rows: readonly [PropName, string, string, readonly string[]][] = [
    ["cone", copy.jump, copy.jumpWhat, RUN_KEYCAPS.jump], ["crateIcon", copy.double, copy.doubleWhat, [RUN_KEYCAPS.jump[0], RUN_KEYCAPS.jump[0]]],
    ["barIcon", copy.slide, copy.slideWhat, RUN_KEYCAPS.slide], ["note", copy.notes, copy.notesWhat, []],
  ];
  return <dl className={styles.legend} data-layout={layout} data-keys={keys}>
    {rows.map(([name, action, what, caps]) => <div key={name}>
      <span className={styles.legendIcon}><Prop name={name} /></span>
      <FanText as="dt" role="item">{action}</FanText>
      {keys && <dd className={styles.legendKeys}>{caps.length > 0 && <Keys caps={caps} />}</dd>}
      <FanText as="dd" role="meta">{what}</FanText>
    </div>)}
  </dl>;
}

export function Track({ character, ticket, copy, locale, name, sound, soundOn, onToggleSound, pauseRequest, onFinish, rerun = false }: {
  character: import("./shared").Character; ticket: Ticket; rerun?: boolean; copy: RunCopy; locale: string; name: string; sound: RunSound; soundOn: boolean;
  onToggleSound: () => void; pauseRequest: number; onFinish: (body: Submission, stats: RunStats) => void;
}) {
  // "Run again" from the result goes straight to running; the ready veil is for the first run of a visit.
  const [stage, setStage] = useState<Stage>(rerun ? "play" : "ready");
  const [hud, setHud] = useState({ score: 0, meters: 0, level: 1, hearts: 3, notes: 0, feverNotes: 0, fever: 0, shield: false });
  const [say, setSay] = useState<{ text: string; id: number }>();
  const [held, setHeld] = useState({ jump: false, slide: false });
  const [artReady, setArtReady] = useState(false);
  const [showSpend, setShowSpend] = useState(Boolean(ticket.spentPoints));
  useEffect(() => {
    if (!ticket.spentPoints) return;
    const timer = window.setTimeout(() => setShowSpend(false), 2800);
    return () => window.clearTimeout(timer);
  }, [ticket.spentPoints]);
  const [hint, setHint] = useState(false);
  const keyboard = useKeyboardGuide();
  const veil = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const effects = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Stage>(rerun ? "play" : "ready");
  const pending = useRef(0);
  const finishNow = useRef<(left: boolean) => void>(() => {});
  const controls = useRef({ start() {}, resume() {} });
  const finishRef = useRef(onFinish);
  const copyRef = useRef(copy);
  finishRef.current = onFinish;
  copyRef.current = copy;
  const number = new Intl.NumberFormat(locale);

  function go(next: Stage) {
    sound.music(character, next === "play" ? "run" : null);
    stageRef.current = next;
    setStage(next);
  }
  function press(mask: number) {
    if (stageRef.current === "play") pending.current |= mask;
  }

  // Only a back press made during this run pauses it; a count left from an earlier run does not.
  const seenPause = useRef(pauseRequest);
  useEffect(() => {
    if (pauseRequest === seenPause.current) return;
    seenPause.current = pauseRequest;
    if (stageRef.current === "play") go("paused");
  }, [pauseRequest]);
  // The veil's main button takes focus so Enter or Space starts or resumes without the mouse.
  useEffect(() => {
    if (stage === "ready" || stage === "paused") veil.current?.querySelector("button")?.focus({ preventScroll: true });
  }, [stage]);

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

    let hitFor = 0;
    const shieldFx = { gained: 0, broke: 0 };
    let sayId = 0;
    let shown = "";
    let finished = false;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (work: () => void, ms: number) => { const id = setTimeout(() => { timers.delete(id); work(); }, ms); timers.add(id); };

    function resize() {
      scale = pixelScale(innerWidth >= 1024 ? 3 : 2);
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
        fraction += elapsed * FPS / 1000;
        let steps = 0;
        while (fraction >= 1 && !sim.state.done && steps++ < 6) {
          fraction--;
          const mask = pending.current;
          pending.current = 0;
          if (mask) inputs.push([sim.state.tick + 1, mask]);
          sim.step(mask);
          if (hitFor > 0) hitFor--;
          if (shieldFx.gained > 0) shieldFx.gained--;
          if (shieldFx.broke > 0) shieldFx.broke--;
          for (const event of sim.events) {
            const text = copyRef.current;
            sound.play(event.type);
            if (event.type === "note" || event.type === "dodge") float(`+${event.points}`, event.x, event.y);
            else if (event.type === "combo") announce(fill(text.combo, { n: event.count }));
            else if (event.type === "fever") announce(`${text.fever}!`);
            else if (event.type === "boost") announce(text.boost);
            else if (event.type === "shield") shieldFx.gained = SHIELD_FX_TICKS;
            else if (event.type === "block") { announce(text.shield); shieldFx.broke = SHIELD_FX_TICKS; }
            else if (event.type === "hit" || event.type === "fall") {
              announce(text.crash);
              hitFor = 24;
              if (!motion.matches) {
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
          later(() => finish(false), motion.matches ? 0 : 500);
        }
      }
      if (art) drawField(context, art, node, sim, hitFor, motion.matches, shieldFx);
    }
    function key(event: KeyboardEvent) {
      const action = runKeyAction(readRunKey(event), stageRef.current);
      if (!action) return;
      if (event.type === "keydown") event.preventDefault();
      if (action === "start") start();
      else if (action === "resume") resume();
      else if (action === "pause") go("paused");
      else if (action === "jump") { press(RUN_INPUT.jump); setHeld((now) => ({ ...now, jump: true })); }
      else if (action === "jumpUp") setHeld((now) => ({ ...now, jump: false }));
      else if (action === "slideDown") { press(RUN_INPUT.slideDown); setHeld((now) => ({ ...now, slide: true })); }
      else {
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
      sound.unlock();
      sound.play("start");
      last = performance.now();
      go("play");
      later(() => {
        setHint(true);
        later(() => setHint(false), HINT_MS);
      }, 3000);
    }
    // A slide key let go while paused never reached the round; stand up again so the runner is not stuck low.
    function resume() {
      last = performance.now();
      fraction = 0;
      go("play");
      pending.current |= RUN_INPUT.slideUp;
      setHeld({ jump: false, slide: false });
    }
    controls.current = { start, resume };
    if (rerun) start();

    const observer = new ResizeObserver(resize);
    observer.observe(box);
    resize();
    void loadArt(character).then((loaded) => { art = loaded; setArtReady(true); }).catch(() => {});
    addEventListener("keydown", key);
    addEventListener("keyup", key);
    addEventListener("resize", turned);
    document.addEventListener("visibilitychange", leave);
    frameId = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      timers.forEach(clearTimeout);
      removeEventListener("keydown", key);
      removeEventListener("keyup", key);
      removeEventListener("resize", turned);
      document.removeEventListener("visibilitychange", leave);
    };
  }, [character, ticket, sound, rerun]);

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
      <FanIconButton aria-label={copy.pause} aria-keyshortcuts={RUN_PAUSE_SHORTCUT} disabled={stage !== "play"} onClick={() => go("paused")}><FanIcon icon={Pause} /></FanIconButton>
      <FanText role="label">{name} · {copy.map}</FanText>
      <FanIconButton aria-label={copy.sound} aria-pressed={soundOn} onClick={onToggleSound}><FanIcon icon={soundOn ? Volume2 : VolumeX} /></FanIconButton>
    </header>
    <div className={styles.hud}>
      <div className={styles.hudScore}>
        <FanText role="meta">{copy.score}</FanText>
        <div className={styles.scoreLine}><FanPixelText as="strong" role="score" data-run-score="">{number.format(hud.score)}</FanPixelText>
        {showSpend && <FanText role="label"><span role="status">−{ticket.spentPoints}P</span></FanText>}</div>
        <FanPixelText role="sub">{number.format(hud.meters)}m · LV.{hud.level}</FanPixelText>
      </div>
      <div className={styles.hudMid}>
        <span className={styles.hearts} role="img" aria-label={`${hud.hearts} / 3`}>
          {[0, 1, 2].map((i) => <Prop key={i} name={i < hud.hearts ? "heart" : "heartEmpty"} />)}
          {hud.shield && <span className={styles.shieldOn}><Prop name="shield" /></span>}
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
      <div className={styles.effects} ref={effects} aria-hidden="true" />
      {say && <FanPixelText as="p" role="say" className={styles.say} key={say.id}>{say.text}</FanPixelText>}
      {keyboard && hint && stage === "play" && <p className={styles.keyHint} aria-hidden="true">
        <span><Keys caps={RUN_KEYCAPS.jump.slice(0, 1)} /><FanText role="label">{copy.jump}</FanText></span>
        <span><Keys caps={RUN_KEYCAPS.slide.slice(0, 1)} /><FanText role="label">{copy.slide}</FanText></span>
        <span><Keys caps={RUN_KEYCAPS.pause.slice(0, 1)} /><FanText role="label">{copy.pause}</FanText></span>
      </p>}
      {(stage === "ready" || stage === "paused") && <div className={styles.veil} ref={veil} data-stage={stage}>
        <FanHeading as="h2">{stage === "ready" ? fill(copy.ready, { name }) : copy.paused}</FanHeading>
        {stage === "ready" ? <Legend copy={copy} layout="veil" /> : <>
          <FanText className={styles.rotate} role="meta">{copy.rotate}</FanText>
          {keyboard && <Legend copy={copy} layout="veil" />}
        </>}
        <FanAction variant="primary" trailingIcon={keyboard && <Keys caps={stage === "ready" ? RUN_KEYCAPS.jump.slice(0, 1) : RUN_KEYCAPS.pause.slice(1)} />}
          onClick={() => stage === "ready" ? controls.current.start() : controls.current.resume()}>{stage === "ready" ? copy.go : copy.resume}</FanAction>
        {stage === "paused" && <FanAction onClick={() => finishNow.current(false)}>{copy.quit}</FanAction>}
      </div>}
    </div>
    {/* 출발 준비 덮개가 장애물과 동작을 알려 주는 동안에는 버튼 아래 설명을 겹쳐 적지 않는다. */}
    <div className={styles.controls}>
      <div data-held={held.jump} onPointerDown={hold("jump", true)} onPointerUp={hold("jump", false)} onPointerCancel={hold("jump", false)}>
        <FanAction className={styles.control} leadingIcon={<FanIcon icon={ArrowUp} />}
          helperText={<>{keyboard && <Keys caps={RUN_KEYCAPS.jump.slice(0, 1)} />}{stage !== "ready" && copy.jumpHint}</>}
          onClick={(event) => { if (event.detail === 0) press(RUN_INPUT.jump); }}>{copy.jump}</FanAction>
      </div>
      <div data-held={held.slide} onPointerDown={hold("slide", true)} onPointerUp={hold("slide", false)} onPointerCancel={hold("slide", false)}>
        <FanAction className={styles.control} leadingIcon={<FanIcon icon={ArrowDown} />}
          helperText={<>{keyboard && <Keys caps={RUN_KEYCAPS.slide.slice(0, 1)} />}{stage !== "ready" && copy.slideHint}</>}
          onClick={(event) => { if (event.detail === 0) press(RUN_INPUT.slideDown | RUN_INPUT.slideUp); }}>{copy.slide}</FanAction>
      </div>
    </div>
  </section>;
}
