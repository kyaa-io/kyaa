"use client";
import { throwIfAborted } from "@/features/reliability/client/throw-if-aborted";
import { useByUsAuth as usePrivy } from "@/features/auth/client/cognito-auth";
import { useByUsSession } from "@/components/byus-session-provider";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { dropResource, peekResource, shareResourceRead, syncResourceOwner, useResourceEpoch, useRetainedResource } from "@/components/fan-ui/resource-cache";
import { withRequestDeadline } from "@/features/reliability/client/request-deadline";

class FanpageReadFailure extends Error { constructor(readonly status: number, readonly body: { error?: { code?: string }; membershipCount?: number; fanCount?: number }) { super("FANPAGE_READ_FAILED"); } }
type State<T> = { status: "loading" } | { status: "ready"; data: T } | { status: "error"; code: string; membershipCount?: number; fanCount?: number };
/** Public reads may include owner context; a changed owner never sees an old snapshot.
 * `anonymous` starts at once without a token. A caller whose answer changes for a signed-in viewer (blocks) must pass url=null while the viewer may be signed in; see `mayHaveSession`.
 * `keepAcrossUrls` (paged or tabbed lists): while the next page, tab or filter loads, the same viewer keeps seeing the
 * previous list in place (`pending` is true) so the list never collapses; it is then replaced in one step. */
export function useFanpageResource<T>(url: string | null, parse: (value: unknown) => T, keepPreviousData = false, anonymous = false, keepAcrossUrls = false) {
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
  const identityKey = anonymous ? "anonymous" : `${sessionReady}:${requestAuthenticated}:${ownerId ?? "guest"}:${session.generation}`;
  useEffect(() => { if (canRead && !anonymous) syncResourceOwner(ownerScope); }, [anonymous, canRead, ownerScope]);
  const key = `${ownerKey}:${revision}`;
  const [snapshot, setSnapshot] = useState<{ key: string; ownerKey: string; identityKey?: string; state: State<T>; refreshFailed?: boolean }>();
  const epoch = useResourceEpoch(cacheKey);
  const handled = useRef({ key, epoch });
  const shown = useRef<State<T> | undefined>(undefined);
  const storedValue = useRetainedResource(key, canRead && url ? peekResource(cacheKey)?.value : undefined);
  const cached = useMemo<State<T> | undefined>(() => { if (storedValue === undefined) return undefined; try { return { status: "ready", data: parse(storedValue) }; } catch { return undefined; } }, [parse, storedValue]);
  useEffect(() => {
    if (!url || !canRead) return;
    const last = handled.current;
    handled.current = { key, epoch };
    if (peekResource(cacheKey)?.fresh) return;
    // A re-read caused only by a write elsewhere keeps the value on screen if it fails.
    const behind = last.key === key && last.epoch !== epoch;
    const keptValue = () => { const value = behind ? shown.current : undefined; return value?.status === "ready" ? value : undefined; };
    const controller = new AbortController();
    void (async () => {
      try {
        const body = await shareResourceRead(cacheKey, (flight) => withRequestDeadline(async (signal) => {
          const token = requestAuthenticated ? await tokenProvider.current() : null;
          throwIfAborted(signal);
          if (requestAuthenticated && !token) throw new Error("AUTHENTICATION_REQUIRED");
          const response = await fetch(url, { cache: "no-store", signal, headers: token ? { Authorization: `Bearer ${token}` } : undefined });
          const value: unknown = await response.json();
          if (!response.ok) throw new FanpageReadFailure(response.status, value as FanpageReadFailure["body"]);
          return value;
        }, { signal: flight }), controller.signal);
        if (controller.signal.aborted) return;
        const data = parse(body);
        setSnapshot({ key, ownerKey, identityKey, state: { status: "ready", data } });
      } catch (failure) {
        if (controller.signal.aborted) return;
        dropResource(cacheKey);
        const kept = keptValue();
        if (kept) { setSnapshot({ key, ownerKey, state: kept }); return; }
        if (failure instanceof FanpageReadFailure) {
          const { status, body } = failure;
          setSnapshot(previous => keepPreviousData && status >= 500 && previous?.ownerKey === ownerKey && previous.state.status === "ready"
            ? { ...previous, key, refreshFailed: true }
            : { key, ownerKey, state: { status: "error", code: body.error?.code ?? "UNAVAILABLE", membershipCount: body.membershipCount, ...(body.fanCount === undefined ? {} : { fanCount: body.fanCount }) } });
          return;
        }
        setSnapshot(previous => keepPreviousData && previous?.ownerKey === ownerKey && previous.state.status === "ready"
          ? { ...previous, key, refreshFailed: true }
          : { key, ownerKey, state: { status: "error", code: "UNAVAILABLE" } });
      }
    })();
    return () => controller.abort();
  }, [url, key, ownerKey, identityKey, cacheKey, canRead, requestAuthenticated, parse, keepPreviousData, epoch]);
  const hasCurrentData = canRead && (snapshot?.key === key || (keepPreviousData && snapshot?.ownerKey === ownerKey && snapshot.state.status === "ready"));
  const heldAcrossUrl = canRead && !hasCurrentData && !cached && keepAcrossUrls && Boolean(url) && snapshot?.identityKey === identityKey && snapshot.state.status === "ready";
  const state: State<T> = !canRead && authenticated && session.error ? { status: "error", code: session.error }
    : hasCurrentData ? snapshot!.state : cached ?? (heldAcrossUrl ? snapshot!.state : { status: "loading" });
  useLayoutEffect(() => { shown.current = state; });
  return { state, pending: heldAcrossUrl, refreshFailed: canRead && snapshot?.ownerKey === ownerKey && snapshot.refreshFailed, invalidate: () => { dropResource(cacheKey); setSnapshot(undefined); setRevision(value => value + 1); }, retry: () => {
    dropResource(cacheKey);
    if (authenticated && !session.ready && session.error) void session.retryTransition();
    setRevision((value) => value + 1);
  } };
}
