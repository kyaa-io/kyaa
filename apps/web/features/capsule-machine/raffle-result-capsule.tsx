"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AppLocale } from "@/i18n/locales";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanDialog } from "@/components/fan-ui/fan-dialog";
import { FanDisplay } from "@/components/fan-ui/fan-display";
import { FanPrintGiftCard } from "@/components/fan-ui/fan-print";
import { capsuleMachineCopy } from "./copy";
import { CapsuleArt } from "./capsule-result";
import { CAPSULE_COLORS, type CapsuleOutcome } from "./palette-art";
import type { CapsuleEngine } from "./machine-art";
import styles from "./raffle-result-capsule.module.css";

// three.js는 결과 팝업이 열린 뒤에만 내려받는다(첫 로드 번들 0). 대체 상태는 같은 칸의 정지 그림이다.
const MachineCanvas = dynamic(() => import("./machine-canvas"), { ssr: false });
/** 장면이 이만큼 안에 준비되지 않으면 연출 없이 결과를 바로 보인다. */
const ENGINE_WAIT_MS = 3000;
/** 연출이 이 시간 안에 끝나지 않으면 멈추고 결과를 보인다. */
const PLAY_MAX_MS = 10000;

export type RaffleCapsuleResult = { state: "won"; usd: number } | { state: "lost" };
export type RaffleCapsuleLabels = { title: string; won: string; lost: string; thanks: string; claim: string; claimCta: string };

function subscribeReduced(listener: () => void) {
  const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  query?.addEventListener("change", listener);
  return () => query?.removeEventListener("change", listener);
}
function useReducedMotion() {
  return useSyncExternalStore(subscribeReduced, () => Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches), () => false);
}

/** 서버가 정한 래플 결과를 캡슐 기계로 한 번 보여 준다. 기계는 결과를 정하지 않고 받은 결과만 연출한다(럭키드로우와 같은 엔진).
 * 움직임 줄이기·GPU 없음·장면 실패·지연은 연출 없이 결과만. */
export function RaffleResultCapsule({ open, onOpenChange, result, locale, labels, onClaim }: {
  open: boolean; onOpenChange: (open: boolean) => void; result: RaffleCapsuleResult; locale: AppLocale; labels: RaffleCapsuleLabels; onClaim: () => void;
}) {
  const c = capsuleMachineCopy(locale);
  const reduced = useReducedMotion();
  const [engine, setEngine] = useState<CapsuleEngine | null>(null);
  const [gpu, setGpu] = useState<"unknown" | "ok" | "off">("unknown");
  const [phase, setPhase] = useState<"ready" | "playing" | "shown">("ready");
  const [color, setColor] = useState(0);
  const played = useRef(false);
  const won = result.state === "won";
  const usd = won ? result.usd : 0;

  // 닫으면 처음 상태로: 다시 열면 기계가 같은 결과를 한 번 더 꺼낸다.
  function change(next: boolean) {
    if (!next) { engine?.clear(); played.current = false; setPhase("ready"); }
    onOpenChange(next);
  }
  const show = useCallback(() => setPhase("shown"), []);

  useEffect(() => {
    if (!open || gpu !== "unknown") return;
    if (reduced) { setGpu("off"); return; }
    let cancelled = false;
    void import("./gpu").then((module) => module.canRunCapsuleMachine()).then((ok) => { if (!cancelled) setGpu(ok ? "ok" : "off"); }, () => { if (!cancelled) setGpu("off"); });
    return () => { cancelled = true; };
  }, [open, gpu, reduced]);

  // 연출을 못 하면 곧바로 결과. 장면이 늦으면 기다리지 않는다.
  useEffect(() => {
    if (!open || phase !== "ready") return;
    if (gpu === "off" || reduced) { show(); return; }
    const timer = window.setTimeout(() => { if (!played.current) show(); }, ENGINE_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [open, phase, gpu, reduced, show]);

  useEffect(() => {
    if (!open || !engine || played.current || phase !== "ready" || reduced) return;
    played.current = true;
    setPhase("playing");
    const outcome: CapsuleOutcome = won ? { level: usd >= 100 ? 2 : 1, imageUrl: null } : { level: 0, imageUrl: null };
    void engine.play(1, [outcome]).then((colors) => {
      const at = CAPSULE_COLORS.indexOf(colors[0] as typeof CAPSULE_COLORS[number]);
      if (at >= 0) setColor(at);
    }, () => undefined).finally(show);
  }, [open, engine, phase, reduced, show, won, usd]);

  // 느린 기기(소프트웨어 렌더링 등)에서는 프레임으로 도는 연출이 끝나지 않을 수 있다: 상한이 지나면 결과로 넘어간다.
  useEffect(() => {
    if (phase !== "playing") return;
    const timer = window.setTimeout(() => { engine?.clear(); show(); }, PLAY_MAX_MS);
    return () => window.clearTimeout(timer);
  }, [phase, engine, show]);

  const handleUnavailable = useCallback(() => setGpu("off"), []);
  const stage = phase !== "shown";

  return <FanDialog open={open} onOpenChange={change} title={labels.title} closeLabel={c.text("close")} size="md">
    <div className={styles.body} data-raffle-capsule={phase} data-raffle-result={result.state}>
      {stage ? <div className={styles.stage} data-graphics={engine && gpu === "ok" ? "3d" : "still"}>
        <img className={styles.still} src="/images/capsule-machine/machine-hires.webp" alt="" width={1254} height={1254} data-hidden={phase === "playing" ? "" : undefined} />
        {open && gpu === "ok" && !reduced ? <MachineCanvas visible onEngine={setEngine} onUnavailable={handleUnavailable} onContextLost={handleUnavailable} onContextRestored={handleUnavailable} /> : null}
        {phase === "playing" ? <FanAction variant="secondary" size="sm" className={styles.skip} onClick={() => { engine?.clear(); show(); }}>{c.text("skip")}</FanAction> : null}
      </div> : <section className={styles.result} aria-labelledby="raffle-capsule-result" aria-live="polite">
        {won
          // 당첨: 기계 안에서 열린 캡슐의 경품(그 금액의 기프트카드)이 올라온다. 미당첨: 빈 캡슐이 열린다.
          ? <div className={styles.prize}><FanPrintGiftCard className={styles.card} label="GIFT CARD" amount={`US$${usd}`} note="KYAA RAFFLE 2026" material={`/images/raffle/v4/mat-card-${usd}.webp`} /></div>
          : <span className={styles.blank}><CapsuleArt colorIndex={color} imageUrl={null} big delay={0} /></span>}
        <FanDisplay role="heading" as="p" id="raffle-capsule-result" className={styles.title}>{won ? labels.won : labels.lost}</FanDisplay>
        <FanDisplay role="caption" as="p" className={styles.note}>{won ? labels.claim : labels.thanks}</FanDisplay>
        <div className={styles.actions}>
          {won ? <FanAction variant="primary" fullWidth onClick={() => { change(false); onClaim(); }}>{labels.claimCta}</FanAction> : null}
          <FanAction variant={won ? "text" : "secondary"} fullWidth onClick={() => change(false)}>{c.text("close")}</FanAction>
        </div>
      </section>}
    </div>
  </FanDialog>;
}
