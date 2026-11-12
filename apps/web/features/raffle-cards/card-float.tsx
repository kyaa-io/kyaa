"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import styles from "./card-float.module.css";

// 서버 HTML에는 DOM 카드(정지 그림)만 있다. three.js는 아래 조건이 모두 맞은 뒤에만 내려받는다(capsule-machine/lucky-stage와 같은 순서).
const FloatCanvas = dynamic(() => import("./float-canvas"), { ssr: false });

function useMedia(query: string) {
  const subscribe = useCallback((listener: () => void) => {
    const list = window.matchMedia?.(query);
    list?.addEventListener("change", listener);
    return () => list?.removeEventListener("change", listener);
  }, [query]);
  return useSyncExternalStore(subscribe, () => Boolean(window.matchMedia?.(query).matches), () => false);
}

type Connection = { saveData?: boolean };
const saveData = () => Boolean((navigator as Navigator & { connection?: Connection }).connection?.saveData);

/** 첫 그리기 뒤 브라우저가 한가할 때(최대 2초). 첫 화면 그림(LCP)과 겨루지 않는다. */
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

/**
 * `FanPrintDesk` 안, 기프트카드 묶음 뒤에 둔다. 같은 자리에 three.js 카드를 겹치고, 준비되면 DOM 카드 면만 감춘다(`data-fan-print-float="3d"`).
 * 정지 그림(DOM 카드)으로 남는 경우: 움직임 줄이기, 데이터 절약, WebGL 2 없음·GPU 0등급, 장면 실패, 컨텍스트 손실, 4초 평균 24fps 미만.
 */
export function RaffleCardFloat() {
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);
  const desk = layer?.parentElement ?? null;
  const [near, setNear] = useState(false), [onScreen, setOnScreen] = useState(false);
  const [gpu, setGpu] = useState<"unknown" | "ok">("unknown");
  const [unavailable, setUnavailable] = useState(false), [lost, setLost] = useState(false), [canvasKey, setCanvasKey] = useState(0), [live, setLive] = useState(false);
  const reduced = useMedia("(prefers-reduced-motion: reduce)");
  const idleReady = useIdleReady();

  useEffect(() => {
    if (!desk || typeof IntersectionObserver === "undefined") return;
    const preload = new IntersectionObserver(([entry]) => { if (entry?.isIntersecting) { setNear(true); preload.disconnect(); } }, { rootMargin: "300px 0px" });
    const visible = new IntersectionObserver(([entry]) => setOnScreen(Boolean(entry?.isIntersecting)));
    preload.observe(desk); visible.observe(desk);
    return () => { preload.disconnect(); visible.disconnect(); };
  }, [desk]);

  const wants = near && idleReady && !reduced && !unavailable && !saveData();
  useEffect(() => {
    if (!wants || gpu === "ok") return;
    let cancelled = false;
    void import("@/features/capsule-machine/gpu").then(module => module.canRunCapsuleMachine()).then(ok => { if (!cancelled) { if (ok) setGpu("ok"); else setUnavailable(true); } }, () => { if (!cancelled) setUnavailable(true); });
    return () => { cancelled = true; };
  }, [wants, gpu]);

  const graphics = live && !lost && !reduced && !unavailable ? "3d" : "still";
  useEffect(() => {
    if (!desk) return;
    if (graphics === "3d") desk.dataset.fanPrintFloat = "3d"; else delete desk.dataset.fanPrintFloat;
    return () => { delete desk.dataset.fanPrintFloat; };
  }, [desk, graphics]);

  const handleUnavailable = useCallback(() => setUnavailable(true), []);
  const handleLost = useCallback(() => setLost(true), []);
  const handleRestored = useCallback(() => { setLost(false); setLive(false); setCanvasKey(key => key + 1); }, []);

  return <div ref={setLayer} className={styles.layer} aria-hidden="true" data-raffle-card-float="" data-graphics={graphics}>
    {desk && wants && gpu === "ok" ? <FloatCanvas key={canvasKey} desk={desk} visible={onScreen} onLive={setLive} onUnavailable={handleUnavailable} onContextLost={handleLost} onContextRestored={handleRestored} /> : null}
  </div>;
}
