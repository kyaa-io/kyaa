"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { useByUsSession } from "@/components/byus-session-provider";
import { appendLoginContext } from "@/components/login-intent";
import { CreatorImage } from "@/components/fan-ui/creator-image";
import { AccessibleOverlay } from "@/components/ui/overlay/accessible-overlay";
import { FanAction } from "@/components/fan-ui/fan-action";
import { subscribeFanActivityUpdates } from "@/components/fan-ui/fan-activity-updates";
import { withRequestDeadline } from "@/features/reliability/client/request-deadline";
import type { AppLocale } from "@/i18n/locales";
import { gggiCopy } from "@/i18n/catalogs/features__fanpage__gggi";
import { gggiEventSchema, type GggiEvent } from "../domain/gggi-event";
import styles from "./gggi-participation-entry.module.css";

export function GggiEventEntry({ locale }: { locale: AppLocale }) {
  const auth = useByUsAuth(), session = useByUsSession();
  const ready = auth.ready && session.ready && (!auth.authenticated || !!auth.user?.id && (!session.ownerId || session.ownerId === auth.user.id));
  const t = gggiCopy[locale];
  return <section className={`${styles.entry} ${styles.event}`} aria-labelledby="gggi-event-heading" id="gggi-event">
    <div className={styles.eventHeader}>
      <div className={styles.copy}>
        <span className={styles.eyebrow}>GGGI × CHANGHA</span>
        <h2 id="gggi-event-heading">{t.eventTitle}</h2>
      </div>
      <CreatorImage slug="changha" src="/images/celebrities/changha/profile-20261021.webp" alt={t.changha} width={128} height={144} sizes="128px" photos={undefined} className={styles.eventPortrait} />
    </div>
    <p className={styles.eventHelp}>{t.entryHelp}</p>
    <GggiEventActions key={`${ready}:${auth.authenticated}:${auth.user?.id}:${session.ownerId}:${session.generation}`}
      locale={locale} ready={ready} authenticated={auth.authenticated} ownerId={auth.user?.id} getAccessToken={auth.getAccessToken} />
  </section>;
}

function GggiEventActions({ locale, ready, authenticated, ownerId, getAccessToken }: {
  locale: AppLocale; ready: boolean; authenticated: boolean; ownerId: string | undefined;
  getAccessToken: () => Promise<string | null>;
}) {
  const t = gggiCopy[locale];
  const [event, setEvent] = useState<GggiEvent | null>(null);
  const [pending, setPending] = useState<"read" | "write" | null>("read");
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const writing = useRef(false);
  const [modal, setModal] = useState<"info" | "complete" | null>(null);
  const offered = useRef(false);
  const tokenProvider = useRef(getAccessToken);
  useEffect(() => { tokenProvider.current = getAccessToken; }, [getAccessToken]);
  useEffect(() => () => { controller.current?.abort(); }, []);

  const request = useCallback(async (method: "GET" | "POST", signal: AbortSignal) => withRequestDeadline(async (requestSignal) => {
    const token = authenticated ? await tokenProvider.current() : null;
    requestSignal.throwIfAborted();
    if (authenticated && !token) throw new Error("AUTHENTICATION_REQUIRED");
    const response = await fetch("/api/celebrities/gggi/event-entry", {
      method, cache: "no-store", signal: requestSignal,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error("AUTHENTICATION_REQUIRED");
      const body = await response.json().catch(() => null);
      throw new Error(typeof body?.error?.code === "string" ? body.error.code : "UNAVAILABLE");
    }
    const result = gggiEventSchema.parse(await response.json());
    if (authenticated !== (result.participation !== null) || (method === "POST" && !result.participation?.enteredAt)) throw new Error("INVALID_RESPONSE");
    return result;
  }, { signal }), [authenticated]);

  const refresh = useCallback(async () => {
    if (!ready || writing.current) return;
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setPending("read"); setError(null);
    try {
      let result = await request("GET", current.signal);
      if (current.signal.aborted) return;
      if (result.status === "open" && result.participation?.liked && !result.participation.enteredAt) {
        writing.current = true;
        setPending("write");
        result = await request("POST", current.signal);
        if (current.signal.aborted) return;
        setModal("complete");
      } else if (result.status === "open" && !result.participation?.enteredAt && !offered.current) {
        offered.current = true;
        let hidden = false;
        try { hidden = localStorage.getItem("gggi-event-dismissed-day") === new Date().toLocaleDateString("en-CA"); } catch { /* Storage can be unavailable in private browsing. */ }
        if (!hidden) setModal("info");
      }
      setEvent(result);
    } catch (caught) {
      if (!current.signal.aborted) setError(caught instanceof Error ? caught.message : "UNAVAILABLE");
    } finally {
      writing.current = false;
      if (!current.signal.aborted) setPending(null);
    }
  }, [ready, request]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => subscribeFanActivityUpdates(ownerId, () => { void refresh(); }, "reactions"), [ownerId, refresh]);

  function dismissToday() {
    try { localStorage.setItem("gggi-event-dismissed-day", new Date().toLocaleDateString("en-CA")); } catch { /* Closing still works without storage. */ }
    setModal(null);
  }

  const login = appendLoginContext("/login", { returnTo: `/gggi?locale=${locale}#gggi-event`, locale, intent: null, entity: null });
  const message = error === "GGGI_EVENT_LIKE_REQUIRED" ? t.likeRequired : error === "GGGI_EVENT_CLOSED" ? t.closed : error === "AUTHENTICATION_REQUIRED" ? t.authError : t.error;
  return <div className={styles.eventActions}>
    {!ready || pending ? <p role="status">{pending === "write" ? t.submitting : t.checking}</p>
      : error ? <><p role="alert">{message}</p>{error === "AUTHENTICATION_REQUIRED" ? <FanAction href={login} variant="primary">{t.login}</FanAction> : <FanAction onClick={() => void refresh()}>{t.retry}</FanAction>}</>
      : event?.participation?.enteredAt ? <p className={styles.entered} role="status"><Check size={20} aria-hidden="true" />{t.entered}</p>
      : event?.status !== "open" ? <p role="status">{event?.status === "closed" ? t.closed : t.notOpen}</p>
      : !authenticated ? <FanAction href={login} variant="primary">{t.login}</FanAction>
      : <FanAction href="#first-reaction" variant="primary">{t.likeToEnter}</FanAction>}
    <FanAction variant="text" onClick={() => setModal("info")}>{t.details}</FanAction>
    <AccessibleOverlay contentAs="section" open={modal !== null} onClose={() => setModal(null)} labelledBy="gggi-modal-title" backdropClassName={styles.backdrop} contentClassName={styles.modal}>
      <button className={styles.close} type="button" aria-label={t.close} onClick={() => setModal(null)}><X size={22} aria-hidden="true" /></button>
      <img className={styles.campaignArt} src="/images/gggi/changha-event-20261026.webp" alt="" width={1536} height={1024} />
      <div className={styles.modalCopy}>
        <span className={styles.eyebrow}>GGGI × CHANGHA</span>
        <h2 id="gggi-modal-title">{modal === "complete" ? t.entered : t.eventTitle}</h2>
        <p>{t.eventBody} {t.comingSoon}</p>
        <p>{t.entryHelp}</p>
        {modal === "complete" || event?.participation?.enteredAt ? <FanAction fullWidth variant="primary" onClick={() => setModal(null)}>{t.close}</FanAction>
          : <FanAction fullWidth variant="primary" href={authenticated ? "#first-reaction" : login} onClick={() => setModal(null)}>{authenticated ? t.likeToEnter : t.login}</FanAction>}
        <FanAction fullWidth variant="text" onClick={dismissToday}>{t.dismissToday}</FanAction>
      </div>
    </AccessibleOverlay>
  </div>;
}
