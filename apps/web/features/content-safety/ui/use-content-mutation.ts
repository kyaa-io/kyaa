"use client";
import { throwIfAborted } from "@/features/reliability/client/throw-if-aborted";
import { useEffect, useRef, useState } from "react";
import { useByUsAuth as usePrivy } from "@/features/auth/client/cognito-auth";
import { useByUsSession } from "@/components/byus-session-provider";
import { contentCopy } from "@/i18n/catalogs/features__fan_posts__ui";
import type { AppLocale } from "@/i18n/locales";

/** Why a mutation failed when the person can act on it: sign in again, or reconnect. */
export type MutationFailure = "auth" | "offline" | null;
const OFFLINE = "NETWORK_OFFLINE";
const AUTH_CODES = new Set(["AUTHENTICATION_REQUIRED", "UNAUTHENTICATED"]);

export function useContentMutation(locale: AppLocale) {
  const auth = usePrivy(), session = useByUsSession(), copy = contentCopy(locale);
  const key = `${auth.ready}:${auth.authenticated}:${session.ownerId ?? auth.user?.id}:${session.generation}`;
  const [state, setState] = useState<{ key: string; busy: boolean; error: string; failure: MutationFailure }>({ key, busy: false, error: "", failure: null });
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); pending.current = null; }, [key]);
  async function request(url: string, method: string, body?: unknown): Promise<unknown | null> {
    if (pending.current || !auth.ready || !auth.authenticated || !session.ready) return null;
    const controller = new AbortController(); pending.current = controller;
    setState({ key, busy: true, error: "", failure: null });
    try {
      const token = await auth.getAccessToken(); throwIfAborted(controller.signal);
      if (!token) throw new Error("AUTHENTICATION_REQUIRED");
      const multipart = body instanceof FormData;
      if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error(OFFLINE);
      const response = await fetch(url, { method, signal: controller.signal, cache: "no-store",
        headers: { Authorization: `Bearer ${token}`, ...(!multipart && body !== undefined ? { "content-type": "application/json" } : {}) },
        body: body === undefined ? undefined : multipart ? body : JSON.stringify(body) })
        .catch((error: unknown) => { throw controller.signal.aborted ? error : new Error(OFFLINE); });
      if (response.status === 401) throw new Error("UNAUTHENTICATED");
      const value = await response.json(); throwIfAborted(controller.signal);
      if (!response.ok) throw new Error(value.error?.code ?? "UNAVAILABLE");
      return value;
    } catch (error) {
      if (!controller.signal.aborted) {
        const code = error instanceof Error ? error.message : "";
        const failure: MutationFailure = AUTH_CODES.has(code) ? "auth" : code === OFFLINE ? "offline" : null;
        setState({ key, busy: false, failure, error: failure === "auth" ? copy.sessionExpired : failure === "offline" ? copy.offline
          : code === "TRANSLATION_RATE_LIMITED" ? copy.translationLimit
          : code.startsWith("TRANSLATION_") ? copy.translationFailed
          : code === "FAN_WEB_FORBIDDEN" ? copy.memberRequired : code === "FAN_WEB_NOT_FOUND" ? copy.unavailable : copy.failed });
      }
      return null;
    } finally {
      if (pending.current === controller) pending.current = null;
      if (!controller.signal.aborted) setState(previous => previous.key === key ? { ...previous, busy: false } : previous);
    }
  }
  return { request, busy: state.key === key && state.busy, error: state.key === key ? state.error : "", failure: state.key === key ? state.failure : null };
}
