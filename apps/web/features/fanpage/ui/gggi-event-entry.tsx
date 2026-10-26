"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { useByUsSession } from "@/components/byus-session-provider";
import { appendLoginContext } from "@/components/login-intent";
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
    <div className={styles.copy}>
      <h2 id="gggi-event-heading">{t.eventTitle}</h2>
      <p>{t.eventBody} <strong>{t.comingSoon}</strong></p>
      <p>{t.entryHelp}</p>
    </div>
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
      const result = await request("GET", current.signal);
      if (!current.signal.aborted) setEvent(result);
    } catch (caught) {
      if (!current.signal.aborted) setError(caught instanceof Error ? caught.message : "UNAVAILABLE");
    } finally {
      if (!current.signal.aborted) setPending(null);
    }
  }, [ready, request]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => subscribeFanActivityUpdates(ownerId, () => { void refresh(); }, "reactions"), [ownerId, refresh]);

  async function enter() {
    if (!ready || !authenticated || writing.current || pending || error || event?.status !== "open" || !event.participation?.liked || event.participation.enteredAt) return;
    writing.current = true;
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setPending("write"); setError(null);
    try {
      const result = await request("POST", current.signal);
      if (!current.signal.aborted) setEvent(result);
    } catch (caught) {
      if (!current.signal.aborted) setError(caught instanceof Error ? caught.message : "UNAVAILABLE");
    } finally {
      writing.current = false;
      if (!current.signal.aborted) setPending(null);
    }
  }

  const login = appendLoginContext("/login", { returnTo: `/gggi?locale=${locale}#gggi-event`, locale, intent: null, entity: null });
  const message = error === "GGGI_EVENT_LIKE_REQUIRED" ? t.likeRequired : error === "GGGI_EVENT_CLOSED" ? t.closed : error === "AUTHENTICATION_REQUIRED" ? t.authError : t.error;
  return <div className={styles.eventActions}>
    {!ready || pending === "read" ? <p role="status">{t.checking}</p>
      : error ? <><p role="alert">{message}</p>{error === "AUTHENTICATION_REQUIRED" ? <FanAction href={login} variant="primary">{t.login}</FanAction> : <FanAction onClick={() => void refresh()}>{t.retry}</FanAction>}</>
      : event?.participation?.enteredAt ? <p className={styles.entered} role="status"><Check size={20} aria-hidden="true" />{t.entered}</p>
      : event?.status !== "open" ? <p role="status">{event?.status === "closed" ? t.closed : t.notOpen}</p>
      : !authenticated ? <FanAction href={login} variant="primary">{t.login}</FanAction>
      : <>{!event.participation?.liked ? <p id="gggi-like-help">{t.likeRequired}</p> : null}
        <FanAction variant="primary" disabled={!event.participation?.liked || pending === "write"} ariaBusy={pending === "write"}
          ariaDescribedBy={!event.participation?.liked ? "gggi-like-help" : undefined} onClick={() => void enter()}>{pending === "write" ? t.submitting : t.enter}</FanAction></>}
  </div>;
}
