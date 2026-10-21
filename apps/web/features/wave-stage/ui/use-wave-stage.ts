"use client";

import type { StageOperatorResult } from "../domain/stage-operator";
import { withRequestDeadline } from "@/features/reliability/client/request-deadline";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { waveStageDrawRequestSchema, waveStageResponseSchema, type WaveStage, type WaveStageDrawRequest } from "../domain/wave-stage";
import { parsePublicDashboard, type PublicDashboardData } from "@/features/public-live-dashboard/domain/public-live-dashboard";

const endpoint = "/api/admin/wave-stage";
export const stageAttemptPrefix = (owner: string) => `kyaa-wave-stage:${encodeURIComponent(owner)}:`;
export function clearStageAttempts(owner: string) {
  try { for (const key of Object.keys(sessionStorage)) if (key.startsWith(stageAttemptPrefix(owner))) sessionStorage.removeItem(key); } catch { /* Storage can be unavailable in private browsing. */ }
}
export function canDrawStage(stage: WaveStage | null, role: string) {
  return (role === "admin" || role === "editor") && !!stage && !stage.draw && !stage.drawConflict &&
    ["changha", "wena"].every(slug => stage.creators.some(creator => creator.slug === slug && creator.participantCount > 0));
}

export function useWaveStage(owner: string, getAccessToken: () => Promise<string | null>, keepActive = false) {
  const [stage, setStage] = useState<WaveStage | null>(null);
  const [metrics, setMetrics] = useState<PublicDashboardData | null>(null);
  const [failed, setFailed] = useState(false), [metricsFailed, setMetricsFailed] = useState(false);
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false);
  const [confirmationRevision, setConfirmationRevision] = useState(0);
  const [access, setAccess] = useState<"unauthenticated" | "denied" | null>(null);
  const [visible, setVisible] = useState(true);
  const active = useRef(true), pending = useRef(false), lastStage = useRef<WaveStage | null>(null);
  const tokenProvider = useRef(getAccessToken), reading = useRef<AbortController | null>(null), writing = useRef<AbortController | null>(null);
  const attempt = useRef<WaveStageDrawRequest | null>(null);
  const refreshMetrics = useRef<(() => Promise<void>) | null>(null);
  useLayoutEffect(() => { tokenProvider.current = getAccessToken; }, [getAccessToken]);
  const accept = useCallback((next: WaveStage) => {
    // A late pre-draw response must never make an already saved draw executable again.
    if (lastStage.current?.draw && !next.draw) return;
    lastStage.current = next; setStage(next); setFailed(false);
    if (next.draw) setUncertain(false);
  }, []);
  const checkAccess = useCallback((status: number) => {
    if (status !== 401 && status !== 403) return false;
    setAccess(status === 401 ? "unauthenticated" : "denied"); setStage(null); lastStage.current = null;
    clearStageAttempts(owner); return true;
  }, [owner]);
  const refresh = useCallback(async () => {
    if (!active.current || (!keepActive && document.visibilityState === "hidden") || pending.current || (reading.current && !reading.current.signal.aborted)) return null;
    const controller = new AbortController(); reading.current = controller;
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const token = await withRequestDeadline(() => tokenProvider.current(), { signal: controller.signal });
      if (!active.current || controller.signal.aborted) return null;
      if (!token) { checkAccess(401); return null; }
      const response = await fetch(endpoint, { cache: "no-store", headers: { authorization: `Bearer ${token}` }, signal: controller.signal });
      if (!active.current || controller.signal.aborted) return null;
      if (checkAccess(response.status)) return null;
      if (!response.ok) throw new Error("Stage unavailable");
      const next = waveStageResponseSchema.parse(await response.json()).stage;
      if (!active.current || controller.signal.aborted) return null;
      accept(next); return next;
    } catch { if (active.current && reading.current === controller && (keepActive || !document.hidden)) setFailed(true); return null; }
    finally { clearTimeout(timeout); if (reading.current === controller) reading.current = null; }
  }, [accept, checkAccess, keepActive]);

  useEffect(() => () => { writing.current?.abort(); }, []);
  useEffect(() => {
    active.current = true;
    if (access) { writing.current?.abort(); return; }
    let metricsController: AbortController | null = null;
    let metricsPending = false;
    const readMetrics = async () => {
      if (!active.current || (!keepActive && document.visibilityState === "hidden") || metricsPending) return;
      metricsPending = true; metricsController = new AbortController();
      const controller = metricsController, timeout = setTimeout(() => controller.abort(), 8_000);
      try {
        const response = await fetch("/api/public/live-dashboard", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Metrics unavailable");
        const next = parsePublicDashboard(await response.json());
        if (active.current && !controller.signal.aborted) {
          setMetrics(previous => next.onchain.state === "unavailable" && previous?.onchain.state === "available" ? { ...next, onchain: previous.onchain } : next);
          setMetricsFailed(next.onchain.state === "unavailable");
        }
      } catch { if (active.current && (keepActive || !document.hidden)) setMetricsFailed(true); }
      finally { clearTimeout(timeout); metricsPending = false; }
    };
    const visibility = () => {
      const shown = keepActive || document.visibilityState !== "hidden"; setVisible(shown);
      if (shown) { void refresh(); void readMetrics(); }
      else { reading.current?.abort(); metricsController?.abort(); }
    };
    refreshMetrics.current = readMetrics;
    visibility();
    const stageTimer = setInterval(() => { void refresh(); }, 1_000);
    const metricsTimer = setInterval(() => { void readMetrics(); }, 30_000);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      refreshMetrics.current = null;
      active.current = false; reading.current?.abort(); metricsController?.abort();
      clearInterval(stageTimer); clearInterval(metricsTimer); document.removeEventListener("visibilitychange", visibility);
    };
  }, [access, refresh, keepActive]);

  const draw = useCallback(async (role: string, requestId?: string): Promise<StageOperatorResult> => {
    const current = lastStage.current;
    if (!active.current || pending.current || !canDrawStage(current, role) || !current || access) return { status: "rejected" };
    pending.current = true; setBusy(true); setUncertain(false); reading.current?.abort();
    const controller = new AbortController(); writing.current = controller;
    const storageKey = `${stageAttemptPrefix(owner)}${current.eventKey}`;
    if (!attempt.current) {
      try {
        const saved: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
        // Persist only the request identity and campaign revisions, never people or results.
        const parsed = waveStageDrawRequestSchema.safeParse(saved);
        if (parsed.success) attempt.current = parsed.data;
      } catch { /* The in-memory attempt still protects retries when storage is blocked. */ }
      if (!attempt.current) {
        const changha = current.creators.find(c => c.slug === "changha")!, wena = current.creators.find(c => c.slug === "wena")!;
        attempt.current = { idempotencyKey: requestId ?? crypto.randomUUID(), expectedRevisions: { changha: changha.revision, wena: wena.revision } };
        try { sessionStorage.setItem(storageKey, JSON.stringify(attempt.current)); } catch { /* Keep the same request in memory. */ }
      }
    }
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let recover = false, submitted = false;
    try {
      const token = await withRequestDeadline(() => tokenProvider.current(), { signal: controller.signal });
      if (!active.current || controller.signal.aborted) return { status: "rejected" };
      if (!token) { checkAccess(401); return { status: "rejected" }; }
      submitted = true;
      const response = await fetch(`${endpoint}/draw`, { method: "POST", cache: "no-store", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(attempt.current), signal: controller.signal });
      if (!active.current) return { status: "uncertain" };
      if (checkAccess(response.status)) return { status: "rejected" };
      if (response.status === 409) {
        const rejection = await response.json().catch(() => null) as { error?: { code?: unknown } } | null;
        if (rejection?.error?.code === "FAN_WEB_CONFLICT" || rejection?.error?.code === "WAVE_STAGE_EMPTY_CAMPAIGN") {
          attempt.current = null;
          try { sessionStorage.removeItem(storageKey); } catch { /* The in-memory attempt has been cleared. */ }
          setUncertain(false); setFailed(true); setConfirmationRevision(value => value + 1); recover = true;
          return { status: "rejected" };
        }
      }
      if (!response.ok) throw new Error("Draw not confirmed");
      const next = waveStageResponseSchema.parse(await response.json()).stage;
      if (controller.signal.aborted) throw new Error("Draw timed out");
      accept(next);
      if (!next.draw) throw new Error("Draw not confirmed");
      return { status: "confirmed" };
    } catch { if (active.current) { setUncertain(submitted); setFailed(true); recover = submitted; } return { status: submitted ? "uncertain" : "rejected" }; }
    finally {
      clearTimeout(timeout); pending.current = false;
      if (active.current) { setBusy(false); if (recover) await refresh(); }
    }
  }, [access, owner, checkAccess, accept, refresh]);
  const cancelDraw = useCallback(() => writing.current?.abort(), []);
  const refreshAll = useCallback(async () => { await Promise.all([refresh(), refreshMetrics.current?.()]); }, [refresh]);
  return { stage, metrics, failed, metricsFailed, busy, uncertain, confirmationRevision, access, visible, refresh, refreshAll, draw, cancelDraw };
}
