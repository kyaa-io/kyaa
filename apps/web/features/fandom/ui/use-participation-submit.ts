"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useByUsSession } from "@/components/byus-session-provider";
import { notifyFanActivityUpdated } from "@/components/fan-ui/fan-activity-updates";
import { withRequestDeadline } from "@/features/reliability/client/request-deadline";
import { participationResultSchema, participationSubmitSchema, type ParticipationSubmit } from "@/server/live-participation/domain";

export function useParticipationSubmit(slug: string, missionId: string, onComplete: () => void) {
  const auth = usePrivy();
  const session = useByUsSession();
  const owner = auth.authenticated && auth.ready && session.ready ? session.ownerId ?? auth.user?.id : null;
  const key = owner ? `byus:live-participation:${owner}:${slug}:${missionId}` : null;
  const identity = `${key}:${session.generation}`;
  const [snapshot, setSnapshot] = useState<{ identity: string; pending: ParticipationSubmit | null; busy: boolean; error: string | null; saved: boolean }>();
  const controller = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const current = useRef<string | null>(identity);
  const complete = useRef(onComplete);
  useLayoutEffect(() => {
    current.current = identity;
    return () => { current.current = null; controller.current?.abort(); busy.current = false; };
  }, [identity]);
  useLayoutEffect(() => { complete.current = onComplete; }, [onComplete]);

  useEffect(() => {
    let pending: ParticipationSubmit | null = null;
    if (key) {
      try {
        const raw = sessionStorage.getItem(key);
        if (raw) {
          const value = participationSubmitSchema.parse(JSON.parse(raw));
          if (value.missionId === missionId) pending = value;
        }
      } catch { /* Invalid local drafts are never sent to the server. */ }
    }
    setSnapshot({ identity, pending, busy: false, error: pending ? "UNKNOWN" : null, saved: false });
    busy.current = false;
    return () => controller.current?.abort();
  }, [identity, key, missionId]);

  const state = snapshot?.identity === identity ? snapshot : { pending: null, busy: false, error: null, saved: false };
  async function submit(payload: ParticipationSubmit["payload"]) {
    if (!owner || !key || busy.current || current.current !== identity) return;
    let request: ParticipationSubmit;
    try {
      const existing = sessionStorage.getItem(key);
      request = existing ? participationSubmitSchema.parse(JSON.parse(existing))
        : participationSubmitSchema.parse({ missionId, requestKey: crypto.randomUUID(), payload });
      if (request.missionId !== missionId) throw new Error("Invalid draft");
      // Persist the full intent before sending; an unknown outcome must reuse it.
      sessionStorage.setItem(key, JSON.stringify(request));
    } catch {
      setSnapshot({ identity, pending: null, busy: false, error: "INVALID", saved: false });
      return;
    }
    busy.current = true;
    const activeController = new AbortController();
    controller.current = activeController;
    setSnapshot({ identity, pending: request, busy: true, error: null, saved: false });
    try {
      const { response, body } = await withRequestDeadline(async signal => {
        const token = await auth.getAccessToken();
        signal.throwIfAborted();
        if (current.current !== identity) throw new DOMException("Account changed", "AbortError");
        if (!token) throw new Error("Authentication unavailable");
        const response = await fetch(`/api/live-events/${encodeURIComponent(slug)}/participation`, {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(request), signal,
        });
        return { response, body: await response.json() };
      }, { signal: activeController.signal });
      if (current.current !== identity) return;
      if (!response.ok) {
        if (response.status < 500 && response.status !== 408) {
          sessionStorage.removeItem(key);
          setSnapshot({ identity, pending: null, busy: false, error: body.error?.code ?? "INVALID", saved: false });
          return;
        }
        throw new Error("Unknown outcome");
      }
      const result = participationResultSchema.parse(body);
      if (result.missionId !== missionId) throw new Error("Unexpected mission");
      sessionStorage.removeItem(key);
      setSnapshot({ identity, pending: null, busy: false, error: null, saved: true });
      notifyFanActivityUpdated(owner);
      complete.current();
    } catch {
      if (current.current === identity) setSnapshot({ identity, pending: request, busy: false, error: "UNKNOWN", saved: false });
    } finally {
      if (current.current === identity) busy.current = false;
    }
  }
  return { ...state, submit, retry: () => state.pending && submit(state.pending.payload) };
}
