"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Maximize, Minimize } from "lucide-react";
import { AccessibleOverlay } from "@/components/ui/overlay/accessible-overlay";
import { FanAction } from "@/components/fan-ui/fan-action";
import type { WaveStage } from "../domain/wave-stage";
import type { PublicDashboardData } from "@/features/public-live-dashboard/domain/public-live-dashboard";
import { canDrawStage } from "./use-wave-stage";
import { stageCopy, type StageLocale } from "./wave-stage-copy";
import styles from "./wave-stage.module.css";

export type WaveStageViewProps = {
  locale: StageLocale; stage: WaveStage | null; metrics: PublicDashboardData | null; role: string;
  failed?: boolean; metricsFailed?: boolean; busy?: boolean; uncertain?: boolean; confirmationRevision?: number; video: ReactNode;
  onRefresh: () => void; onDraw: () => void;
};
const formatCount = (value: number | null | undefined, locale: StageLocale) => value == null ? "—" : value.toLocaleString(locale);
function asTime(value: string, locale: StageLocale) {
  return new Date(value).toLocaleString(locale === "ko" ? "ko-KR" : "en-GB", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Seoul", hour12: false });
}

export function WaveStageView({ locale, stage, metrics, role, failed = false, metricsFailed = false, busy = false, uncertain = false, confirmationRevision = 0, video, onRefresh, onDraw }: WaveStageViewProps) {
  const t = stageCopy[locale];
  const [view, setView] = useState<"dashboard" | "results">("dashboard");
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
  const close = () => { if (!busy) { setConfirming(false); setConsent(false); } };
  const toggleFullscreen = async () => {
    setFullscreenFailed(false);
    try { if (document.fullscreenElement) await document.exitFullscreen(); else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); else throw new Error("Unavailable"); }
    catch { setFullscreenFailed(true); }
  };
  const canDraw = canDrawStage(stage, role) && !failed && !busy;
  const database = metrics?.database.state === "available" ? metrics.database : null;
  const onchain = metrics?.onchain.state === "available" ? metrics.onchain : null;
  const isViewer = role !== "admin" && role !== "editor";
  const drawLabel = busy ? t.busy : stage?.draw ? t.drawn : uncertain ? t.retryDraw : t.draw;
  return <main ref={root} className={styles.screen} lang={locale}>
    <header className={styles.header}>
      <div className={styles.brand}><h1>{t.title}</h1><p>{t.subtitle}</p></div>
      <div className={styles.headerActions}>
        <div className={styles.views} aria-label={locale === "ko" ? "화면 선택" : "View"}>
          <button type="button" aria-pressed={view === "dashboard"} onClick={() => setView("dashboard")}>{t.dashboard}</button>
          <button type="button" aria-pressed={view === "results"} disabled={!stage?.draw} onClick={() => setView("results")}>{t.results}</button>
        </div>
        <button type="button" className={styles.fullscreen} onClick={() => void toggleFullscreen()} aria-label={fullscreen ? t.exitFullscreen : t.fullscreen} title={fullscreen ? t.exitFullscreen : t.fullscreen}>{fullscreen ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}</button>
      </div>
    </header>
    {fullscreenFailed && <p role="alert" className={styles.alert}>{t.fullscreenFailed}</p>}
    <div className={styles.body}>
      <aside className={styles.live} aria-label={t.live}><div className={styles.liveTitle}><span>LIVE</span><h2>{t.live}</h2></div><div className={styles.video}>{video}</div></aside>
      <section className={styles.board} aria-label={view === "results" ? t.results : t.dashboard}>
        {!stage ? <div className={styles.loading}><p role={failed ? "alert" : "status"}>{failed ? t.failed : t.loading}</p>{failed && <FanAction onClick={onRefresh}>{t.retry}</FanAction>}</div> : view === "results" && stage.draw ? <>
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
          <header className={styles.sectionHeading}><div><p className={styles.eyebrow}>{t.event}</p><h2>{t.dashboard}</h2></div><span className={styles.eventDate}>2026.10.22</span></header>
          <div className={styles.creators}>{stage.creators.map(creator => <section className={styles.creator} key={creator.slug}>
            <h3>{creator.name}</h3><div className={styles.participants}><strong>{formatCount(creator.participantCount, locale)}</strong><span>{t.participants}</span></div>
            <dl className={styles.creatorMetrics}><div><dt>{t.reservations}</dt><dd>{formatCount(creator.reservationCount, locale)}</dd></div><div><dt>{t.entries}</dt><dd>{formatCount(creator.weightedEntryCount, locale)}</dd></div><div><dt>{t.photocard}</dt><dd>{formatCount(creator.photocardEligibleCount, locale)}</dd></div></dl>
            <p className={styles.photocardHelp}>{t.photocardHelp}</p>
          </section>)}</div>
          <section className={styles.service}><header><h3>{t.service}</h3>{database && <time dateTime={database.asOf}>{t.updated} {asTime(database.asOf, locale)} KST</time>}</header>
            <dl className={styles.serviceMetrics}>{[[t.approved, database?.approvedParticipation], [t.broadcasts, database?.participatingBroadcasts], [t.hearts, database?.sentHearts]].map(([label, value]) => <div key={label as string}><dt>{label}</dt><dd>{formatCount(value as number | null | undefined, locale)}</dd></div>)}</dl>
            {!database && <p className={styles.sourceStatus}>{t.unavailable}</p>}
          </section>
          <section className={styles.service}><header><h3>{t.onchain}</h3>{onchain && <time dateTime={onchain.asOf}>{t.updated} {asTime(onchain.asOf, locale)} KST</time>}</header>
            <dl className={styles.chainMetrics}>{[[t.transactions, onchain?.metrics.currentActionTransactions], [t.passport, onchain?.metrics.passportCredentials], [t.credentials, onchain?.metrics.mintedCredentials], [t.wallets, onchain?.metrics.uniqueActiveWallets]].map(([label, value]) => <div key={label as string}><dt>{label}</dt><dd>{formatCount(value as number | null | undefined, locale)}</dd></div>)}</dl>
            {!onchain && <p className={styles.sourceStatus}>{t.unavailable}</p>}
          </section>
          {metricsFailed && <p className={styles.sourceStatus} role="status">{t.stale}</p>}
        </>}
        {stage && <footer className={styles.controls}>
          <div className={styles.statusText}>{isViewer ? <p>{t.viewer} · {t.readOnly}</p> : stage.drawConflict ? <p role="alert">{t.conflict}</p> : !stage.draw && stage.creators.some(creator => creator.participantCount === 0) ? <p>{t.noEntries}</p> : <p>{stage.draw ? t.drawn : t.photocardHelp}</p>}
            {confirmationRevision > 0 && !stage.draw && <p role="alert">{t.reconfirm}</p>}{failed && <p role="alert">{t.stale}</p>}{uncertain && !stage.draw && <p role="alert">{t.uncertain}</p>}
          </div>
          {failed && <FanAction onClick={onRefresh} disabled={busy}>{t.retry}</FanAction>}
          {!isViewer && !stage.draw && <button ref={trigger} type="button" className={styles.drawButton} disabled={!canDraw} aria-busy={busy} onClick={() => { setConfirming(true); setConsent(false); }}>{drawLabel}</button>}
        </footer>}
      </section>
    </div>
    <footer className={styles.footer}><span>Kyaa. Every Fan Moment Counts.</span>{stage && <time dateTime={stage.asOf}>{t.updated} {asTime(stage.asOf, locale)} KST</time>}</footer>
    <AccessibleOverlay open={confirming} onClose={close} labelledBy={titleId} initialFocusRef={cancel} busy={busy} backdropClassName={styles.backdrop} contentClassName={styles.confirm}>
      <h2 id={titleId}>{t.confirmTitle}</h2><p>{t.confirmBody}</p>
      <ul className={styles.confirmPrizes}>{stage?.prizes.map(prize => <li key={prize.benefitId}><span>{stage.creators.find(c => c.slug === prize.creatorSlug)?.name} · {prize.title}</span><strong>{t.prizeCount} {Math.min(prize.winnerQuantity, stage.creators.find(c => c.slug === prize.creatorSlug)?.participantCount ?? 0)}{locale === "ko" ? "명" : ""}</strong></li>)}</ul>
      <label className={styles.consent}><input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} /><span>{t.consent}</span></label>
      {uncertain && <p role="alert">{t.uncertain}</p>}
      <div className={styles.confirmActions}><button ref={cancel} type="button" className={styles.cancel} onClick={close} disabled={busy}>{t.cancel}</button><button type="button" className={styles.drawButton} disabled={!consent || !canDraw} aria-busy={busy} onClick={onDraw}>{busy ? t.busy : t.confirm}</button></div>
    </AccessibleOverlay>
  </main>;
}
