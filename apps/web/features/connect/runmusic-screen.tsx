"use client";

import { usePrivy } from "@privy-io/react-auth";
import { Check, Heart, ArrowRight, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useByUsSession } from "@/components/byus-session-provider";
import { usePageLocale } from "@/components/locale-provider";
import { appendLoginContext } from "@/components/login-intent";
import { FocusFlowFrame } from "@/components/fan-shell/focus-flow-frame";
import { FanAction } from "@/components/fan-ui/fan-action";
import { AccessibleOverlay } from "@/components/ui/overlay/accessible-overlay";
import { withRequestDeadline } from "@/features/reliability/client/request-deadline";
import { runmusicCampaignSchema, runmusicStatusSchema, type RunmusicCampaign, type RunmusicStatus } from "@/features/runmusic/domain";
import type { AppLocale } from "@/i18n/locales";
import { runmusicCopy } from "./runmusic-copy";
import styles from "./runmusic-screen.module.css";

export function clearLegacyRunmusicCode() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  if (params.has("checkin")) {
    params.delete("checkin");
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search + (params.size ? `#${params}` : ""));
  }
  try { sessionStorage.removeItem("runmusic-checkin-code"); } catch { /* The old code is no longer used. */ }
}

export function RunmusicScreen({ resultsOnly = false }: { resultsOnly?: boolean }) {
  const auth = usePrivy(), session = useByUsSession(), locale = usePageLocale();
  useEffect(clearLegacyRunmusicCode, []);
  const restored = auth.ready && session.ready && (!auth.authenticated || !!auth.user?.id && (!session.ownerId || session.ownerId === auth.user.id));
  return <FocusFlowFrame locale={locale} mainId="runmusic-main" showFooter>
    <Participation key={`${auth.authenticated}:${auth.user?.id}:${session.ownerId}:${session.generation}`} locale={locale}
      resultsOnly={resultsOnly} restored={restored} authenticated={auth.authenticated} getAccessToken={auth.getAccessToken} />
  </FocusFlowFrame>;
}

function Participation({ locale, resultsOnly, restored, authenticated, getAccessToken }: {
  locale: AppLocale; resultsOnly: boolean; restored: boolean; authenticated: boolean; getAccessToken: () => Promise<string | null>;
}) {
  const t = runmusicCopy[locale];
  const [campaign, setCampaign] = useState<RunmusicCampaign | null>(null), [status, setStatus] = useState<RunmusicStatus | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [revision, setRevision] = useState(0), [dialog, setDialog] = useState(false), [kakaoId, setKakaoId] = useState("");
  const [pasteHelp, setPasteHelp] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const alive = useRef(false), mutationBusy = useRef(false), autoOpened = useRef(false);
  const controller = useRef<AbortController | null>(null), attempt = useRef<{ snapshot: string; key: string } | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    if (!restored) return;
    const request = new AbortController(); setLoading(true); setError("");
    void withRequestDeadline(async signal => {
      const token = authenticated ? await getAccessToken() : null;
      signal.throwIfAborted(); if (authenticated && !token) throw new Error("AUTH_REQUIRED");
      const response = await fetch(authenticated ? "/api/me/runmusic" : "/api/runmusic", {
        headers: token ? { authorization: `Bearer ${token}` } : {}, cache: "no-store", signal,
      });
      if (!response.ok) throw new Error("LOAD_FAILED");
      const body = await response.json();
      if (authenticated) { const owned = runmusicStatusSchema.parse(body); return { campaign: owned.campaign, status: owned }; }
      return { campaign: runmusicCampaignSchema.parse(body), status: null };
    }, { signal: request.signal }).then(result => {
      if (!request.signal.aborted) { setCampaign(result.campaign); setStatus(result.status); }
    }).catch(() => { if (!request.signal.aborted) setError(t.error); }).finally(() => { if (!request.signal.aborted) setLoading(false); });
    return () => request.abort();
  }, [authenticated, restored, getAccessToken, revision, t.error]);
  const open = !!campaign && campaign.published && !campaign.drawn && now >= Date.parse(campaign.entryOpensAt) && now < Date.parse(campaign.entryClosesAt);
  useEffect(() => {
    if (restored && !loading && authenticated && status && !status.entered && open && !resultsOnly && !autoOpened.current) {
      autoOpened.current = true; setDialog(true);
    }
  }, [restored, loading, authenticated, status, open, resultsOnly]);

  async function submit(action: "like" | "enter" | "save_contact") {
    if (mutationBusy.current || !restored || !authenticated || !status) return;
    if (action === "enter" && (!status.liked || !open || status.entered)) return;
    mutationBusy.current = true; setBusy(true); setError("");
    const request = new AbortController(); controller.current = request;
    try {
      const next = await withRequestDeadline(async signal => {
        const token = await getAccessToken(); signal.throwIfAborted(); if (!token) throw new Error("AUTH_REQUIRED");
        const payload = { action, ...(action === "save_contact" ? { kakaoId: kakaoId.trim() } : {}) };
        const snapshot = JSON.stringify(payload);
        if (attempt.current?.snapshot !== snapshot) attempt.current = { snapshot, key: crypto.randomUUID() };
        const response = await fetch(action === "like" ? "/api/celebrities/runmusic/reactions" : "/api/me/runmusic", {
          method: "POST", headers: { authorization: `Bearer ${token}`, ...(action === "like" ? {} : { "content-type": "application/json" }) },
          ...(action === "like" ? {} : { body: JSON.stringify({ ...payload, requestKey: attempt.current.key }) }), cache: "no-store", signal,
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error?.code ?? "FAILED");
        if (action !== "like") return runmusicStatusSchema.parse(body);
        // Read the campaign's authoritative like state without opening the Passport celebration.
        const refresh = await fetch("/api/me/runmusic", { headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal });
        if (!refresh.ok) throw new Error("LOAD_FAILED");
        return runmusicStatusSchema.parse(await refresh.json());
      }, { signal: request.signal });
      if (!alive.current || request.signal.aborted) return;
      setStatus(next); setCampaign(next.campaign); attempt.current = null;
      if (action === "enter") setDialog(false);
      if (action === "save_contact") setKakaoId("");
    } catch (problem) {
      if (alive.current && !request.signal.aborted) {
        const code = problem instanceof Error ? problem.message : "";
        setError(code.includes("AUTH") ? t.authError : code.includes("CLOSED") ? t.closed : code.includes("NOT_OPEN") ? t.notOpen : t.error);
      }
    } finally { if (alive.current) { mutationBusy.current = false; setBusy(false); } }
  }
  async function paste() {
    setPasteHelp("");
    try {
      const value = await navigator.clipboard.readText();
      if (alive.current) setKakaoId(value);
    } catch { if (alive.current) setPasteHelp(t.pasteFallback); }
  }
  const login = appendLoginContext("/login", { returnTo: `/connect/runmusic${resultsOnly ? "/results" : ""}?locale=${locale}`, locale, intent: null, entity: null });
  const date = (value: string) => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" }).format(new Date(value));
  const controls = <div className={styles.steps}>
    <p>{t.likeHelp}</p>
    <FanAction disabled={busy || !open || !!status?.liked} onClick={() => void submit("like")} leadingIcon={status?.liked ? <Check size={20} /> : <Heart size={20} />}>{status?.liked ? t.liked : t.like}</FanAction>
    <FanAction variant="primary" disabled={busy || !open || !status?.liked} ariaBusy={busy} onClick={() => void submit("enter")} trailingIcon={<ArrowRight size={20} />}>{t.enter}</FanAction>
    {!open ? <p role="status">{campaign && now < Date.parse(campaign.entryOpensAt) ? t.notOpen : t.closed}</p> : null}
  </div>;
  return <main id="runmusic-main" className={styles.main}>
    <header className={styles.hero}>
      <div className={styles.brand}><img src="/images/runmusic/official-brand.webp" alt="RUN&MUSIC" width="112" height="112" /><span>× kyaa</span></div>
      <p className={styles.eyebrow}>RUN&MUSIC · 2026.10.24</p>
      <h1>{resultsOnly ? t.results : t.title}</h1>
      {!resultsOnly ? <p className={styles.intro}>{t.intro}</p> : null}
    </header>
    {!restored || loading ? <p role="status">{t.loading}</p> : <>
      {campaign && !resultsOnly ? <>
        <section className={styles.prizes} aria-label={t.prizes}>{campaign.prizes.map(prize => <article className={styles.prize} key={prize.code}>
          <div className={styles.prizeImage}>{prize.code === "andong_yogurt_1l" ? <svg viewBox="0 381 1206 1203" role="img" aria-label={prize.label}>
            <image href={prize.imageUrl} width="1206" height="2622" />
          </svg> : <img src={prize.imageUrl} alt={prize.label} />}</div>
          <div className={styles.prizeCopy}><span className={styles.count}>{t.count.replace("{count}", new Intl.NumberFormat(locale).format(prize.count))}</span><h2>{prize.label}</h2></div>
        </article>)}</section>
        <dl className={styles.dates}><div><dt>{t.deadline}</dt><dd>{date(campaign.entryClosesAt)} KST</dd></div><div><dt>{t.resultsAt}</dt><dd>{date(campaign.resultsAt)} KST</dd></div></dl>
      </> : null}
      {campaign ? <section className={styles.participation}>
        {!authenticated ? <FanAction href={login} variant="primary" fullWidth>{t.login}</FanAction>
          : !status ? null : resultsOnly ? <>
            <div className={styles.result} role="status"><h2>{status.result === "winner" ? t.win : status.result === "not_selected" ? t.lose : status.result === "not_entered" ? t.notEntered : now >= Date.parse(campaign.resultsAt) ? t.processing : t.pending}</h2>
              {status.result === "pending" ? <p>{t.resultsAt} · {date(campaign.resultsAt)} KST</p> : null}
              {status.result === "winner" ? <>
                <p>{campaign.prizes.find(prize => prize.code === status.prizeCode)?.label}</p>
                {status.receiptId ? <div className={styles.receipt}><span>{t.receipt}</span><strong>{status.receiptId}</strong></div> : null}
                {status.receivedAt ? <p>{t.received} · {date(status.receivedAt)} KST</p> : null}
              </> : null}
            </div>
            <FanAction disabled={busy} onClick={() => setRevision(value => value + 1)}>{t.retry}</FanAction>
          </> : status.entered ? <div className={styles.confirmation}><Check size={24} aria-hidden="true" /><h2>{t.entered}</h2><FanAction variant="text" href={`/connect/runmusic/results?locale=${locale}`}>{t.results}</FanAction></div>
            : <FanAction variant="primary" fullWidth disabled={!open || busy} onClick={() => setDialog(true)}>{open ? t.enter : now < Date.parse(campaign.entryOpensAt) ? t.notOpen : t.closed}</FanAction>}
        {!resultsOnly ? <p className={styles.meta}>{t.equal}</p> : null}
        {authenticated && status?.entered && status.result !== "not_selected" ? <section className={styles.contact} aria-labelledby="runmusic-contact-title">
          <h2 id="runmusic-contact-title">{t.contactTitle}</h2><p id="runmusic-contact-help">{t.contactHelp}</p>
          {status.contact.saved ? <p className={styles.saved} role="status"><Check size={18} aria-hidden="true" />{t.saved} {status.contact.masked}</p> : null}
          <form className={styles.form} onSubmit={event => { event.preventDefault(); void submit("save_contact"); }}>
            <label htmlFor="runmusic-kakao-id">{t.kakaoId}</label>
            <div className={styles.inputRow}><input id="runmusic-kakao-id" value={kakaoId} onChange={event => setKakaoId(event.target.value)} required maxLength={100} pattern="[^\x00-\x1F\x7F]+" autoComplete="off" aria-describedby="runmusic-contact-help" disabled={busy} /><FanAction disabled={busy} onClick={() => void paste()}>{t.paste}</FanAction></div>
            {pasteHelp ? <p role="status" className={styles.meta}>{pasteHelp}</p> : null}
            <FanAction type="submit" variant="primary" disabled={busy || !kakaoId.trim()} ariaBusy={busy}>{t.save}</FanAction>
          </form>
        </section> : null}
      </section> : null}
      {resultsOnly ? <FanAction variant="text" href={`/connect/runmusic?locale=${locale}`}>{t.back}</FanAction> : null}
    </>}
    {error && !dialog ? <div className={styles.error} role="alert"><p>{error}</p>{!campaign ? <FanAction onClick={() => setRevision(value => value + 1)}>{t.retry}</FanAction> : null}</div> : null}
    <AccessibleOverlay open={dialog && restored && !!status && !status.entered} onClose={() => { setDialog(false); setError(""); }} labelledBy="runmusic-dialog-title" describedBy="runmusic-dialog-description" backdropClassName={styles.backdrop} contentClassName={styles.dialog} busy={busy}>
      <div className={styles.dialogHeader}><h2 id="runmusic-dialog-title">{t.enter}</h2><button type="button" aria-label={t.close} className={styles.close} disabled={busy} onClick={() => { setDialog(false); setError(""); }}><X size={24} /></button></div>
      <p id="runmusic-dialog-description" className={styles.meta}>{t.equal}</p>
      {controls}
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    </AccessibleOverlay>
  </main>;
}
