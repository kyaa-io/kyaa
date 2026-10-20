"use client";

import { usePrivy } from "@privy-io/react-auth";
import { Check, ArrowUpRight, Ticket, MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useByUsSession } from "@/components/byus-session-provider";
import { usePageLocale } from "@/components/locale-provider";
import { appendLoginContext } from "@/components/login-intent";
import { FocusFlowFrame } from "@/components/fan-shell/focus-flow-frame";
import { FanAction, fanActionClassName } from "@/components/fan-ui/fan-action";
import { withRequestDeadline } from "@/features/reliability/client/request-deadline";
import { assetSchema } from "@/features/fan-posts/domain/content";
import { runmusicCampaignSchema, runmusicStatusSchema, type RunmusicCampaign, type RunmusicStatus, type RunmusicAction } from "@/features/runmusic/domain";
import type { AppLocale } from "@/i18n/locales";
import { runmusicCopy } from "./runmusic-copy";
import styles from "./runmusic-screen.module.css";

export const RUNMUSIC_CODE_STORAGE = "runmusic-checkin-code";
export function restoreRunmusicCode() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const incoming = params.get("checkin");
  if (incoming !== null) {
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    if (incoming.trim().length > 0 && incoming.length <= 128) {
      try { sessionStorage.setItem(RUNMUSIC_CODE_STORAGE, incoming.trim()); } catch { /* Manual entry remains available. */ }
      return incoming.trim();
    }
    return "";
  }
  try { return sessionStorage.getItem(RUNMUSIC_CODE_STORAGE) ?? ""; } catch { return ""; }
}

export function RunmusicScreen() {
  const auth = usePrivy(), session = useByUsSession(), locale = usePageLocale();
  const [code, setCode] = useState("");
  useEffect(() => { setCode(restoreRunmusicCode()); }, []);
  const restored = auth.ready && session.ready && (!auth.authenticated || !!auth.user?.id && (!session.ownerId || session.ownerId === auth.user.id));
  return <FocusFlowFrame locale={locale} mainId="runmusic-main" showFooter>
    <Participation key={`${auth.user?.id}:${session.ownerId}:${session.generation}`} locale={locale} code={code} setCode={setCode}
      restored={restored} authenticated={auth.authenticated} getAccessToken={auth.getAccessToken} />
  </FocusFlowFrame>;
}

function Participation({ locale, code, setCode, restored, authenticated, getAccessToken }: {
  locale: AppLocale; code: string; setCode: (value: string) => void; restored: boolean; authenticated: boolean;
  getAccessToken: () => Promise<string | null>;
}) {
  const t = runmusicCopy[locale];
  const [campaign, setCampaign] = useState<RunmusicCampaign | null>(null), [status, setStatus] = useState<RunmusicStatus | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [revision, setRevision] = useState(0);
  const [body, setBody] = useState(""), [answer, setAnswer] = useState(""), [file, setFile] = useState<File | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
  const [active, setActive] = useState<RunmusicAction["action"] | null>(null);
  const alive = useRef(false), mutationBusy = useRef(false), attempt = useRef<{ snapshot: string; key: string } | null>(null);
  const uploaded = useRef<{ file: File; id: string } | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => {
    if (!restored) return;
    const request = new AbortController();
    setLoading(true); setError("");
    void withRequestDeadline(async signal => {
      const token = authenticated ? await getAccessToken() : null;
      signal.throwIfAborted();
      if (authenticated && !token) throw new Error("AUTH_REQUIRED");
      const response = await fetch(authenticated ? "/api/me/runmusic" : "/api/runmusic", {
        headers: token ? { authorization: `Bearer ${token}` } : {}, cache: "no-store", signal,
      });
      if (!response.ok) throw new Error("LOAD_FAILED");
      const result = await response.json();
      if (authenticated) { const parsed = runmusicStatusSchema.parse(result); return { campaign: parsed.campaign, status: parsed }; }
      return { campaign: runmusicCampaignSchema.parse(result), status: null };
    }, { signal: request.signal }).then(result => {
      if (!request.signal.aborted) { setCampaign(result.campaign); setStatus(result.status); }
    }).catch(() => { if (!request.signal.aborted) setError(t.error); }).finally(() => { if (!request.signal.aborted) setLoading(false); });
    return () => request.abort();
  }, [authenticated, restored, getAccessToken, revision, t.error]);

  async function submit(action: RunmusicAction["action"]) {
    if (mutationBusy.current || !restored || !authenticated) return;
    mutationBusy.current = true; setBusy(true); setError("");
    const request = new AbortController(); controller.current = request;
    try {
      await withRequestDeadline(async signal => {
        const token = await getAccessToken();
        signal.throwIfAborted(); if (!token) throw new Error("AUTH_REQUIRED");
        let assetIds: string[] | undefined;
        if (action === "photo") {
          if (!file || file.size > 8 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("PHOTO_INVALID");
          if (uploaded.current?.file !== file) {
            const data = new FormData(); data.set("file", file); data.set("celebritySlug", "runmusic");
            const response = await fetch("/api/content-assets", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: data, signal });
            if (!response.ok) throw new Error("UPLOAD_FAILED");
            const asset = assetSchema.parse((await response.json()).asset);
            uploaded.current = { file, id: asset.id };
          }
          assetIds = [uploaded.current.id];
        }
        const payload = { action, ...(["pre_cheer", "cheer", "photo"].includes(action) ? { body: body.trim() } : {}),
          ...(assetIds ? { assetIds } : {}), ...(action === "checkin" ? { code: code.trim() } : {}), ...(action === "quiz" ? { answer } : {}) };
        const snapshot = JSON.stringify(payload);
        if (attempt.current?.snapshot !== snapshot) attempt.current = { snapshot, key: crypto.randomUUID() };
        signal.throwIfAborted();
        const response = await fetch("/api/me/runmusic", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ ...payload, requestKey: attempt.current.key }), cache: "no-store", signal });
        const result = await response.json();
        if (!response.ok) throw new Error(typeof result?.error?.code === "string" ? result.error.code : "FAILED");
        const next = runmusicStatusSchema.parse(result);
        if (!alive.current) return;
        setStatus(next); setCampaign(next.campaign); setBody(""); setAnswer(""); setFile(null); setActive(null); attempt.current = null; uploaded.current = null;
        if (action === "checkin") { setCode(""); try { sessionStorage.removeItem(RUNMUSIC_CODE_STORAGE); } catch { /* The server still prevents repeat entries. */ } }
      }, { signal: request.signal });
    } catch (problem) {
      if (alive.current && !request.signal.aborted) {
        const code = problem instanceof Error ? problem.message : "";
        setError(code.includes("INVALID_CODE") ? t.invalidCode : code.includes("ANSWER") ? t.invalidAnswer : code.includes("CLOSED") || code.includes("NOT_OPEN") ? t.closed
          : code.includes("AUTH") ? t.authError : code.includes("CHECKIN_REQUIRED") || code.includes("REGISTRATION_REQUIRED") ? t.locked : code === "PHOTO_INVALID" ? t.photoHelp : t.error);
      }
    } finally { if (alive.current) { mutationBusy.current = false; setBusy(false); } }
  }
  const preOpen = !!campaign && now >= Date.parse(campaign.registrationOpensAt) && now < Date.parse(campaign.registrationClosesAt);
  const dayOpen = !!campaign && now >= Date.parse(campaign.eventStartsAt) && now < Date.parse(campaign.eventEndsAt);
  const login = appendLoginContext("/login", { returnTo: `/connect/runmusic?locale=${locale}`, locale, intent: null, entity: null });
  const missions = ["pre_cheer", "checkin", "cheer", "photo", "quiz"] as const;
  const names = { pre_cheer: t.preCheer, checkin: t.checkin, cheer: t.cheer, photo: t.photo, quiz: t.quiz };
  const date = (value: string) => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" }).format(new Date(value));
  return <main id="runmusic-main" className={styles.main}>
    <header className={styles.hero}>
      <div className={styles.brand}><img src="/images/runmusic/official-brand.webp" width={544} height={544} alt="RUN&MUSIC" /><span>RUN&MUSIC × kyaa</span></div>
      <p className={styles.eyebrow}>2026.10.24 · ANDONG</p>
      <h1>{t.title}</h1><p className={styles.intro}>{t.intro}</p>
      <p className={styles.venue}><MapPin size={18} aria-hidden="true" />{t.venue}</p>
      {campaign && <p className={styles.meta}>{t.eventHours} · {date(campaign.eventStartsAt)} – {date(campaign.eventEndsAt)} · KST</p>}
      <div className={styles.links}><a href="https://runmusicfestival.localvibehub.com/run-music" target="_blank" rel="noopener noreferrer">{t.official}<ArrowUpRight size={16} aria-hidden="true" /></a><a href="https://runmusicfestival.localvibehub.com/run-music/concert" target="_blank" rel="noopener noreferrer">{t.ticketLink}<ArrowUpRight size={16} aria-hidden="true" /></a></div>
    </header>
    <div className={styles.layout}>
      <section className={styles.reward} aria-labelledby="runmusic-prize"><p className={styles.eyebrow}>RUN&MUSIC</p><h2 id="runmusic-prize">{t.prize.replace("{count}", String(campaign?.prizeCount ?? 100))}</h2><p className={styles.bonus}>{t.bonus}</p><p>{t.rules}</p>
        {campaign && <p className={styles.meta}>{t.preClose} · {date(campaign.registrationClosesAt)} KST</p>}
      </section>
      <section className={styles.participation} aria-labelledby="runmusic-participation" aria-busy={busy || loading || !restored}>
        <h2 id="runmusic-participation">{t.tickets}</h2>
        {loading || !restored ? <p role="status">{t.loading}</p> : campaign ? <>
          <div className={styles.ticket}><Ticket aria-hidden="true" /><strong>{status?.tickets ?? 0}<span> / {status?.multiplier === 2 ? 8 : 4}</span></strong>{status?.multiplier === 2 && <span className={styles.badge}>×2</span>}</div>
          {!authenticated ? <FanAction href={login} variant="primary" fullWidth>{t.login}</FanAction> : <>
            <FanAction variant={status?.registered ? "neutral" : "primary"} fullWidth disabled={busy || !!status?.registered || !campaign.published || campaign.drawn || !preOpen} onClick={() => void submit("register")} leadingIcon={status?.registered ? <Check /> : undefined}>{status?.registered ? t.registered : t.register}</FanAction>
            <ol className={styles.missions}>{missions.map((mission, index) => {
              const completed = status?.missions.includes(mission);
              const phaseOpen = mission === "pre_cheer" ? preOpen : dayOpen;
              const phaseTime = mission === "pre_cheer" ? `${date(campaign.registrationOpensAt)} – ${date(campaign.registrationClosesAt)} KST` : `${date(campaign.eventStartsAt)} – ${date(campaign.eventEndsAt)} KST`;
              const locked = mission === "pre_cheer" ? !status?.registered : mission !== "checkin" && !status?.missions.includes("checkin");
              return <li key={mission}><div className={styles.missionTitle}><span className={styles.number}>{completed ? <Check size={18} aria-hidden="true" /> : index + 1}</span><div><h3>{names[mission]}</h3><p className={styles.meta}>{completed ? t.done : !phaseOpen ? phaseTime : locked ? mission === "pre_cheer" ? t.register : t.locked : t.waiting}</p></div>{!completed && <button type="button" className={fanActionClassName("neutral")} disabled={busy || locked || !campaign.published || campaign.drawn || !phaseOpen} aria-expanded={active === mission} aria-controls={`runmusic-${mission}-form`} onClick={() => { setActive(active === mission ? null : mission); setError(""); }}>{names[mission]}</button>}</div>
                {!completed && active === mission && <form id={`runmusic-${mission}-form`} className={styles.form} onSubmit={event => { event.preventDefault(); void submit(mission); }}>
                  {mission === "checkin" ? <><label htmlFor="runmusic-code">{t.code}</label><input id="runmusic-code" value={code} onChange={event => setCode(event.target.value)} maxLength={128} required autoComplete="off" aria-describedby="runmusic-checkin-help runmusic-error" /><p id="runmusic-checkin-help" className={styles.meta}>{t.onsiteHint}</p></>
                    : mission === "quiz" ? <><p>{t.question}</p><label htmlFor="runmusic-answer">{t.answer}</label><select id="runmusic-answer" value={answer} onChange={event => setAnswer(event.target.value)} required aria-describedby="runmusic-error"><option value="">—</option><option value="안동체육관">안동체육관</option><option value="안동시민운동장">안동시민운동장</option><option value="안동역">안동역</option></select></>
                    : <><label htmlFor={`runmusic-body-${mission}`}>{t.body}</label><textarea id={`runmusic-body-${mission}`} value={body} onChange={event => setBody(event.target.value)} required={mission !== "photo"} maxLength={mission === "photo" ? 5000 : 1000} rows={3} aria-describedby="runmusic-public-help runmusic-error" /><p id="runmusic-public-help" className={styles.meta}>{t.publicHint}</p>{mission === "photo" && <><label htmlFor="runmusic-photo">{t.photo}</label><input id="runmusic-photo" type="file" accept="image/jpeg,image/png,image/webp" required onChange={event => { setFile(event.target.files?.[0] ?? null); }} aria-describedby="runmusic-photo-help runmusic-error" /><p id="runmusic-photo-help" className={styles.meta}>{t.photoHelp}</p></>}</>}
                  <FanAction type="submit" variant="primary" disabled={busy}>{busy ? t.loading : t.submit}</FanAction>
                </form>}
              </li>;
            })}</ol>
            <section className={styles.results} aria-labelledby="runmusic-result"><h2 id="runmusic-result">{t.result}</h2><p role="status">{status?.result === "winner" ? t.win : status?.result === "not_selected" ? t.lose : status?.result === "not_entered" ? t.notEntered : t.pending}</p>
              {status?.result === "winner" && status.receiptId && <><p>{t.receipt}</p><code className={styles.receipt}>{status.receiptId}</code>{status.receivedAt && <p>{t.received} · {date(status.receivedAt)} KST</p>}</>}
              <FanAction onClick={() => setRevision(value => value + 1)} disabled={busy}>{t.retry}</FanAction>
            </section>
          </>}
        </> : <FanAction onClick={() => setRevision(value => value + 1)}>{t.retry}</FanAction>}
        <p id="runmusic-error" className={styles.error} role={error ? "alert" : undefined}>{error}</p>
      </section>
    </div>
    <details className={styles.notice}><summary>{t.notice}</summary><img src="/images/runmusic/venue-change-20261020.jpg" width={1080} height={1350} alt={t.notice} loading="lazy" /><a href="/images/runmusic/venue-change-20261020.jpg" target="_blank" rel="noopener noreferrer">{t.notice}<ArrowUpRight size={16} aria-hidden="true" /></a></details>
  </main>;
}
