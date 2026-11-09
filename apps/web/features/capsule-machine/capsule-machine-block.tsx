"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AppLocale } from "@/i18n/locales";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanTag } from "@/components/fan-ui/fan-tag";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanLockedValue } from "@/components/fan-ui/fan-locked-value";
import { FanState } from "@/components/fan-ui/fan-state";
import { groupsCopy } from "@/features/groups/ui/copy";
import { GroupRequestError, useGroupResource } from "@/features/groups/ui/use-group-resource";
import { capsuleCopy } from "@/features/group-capsule/copy";
import { capsuleResultSchema, capsulesSchema } from "@/features/group-capsule/domain";
import { raffleStateCopy } from "@/features/group-raffle/state-copy";
import { walletSchema } from "@/server/group-wallet/domain";
import { capsuleMachineCopy } from "./copy";
import { CAPSULE_DRAW_OPEN, canDrawCount, pickCampaign, probabilityLabel, remainingPrizes, toOutcomes, type CapsuleResult } from "./domain";
import { CAPSULE_COLORS, type CapsuleOutcome } from "./palette-art";
import type { CapsuleEngine } from "./machine-art";
import { CapsuleResultCard } from "./capsule-result";
import styles from "./capsule-machine.module.css";

// dev notes 1: three.js loads only once the block is near the screen and the GPU check (its own small chunk) passed;
// the server HTML holds the same-size still render. A tier 0 device downloads detect-gpu only, never three.
const MachineCanvas = dynamic(() => import("./machine-canvas"), { ssr: false });

const parseList = (value: unknown) => capsulesSchema.parse(value);
const parseWallet = (value: unknown) => walletSchema.parse(value);
const STILL = "/images/capsule-machine/machine-idle.webp";
const RESULT_STILL = ["/images/capsule-machine/result-blank.webp", "/images/capsule-machine/result-prize.webp", "/images/capsule-machine/result-rare.webp"] as const;

function subscribeReduced(listener: () => void) {
  const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  query?.addEventListener("change", listener);
  return () => query?.removeEventListener("change", listener);
}
/** dev notes 9: follows the setting live. */
function useReducedMotion() {
  return useSyncExternalStore(subscribeReduced, () => Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches), () => false);
}

type Shown = { result: CapsuleResult; outcomes: CapsuleOutcome[]; colorIndexes: number[] };
type DrawError = "insufficient" | "paused" | "unknown";

/** B2: the capsule machine heading 덕질 > 럭키드로우. The server decides each result; the machine only stages it, and the result card shows even without graphics. */
export function CapsuleMachineBlock({ locale, guest, drawOpen = CAPSULE_DRAW_OPEN }: { locale: AppLocale; guest: boolean; drawOpen?: boolean }) {
  const c = capsuleMachineCopy(locale), base = capsuleCopy(locale);
  const list = useGroupResource("/api/groups/capsules", parseList);
  const wallet = useGroupResource(guest ? null : "/api/me/wallet", parseWallet);
  const campaign = list.data ? pickCampaign(list.data.items) : null;
  const tickets = wallet.data?.tickets ?? null;
  const reduced = useReducedMotion();

  const stageRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false), [onScreen, setOnScreen] = useState(false);
  const [engine, setEngine] = useState<CapsuleEngine | null>(null);
  const [gpu, setGpu] = useState<"unknown" | "ok">("unknown");
  const [unavailable, setUnavailable] = useState(false), [lost, setLost] = useState(false), [canvasKey, setCanvasKey] = useState(0);
  const [busy, setBusy] = useState(false), [playing, setPlaying] = useState(false);
  const [shown, setShown] = useState<Shown | null>(null), [error, setError] = useState<DrawError | null>(null);
  const engineRef = useRef<CapsuleEngine | null>(null);
  useEffect(() => { engineRef.current = engine; }, [engine]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof IntersectionObserver === "undefined") return;
    const preload = new IntersectionObserver(([entry]) => { if (entry?.isIntersecting) { setNear(true); preload.disconnect(); } }, { rootMargin: "300px 0px" });
    const visible = new IntersectionObserver(([entry]) => setOnScreen(Boolean(entry?.isIntersecting)));
    preload.observe(stage); visible.observe(stage);
    return () => { preload.disconnect(); visible.disconnect(); };
  }, []);

  const wantsMachine = near && !reduced && !unavailable && Boolean(campaign);
  useEffect(() => {
    if (!wantsMachine || gpu === "ok") return;
    let cancelled = false;
    void import("./gpu").then((module) => module.canRunCapsuleMachine()).then((ok) => { if (!cancelled) { if (ok) setGpu("ok"); else setUnavailable(true); } }, () => { if (!cancelled) setUnavailable(true); });
    return () => { cancelled = true; };
  }, [wantsMachine, gpu]);

  const live = Boolean(engine) && !reduced && !lost;
  const handleEngine = useCallback((next: CapsuleEngine | null) => setEngine(next), []);
  const handleUnavailable = useCallback(() => setUnavailable(true), []);
  const handleLost = useCallback(() => setLost(true), []);
  const handleRestored = useCallback(() => { setLost(false); setEngine(null); setCanvasKey((key) => key + 1); }, []);

  async function draw(count: 1 | 10) {
    if (!campaign || busy || !canDrawCount(campaign, count, tickets, drawOpen)) return;
    setBusy(true); setError(null); setShown(null);
    try {
      const raw = await wallet.request(`/api/groups/capsules/${campaign.id}/draw`, { method: "POST", body: JSON.stringify({ requestKey: crypto.randomUUID(), count }) });
      const result = capsuleResultSchema.parse(raw);
      const outcomes = toOutcomes(result, campaign);
      let colors: string[] = [];
      const machine = engineRef.current;
      if (machine && live) { setPlaying(true); colors = await machine.play(count, outcomes).catch(() => []); setPlaying(false); }
      const colorIndexes = outcomes.map((_, i) => { const at = CAPSULE_COLORS.indexOf(colors[i] as typeof CAPSULE_COLORS[number]); return at >= 0 ? at : (i * 3) % CAPSULE_COLORS.length; });
      setShown({ result, outcomes, colorIndexes });
      list.retry(); wallet.retry();
    } catch (failure) {
      const code = failure instanceof GroupRequestError ? failure.code : "";
      setError(code === "GROUP_WALLET_INSUFFICIENT_BALANCE" ? "insufficient" : ["CAPSULE_CLOSED", "CAPSULE_INSUFFICIENT_STOCK", "CAPSULE_SOLD_OUT", "CAPSULE_INVALID"].includes(code) ? "paused" : "unknown");
    } finally { setPlaying(false); setBusy(false); }
  }
  const skip = () => engineRef.current?.clear();
  const close = () => { engineRef.current?.clear(); setShown(null); };
  const again = () => { engineRef.current?.clear(); setShown(null); void draw(1); };

  const state = drawOpen && campaign?.status === "active" ? "open" : "soon";
  const topLevel = shown ? Math.max(...shown.outcomes.map((o) => o.level)) as 0 | 1 | 2 : null;
  const still = shown && !live && shown.result.count === 1 && topLevel !== null ? RESULT_STILL[topLevel] : STILL;
  const showCanvas = wantsMachine && gpu === "ok";

  // H1: no public capsule (or the list failed) — one line in the section frame (D2), not an empty machine.
  if (list.error) return <FanState inline compact kind="error" className={styles.state} title={c.text("loadError")} actions={<FanAction variant="text" onClick={list.retry}>{groupsCopy(locale).retry}</FanAction>} />;
  if (list.data && !campaign) return <FanState inline compact kind="empty" className={styles.state} title={base.empty} />;
  const title = campaign?.name ?? base.title;

  return <section className={styles.block} aria-labelledby="capsule-machine-title" data-lucky-module="" data-lucky-state={state} data-capsule-graphics={live ? "3d" : "still"}>
    <div ref={stageRef} className={styles.stage}>
      <img className={styles.still} src={still} alt="" width={1600} height={800} data-hidden={live && !shown ? "" : undefined} />
      {showCanvas ? <MachineCanvas key={canvasKey} visible={onScreen} onEngine={handleEngine} onUnavailable={handleUnavailable} onContextLost={handleLost} onContextRestored={handleRestored} /> : null}
      <span className={styles.sparkles} aria-hidden="true">{[0, 1, 2, 3, 4, 5].map((i) => <svg key={i} viewBox="0 0 20 20" width={14} height={14}><path d="M10 0C10.8 6 14 9.2 20 10 14 10.8 10.8 14 10 20 9.2 14 6 10.8 0 10 6 9.2 9.2 6 10 0Z" /></svg>)}</span>
      {playing ? <FanAction variant="secondary" size="sm" className={styles.skip} onClick={skip}>{c.text("skip")}</FanAction> : null}
    </div>
    <div className={styles.info}>
      <div className={styles.titleRow}>
        <FanTag tone="fan">{c.text(state)}</FanTag>
        <span id="capsule-machine-title" className={styles.title}><FanHeading as="h3">{title}</FanHeading></span>
      </div>
      <ul className={styles.prizes} aria-label={base.prizes}>
        {campaign ? <>
          {campaign.prizes.map((prize) => <li key={prize.id} className={styles.prize} data-row="capsule-prize">
            <span className={styles.prizeArt}><img src={prize.imageUrl ?? "/images/capsule-machine/capsule-0-open.webp"} alt="" width={56} height={56} /></span>
            <strong>{prize.name}</strong><span>{probabilityLabel(prize.weight, campaign.weightTotal, locale)}</span>
          </li>)}
          <li className={`${styles.prize} ${styles.blank}`} data-row="capsule-prize"><span className={styles.prizeArt}><img src="/images/capsule-machine/capsule-6-open.webp" alt="" width={56} height={56} /></span><strong>{base.blank}</strong><span>{probabilityLabel(campaign.blankWeight, campaign.weightTotal, locale)}</span></li>
        </> : [0, 1, 2, 3].map((slot) => <li key={slot} className={`${styles.prize} ${styles.prizeSlot}`} data-row="capsule-prize" aria-hidden="true"><span className={styles.prizeArt} /></li>)}
      </ul>
      <dl className={styles.facts}>
        <div><dt>{c.text("perDraw")}</dt><dd>{c.fill("tickets", { n: 1 })}</dd></div>
        <div><dt>{c.text("remaining")}</dt><dd>{campaign ? c.fill("prizes", { n: remainingPrizes(campaign) }) : null}</dd></div>
        <div><dt>{c.text("myTickets")}</dt><dd className={styles.mine}>{guest ? <FanLockedValue locale={locale} /> : tickets === null ? null : c.fill("tickets", { n: tickets })}</dd></div>
      </dl>
      {/* One emphasised action per screen (DESIGN.md): while 준비 중 the wallet keeps it, so both draws are secondary. */}
      <div className={styles.actions}>
        <FanAction variant="secondary" disabled={busy || !canDrawCount(campaign, 1, tickets, drawOpen)} onClick={() => void draw(1)}>{base.drawOne}<small className={styles.cost}>{c.fill("tickets", { n: 1 })}</small></FanAction>
        <FanAction variant={state === "open" ? "primary" : "secondary"} disabled={busy || !canDrawCount(campaign, 10, tickets, drawOpen)} onClick={() => void draw(10)}>{base.drawTen}<small className={styles.cost}>{c.fill("tickets", { n: 10 })}</small></FanAction>
      </div>
      {error ? <p className={styles.error} role="alert">{error === "insufficient" ? raffleStateCopy(locale).insufficient : error === "paused" ? base.paused : base.unknown}</p> : null}
    </div>
    {shown && campaign ? <CapsuleResultCard result={shown.result} outcomes={shown.outcomes} colorIndexes={shown.colorIndexes} campaignName={campaign.name} locale={locale}
      claimHref={`/my/capsules?locale=${locale}`} againDisabled={busy || !canDrawCount(campaign, 1, tickets, drawOpen)} onAgain={again} onClose={close} /> : null}
  </section>;
}
