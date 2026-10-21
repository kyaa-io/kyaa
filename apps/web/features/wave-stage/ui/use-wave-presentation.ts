"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { waveStagePresentationResponseSchema, type WaveStagePresentationResponse, type WaveStagePresentationScope } from "../domain/presentation";
import { waveStageTikTokResponseSchema, type WaveStageTikTokResponse } from "../domain/tiktok-metrics";

export function useWavePresentation(getAccessToken: () => Promise<string | null>) {
  const [scope, setScope] = useState<WaveStagePresentationScope>("all");
  const [presentation, setPresentation] = useState<WaveStagePresentationResponse | null>(null);
  const [tiktok, setTikTok] = useState<WaveStageTikTokResponse | null>(null);
  const [presentationFailed, setPresentationFailed] = useState(false), [tiktokFailed, setTikTokFailed] = useState(false);
  const [presentationAccess, setAccess] = useState<"unauthenticated" | "denied" | null>(null);
  const [revision, setRevision] = useState(0);
  const tokenProvider = useRef(getAccessToken);
  useLayoutEffect(() => { tokenProvider.current = getAccessToken; }, [getAccessToken]);
  const refreshPresentation = useCallback(() => setRevision(value => value + 1), []);

  useEffect(() => {
    if (presentationAccess) return;
    let closed = false;
    const controllers = new Map<string, AbortController>();
    const read = async (source: "presentation" | "tiktok") => {
      if (closed || document.hidden || (controllers.has(source) && !controllers.get(source)!.signal.aborted)) return;
      const controller = new AbortController(); controllers.set(source, controller);
      const timeout = setTimeout(() => controller.abort(), 8_000);
      try {
        const token = await tokenProvider.current();
        if (closed || controller.signal.aborted) return;
        const response = token ? await fetch(`/api/admin/wave-stage/${source}${source === "presentation" ? `?scope=${scope}` : ""}`, {
          cache: "no-store", headers: { authorization: `Bearer ${token}` }, signal: controller.signal,
        }) : new Response(null, { status: 401 });
        if (closed || controller.signal.aborted) return;
        if (response.status === 401 || response.status === 403) {
          closed = true; for (const pending of controllers.values()) pending.abort();
          setPresentation(null); setTikTok(null); setAccess(response.status === 401 ? "unauthenticated" : "denied"); return;
        }
        if (!response.ok) throw new Error("Presentation unavailable");
        const body: unknown = await response.json();
        if (closed || controller.signal.aborted) return;
        if (source === "presentation") {
          const next = waveStagePresentationResponseSchema.parse(body);
          if (next.scope !== scope) throw new Error("Scope mismatch");
          setPresentation(next); setPresentationFailed(false);
        } else { setTikTok(waveStageTikTokResponseSchema.parse(body)); setTikTokFailed(false); }
      } catch {
        if (!closed && !document.hidden && controllers.get(source) === controller) {
          if (source === "presentation") setPresentationFailed(true); else setTikTokFailed(true);
        }
      } finally { clearTimeout(timeout); if (controllers.get(source) === controller) controllers.delete(source); }
    };
    const refresh = () => {
      if (document.hidden) { for (const controller of controllers.values()) controller.abort(); }
      else { void read("presentation"); void read("tiktok"); }
    };
    refresh();
    const dataTimer = setInterval(() => void read("presentation"), 1_000);
    const liveTimer = setInterval(() => void read("tiktok"), 15_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { closed = true; for (const controller of controllers.values()) controller.abort(); clearInterval(dataTimer); clearInterval(liveTimer); document.removeEventListener("visibilitychange", refresh); };
  }, [scope, revision, presentationAccess]);

  return { scope, setScope, presentation: presentation?.scope === scope ? presentation : null, tiktok, presentationFailed, tiktokFailed, presentationAccess, refreshPresentation };
}
