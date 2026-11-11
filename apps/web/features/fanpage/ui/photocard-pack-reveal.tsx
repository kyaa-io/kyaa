"use client";
import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import type { AppLocale } from "@/i18n/locales";
import { photocardPackCopy } from "../domain/photocard-pack-copy";
import styles from "./photocard-pack-reveal.module.css";

type Stage = "idle" | "burst" | "revealed" | "done";

const TEAR_Y = 17;
const SEGMENTS = 16;
/** Fixed jagged tear line shared by the top strip and the pack body, so the two halves fit back together. */
const TEAR = Array.from({ length: SEGMENTS + 1 }, (_, i) => [(i / SEGMENTS) * 100, TEAR_Y + (i % 2 ? 1.6 : -1.2) + ((i * 37) % 7) / 8] as const);
const points = (list: readonly (readonly [number, number])[]) => list.map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`).join(",");
const TOP_CLIP = `polygon(0 0,100% 0,${points([...TEAR].reverse())})`;
const BODY_CLIP = `polygon(${points(TEAR)},100% 100%,0 100%)`;
const CONFETTI = Array.from({ length: 30 }, (_, i) => {
  const a = ((i * 137.5) % 360) * (Math.PI / 180), r = 70 + ((i * 53) % 90), seed = (i * 7919) % 100;
  return { dx: Math.cos(a) * r * 1.3, dy: -Math.abs(Math.sin(a)) * r - 30 + (seed % 20), rot: (seed * 9) % 540 - 270, delay: (i % 6) * 22, tone: i % 4, size: 6 + (seed % 6) };
});

function reducedMotion() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Pack-tear ceremony in front of already-claimed photocards. Presentation only: the children (the authenticated media)
 * are mounted at once so they load behind the pack, and stay hidden until the pack is torn open.
 */
export function PhotocardPackReveal({ locale, alreadyOpened, onOpened, children }: { locale: AppLocale; alreadyOpened: boolean; onOpened: () => void; children: ReactNode }) {
  const copy = photocardPackCopy(locale);
  const [stage, setStage] = useState<Stage>(() => alreadyOpened || reducedMotion() ? "done" : "idle");
  const pack = useRef<HTMLDivElement>(null), cards = useRef<HTMLDivElement>(null), timers = useRef<number[]>([]);
  const drag = useRef<{ id: number; x: number; width: number; moved: boolean } | null>(null);
  const confetti = useMemo(() => CONFETTI, []);
  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);
  useEffect(() => { if (stage === "done" && !alreadyOpened) onOpened(); }, [stage, alreadyOpened, onOpened]);

  function setProgress(value: number, dir?: "left" | "right") {
    pack.current?.style.setProperty("--p", String(value));
    if (dir && pack.current) pack.current.dataset.dir = dir;
  }
  function tear() {
    if (stage !== "idle") return;
    drag.current = null; setProgress(1); setStage("burst");
    timers.current.push(window.setTimeout(() => { setStage("revealed"); cards.current?.focus({ preventScroll: true }); }, 520), window.setTimeout(() => setStage("done"), 1300));
  }
  function down(event: PointerEvent<HTMLDivElement>) {
    if (stage !== "idle" || !event.isPrimary) return;
    drag.current = { id: event.pointerId, x: event.clientX, width: event.currentTarget.getBoundingClientRect().width, moved: false };
    event.currentTarget.setPointerCapture?.(event.pointerId); event.currentTarget.dataset.dragging = "true";
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const d = drag.current; if (!d || d.id !== event.pointerId) return;
    const dx = event.clientX - d.x; if (Math.abs(dx) > 6) d.moved = true;
    const p = Math.min(1, Math.abs(dx) / (d.width * 0.72));
    setProgress(p, dx < 0 ? "left" : "right");
    if (p >= 0.96) { event.currentTarget.dataset.dragging = "false"; tear(); }
  }
  function up(event: PointerEvent<HTMLDivElement>) {
    const d = drag.current; if (!d || d.id !== event.pointerId) return;
    event.currentTarget.dataset.dragging = "false";
    if (!d.moved) { tear(); return; }
    const progress = Number(pack.current?.style.getPropertyValue("--p") || 0);
    drag.current = null;
    if (progress >= 0.55) tear(); else setProgress(0);
  }

  const torn = stage !== "idle";
  return <div className={styles.root} data-stage={stage}>
    {stage !== "done" ? <div className={styles.packArea}>
      <div ref={pack} className={styles.pack} data-stage={stage} data-dir="right" aria-hidden="true" style={{ "--p": 0 } as React.CSSProperties}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={e => { drag.current = null; e.currentTarget.dataset.dragging = "false"; setProgress(0); }}>
        <div className={styles.body} style={{ clipPath: BODY_CLIP }}><PackFace /></div>
        <div className={styles.gap} />
        <div className={styles.top} style={{ clipPath: TOP_CLIP }}><PackFace /></div>
        {torn ? <div className={styles.confetti}>{confetti.map((c, i) => <i key={i} data-tone={c.tone} style={{ "--dx": `${c.dx}px`, "--dy": `${c.dy}px`, "--rot": `${c.rot}deg`, "--delay": `${c.delay}ms`, width: c.size, height: c.size * 1.6 } as React.CSSProperties} />)}</div> : null}
      </div>
      {stage === "idle" ? <FanAction variant="neutral" onClick={tear}>{copy.open}</FanAction> : null}
    </div> : null}
    <div ref={cards} tabIndex={-1} className={styles.cards} hidden={stage === "idle" || stage === "burst"} data-stage={stage}>{children}</div>
  </div>;
}

function PackFace() {
  return <div className={styles.face}><span className={styles.crimp} /><strong>KYAA</strong><span className={styles.crimpBottom} /></div>;
}

/** Tilt and rainbow reflection that follow the pointer; idles with a slow sweep so touch screens also see it. */
export function HoloCard({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  function move(event: PointerEvent<HTMLDivElement>) {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect(), x = Math.min(1, Math.max(0, (event.clientX - r.left) / r.width)), y = Math.min(1, Math.max(0, (event.clientY - r.top) / r.height));
    el.dataset.active = "true";
    el.style.setProperty("--hx", String(x)); el.style.setProperty("--hy", String(y));
    el.style.setProperty("--tx", `${((x - 0.5) * 14).toFixed(2)}deg`); el.style.setProperty("--ty", `${((0.5 - y) * 14).toFixed(2)}deg`);
  }
  function leave() {
    const el = ref.current; if (!el) return;
    el.dataset.active = "false"; el.style.setProperty("--tx", "0deg"); el.style.setProperty("--ty", "0deg");
  }
  return <div ref={ref} className={styles.holo} data-active="false" onPointerMove={move} onPointerLeave={leave} onPointerCancel={leave}>{children}</div>;
}
