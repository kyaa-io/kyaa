"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { dropResource, peekResource, shareResourceRead, useResourceEpoch, useRetainedResource } from "@/components/fan-ui/resource-cache";
import { usePublicReadAuth } from "@/features/auth/client/public-read-auth";

type State<T> = { status: "loading" } | { status: "ready"; data: T } | { status: "error" };

/** Rankings are public; a signed-in viewer also gets "my" values, so the token is attached when one exists. */
export function useRankingResource<T>(url: string, parse: (value: unknown) => T) {
  const { ready, authenticated, user, getAccessToken } = usePublicReadAuth();
  const owner = authenticated ? user?.id ?? "member" : "guest";
  const cacheKey = `ranking:${owner}:${url}`;
  const [settled, setSettled] = useState<{ key: string; state: State<T> }>();
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => { dropResource(cacheKey); setSettled(undefined); setAttempt((n) => n + 1); }, [cacheKey]);
  // A quiet re-read (home ranking, back on the tab after a while): the rows stay on screen while it runs and if it fails.
  const quiet = useRef(false);
  const refresh = useCallback(() => { quiet.current = true; dropResource(cacheKey); setAttempt((n) => n + 1); }, [cacheKey]);
  const epoch = useResourceEpoch(cacheKey);
  const handled = useRef({ cacheKey, attempt, epoch });
  const shown = useRef<State<T> | undefined>(undefined);
  const storedValue = useRetainedResource(cacheKey, ready ? peekResource(cacheKey)?.value : undefined);
  const cached = useMemo<State<T> | undefined>(() => { if (storedValue === undefined) return undefined; try { return { status: "ready", data: parse(storedValue) }; } catch { return undefined; } }, [parse, storedValue]);

  useEffect(() => {
    if (!ready) return;
    const last = handled.current;
    handled.current = { cacheKey, attempt, epoch };
    if (peekResource(cacheKey)?.fresh) return;
    // A re-read caused only by a write elsewhere keeps the value on screen if it fails.
    const behind = (last.cacheKey === cacheKey && last.attempt === attempt && last.epoch !== epoch) || quiet.current;
    // A quiet re-read skips the browser's copy: a signed-out answer may be kept a minute, and the same answer would read as an old snapshot again.
    const revalidate = quiet.current;
    quiet.current = false;
    const controller = new AbortController();
    (async () => {
      try {
        const body = await shareResourceRead(cacheKey, async (signal) => {
          // A token that does not come in time reads the public rows; the member re-read follows when sign-in settles.
          const token = authenticated ? await getAccessToken().catch(() => null) : null;
          const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : undefined, signal, ...(revalidate ? { cache: "no-cache" as const } : {}) });
          if (!response.ok) throw new Error("rankings unavailable");
          return (await response.json()) as unknown;
        }, controller.signal);
        const data = parse(body);
        if (!controller.signal.aborted) setSettled({ key: cacheKey, state: { status: "ready", data } });
      } catch {
        if (controller.signal.aborted) return;
        dropResource(cacheKey);
        const kept = behind ? shown.current : undefined;
        setSettled({ key: cacheKey, state: kept?.status === "ready" ? kept : { status: "error" } });
      }
    })();
    return () => controller.abort();
    // parse is a module-level schema parser; the request is keyed by url and the sign-in state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ready, authenticated, attempt, cacheKey, epoch]);

  // The guest rows read during a stalled sign-in stay on screen while the member re-read of the same url runs.
  const own = settled?.key === cacheKey ? settled.state : cached;
  const [lastReady, setLastReady] = useState<{ url: string; state: State<T> }>();
  if (own?.status === "ready" && (lastReady?.url !== url || lastReady.state !== own)) setLastReady({ url, state: own });
  const state: State<T> = own ?? (lastReady?.url === url ? lastReady.state : undefined) ?? { status: "loading" };
  useLayoutEffect(() => { shown.current = state; });
  return { state, retry, refresh };
}
