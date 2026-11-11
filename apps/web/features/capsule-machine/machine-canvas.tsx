"use client";
import { useEffect, useRef } from "react";
import { createCapsuleEngine, type CapsuleEngine, type CapsuleFraming } from "./machine-art";
import styles from "./capsule-machine.module.css";

export type MachineCanvasProps = {
  /** The stage is on screen (IntersectionObserver). With a hidden tab this stops the render loop (dev notes 7). */
  visible: boolean;
  onEngine: (engine: CapsuleEngine | null) => void;
  /** The scene could not be built (the block already ran the WebGL 2 / GPU tier check before loading this chunk): the still image stays. */
  onUnavailable: () => void;
  /** iOS context loss: the still image comes back; restore rebuilds the scene through a remount (dev notes 6). */
  onContextLost: () => void;
  onContextRestored: () => void;
  /** C4 럭키드로우 무대: 쉬는 동안의 장면과 그 구도. 주지 않으면 B2 장면 그대로다. */
  idle?: boolean;
  framing?: CapsuleFraming;
  /** idle이 낮춤 단계를 다 거쳐도 24fps에 못 미침: 정지 그림으로 돌아간다. */
  onStall?: () => void;
};

/** Loaded only through next/dynamic(ssr:false) once the 럭키드로우 block is near the screen and the GPU check passed; three.js lives in this chunk. */
export default function MachineCanvas({ visible, onEngine, onUnavailable, onContextLost, onContextRestored, idle, framing, onStall }: MachineCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<CapsuleEngine | null>(null);
  const visibleRef = useRef(visible);
  const lostRef = useRef(false), suspendedRef = useRef(false);
  const callbacks = useRef({ onEngine, onUnavailable, onContextLost, onContextRestored, onStall });
  useEffect(() => { callbacks.current = { onEngine, onUnavailable, onContextLost, onContextRestored, onStall }; });
  // 장면은 마운트 때 한 번 만든다: 구도는 그때의 값을 쓰고, 폭이 바뀌면 부른 쪽이 key로 다시 마운트한다.
  const scene = useRef({ idle, framing });

  const sync = () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (visibleRef.current && !lostRef.current && !suspendedRef.current && document.visibilityState === "visible") engine.start(); else engine.stop();
  };

  useEffect(() => {
    const canvas = canvasRef.current!;
    let cancelled = false;
    let resize: ResizeObserver | null = null;
    const handleLost = (event: Event) => { event.preventDefault(); lostRef.current = true; canvas.dataset.contextLost = ""; engineRef.current?.stop(); engineRef.current?.clear(); callbacks.current.onContextLost(); };
    const handleRestored = () => { if (lostRef.current) callbacks.current.onContextRestored(); };
    const handleVisibility = () => { engineRef.current?.stop(); sync(); };
    const handlePageHide = () => { suspendedRef.current = true; engineRef.current?.stop(); };
    // A restored page may retain running=true without a pending Safari animation frame.
    const handlePageShow = () => { suspendedRef.current = false; engineRef.current?.stop(); sync(); };
    canvas.addEventListener("webglcontextlost", handleLost);
    canvas.addEventListener("webglcontextrestored", handleRestored);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);
    void (async () => {
      let engine: CapsuleEngine;
      try { engine = await createCapsuleEngine(canvas, { wordmarkUrl: "/images/guest-home/kyaa-wordmark.svg", ...scene.current, onStall: () => callbacks.current.onStall?.() }); }
      catch { if (!cancelled) callbacks.current.onUnavailable(); return; }
      if (cancelled) { engine.dispose(); return; }
      engineRef.current = engine;
      const fit = () => { const { width, height } = canvas.getBoundingClientRect(); if (width && height) engine.setSize(width, height); };
      resize = new ResizeObserver(fit); resize.observe(canvas); fit();
      const memory = engine.memory();
      canvas.dataset.glGeometries = String(memory.geometries); canvas.dataset.glTextures = String(memory.textures);
      callbacks.current.onEngine(engine);
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
      const engine = engineRef.current; engineRef.current = null;
      if (engine) { callbacks.current.onEngine(null); engine.dispose(); }
    };
  }, []);

  useEffect(() => { visibleRef.current = visible; sync(); });

  return <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" data-capsule-canvas="" />;
}
