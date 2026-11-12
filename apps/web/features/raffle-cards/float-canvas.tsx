"use client";
import { useEffect, useRef } from "react";
import { createFloatEngine, type FloatEngine } from "./float-art";
import { measureCards } from "./card-face";
import styles from "./card-float.module.css";

export type FloatCanvasProps = {
  /** 카드가 놓인 책상(FanPrintDesk). 캔버스는 이 칸을 그대로 덮는다. */
  desk: HTMLElement;
  /** 책상이 화면 안에 있는지. 밖이거나 탭이 가려지면 그리기를 멈춘다. */
  visible: boolean;
  /** 첫 장(DOM과 같은 정지 자세)을 그린 뒤 true, 내려갈 때 false. */
  onLive: (live: boolean) => void;
  /** 장면을 만들 수 없거나 4초 평균 24fps에 못 미침: 정지 그림(DOM 카드)으로 남는다. */
  onUnavailable: () => void;
  onContextLost: () => void;
  onContextRestored: () => void;
};

const finePointer = () => typeof matchMedia === "function" && matchMedia("(hover: hover) and (pointer: fine)").matches;

/** next/dynamic(ssr:false)으로만 불러온다. three.js는 이 청크 안에 있다(capsule-machine/machine-canvas와 같은 수명 관리). */
export default function FloatCanvas({ desk, visible, onLive, onUnavailable, onContextLost, onContextRestored }: FloatCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<FloatEngine | null>(null);
  const visibleRef = useRef(visible);
  const lostRef = useRef(false), suspendedRef = useRef(false);
  const callbacks = useRef({ onLive, onUnavailable, onContextLost, onContextRestored });
  useEffect(() => { callbacks.current = { onLive, onUnavailable, onContextLost, onContextRestored }; });

  const sync = () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (visibleRef.current && !lostRef.current && !suspendedRef.current && document.visibilityState === "visible") engine.start(); else engine.stop();
  };

  useEffect(() => {
    const canvas = canvasRef.current!;
    let cancelled = false, resize: ResizeObserver | null = null, layoutRun = 0, tiltBase: { beta: number; gamma: number } | null = null;
    const handleLost = (event: Event) => { event.preventDefault(); lostRef.current = true; engineRef.current?.stop(); callbacks.current.onLive(false); callbacks.current.onContextLost(); };
    const handleRestored = () => { if (lostRef.current) callbacks.current.onContextRestored(); };
    const handleVisibility = () => { engineRef.current?.stop(); sync(); };
    const handlePageHide = () => { suspendedRef.current = true; engineRef.current?.stop(); };
    const handlePageShow = () => { suspendedRef.current = false; engineRef.current?.stop(); sync(); };
    // PC: 포인터가 화면 어디에 있든 책상 가운데를 기준으로 카드가 그쪽을 살짝 본다.
    const handlePointer = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const box = desk.getBoundingClientRect();
      engineRef.current?.setPointer((event.clientX - (box.left + box.width / 2)) / (window.innerWidth / 2), (event.clientY - (box.top + box.height / 2)) / (window.innerHeight / 2));
    };
    // 모바일: 기기 기울기가 (허락 없이) 들어오는 브라우저에서만 쓴다. 들어오지 않으면 느린 쉬는 움직임만 남는다.
    const handleTilt = (event: DeviceOrientationEvent) => {
      if (event.beta == null || event.gamma == null) return;
      tiltBase ??= { beta: event.beta, gamma: event.gamma };
      engineRef.current?.setPointer((event.gamma - tiltBase.gamma) / 20, (event.beta - tiltBase.beta) / 20);
    };
    canvas.addEventListener("webglcontextlost", handleLost);
    canvas.addEventListener("webglcontextrestored", handleRestored);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);
    if (finePointer()) window.addEventListener("pointermove", handlePointer, { passive: true });
    else window.addEventListener("deviceorientation", handleTilt, { passive: true });

    void (async () => {
      let engine: FloatEngine;
      try {
        // 쌓이는 연출(FanPrintReveal)이 끝난 자리를 잰다.
        await Promise.all((desk.getAnimations?.({ subtree: true }) ?? []).map(animation => animation.finished.catch(() => undefined)));
        const layout = await measureCards(desk);
        if (cancelled) return;
        if (!layout.piles.length || !layout.width || !layout.height) throw new Error("RAFFLE_CARDS_EMPTY");
        engine = createFloatEngine(canvas, { onStall: () => callbacks.current.onUnavailable() });
        engine.setLayout(layout);
      } catch { if (!cancelled) callbacks.current.onUnavailable(); return; }
      if (cancelled) { engine.dispose(); return; }
      engineRef.current = engine;
      // 폭이 바뀌면 DOM 카드를 다시 재서 같은 자리에 놓는다(재는 동안은 DOM 카드가 보인다).
      let size = `${desk.clientWidth}x${desk.clientHeight}`;
      resize = new ResizeObserver(() => {
        const next = `${desk.clientWidth}x${desk.clientHeight}`;
        if (next === size) return;
        size = next;
        const run = ++layoutRun;
        callbacks.current.onLive(false);
        void measureCards(desk).then(layout => {
          if (cancelled || run !== layoutRun || engineRef.current !== engine) return;
          engine.setLayout(layout); callbacks.current.onLive(true);
        }, () => { if (!cancelled) callbacks.current.onUnavailable(); });
      });
      resize.observe(desk);
      callbacks.current.onLive(true);
      sync();
    })();
    return () => {
      cancelled = true;
      resize?.disconnect();
      canvas.removeEventListener("webglcontextlost", handleLost);
      canvas.removeEventListener("webglcontextrestored", handleRestored);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("pointermove", handlePointer);
      window.removeEventListener("deviceorientation", handleTilt);
      const engine = engineRef.current; engineRef.current = null;
      if (engine) { callbacks.current.onLive(false); engine.dispose(); }
    };
  }, [desk]);

  useEffect(() => { visibleRef.current = visible; sync(); });

  return <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" data-raffle-card-canvas="" />;
}
