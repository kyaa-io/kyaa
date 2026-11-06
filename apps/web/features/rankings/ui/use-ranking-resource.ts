"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { dropResource, peekResource, storeResource } from "@/components/fan-ui/resource-cache";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";

type State<T> = { status: "loading" } | { status: "ready"; data: T } | { status: "error" };

/** Rankings are public; a signed-in viewer also gets "my" values, so the token is attached when one exists. */
export function useRankingResource<T>(url: string, parse: (value: unknown) => T) {
  const { ready, authenticated, user, getAccessToken } = useByUsAuth();
  const owner = authenticated ? user?.id ?? "member" : "guest";
  const cacheKey = `ranking:${owner}:${url}`;
  const [settled, setSettled] = useState<{ key: string; state: State<T> }>();
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => { dropResource(cacheKey); setSettled(undefined); setAttempt((n) => n + 1); }, [cacheKey]);
  const storedValue = ready ? peekResource(cacheKey)?.value : undefined;
  const cached = useMemo<State<T> | undefined>(() => { if (storedValue === undefined) return undefined; try { return { status: "ready", data: parse(storedValue) }; } catch { return undefined; } }, [parse, storedValue]);

  useEffect(() => {
    if (!ready) return;
    if (peekResource(cacheKey)?.fresh) return;
    const controller = new AbortController();
    (async () => {
      try {
        const token = authenticated ? await getAccessToken() : null;
        const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : undefined, signal: controller.signal });
        if (!response.ok) throw new Error("rankings unavailable");
        const body: unknown = await response.json();
        const data = parse(body);
        storeResource(cacheKey, body);
        if (!controller.signal.aborted) setSettled({ key: cacheKey, state: { status: "ready", data } });
      } catch {
        if (!controller.signal.aborted) setSettled({ key: cacheKey, state: { status: "error" } });
      }
    })();
    return () => controller.abort();
    // parse is a module-level schema parser; the request is keyed by url and the sign-in state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ready, authenticated, attempt, cacheKey]);

  const state: State<T> = settled?.key === cacheKey ? settled.state : cached ?? { status: "loading" };
  return { state, retry };
}
