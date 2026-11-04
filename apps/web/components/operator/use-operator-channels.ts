"use client";

import { useByUsAuth as usePrivy } from "@/features/auth/client/cognito-auth";
import { useEffect, useState } from "react";
import { z } from "zod";

const channelSchema = z.object({ id: z.uuid(), slug: z.string(), status: z.enum(["draft", "published"]), nameKo: z.string(), nameEn: z.string() });
const payloadSchema = z.object({ kind: z.enum(["admin", "operator"]), role: z.string(), celebrities: z.array(channelSchema) });
export type OperatorChannel = z.infer<typeof channelSchema>;
export type OperatorChannelsState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "denied" }
  | { status: "authorized"; kind: "admin" | "operator"; role: string; channels: OperatorChannel[] };

export function useOperatorChannels(): OperatorChannelsState {
  const { ready, authenticated, getAccessToken, user } = usePrivy();
  const [owner, setOwner] = useState<string | null>(null);
  const [state, setState] = useState<OperatorChannelsState>({ status: "loading" });

  useEffect(() => {
    if (!ready) { setState({ status: "loading" }); return; }
    if (!authenticated) { setState({ status: "unauthenticated" }); return; }
    const controller = new AbortController();
    let active = true;
    void (async () => {
      try {
        const token = await getAccessToken();
        if (!token) { if (active) setState({ status: "unauthenticated" }); return; }
        const sync = await fetch("/api/auth/session", { method: "POST", headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal });
        if (!sync.ok) throw new Error("Session synchronization failed");
        const response = await fetch("/api/operator/channels", { method: "GET", headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal });
        if (!active) return;
        if (response.status === 401) { setState({ status: "unauthenticated" }); return; }
        if (response.status === 403) { setState({ status: "denied" }); return; }
        if (!response.ok) throw new Error("Operator channel lookup failed");
        const payload = payloadSchema.parse(await response.json());
        if (!active) return;
        setOwner(user?.id ?? null);
        setState({ status: "authorized", kind: payload.kind, role: payload.role, channels: payload.celebrities });
      } catch (error) {
        if (active && !(error instanceof DOMException && error.name === "AbortError")) setState({ status: "denied" });
      }
    })();
    return () => { active = false; controller.abort(); };
  }, [authenticated, getAccessToken, ready, user?.id]);

  if (!ready) return { status: "loading" };
  if (!authenticated) return { status: "unauthenticated" };
  return state.status === "authorized" && owner !== (user?.id ?? null) ? { status: "loading" } : state;
}
