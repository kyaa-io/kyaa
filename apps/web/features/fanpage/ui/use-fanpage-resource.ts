"use client";
import { throwIfAborted } from "@/features/reliability/client/throw-if-aborted";
import { useByUsAuth as usePrivy } from "@/features/auth/client/cognito-auth";
import { useByUsSession } from "@/components/byus-session-provider";
import { useEffect, useMemo, useRef, useState } from "react";
import { dropResource, peekResource, storeResource, syncResourceOwner } from "@/components/fan-ui/resource-cache";
import { withRequestDeadline } from "@/features/reliability/client/request-deadline";

type State<T> = { status: "loading" } | { status: "ready"; data: T } | { status: "error"; code: string; membershipCount?: number; fanCount?: number };
/** Public reads may include owner context; a changed owner never sees an old snapshot.
 * `anonymous` is for reads whose answer does not depend on the viewer: they start at once instead of waiting for the sign-in session. */
export function useFanpageResource<T>(url: string | null, parse: (value: unknown) => T, keepPreviousData = false, anonymous = false) {
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const tokenProvider = useRef(getAccessToken);
  useEffect(() => { tokenProvider.current = getAccessToken; }, [getAccessToken]);
  const session = useByUsSession();
  const sessionReady = ready && session.ready;
  const canRead = anonymous || (ready && (!authenticated || session.ready));
  const requestAuthenticated = !anonymous && sessionReady && authenticated;
  const ownerId = requestAuthenticated ? session.ownerId ?? user?.id ?? null : null;
  const [revision, setRevision] = useState(0);
  const ownerKey = anonymous ? `${url}:anonymous` : `${url}:${sessionReady}:${requestAuthenticated}:${ownerId ?? "guest"}:${session.generation}`;
  const cacheKey = anonymous ? `anonymous:${url}` : `${ownerId ?? "guest"}:${session.generation}:${url}`;
  const ownerScope = `${ownerId ?? "guest"}:${session.generation}`;
  useEffect(() => { if (canRead && !anonymous) syncResourceOwner(ownerScope); }, [anonymous, canRead, ownerScope]);
  const key = `${ownerKey}:${revision}`;
  const [snapshot, setSnapshot] = useState<{ key: string; ownerKey: string; state: State<T>; refreshFailed?: boolean }>();
  const storedValue = canRead && url ? peekResource(cacheKey)?.value : undefined;
  const cached = useMemo<State<T> | undefined>(() => { if (storedValue === undefined) return undefined; try { return { status: "ready", data: parse(storedValue) }; } catch { return undefined; } }, [parse, storedValue]);
  useEffect(() => {
    if (!url || !canRead) return;
    if (peekResource(cacheKey)?.fresh) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const { response, body } = await withRequestDeadline(async (signal) => {
          const token = requestAuthenticated ? await tokenProvider.current() : null;
          throwIfAborted(signal);
          if (requestAuthenticated && !token) throw new Error("AUTHENTICATION_REQUIRED");
          const response = await fetch(url, { cache: "no-store", signal, headers: token ? { Authorization: `Bearer ${token}` } : undefined });
          return { response, body: await response.json() };
        }, { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (!response.ok) {
          setSnapshot(previous => keepPreviousData && response.status >= 500 && previous?.ownerKey === ownerKey && previous.state.status === "ready"
            ? { ...previous, key, refreshFailed: true }
            : { key, ownerKey, state: { status: "error", code: body.error?.code ?? "UNAVAILABLE", membershipCount: body.membershipCount, ...(body.fanCount === undefined ? {} : { fanCount: body.fanCount }) } });
          return;
        }
        const data = parse(body);
        storeResource(cacheKey, body);
        setSnapshot({ key, ownerKey, state: { status: "ready", data } });
      } catch {
        if (!controller.signal.aborted) setSnapshot(previous => keepPreviousData && previous?.ownerKey === ownerKey && previous.state.status === "ready"
          ? { ...previous, key, refreshFailed: true }
          : { key, ownerKey, state: { status: "error", code: "UNAVAILABLE" } });
      }
    })();
    return () => controller.abort();
  }, [url, key, ownerKey, cacheKey, canRead, requestAuthenticated, parse, keepPreviousData]);
  const hasCurrentData = canRead && (snapshot?.key === key || (keepPreviousData && snapshot?.ownerKey === ownerKey && snapshot.state.status === "ready"));
  const state: State<T> = !canRead && authenticated && session.error ? { status: "error", code: session.error }
    : hasCurrentData ? snapshot!.state : cached ?? { status: "loading" };
  return { state, refreshFailed: canRead && snapshot?.ownerKey === ownerKey && snapshot.refreshFailed, invalidate: () => { dropResource(cacheKey); setSnapshot(undefined); setRevision(value => value + 1); }, retry: () => {
    dropResource(cacheKey);
    if (authenticated && !session.ready && session.error) void session.retryTransition();
    setRevision((value) => value + 1);
  } };
}
