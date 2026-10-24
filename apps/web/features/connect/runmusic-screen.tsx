"use client";

import { useByUsAuth as usePrivy } from "@/features/auth/client/cognito-auth";
import { Check, Heart, ArrowRight, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { useByUsSession } from "@/components/byus-session-provider";
import { usePageLocale } from "@/components/locale-provider";
import { appendLoginContext } from "@/components/login-intent";
import { FocusFlowFrame } from "@/components/fan-shell/focus-flow-frame";
import { FanAction } from "@/components/fan-ui/fan-action";
import { AccessibleOverlay } from "@/components/ui/overlay/accessible-overlay";
import { withRequestDeadline } from "@/features/reliability/client/request-deadline";
import { runmusicCampaignSchema, runmusicKakaoIdSchema, runmusicStatusSchema, type RunmusicCampaign, type RunmusicStatus } from "@/features/runmusic/domain";
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
  const t = runmusicCopy[locale], prizeClipId = useId();
  const [campaign, setCampaign] = useState<RunmusicCampaign | null>(null), [status, setStatus] = useState<RunmusicStatus | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [requiresLogin, setRequiresLogin] = useState(false);
  const [revision, setRevision] = useState(0), [dialog, setDialog] = useState<"entry" | "success" | null>(null), [kakaoId, setKakaoId] = useState("");
  const completionTitle = useRef<HTMLHeadingElement>(null), confirmedTitle = useRef<HTMLHeadingElement>(null);
  function closeDialog() {
    setDialog(null); setError("");
    if (dialog === "success") requestAnimationFrame(() => confirmedTitle.current?.focus({ preventScroll: true }));
  }
  const [pasteHelp, setPasteHelp] = useState(""), [contactError, setContactError] = useState("");
  function changeKakaoId(value: string) {
    setKakaoId(value); attempt.current = null; setPasteHelp("");
    setContactError(value && !runmusicKakaoIdSchema.safeParse(value).success ? t.invalidId : "");
  }
  const [now, setNow] = useState(() => Date.now());
  const alive = useRef(false), mutationBusy = useRef(false), autoOpened = useRef(false);
  const controller = useRef<AbortController | null>(null), attempt = useRef<{ snapshot: string; key: string } | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    const request = new AbortController(); setLoading(true); setError("");
    const load = async () => {
      let token: string | null = null;
      if (restored && authenticated) {
        try { token = await withRequestDeadline(() => getAccessToken(), { signal: request.signal }); }
        catch { request.signal.throwIfAborted(); }
      }
      return withRequestDeadline(async signal => {
        signal.throwIfAborted();
        if (token) {
          const response = await fetch("/api/me/runmusic", { headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal });
          if (response.ok) {
            const owned = runmusicStatusSchema.parse(await response.json());
            return { campaign: owned.campaign, status: owned };
          }
          if (response.status !== 401 && response.status !== 403) throw new Error("LOAD_FAILED");
        }
        // A restored SDK identity can still need the app's login/session step.
        const response = await fetch("/api/runmusic", { headers: {}, cache: "no-store", signal });
        if (!response.ok) throw new Error("LOAD_FAILED");
        return { campaign: runmusicCampaignSchema.parse(await response.json()), status: null };
      }, { signal: request.signal });
    };
    void load().then(result => {
      if (!request.signal.aborted) { setCampaign(result.campaign); setStatus(result.status); }
    }).catch(() => { if (!request.signal.aborted) setError(t.error); }).finally(() => { if (!request.signal.aborted) setLoading(false); });
    return () => request.abort();
  }, [authenticated, restored, getAccessToken, revision, t.error]);
  const open = !!campaign && campaign.published && !campaign.drawn && now >= Date.parse(campaign.entryOpensAt) && now < Date.parse(campaign.entryClosesAt);
  useEffect(() => {
    if (restored && !loading && authenticated && status && !status.entered && open && !resultsOnly && !autoOpened.current) {
      autoOpened.current = true; setDialog("entry");
    }
  }, [restored, loading, authenticated, status, open, resultsOnly]);

  async function submit(action: "enter" | "save_contact") {
    if (mutationBusy.current || requiresLogin || !restored || !authenticated || !status) return;
    if (action === "enter" && (!open || status.entered)) return;
    if (!runmusicKakaoIdSchema.safeParse(kakaoId).success) { setContactError(t.invalidId); return; }
    mutationBusy.current = true; setBusy(true); setError("");
    const request = new AbortController(); controller.current = request;
    try {
      const next = await withRequestDeadline(async signal => {
        const token = await getAccessToken().catch(() => null); signal.throwIfAborted(); if (!token) throw new Error("AUTH_REQUIRED");
        const payload = { action, kakaoId: kakaoId.trim() };
        const snapshot = JSON.stringify(payload);
        if (attempt.current?.snapshot !== snapshot) attempt.current = { snapshot, key: crypto.randomUUID() };
        if (action === "enter" && !status.liked) {
          const liked = await fetch("/api/celebrities/runmusic/reactions", { method: "POST", headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal });
          if (liked.status === 401 || liked.status === 403) throw new Error("AUTH_REQUIRED");
          if (!liked.ok) throw new Error("LIKE_FAILED");
          signal.throwIfAborted();
        }
        const response = await fetch("/api/me/runmusic", {
          method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ ...payload, requestKey: attempt.current.key }), cache: "no-store", signal,
        });
        if (response.status === 401 || response.status === 403) throw new Error("AUTH_REQUIRED");
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error?.code ?? "FAILED");
        return runmusicStatusSchema.parse(body);
      }, { signal: request.signal });
      if (!alive.current || request.signal.aborted) return;
      if (action === "enter" && !next.entered) throw new Error("FAILED");
      setStatus(next); setCampaign(next.campaign); attempt.current = null;
      if (action === "enter") setDialog("success");
      setKakaoId(""); setContactError("");
    } catch (problem) {
      if (alive.current && !request.signal.aborted) {
        const code = problem instanceof Error ? problem.message : "";
        if (code.includes("AUTH")) setRequiresLogin(true);
        setError(code.includes("AUTH") ? t.authError : code.includes("CLOSED") ? t.closed : code.includes("NOT_OPEN") ? t.notOpen : t.error);
      }
    } finally { if (alive.current) { mutationBusy.current = false; setBusy(false); } }
  }
  async function paste() {
    setPasteHelp("");
    try {
      const value = await navigator.clipboard.readText();
      if (alive.current) changeKakaoId(value);
    } catch { if (alive.current) setPasteHelp(t.pasteFallback); }
  }
  const login = appendLoginContext("/login", { returnTo: `/connect/runmusic${resultsOnly ? "/results" : ""}?locale=${locale}`, locale, intent: null, entity: null });
  const date = (value: string) => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" }).format(new Date(value));
  const contactInput = <>
    <label htmlFor="runmusic-kakao-id">{t.kakaoId}</label>
    <div className={styles.inputRow}><input id="runmusic-kakao-id" value={kakaoId} onChange={event => changeKakaoId(event.target.value)} onPaste={event => {
      event.preventDefault();
      const input = event.currentTarget, text = event.clipboardData.getData("text/plain");
      changeKakaoId(kakaoId.slice(0, input.selectionStart ?? kakaoId.length) + text + kakaoId.slice(input.selectionEnd ?? kakaoId.length));
    }} required autoComplete="off" aria-invalid={!!contactError} aria-describedby={`runmusic-contact-help runmusic-kakao-help${contactError ? " runmusic-contact-error" : ""}`} disabled={busy} /><FanAction disabled={busy} onClick={() => void paste()}>{t.paste}</FanAction></div>
    {contactError ? <p id="runmusic-contact-error" role="alert" className={styles.error}>{contactError}</p> : null}
    {pasteHelp ? <p role="status" className={styles.meta}>{pasteHelp}</p> : null}
  </>;
  const idHelp = <div className={styles.idHelp}><strong>{t.kakaoIdHelpTitle}</strong><ol id="runmusic-kakao-help">{t.kakaoIdHelp.split(" → ").map(step => <li key={step}>{step}</li>)}</ol><img className={styles.idExample} src="/images/runmusic/kakao-id-guide.png" alt={t.kakaoIdHelpTitle} width="850" height="1850" /></div>;
  const controls = <form className={styles.form} onSubmit={event => { event.preventDefault(); void submit("enter"); }}>
    <p id="runmusic-contact-help">{t.contactHelp}</p>
    {contactInput}
    <div className={styles.steps}>
      <p>{t.likeHelp}</p>
      <FanAction type="submit" variant="primary" disabled={busy || requiresLogin || !open || !runmusicKakaoIdSchema.safeParse(kakaoId).success} ariaBusy={busy} trailingIcon={<ArrowRight size={20} />}>{t.confirmEntry}</FanAction>
      {!open ? <p role="status">{campaign && now < Date.parse(campaign.entryOpensAt) ? t.notOpen : t.closed}</p> : null}
    </div>
    {idHelp}
  </form>;
  return <main id="runmusic-main" className={styles.main}>
    <header className={styles.hero}>
      <div className={styles.brand}><img src="/images/runmusic/official-brand.webp" alt="RUN&MUSIC" width="112" height="112" /><span>× kyaa</span></div>
      <p className={styles.eyebrow}>RUN&MUSIC · 2026.10.24</p>
      <h1>{resultsOnly ? t.results : t.title}</h1>
      {!resultsOnly ? <p className={styles.intro}>{t.intro}</p> : null}
    </header>
    {loading ? <p role="status">{t.loading}</p> : <>
      {campaign && !resultsOnly ? <>
        {!restored || !authenticated || !status || requiresLogin || !status.entered ? <div className={styles.entryAction}>
          {!restored || !authenticated || !status || requiresLogin ? <FanAction href={login} variant="primary" leadingIcon={<Heart size={20} />}>{t.enter}</FanAction>
            : <FanAction variant="primary" disabled={!open || busy} onClick={() => setDialog("entry")} leadingIcon={<Heart size={20} />}>{open ? t.enter : now < Date.parse(campaign.entryOpensAt) ? t.notOpen : t.closed}</FanAction>}
        </div> : null}
        <section className={styles.prizes} aria-label={t.prizes}>{campaign.prizes.map(prize => <article className={styles.prize} key={prize.code}>
          <div className={styles.prizeImage}>{prize.code === "andong_yogurt_1l" ? <svg viewBox="0 381 1206 1203" role="img" aria-label={prize.label}>
            <defs><clipPath id={prizeClipId}><rect x="0" y="381" width="1206" height="1203" /></clipPath></defs>
            <image href={prize.imageUrl} width="1206" height="2622" clipPath={`url(#${prizeClipId})`} />
          </svg> : <img src={prize.imageUrl} alt={prize.label} />}</div>
          <div className={styles.prizeCopy}><span className={styles.count}>{t.count.replace("{count}", new Intl.NumberFormat(locale).format(prize.count))}</span><h2>{prize.label}</h2></div>
        </article>)}</section>
        <dl className={styles.dates}><div><dt>{t.deadline}</dt><dd>{date(campaign.entryClosesAt)} KST</dd></div><div><dt>{t.resultsAt}</dt><dd>{date(campaign.resultsAt)} KST</dd></div></dl>
      </> : null}
      {campaign ? <section className={styles.participation}>
        {!restored || !authenticated || !status || requiresLogin ? resultsOnly ? <FanAction href={login} variant="primary" fullWidth>{t.login}</FanAction> : null
          : resultsOnly ? <>
            <div className={styles.result} role="status"><h2>{status.result === "winner" ? t.win : status.result === "not_selected" ? t.lose : status.result === "not_entered" ? t.notEntered : now >= Date.parse(campaign.resultsAt) ? t.processing : t.pending}</h2>
              {status.result === "pending" ? <p>{t.resultsAt} · {date(campaign.resultsAt)} KST</p> : null}
              {status.result === "winner" ? <>
                <p>{campaign.prizes.find(prize => prize.code === status.prizeCode)?.label}</p>
                {status.receiptId ? <div className={styles.receipt}><span>{t.receipt}</span><strong>{status.receiptId}</strong></div> : null}
                {status.receivedAt ? <p>{t.received} · {date(status.receivedAt)} KST</p> : null}
              </> : null}
            </div>
            <FanAction disabled={busy} onClick={() => setRevision(value => value + 1)}>{t.retry}</FanAction>
          </> : status.entered ? <div className={styles.confirmation}><Check size={24} aria-hidden="true" /><h2 ref={confirmedTitle} tabIndex={-1}>{t.entered}</h2><FanAction variant="text" href={`/connect/runmusic/results?locale=${locale}`}>{t.results}</FanAction></div>
            : null}
        {restored && authenticated && status?.entered && !requiresLogin ? <FanAction href={`/?locale=${locale}`} variant="primary" fullWidth className={styles.home}>{t.home}</FanAction> : null}
        {!resultsOnly ? <p className={styles.meta}>{t.equal}</p> : null}
        {restored && authenticated && status?.entered && status.result !== "not_selected" ? <section className={styles.contact} aria-labelledby="runmusic-contact-title">
          <h2 id="runmusic-contact-title">{t.contactTitle}</h2><p id="runmusic-contact-help">{t.contactHelp}</p>
          {status.contact.saved ? <p className={styles.saved} role="status"><Check size={18} aria-hidden="true" />{t.saved} {status.contact.masked}</p> : null}
          <form className={styles.form} onSubmit={event => { event.preventDefault(); void submit("save_contact"); }}>
            {contactInput}
            <FanAction type="submit" variant="primary" disabled={busy || requiresLogin || !runmusicKakaoIdSchema.safeParse(kakaoId).success} ariaBusy={busy}>{t.save}</FanAction>
            {idHelp}
          </form>
        </section> : null}
      </section> : null}
      {resultsOnly ? <FanAction variant="text" href={`/connect/runmusic?locale=${locale}`}>{t.back}</FanAction> : null}
    </>}
    {error && !dialog ? <div className={styles.error} role="alert"><p>{error}</p>{!campaign ? <FanAction onClick={() => setRevision(value => value + 1)}>{t.retry}</FanAction> : null}</div> : null}
    <AccessibleOverlay open={!!dialog && restored && !!status && (dialog === "success" ? status.entered : !status.entered)} onClose={closeDialog} labelledBy="runmusic-dialog-title" describedBy="runmusic-dialog-description" initialFocusRef={dialog === "success" ? completionTitle : undefined} backdropClassName={styles.backdrop} contentClassName={styles.dialog} busy={busy}>
      {dialog === "success" ? <>
        <button type="button" aria-label={t.close} className={`${styles.close} ${styles.completionClose}`} onClick={closeDialog}><X size={24} /></button>
        <div className={styles.completion}>
          <div className={styles.confetti} aria-hidden="true">{Array.from({ length: 20 }, (_, index) => <i key={index} style={{
            "--burst-x": `${(index % 2 ? 1 : -1) * (42 + (index * 17) % 104)}px`,
            "--burst-y": `${-36 + (index * 23) % 172}px`,
            "--burst-turn": `${(index % 2 ? 1 : -1) * (120 + index * 31)}deg`,
          } as CSSProperties} />)}</div>
          <div className={styles.completionMark} aria-hidden="true"><Check size={36} strokeWidth={3} /></div>
          <div className={styles.completionCopy}>
            <h2 id="runmusic-dialog-title" ref={completionTitle} tabIndex={-1}>{t.completionTitle}</h2>
            <p id="runmusic-dialog-description">{t.pending}</p>
          </div>
          <div className={styles.completionDate}><span>{t.resultsAt}</span><strong>{campaign ? date(campaign.resultsAt) : ""} KST</strong></div>
          <FanAction variant="primary" fullWidth onClick={closeDialog}>{t.acknowledge}</FanAction>
        </div>
      </> : <>
      <div className={styles.dialogHeader}><h2 id="runmusic-dialog-title">{t.enter}</h2><button type="button" aria-label={t.close} className={styles.close} disabled={busy} onClick={closeDialog}><X size={24} /></button></div>
      <p id="runmusic-dialog-description" className={styles.meta}>{t.equal}</p>
      {controls}
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      {requiresLogin ? <FanAction href={login} variant="primary" fullWidth>{t.login}</FanAction> : null}
      </>}
    </AccessibleOverlay>
  </main>;
}
