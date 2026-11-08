"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { showFanToast } from "@/components/fan-ui/fan-toast";
import { toContentLocale, type AppLocale } from "@/i18n/locales";
import { notificationCollectionSchema, type NotificationItem } from "../domain/notification-model";
import { inboxCopy } from "./notification-inbox-copy";

export type InboxState =
  | { kind: "loading" }
  | { kind: "auth" }
  | { kind: "error" }
  | { kind: "ready"; items: NotificationItem[] };

/** 60초마다, 그리고 탭이 다시 보일 때 다시 읽는다(plan-ux r6 6.5 전환, R21). */
const REFRESH_MS = 60_000;

/** 알림함 자료: `?fields=actor`(주체·대상·썸네일), 읽음 낙관, 모두 읽음. 패널과 `/notifications`가 같이 쓴다. */
export function useNotificationInbox(locale: AppLocale, active = true) {
  const { ready, authenticated, user, getAccessToken } = useByUsAuth();
  const owner = user?.id ?? null;
  const [state, setState] = useState<InboxState>({ kind: "loading" });
  const [readingAll, setReadingAll] = useState(false);
  const ownerRef = useRef(owner);
  const generation = useRef(0);
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);
  useLayoutEffect(() => {
    if (ownerRef.current !== owner) setState({ kind: "loading" });
    ownerRef.current = owner;
    return () => { generation.current += 1; };
  }, [owner]);

  const load = useCallback(async () => {
    if (!ready) return;
    if (!authenticated) { setState({ kind: "auth" }); return; }
    const mine = ++generation.current;
    const ownerAtStart = owner;
    const current = () => mine === generation.current && ownerRef.current === ownerAtStart;
    try {
      const token = await getAccessToken();
      if (!current()) return;
      if (!token) throw new Error("token");
      const response = await fetch(`/api/notifications?locale=${toContentLocale(locale)}&recipientLinks=1&fields=actor`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
      if (!response.ok) throw new Error("response");
      const data = notificationCollectionSchema.parse(await response.json());
      if (current()) setState({ kind: "ready", items: data.notifications });
    } catch {
      if (current()) setState((previous) => previous.kind === "ready" ? previous : { kind: "error" });
    }
  }, [authenticated, getAccessToken, locale, owner, ready]);

  useEffect(() => {
    if (!active) return;
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [active, load]);

  const post = useCallback(async (path: string) => {
    const token = await getAccessToken();
    if (!token) throw new Error("token");
    const response = await fetch(path, { method: "POST", headers: { authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error("response");
  }, [getAccessToken]);

  const markLocal = useCallback((ids: ReadonlySet<string> | null) => {
    const now = new Date().toISOString();
    setState((previous) => previous.kind !== "ready" ? previous : {
      kind: "ready",
      items: previous.items.map((item) => item.readAt || (ids && !ids.has(item.id)) ? item : { ...item, readAt: now }),
    });
  }, []);

  /** 읽음 낙관: 점을 바로 지우고 요청은 뒤에서 보낸다. 실패하면 토스트 한 줄, 이동은 그대로 한다. */
  const markRead = useCallback((items: readonly NotificationItem[]) => {
    const unread = items.filter((item) => !item.readAt);
    if (!unread.length) return;
    markLocal(new Set(unread.map((item) => item.id)));
    void Promise.all(unread.map((item) => post(`/api/notifications/${item.id}/read`))).catch(() => {
      showFanToast({ title: inboxCopy(locale).readFailed, tone: "error" });
    });
  }, [locale, markLocal, post]);

  const readAll = useCallback(async () => {
    if (readingAll) return;
    setReadingAll(true);
    const before = stateRef.current;
    markLocal(null);
    try {
      await post("/api/notifications/read-all");
    } catch {
      setState(before);
      showFanToast({ title: inboxCopy(locale).readFailed, tone: "error" });
    } finally {
      setReadingAll(false);
    }
  }, [locale, markLocal, post, readingAll]);

  const unread = state.kind === "ready" ? state.items.filter((item) => !item.readAt).length : 0;
  return { state, unread, reload: load, markRead, readAll, readingAll };
}
