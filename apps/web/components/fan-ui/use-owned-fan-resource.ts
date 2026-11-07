"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useByUsSession } from "@/components/byus-session-provider";
import { withRequestDeadline } from "@/features/reliability/client/request-deadline";
import { subscribeFanActivityUpdates } from "./fan-activity-updates";
import { resourceEpoch } from "./resource-cache";

type ResourceState<T> = { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; kind: "auth" | "missing" | "network" };
type OwnerAuth = {
  ready: boolean;
  authenticated: boolean;
  user?: { id: string } | null;
  getAccessToken: () => Promise<string | null>;
};

type SharedRead = { ok: boolean; status: number; body: unknown };
type SharedEntry = { promise: Promise<SharedRead>; controller: AbortController; refs: number; settled: boolean; settledAt?: number; epoch: number };
/** A successful answer stays joinable this long, so panels that mount one after another while the first screen loads read it once. */
export const OWNED_READ_REUSE_MS = 10_000;
// Requests in flight are shared; a successful answer is kept for OWNED_READ_REUSE_MS and dropped at once by any write (the resource epoch).
const inFlightReads = new Map<string, SharedEntry>();
const reusable = (entry: SharedEntry) => !entry.settled || (entry.settledAt !== undefined && Date.now() - entry.settledAt < OWNED_READ_REUSE_MS && entry.epoch === resourceEpoch());

/**
 * Join an identical read (same token, owner, session generation and URL) that is in flight or answered moments ago,
 * or start one. The shared request has its own AbortController: a caller leaving only stops its own wait, and the
 * request is aborted only when every caller has left. `fresh` never joins, so reads that must observe a newer server
 * state (activity updates, retries) cannot be answered by a request that began earlier.
 */
function readShared(scope: string, url: string, token: string, signal: AbortSignal, fresh: boolean): Promise<SharedRead> {
  const key = `${scope}\n${token}\n${url}`;
  const existing = inFlightReads.get(key);
  if (existing && !reusable(existing)) inFlightReads.delete(key);
  let entry = fresh || !existing || !reusable(existing) ? undefined : existing;
  if (!entry) {
    const controller = new AbortController();
    const created: SharedEntry = { controller, refs: 0, settled: false, epoch: resourceEpoch(), promise: undefined as unknown as Promise<SharedRead> };
    created.promise = fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal })
      .then(async (response): Promise<SharedRead> => ({
        ok: response.ok, status: response.status, body: response.ok ? await response.json() : undefined,
      }))
      .then((value) => {
        created.settled = true;
        // Only a successful answer read under the current store is kept; anything else is read again by the next caller.
        if (value.ok && created.epoch === resourceEpoch()) created.settledAt = Date.now();
        else if (inFlightReads.get(key) === created) inFlightReads.delete(key);
        return value;
      }, (error: unknown) => {
        created.settled = true;
        if (inFlightReads.get(key) === created) inFlightReads.delete(key);
        throw error;
      });
    created.promise.catch(() => {});
    inFlightReads.set(key, created);
    entry = created;
  }
  const joined = entry;
  joined.refs += 1;
  return new Promise<SharedRead>((resolve, reject) => {
    let released = false;
    const release = () => {
      if (released) return false;
      released = true;
      joined.refs -= 1;
      return true;
    };
    const onAbort = () => {
      if (release() && joined.refs <= 0 && !joined.settled) {
        joined.controller.abort();
        if (inFlightReads.get(key) === joined) inFlightReads.delete(key);
      }
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (signal.aborted) { onAbort(); return; }
    signal.addEventListener("abort", onAbort, { once: true });
    joined.promise.then(
      (value) => { signal.removeEventListener("abort", onAbort); release(); resolve(structuredClone(value)); },
      (error) => { signal.removeEventListener("abort", onAbort); release(); reject(error); },
    );
  });
}

/** Keep owned views fresh without blanking the page during background reads. */
export function useOwnedFanResource<T>(
  url: string | null,
  parse: (value: unknown) => T,
  auth: OwnerAuth,
  shouldPoll?: (data: T) => boolean,
) {
  const { ready, authenticated, getAccessToken } = auth;
  const session = useByUsSession();
  const sessionReady = ready && session.ready;
  const ownerId = session.ownerId ?? auth.user?.id;
  const key = `${sessionReady}:${authenticated}:${ownerId ?? ""}:${session.generation}:${url ?? ""}`;
  const [snapshot, setSnapshot] = useState<{ key: string; state: ResourceState<T>; refreshFailed: boolean }>();
  const refreshRef = useRef<() => void>(() => {});
  const replaceRef = useRef<(data: T) => void>(() => {});
  const retry = useCallback(() => refreshRef.current(), []);
  const replaceData = useCallback((data: T) => replaceRef.current(data), []);

  useEffect(() => {
    if (!sessionReady || !authenticated || !url) return;
    let active = true;
    let inFlight = false;
    let requestedAgain = false;
    let data: T | undefined;
    let dataVersion = 0;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    const publish = (state: ResourceState<T>, refreshFailed = false) => {
      if (active) setSnapshot({ key, state, refreshFailed });
    };
    const load = async (fresh = false) => {
      if (!active) return;
      if (inFlight) { requestedAgain = true; return; }
      clearTimeout(timer);
      inFlight = true;
      const versionAtStart = dataVersion;
      controller = new AbortController();
      if (data === undefined) publish({ status: "loading" });
      try {
        await withRequestDeadline(async (signal) => {
          const token = await getAccessToken();
          if (!active || signal.aborted || versionAtStart !== dataVersion) return;
          if (!token) { data = undefined; publish({ status: "error", kind: "auth" }); return; }
          const response = await readShared(`${ownerId ?? ""}:${session.generation}`, url, token, signal, fresh);
          if (!active || signal.aborted || versionAtStart !== dataVersion) return;
          if (response.status === 401 || response.status === 403 || response.status === 404) {
            data = undefined;
            publish({ status: "error", kind: response.status === 404 ? "missing" : "auth" });
            return;
          }
          if (!response.ok) throw new Error("Owned resource unavailable");
          const next = parse(response.body);
          if (!active || signal.aborted || versionAtStart !== dataVersion) return;
          data = next;
          failures = 0;
          publish({ status: "ready", data: next });
        }, { signal: controller.signal });
      } catch {
        if (!active || versionAtStart !== dataVersion) return;
        failures += 1;
        publish(data === undefined ? { status: "error", kind: "network" } : { status: "ready", data }, data !== undefined);
      } finally {
        inFlight = false;
        if (active && requestedAgain) {
          requestedAgain = false;
          void load(true);
        } else if (active && data !== undefined && (failures > 0 || shouldPoll?.(data))) {
          timer = setTimeout(() => {
            // Polls and failure retries must see a newer server state, so they never reuse a recent answer.
            if (document.visibilityState !== "hidden") void load(true);
          }, Math.min(5_000 * 2 ** Math.min(failures, 3), 30_000));
        }
      }
    };
    const refresh = () => { void load(true); };
    refreshRef.current = refresh;
    // A validated mutation response is authoritative over reads started before it.
    replaceRef.current = (next) => {
      dataVersion += 1;
      data = next;
      failures = 0;
      publish({ status: "ready", data: next });
    };
    const unsubscribe = subscribeFanActivityUpdates(ownerId, refresh);
    void load();
    return () => {
      active = false;
      controller?.abort();
      clearTimeout(timer);
      unsubscribe();
      refreshRef.current = () => {};
      replaceRef.current = () => {};
    };
  }, [authenticated, getAccessToken, key, ownerId, parse, sessionReady, shouldPoll, url]);

  const state: ResourceState<T> = !sessionReady ? { status: "loading" }
    : !authenticated ? { status: "error", kind: "auth" }
    : !url ? { status: "error", kind: "missing" }
    : snapshot?.key === key ? snapshot.state : { status: "loading" };
  return { state, retry, replaceData, refreshFailed: snapshot?.key === key && snapshot.refreshFailed };
}
