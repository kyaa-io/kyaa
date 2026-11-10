"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { CapsuleFraming } from "./machine-art";
import styles from "./lucky-stage.module.css";

// C4: 럭키드로우 카드의 무대. 서버 HTML에는 같은 크기의 정지 그림만 있고, three.js는 아래 조건이 모두 맞은 뒤에만 내려받는다.
const MachineCanvas = dynamic(() => import("./machine-canvas"), { ssr: false });

const STILL_WIDE = "/images/capsule-machine/lucky-stage-wide.webp", STILL_NARROW = "/images/capsule-machine/lucky-stage-narrow.webp";
/** 무대 칸이 580×300(1024 이상) / 폭 100%×204. 기계가 칸 오른쪽에 오고, 응모권이 왼쪽 앞에 머문다(plan-ux 5절). */
const FRAMING_WIDE: CapsuleFraming = { fov: 30, y: 2.2, lookY: 1.76, z: 8.6, x: -1.7, lookX: -1.7, hover: [-2.23, 2.08, 5.65] };
const FRAMING_NARROW: CapsuleFraming = { fov: 30, y: 2.2, lookY: 1.69, z: 8.4, x: -1.25, lookX: -1.25, hover: [-1.76, 2.08, 5.45] };

function useMedia(query: string, server: boolean) {
  const subscribe = useCallback((listener: () => void) => {
    const list = window.matchMedia?.(query);
    list?.addEventListener("change", listener);
    return () => list?.removeEventListener("change", listener);
  }, [query]);
  return useSyncExternalStore(subscribe, () => Boolean(window.matchMedia?.(query).matches), () => server);
}

type Connection = { saveData?: boolean };
const saveData = () => Boolean((navigator as Navigator & { connection?: Connection }).connection?.saveData);

/** 첫 그리기 뒤 브라우저가 한가할 때(최대 2초). 첫 화면에 있는 카드가 교차 관찰만으로 바로 three를 부르지 않게 한다. */
function useIdleReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(() => setReady(true), { timeout: 2000 });
      return () => window.cancelIdleCallback(id);
    }
    const timer = window.setTimeout(() => setReady(true), 200);
    return () => window.clearTimeout(timer);
  }, []);
  return ready;
}

/** 정지 그림 위에 three.js 기계를 겹친다. 정지 그림은 reduced-motion·GPU 0등급·데이터 절약·컨텍스트 손실·장면 실패의 대체이고,
 * 캔버스가 준비되면 불투명도만 바꿔 감춘다(칸 크기 변화 0). `CapsuleMachineBlock`의 순서를 따른다. */
export function LuckyStage({ className }: { className?: string }) {
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const [near, setNear] = useState(false), [onScreen, setOnScreen] = useState(false);
  const [gpu, setGpu] = useState<"unknown" | "ok">("unknown");
  const [unavailable, setUnavailable] = useState(false), [lost, setLost] = useState(false), [canvasKey, setCanvasKey] = useState(0), [live, setLive] = useState(false);
  const reduced = useMedia("(prefers-reduced-motion: reduce)", false), wide = useMedia("(min-width: 1024px)", false);
  const idleReady = useIdleReady();

  useEffect(() => {
    if (!stage || typeof IntersectionObserver === "undefined") return;
    const preload = new IntersectionObserver(([entry]) => { if (entry?.isIntersecting) { setNear(true); preload.disconnect(); } }, { rootMargin: "300px 0px" });
    const visible = new IntersectionObserver(([entry]) => setOnScreen(Boolean(entry?.isIntersecting)));
    preload.observe(stage); visible.observe(stage);
    return () => { preload.disconnect(); visible.disconnect(); };
  }, [stage]);

  const wantsMachine = near && idleReady && !reduced && !unavailable && !saveData();
  useEffect(() => {
    if (!wantsMachine || gpu === "ok") return;
    let cancelled = false;
    void import("./gpu").then((module) => module.canRunCapsuleMachine()).then((ok) => { if (!cancelled) { if (ok) setGpu("ok"); else setUnavailable(true); } }, () => { if (!cancelled) setUnavailable(true); });
    return () => { cancelled = true; };
  }, [wantsMachine, gpu]);

  const handleEngine = useCallback((next: unknown) => setLive(Boolean(next)), []);
  const handleUnavailable = useCallback(() => setUnavailable(true), []);
  const handleLost = useCallback(() => setLost(true), []);
  const handleRestored = useCallback(() => { setLost(false); setLive(false); setCanvasKey((key) => key + 1); }, []);
  const showCanvas = wantsMachine && gpu === "ok";
  const graphics = live && !lost && !reduced ? "3d" : "still";

  return <div ref={setStage} className={className ? `${styles.stage} ${className}` : styles.stage} data-lucky-stage="" data-lucky-graphics={graphics}>
    <picture>
      <source media="(min-width: 1024px)" srcSet={STILL_WIDE} />
      <img className={styles.still} src={STILL_NARROW} alt="" width={716} height={408} data-hidden={graphics === "3d" ? "" : undefined} />
    </picture>
    {showCanvas ? <MachineCanvas key={`${canvasKey}-${wide ? "wide" : "narrow"}`} visible={onScreen} idle framing={wide ? FRAMING_WIDE : FRAMING_NARROW}
      onEngine={handleEngine} onUnavailable={handleUnavailable} onStall={handleUnavailable} onContextLost={handleLost} onContextRestored={handleRestored} /> : null}
  </div>;
}
