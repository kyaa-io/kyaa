"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { parseStageHostEndpoint, stageHostSourceCommandSchema, type StageHostProjection } from "../domain/stage-host-projection";

export function useStageHostEndpoint() {
  const [endpoint, setEndpoint] = useState<string | null>(null);
  useEffect(() => {
    if (!window.location.hash.startsWith("#stage-host=")) return;
    const next = parseStageHostEndpoint(window.location.hash);
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    setEndpoint(next);
  }, []);
  return endpoint;
}

export function useStageHostSource({ endpoint, authorized, projection, onScope, onRefresh }: {
  endpoint: string | null; authorized: boolean; projection: StageHostProjection | null;
  onScope: (scope: StageHostProjection["scope"]) => void; onRefresh: () => void;
}) {
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "disconnected">("idle");
  const socket = useRef<WebSocket | null>(null);
  const latest = useRef({ authorized, projection, onScope, onRefresh });
  useLayoutEffect(() => { latest.current = { authorized, projection, onScope, onRefresh }; });
  const disconnect = useCallback(() => {
    const current = socket.current; socket.current = null; current?.close();
    setStatus("disconnected");
  }, []);
  const connect = useCallback(() => {
    if (!endpoint || !latest.current.authorized || socket.current) return;
    try {
      const current = new WebSocket(endpoint); socket.current = current; setStatus("connecting");
      current.onopen = () => {
        if (socket.current !== current || !latest.current.authorized) { current.close(); return; }
        setStatus("connected");
      };
      current.onmessage = event => {
        if (socket.current !== current || !latest.current.authorized || typeof event.data !== "string" || event.data.length > 1024) return;
        try {
          const command = stageHostSourceCommandSchema.safeParse(JSON.parse(event.data));
          if (!command.success) return;
          if (command.data.action === "scope") latest.current.onScope(command.data.scope);
          else latest.current.onRefresh();
        } catch { /* Untrusted local messages never invoke an action. */ }
      };
      current.onclose = () => { if (socket.current === current) { socket.current = null; setStatus("disconnected"); } };
      current.onerror = () => { if (socket.current === current) disconnect(); };
    } catch { disconnect(); }
  }, [endpoint, disconnect]);
  useEffect(() => { if (!authorized) disconnect(); }, [authorized, disconnect]);
  useEffect(() => () => { const current = socket.current; socket.current = null; current?.close(); }, []);
  useEffect(() => {
    if (status !== "connected" || !authorized) return;
    const send = () => {
      const current = socket.current, data = latest.current;
      if (current?.readyState === WebSocket.OPEN && data.authorized && data.projection) {
        try { current.send(JSON.stringify({ type: "projection", projection: data.projection })); }
        catch { disconnect(); }
      }
    };
    send(); const heartbeat = setInterval(send, 1000);
    return () => clearInterval(heartbeat);
  }, [status, authorized, projection, disconnect]);
  return { available: endpoint !== null, connected: status === "connected", status, connect, disconnect };
}
