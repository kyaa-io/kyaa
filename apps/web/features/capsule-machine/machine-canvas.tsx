"use client";
import { useEffect, useRef } from "react";
import { createCapsuleEngine, type CapsuleEngine } from "./machine-art";
import { canRunCapsuleMachine } from "./gpu";
import styles from "./capsule-machine.module.css";

export type MachineCanvasProps = {
  /** The stage is on screen (IntersectionObserver). With a hidden tab this stops the render loop (dev notes 7). */
  visible: boolean;
  onEngine: (engine: CapsuleEngine | null) => void;
  /** WebGL 2 missing or GPU tier 0: the still image stays (dev notes 4·5). */
  onUnavailable: () => void;
  /** iOS context loss: the still image comes back; restore rebuilds the scene through a remount (dev notes 6). */
  onContextLost: () => void;
  onContextRestored: () => void;
};

/** Loaded only through next/dynamic(ssr:false) once the 럭키드로우 block is near the screen; three.js lives in this chunk. */
export default function MachineCanvas({ visible, onEngine, onUnavailable, onContextLost, onContextRestored }: MachineCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<CapsuleEngine | null>(null);
  const visibleRef = useRef(visible);
  const callbacks = useRef({ onEngine, onUnavailable, onContextLost, onContextRestored });
  useEffect(() => { callbacks.current = { onEngine, onUnavailable, onContextLost, onContextRestored }; });

  const sync = () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (visibleRef.current && document.visibilityState === "visible") engine.start(); else engine.stop();
  };

  useEffect(() => {
    const canvas = canvasRef.current!;
    let cancelled = false, lost = false;
    let resize: ResizeObserver | null = null;
    const handleLost = (event: Event) => { event.preventDefault(); lost = true; engineRef.current?.stop(); engineRef.current?.clear(); callbacks.current.onContextLost(); };
    const handleRestored = () => { if (lost) callbacks.current.onContextRestored(); };
    const handleVisibility = () => sync();
    canvas.addEventListener("webglcontextlost", handleLost);
    canvas.addEventListener("webglcontextrestored", handleRestored);
    document.addEventListener("visibilitychange", handleVisibility);
    void (async () => {
      if (!(await canRunCapsuleMachine())) { if (!cancelled) callbacks.current.onUnavailable(); return; }
      if (cancelled) return;
      let engine: CapsuleEngine;
      try { engine = await createCapsuleEngine(canvas, { wordmarkUrl: "/images/guest-home/kyaa-wordmark.svg" }); }
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
      const engine = engineRef.current; engineRef.current = null;
      if (engine) { callbacks.current.onEngine(null); engine.dispose(); }
    };
  }, []);

  useEffect(() => { visibleRef.current = visible; sync(); });

  return <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" data-capsule-canvas="" />;
}
