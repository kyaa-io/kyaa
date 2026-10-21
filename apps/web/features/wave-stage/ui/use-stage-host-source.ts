"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { stageOperatorCommandSchema, stageOperatorStateSchema, type StageOperatorCommand, type StageOperatorResult, type StageOperatorState } from "../domain/stage-operator";
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

export function useStageHostSource({ endpoint, authorized, projection, onScope, onRefresh, operator, onOperator }: {
  endpoint: string | null; authorized: boolean; projection: StageHostProjection | null;
  operator?: StageOperatorState; onOperator?: (command: StageOperatorCommand, recovery?: boolean, retry?: boolean) => Promise<StageOperatorResult>;
  onScope: (scope: StageHostProjection["scope"]) => void; onRefresh: () => void;
}) {
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "disconnected">("idle");
  const socket = useRef<WebSocket | null>(null);
  const latest = useRef({ authorized, projection, onScope, onRefresh, operator, onOperator });
  useLayoutEffect(() => { latest.current = { authorized, projection, onScope, onRefresh, operator, onOperator }; });
  const seen = useRef(new Map<string, { body: string; result: Promise<StageOperatorResult> }>());
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
          const raw = JSON.parse(event.data);
          if (raw.type === 'operator-command' || raw.type === 'operator-reconcile' || raw.type === 'operator-retry') {
            const { type, ...input } = raw;
            const parsed = stageOperatorCommandSchema.safeParse(input);
            if (!parsed.success || !latest.current.onOperator) return;
            const command = parsed.data, body = JSON.stringify(command), previous = seen.current.get(command.commandId);
            const recovery = type === 'operator-reconcile', retry = type === 'operator-retry';
            const result = previous && previous.body !== body ? Promise.resolve({ status: 'rejected' as const }) :
              recovery ? latest.current.onOperator(command, true) : retry ? latest.current.onOperator(command, false, true) : previous?.result ?? latest.current.onOperator(command);
            if (!recovery && (!previous || retry)) seen.current.set(command.commandId, { body, result });
            void result.then(value => {
              if (socket.current === current && latest.current.authorized && current.readyState === WebSocket.OPEN)
                current.send(JSON.stringify({ type: 'operator-result', commandId: command.commandId, ...value, ...(recovery ? { recovery: true } : {}) }));
            }).catch(() => {
              if (socket.current === current && current.readyState === WebSocket.OPEN) current.send(JSON.stringify({ type: 'operator-result', commandId: command.commandId, status: 'uncertain' }));
            });
            return;
          }
          const command = stageHostSourceCommandSchema.safeParse(raw);
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
  useEffect(() => () => { const current = socket.current; socket.current = null; current?.close(); }, [endpoint]);
  useEffect(() => {
    if (status !== "connected" || !authorized) return;
    const send = () => {
      const current = socket.current, data = latest.current;
      if (current?.readyState === WebSocket.OPEN && data.authorized && data.projection) {
        try {
          current.send(JSON.stringify({ type: "projection", projection: data.projection }));
          if (data.operator) current.send(JSON.stringify({ type: 'operator-state', operator: stageOperatorStateSchema.parse(data.operator) }));
        }
        catch { disconnect(); }
      }
    };
    send(); const heartbeat = setInterval(send, 1000);
    return () => clearInterval(heartbeat);
  }, [status, authorized, projection, operator, disconnect]);
  return { available: endpoint !== null, connected: status === "connected", status, connect, disconnect };
}
