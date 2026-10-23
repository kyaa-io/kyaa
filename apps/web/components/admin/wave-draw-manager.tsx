"use client";
import { useEffect, useRef, useState } from "react";
import { useByUsAuth as usePrivy } from "@/features/auth/client/cognito-auth";
import { z } from "zod";
import { WAVE_PRIZES, waveAdminDrawResponseSchema } from "@/features/fanpage/domain/wave-draw";
import { WaveWinners, wavePrizeImage } from "@/features/fanpage/ui/wave-draw";
import { RaffleResultReveal } from "@/features/benefit/ui/raffle-result-reveal";
import { AccessibleOverlay } from "@/components/ui/overlay/accessible-overlay";
import { AdminAccessState } from "./admin-access-state";
import { AdminOperationsShell, type AdminLocale } from "./operations-shell";
import { useAdminSession } from "./use-admin-session";
import styles from "./wave-draw-manager.module.css";

type DrawData = z.infer<typeof waveAdminDrawResponseSchema>;
const endpoint = "/api/admin/kyaa-wave/draw";
const copy = {
  ko: { title: "kyaa wave 추첨", intro: "경품 10종 · 총 67개. 추첨은 한 번만 실행하고, 당첨자는 경품 순서대로 공개합니다.", entries: "응모 회원", loading: "추첨 정보를 불러오는 중…", failed: "처리 결과를 확인하지 못했습니다. 다시 시도해 주세요.", retry: "다시 조회", execute: "응모 마감·추첨 실행", confirmTitle: "응모를 마감하고 추첨할까요?", confirmHelp: "실행하면 응모와 선호 경품 변경이 마감됩니다. 추첨 결과는 다시 뽑거나 변경할 수 없습니다. 당첨자는 경품별로 따로 공개합니다.", consent: "응모 마감과 1회 추첨을 확인했습니다.", confirm: "추첨 실행", cancel: "취소", busy: "처리 중…", viewer: "읽기 전용 권한입니다. 추첨 실행과 당첨자 공개는 편집 권한이 필요합니다.", executed: "추첨 완료", reveal: "다음 경품 공개", finished: "모든 경품을 공개했습니다.", published: "공개 완료", hidden: "공개 전", resultTitle: "공개된 당첨자", open: "당첨자 발표 보기", help: "티켓을 열어 공개된 당첨자 명단을 확인하세요.", ticket: "당첨자 발표", result: "경품 당첨 결과", skip: "명단 바로 보기", refreshFailed: "최신 정보를 불러오지 못했습니다. 표시된 결과는 마지막으로 확인한 내용입니다." },
  en: { title: "kyaa wave draw", intro: "10 prize types · 67 prizes. Run the draw once, then publish winners in prize order.", entries: "Entrants", loading: "Loading draw…", failed: "We couldn’t confirm the result. Please try again.", retry: "Refresh", execute: "Close entries and run draw", confirmTitle: "Close entries and run the draw?", confirmHelp: "This closes entries and prize preference changes. The draw cannot be rerun or changed. Publish the winners separately for each prize.", consent: "I confirm entry closure and the one-time draw.", confirm: "Run draw", cancel: "Cancel", busy: "Processing…", viewer: "Read-only access. Editing permission is required to run the draw or publish winners.", executed: "Draw completed", reveal: "Publish next prize", finished: "All prizes have been published.", published: "Published", hidden: "Not published", resultTitle: "Published winners", open: "Reveal winners", help: "Open the ticket to see the published winner list.", ticket: "Winner announcement", result: "Prize results", skip: "Show winners now", refreshFailed: "Couldn’t refresh. The displayed results are from the last successful update." },
};

export function WaveDrawManager({ locale }: { locale: AdminLocale }) {
  const session = useAdminSession(), auth = usePrivy();
  if (session.status !== "authorized") return <AdminAccessState status={session.status} locale={locale} />;
  return <DrawOperations key={`${auth.user?.id}:${session.admin.email}:${session.admin.role}`} locale={locale} adminRole={session.admin.role} getAccessToken={auth.getAccessToken} />;
}
function DrawOperations({ locale, adminRole, getAccessToken }: { locale: AdminLocale; adminRole: string; getAccessToken: () => Promise<string | null> }) {
  const t = copy[locale], canWrite = adminRole === "admin" || adminRole === "editor";
  const [data, setData] = useState<DrawData | null>(null), [error, setError] = useState(false), [refreshFailed, setRefreshFailed] = useState(false);
  const [access, setAccess] = useState<"unauthenticated" | "denied" | null>(null);
  const [revision, setRevision] = useState(0), [busy, setBusy] = useState(false), [confirming, setConfirming] = useState(false), [consent, setConsent] = useState(false);
  const executeTrigger = useRef<HTMLButtonElement>(null), cancel = useRef<HTMLButtonElement>(null);
  const tokenProvider = useRef(getAccessToken), reading = useRef<AbortController | null>(null), writing = useRef<AbortController | null>(null), pending = useRef(false);
  const attempt = useRef<{ operation: string; requestId: string } | null>(null);
  useEffect(() => { tokenProvider.current = getAccessToken; }, [getAccessToken]);
  useEffect(() => () => { reading.current?.abort(); writing.current?.abort(); }, []);
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === "visible" && !pending.current) setRevision(value => value + 1); }, 5000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (access || pending.current) return;
    const controller = new AbortController(); reading.current = controller;
    void (async () => {
      try {
        const token = await tokenProvider.current();
        if (controller.signal.aborted) return;
        if (!token) { setAccess("unauthenticated"); return; }
        const response = await fetch(endpoint, { cache: "no-store", headers: { authorization: `Bearer ${token}` }, signal: controller.signal });
        if (controller.signal.aborted) return;
        if (response.status === 401 || response.status === 403) { setData(null); setAccess(response.status === 401 ? "unauthenticated" : "denied"); return; }
        if (!response.ok) throw new Error();
        const next = waveAdminDrawResponseSchema.parse(await response.json());
        if (!controller.signal.aborted) { setData(current => current?.draw && (!next.draw || current.draw.id === next.draw.id && current.draw.revealedThrough > next.draw.revealedThrough) ? current : next); setRefreshFailed(false); }
      } catch { if (!controller.signal.aborted) setRefreshFailed(true); }
    })();
    return () => controller.abort();
  }, [revision, access]);
  async function mutate(prizeIndex?: number) {
    if (!canWrite || pending.current || !data || (prizeIndex === undefined ? Boolean(data.draw) || !consent : !data.draw || prizeIndex !== data.draw.revealedThrough + 1)) return;
    pending.current = true; setBusy(true); setError(false); reading.current?.abort();
    const operation = prizeIndex === undefined ? "execute" : `${data.draw!.id}:${prizeIndex}`;
    if (attempt.current?.operation !== operation) attempt.current = { operation, requestId: crypto.randomUUID() };
    const controller = new AbortController(); writing.current = controller;
    try {
      const token = await tokenProvider.current();
      if (controller.signal.aborted) return;
      if (!token) { setData(null); setAccess("unauthenticated"); return; }
      const response = await fetch(prizeIndex === undefined ? endpoint : `${endpoint}/reveal`, {
        method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ requestId: attempt.current.requestId, ...(prizeIndex === undefined ? {} : { drawId: data.draw!.id, prizeIndex }) }),
      });
      if (controller.signal.aborted) return;
      if (response.status === 401 || response.status === 403) { setData(null); setAccess(response.status === 401 ? "unauthenticated" : "denied"); return; }
      if (!response.ok) throw new Error();
      const next = waveAdminDrawResponseSchema.parse(await response.json());
      if (!controller.signal.aborted) { setData(current => current?.draw && (!next.draw || current.draw.id === next.draw.id && current.draw.revealedThrough > next.draw.revealedThrough) ? current : next); setRefreshFailed(false); attempt.current = null; setConfirming(false); }
    } catch { if (!controller.signal.aborted) setError(true); }
    finally { if (!controller.signal.aborted) { pending.current = false; setBusy(false); setRevision(value => value + 1); } }
  }
  const close = () => { if (!pending.current) { setConfirming(false); setConsent(false); requestAnimationFrame(() => executeTrigger.current?.focus()); } };
  if (access) return <AdminAccessState status={access} locale={locale} />;
  const nextIndex = data?.draw ? data.draw.revealedThrough + 1 : 0;
  return <AdminOperationsShell locale={locale} adminRole={adminRole}><div className={styles.main}>
    <header><h1>{t.title}</h1><p>{t.intro}</p></header>
    {!canWrite && <p className={styles.notice}>{t.viewer}</p>}
    {refreshFailed && <p role="alert">{data ? t.refreshFailed : t.failed} <button type="button" onClick={() => setRevision(value => value + 1)} disabled={busy}>{t.retry}</button></p>}
    {!data ? !refreshFailed && <p role="status">{t.loading}</p> : <>
      <section className={styles.controls} aria-label={t.title}><p>{t.entries}: <strong>{data.entryCount.toLocaleString(locale)}</strong></p>
        {data.draw ? <><p>{t.executed} · <time dateTime={data.draw.executedAt}>{new Date(data.draw.executedAt).toLocaleString(locale, { timeZone: "Asia/Seoul" })}</time></p><p>{data.draw.revealedThrough} / {WAVE_PRIZES.length} {t.published}</p>
          {nextIndex <= WAVE_PRIZES.length ? <button type="button" disabled={!canWrite || busy} onClick={() => void mutate(nextIndex)}>{busy ? t.busy : `${t.reveal}: ${nextIndex}. ${WAVE_PRIZES[nextIndex - 1].title}`}</button> : <p role="status">{t.finished}</p>}
        </> : <button ref={executeTrigger} type="button" disabled={!canWrite || busy} onClick={() => { setConsent(false); setConfirming(true); }}>{t.execute}</button>}
        {error && !confirming && <p role="alert">{t.failed}</p>}
      </section>
      <ol className={styles.prizes}>{WAVE_PRIZES.map((prize, index) => {
        const published = Boolean(data.draw && index < data.draw.revealedThrough), result = data.results.find(item => item.prizeKey === prize.key);
        return <li key={prize.key}><div className={styles.prizeHeading}><img src={wavePrizeImage(prize.key)} width={96} height={96} alt="" /><div><h2>{index + 1}. {prize.title}</h2><p>{prize.quantity} · {published ? t.published : t.hidden}</p></div></div>
          {published && result && data.draw && <RaffleResultReveal key={`${data.draw.id}:${prize.key}`} locale={locale} storageKey={`wave-admin:${data.draw.id}:${prize.key}`} outcome="won" title={prize.title} imageUrl={wavePrizeImage(prize.key)} headingId={`wave-winners-${prize.key}`} announcement={`${prize.title}: ${t.published}`} labels={{ ready: t.resultTitle, open: t.open, help: t.help, ticket: t.ticket, result: t.result, skip: t.skip }}><h3 id={`wave-winners-${prize.key}`} data-result-heading tabIndex={-1}>{prize.title}</h3><WaveWinners winners={result.winners} locale={locale} /></RaffleResultReveal>}
        </li>;
      })}</ol>
    </>}
    {confirming && <AccessibleOverlay open onClose={close} labelledBy="wave-draw-confirm-title" initialFocusRef={cancel} busy={busy} backdropClassName={styles.backdrop} contentClassName={styles.dialog} contentAs="section">
      <h2 id="wave-draw-confirm-title">{t.confirmTitle}</h2><p>{t.confirmHelp}</p><label><input type="checkbox" checked={consent} disabled={busy || Boolean(data?.draw)} onChange={event => setConsent(event.target.checked)} />{t.consent}</label>
      <div className={styles.actions}><button ref={cancel} type="button" disabled={busy} onClick={close}>{t.cancel}</button><button type="button" disabled={!consent || busy || Boolean(data?.draw)} onClick={() => void mutate()}>{busy ? t.busy : t.confirm}</button></div>
      {error && <p role="alert">{t.failed}</p>}
    </AccessibleOverlay>}
  </div></AdminOperationsShell>;
}
