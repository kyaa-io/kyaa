"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Maximize, Minimize } from "lucide-react";
import { AccessibleOverlay } from "@/components/ui/overlay/accessible-overlay";
import type { WaveStage } from "../domain/wave-stage";
import type { PublicDashboardData } from "@/features/public-live-dashboard/domain/public-live-dashboard";
import { canDrawStage } from "./use-wave-stage";
import { stageCopy, type StageLocale } from "./wave-stage-copy";
import { WavePresentationPanel, type PresentationProps, type PresentationScene } from "./wave-presentation-panel";
import styles from "./wave-stage.module.css";

export type WaveStageViewProps = PresentationProps & {
  locale: StageLocale; stage: WaveStage | null; metrics: PublicDashboardData | null; role: string;
  failed?: boolean; metricsFailed?: boolean; busy?: boolean; uncertain?: boolean; confirmationRevision?: number;
  onRefresh: () => void; onDraw: () => void; sourceControls?: ReactNode;
};
const formatCount = (value: number | null | undefined, locale: StageLocale) => value == null ? "—" : value.toLocaleString(locale);
function asTime(value: string, locale: StageLocale) {
  return new Date(value).toLocaleString(locale === "ko" ? "ko-KR" : "en-GB", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Seoul", hour12: false });
}

export function WaveStageView({ locale, stage, metrics, role, failed = false, metricsFailed = false, busy = false, uncertain = false, confirmationRevision = 0, onRefresh, onDraw, sourceControls, ...presentation }: WaveStageViewProps) {
  const t = stageCopy[locale];
  const [view, setView] = useState<PresentationScene | "explorer" | "draw" | "results">("dashboard");
  const [confirming, setConfirming] = useState(false), [consent, setConsent] = useState(false);
  const [fullscreen, setFullscreen] = useState(false), [fullscreenFailed, setFullscreenFailed] = useState(false);
  const root = useRef<HTMLElement>(null), trigger = useRef<HTMLButtonElement>(null), cancel = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const executedAt = stage?.draw?.executedAt;
  useEffect(() => {
    if (executedAt) { setView("results"); setConfirming(false); setConsent(false); }
  }, [executedAt]);
  useEffect(() => {
    if (confirmationRevision > 0) { setConfirming(false); setConsent(false); }
  }, [confirmationRevision]);
  useEffect(() => {
    const update = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  useEffect(() => {
    const navigate = (event: KeyboardEvent) => {
      if (confirming || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || (event.target instanceof Element && event.target.closest("button, a, input, select, textarea, [contenteditable]"))) return;
      const scenes = ["dashboard", "records", "explorer", "draw", "results"] as const;
      const available = stage?.draw ? scenes : scenes.slice(0, -1);
      const current = available.indexOf(view);
      if (current < 0 || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault(); setView(available[(current + (event.key === "ArrowRight" ? 1 : available.length - 1)) % available.length]!);
    };
    document.addEventListener("keydown", navigate); return () => document.removeEventListener("keydown", navigate);
  }, [confirming, view, stage?.draw]);
  const close = () => { if (!busy) { setConfirming(false); setConsent(false); } };
  const toggleFullscreen = async () => {
    setFullscreenFailed(false);
    try { if (document.fullscreenElement) await document.exitFullscreen(); else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); else throw new Error("Unavailable"); }
    catch { setFullscreenFailed(true); }
  };
  const canDraw = canDrawStage(stage, role) && !failed && !busy;
  const isViewer = role !== "admin" && role !== "editor";
  const drawLabel = busy ? t.busy : stage?.draw ? t.drawn : uncertain ? t.retryDraw : t.draw;
  return <main ref={root} className={styles.screen} data-view={view} lang={locale}>
    <header className={styles.header}>
      <div className={styles.brand}><h1>{t.title}</h1><p>{t.subtitle}</p></div>
      <div className={styles.headerActions}>
        <div className={styles.views} aria-label={locale === "ko" ? "화면 선택" : "View"}>
          <button type="button" aria-pressed={view === "dashboard"} onClick={() => setView("dashboard")}>{t.dashboard}</button>
          <button type="button" aria-pressed={view === "records"} onClick={() => setView("records")}>{locale === "ko" ? "GIWA 기록" : "GIWA records"}</button>
          <button type="button" aria-pressed={view === "explorer"} onClick={() => setView("explorer")}>{locale === "ko" ? "실제 기록 확인" : "Explorer"}</button>
          <button type="button" aria-pressed={view === "draw"} onClick={() => setView("draw")}>{locale === "ko" ? "경품 추첨" : "Prize draw"}</button>
          <button type="button" aria-pressed={view === "results"} disabled={!stage?.draw} onClick={() => setView("results")}>{t.results}</button>
        </div>
        <button type="button" className={styles.fullscreen} onClick={() => void toggleFullscreen()} aria-label={fullscreen ? t.exitFullscreen : t.fullscreen} title={fullscreen ? t.exitFullscreen : t.fullscreen}>{fullscreen ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}</button>
      </div>
    </header>
    {fullscreenFailed && <p role="alert" className={styles.alert}>{t.fullscreenFailed}</p>}
    <div className={styles.presentationTools}>{sourceControls}<button type="button" onClick={onRefresh}>{t.retry}</button></div>
    <div className={styles.body}>
      <section className={styles.board} aria-label={view === "results" ? t.results : view === "records" ? (locale === "ko" ? "GIWA 기록" : "GIWA records") : view === "explorer" ? (locale === "ko" ? "실제 기록 확인" : "Explorer") : view === "draw" ? (locale === "ko" ? "경품 추첨" : "Prize draw") : t.dashboard}>
        {view === "dashboard" || view === "records" ? <WavePresentationPanel {...presentation} scene={view} locale={locale} /> : view === "explorer" ? <>
          <header className={styles.sectionHeading}><div><p className={styles.eyebrow}>GIWA SEPOLIA</p><h2>{locale === "ko" ? "실제 기록 확인" : "Explore real records"}</h2></div><span className={styles.sceneNumber}>03<small> / 05</small></span></header>
          <div className={styles.explorerScene}><h3>{locale === "ko" ? "탐색기에서 기록을 확인하세요" : "View records in the explorer"}</h3><p>{locale === "ko" ? "별도 탐색기 창에서 Internal transactions를 확인합니다. 새 기록은 탐색기 창을 직접 새로고침해 확인하세요." : "Check Internal transactions in the separate explorer window. Refresh that window manually to see new records."}</p><a href="https://sepolia-explorer.giwa.io/address/0xb6c5F48d770A732dEb374226EDa1E5Be209B7ED4?tab=internal_txns" target="wave-giwa-explorer" rel="noopener noreferrer">{locale === "ko" ? "GIWA 탐색기 열기 ↗" : "Open GIWA explorer ↗"}</a>{presentation.presentation?.onchain.state === "available" && <a href={`https://sepolia-explorer.giwa.io/address/${presentation.presentation.onchain.contractAddress}`} target="wave-giwa-ledger" rel="noopener noreferrer">{locale === "ko" ? "팬 활동 집계 컨트랙트 열기 ↗" : "Open fan activity ledger contract ↗"}</a>}</div>
        </> : !stage ? <div className={styles.loading}><p role={failed ? "alert" : "status"}>{failed ? t.failed : t.loading}</p></div> : view === "results" && stage.draw ? <>
          <header className={styles.sectionHeading}><div><p className={styles.eyebrow}>{t.allPublished}</p><h2>{t.results}</h2></div><p>{t.resultNote}</p></header>
          <div className={styles.prizes}>{stage.prizes.map(prize => {
            const winners = stage.draw!.winners.filter(winner => winner.benefitId === prize.benefitId);
            const creator = stage.creators.find(item => item.slug === prize.creatorSlug);
            return <section key={prize.benefitId} className={styles.prize} data-large={prize.winnerQuantity > 10}>
              <header><p>{creator?.name}</p><h3>{prize.title}</h3><strong>{formatCount(winners.length, locale)}<span>{locale === "ko" ? "명" : " winners"}</span></strong></header>
              {winners.length ? <ol className={styles.winners}>{winners.map((winner, index) => <li key={`${winner.displayCode}:${index}`}><span className={styles.winnerName}>{winner.displayName}</span><span className={styles.winnerCode}>{winner.displayCode}</span></li>)}</ol> : <p>{t.emptyWinners}</p>}
            </section>;
          })}</div>
        </> : <>
          <header className={styles.sectionHeading}><div><p className={styles.eyebrow}>{t.event}</p><h2>{locale === "ko" ? "경품 추첨" : "Prize draw"}</h2></div><span className={styles.eventDate}>2026.10.22</span></header>
          <div className={styles.creators}>{stage.creators.map(creator => <section className={styles.creator} key={creator.slug}>
            <h3>{creator.name}</h3><div className={styles.participants}><strong>{formatCount(creator.participantCount, locale)}</strong><span>{t.participants}</span></div>
            <dl className={styles.creatorMetrics}><div><dt>{t.reservations}</dt><dd>{formatCount(creator.reservationCount, locale)}</dd></div><div><dt>{t.entries}</dt><dd>{formatCount(creator.weightedEntryCount, locale)}</dd></div><div><dt>{t.photocard}</dt><dd>{formatCount(creator.photocardEligibleCount, locale)}</dd></div></dl>
            <p className={styles.photocardHelp}>{t.photocardHelp}</p>
          </section>)}</div>
        </>}
        {stage && (view === "draw" || view === "results") && <footer className={styles.controls}>
          <div className={styles.statusText}>{isViewer ? <p>{t.viewer} · {t.readOnly}</p> : stage.drawConflict ? <p role="alert">{t.conflict}</p> : !stage.draw && stage.creators.some(creator => creator.participantCount === 0) ? <p>{t.noEntries}</p> : <p>{stage.draw ? t.drawn : t.photocardHelp}</p>}
            {confirmationRevision > 0 && !stage.draw && <p role="alert">{t.reconfirm}</p>}{failed && <p role="alert">{t.stale}</p>}{uncertain && !stage.draw && <p role="alert">{t.uncertain}</p>}
          </div>
          {!isViewer && !stage.draw && <button ref={trigger} type="button" className={styles.drawButton} disabled={!canDraw} aria-busy={busy} onClick={() => { setConfirming(true); setConsent(false); }}>{drawLabel}</button>}
        </footer>}
      </section>
    </div>
    <footer className={styles.footer}><span>Kyaa. Every Fan Moment Counts.</span>{isViewer && <span>{t.readOnly}</span>}{stage && (view === "draw" || view === "results") && <time dateTime={stage.asOf}>{t.updated} {asTime(stage.asOf, locale)} KST</time>}</footer>
    <AccessibleOverlay open={confirming} onClose={close} labelledBy={titleId} initialFocusRef={cancel} busy={busy} backdropClassName={styles.backdrop} contentClassName={styles.confirm}>
      <h2 id={titleId}>{t.confirmTitle}</h2><p>{t.confirmBody}</p>
      <ul className={styles.confirmPrizes}>{stage?.prizes.map(prize => <li key={prize.benefitId}><span>{stage.creators.find(c => c.slug === prize.creatorSlug)?.name} · {prize.title}</span><strong>{t.prizeCount} {Math.min(prize.winnerQuantity, stage.creators.find(c => c.slug === prize.creatorSlug)?.participantCount ?? 0)}{locale === "ko" ? "명" : ""}</strong></li>)}</ul>
      <label className={styles.consent}><input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} /><span>{t.consent}</span></label>
      {uncertain && <p role="alert">{t.uncertain}</p>}
      <div className={styles.confirmActions}><button ref={cancel} type="button" className={styles.cancel} onClick={close} disabled={busy}>{t.cancel}</button><button type="button" className={styles.drawButton} disabled={!consent || !canDraw} aria-busy={busy} onClick={onDraw}>{busy ? t.busy : t.confirm}</button></div>
    </AccessibleOverlay>
  </main>;
}
