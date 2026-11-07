// 클라이언트 읽기의 모듈 단위 저장소. 원본 JSON을 담고 해석은 부르는 쪽이 한다(같은 주소를 다른 스키마로 읽는 화면이 있다).
// 키에는 항상 소유자가 들어가고, 소유자가 바뀌면(로그인·로그아웃) 전부 지운다. 다른 회원의 값이 남지 않게 한다.
import { useState, useSyncExternalStore } from "react";

export const RESOURCE_FRESH_MS = 30_000;

type Entry = { value: unknown; storedAt: number };
const entries = new Map<string, Entry>();
type Flight = { promise: Promise<unknown>; controller: AbortController; waiters: number };
const inFlight = new Map<string, Flight>();
let currentOwner: string | null = null;

/** `/api/me/*`는 다른 경로의 지급·교환으로 바뀌므로 바로 보여 주되 다시 읽는다. 다만 첫 화면에서 같은 값을 여러 칸이 차례로 마운트하며
 * 읽는 일은 한 번으로 합치려고 짧은 시간만 새것으로 본다. 쓰기는 저장소를 비우므로 이 시간 안에도 바뀐 값은 다시 읽는다. */
export const ME_RESOURCE_FRESH_MS = 10_000;
const freshFor = (key: string) => key.includes("/api/me/") ? ME_RESOURCE_FRESH_MS : RESOURCE_FRESH_MS;

export function peekResource(key: string): (Entry & { fresh: boolean }) | undefined {
  const entry = entries.get(key);
  if (!entry) return undefined;
  return { ...entry, fresh: Date.now() - entry.storedAt < freshFor(key) };
}
/** 저장소가 비워진 횟수. 저장소 밖의 짧은 공유 읽기도 쓰기 뒤에는 다시 읽게 한다. */
export const resourceEpoch = () => epoch;
export function storeResource(key: string, value: unknown) { entries.set(key, { value, storedAt: Date.now() }); }
export function dropResource(key: string) { entries.delete(key); inFlight.delete(key); }

// 저장소가 비면 마운트된 훅이 다시 읽어야 한다. 판 번호는 바로 올리되 알림은 조금 늦춰,
// 쓰기 응답을 끝까지 받은 쪽의 `retry`가 만든 렌더와 한 번의 읽기로 합쳐지게 한다. 그 사이 마운트한 훅은 새 번호로 시작해 다시 읽지 않는다.
const NOTIFY_DELAY_MS = 50;
const listeners = new Set<() => void>();
let epoch = 0;
let notifyTimer: ReturnType<typeof setTimeout> | null = null;
function bumpEpoch() {
  epoch += 1;
  if (notifyTimer !== null) return;
  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    for (const listener of listeners) listener();
  }, NOTIFY_DELAY_MS);
}
export function clearResources() { entries.clear(); inFlight.clear(); bumpEpoch(); }
const subscribeEpoch = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
/** 저장소가 비워질 때마다 바뀌는 값. 읽기 effect의 의존값으로 쓴다. */
export const useResourceEpoch = () => useSyncExternalStore(subscribeEpoch, () => epoch, () => 0);

/** 저장소가 비어도 같은 범위(소유자와 주소를 담은 값)에서는 마지막 원본을 돌려준다. 범위가 바뀌면 곧바로 버린다. */
export function useRetainedResource(scope: string, value: unknown): unknown {
  const [held, setHeld] = useState<{ scope: string; value: unknown }>();
  if (value !== undefined) {
    if (held?.scope !== scope || held.value !== value) setHeld({ scope, value });
    return value;
  }
  return held?.scope === scope ? held.value : undefined;
}

// 서버 상태를 바꾸지 않는 POST(측정, 세션, 번역, 접속 표시)는 저장소를 비우지 않는다.
const NOT_A_WRITE = /^\/api\/(?:analytics|events|campaigns|auth|display-translations|content-translations)(?:\/|$)|\/presence$/;
export function isResourceWrite(method: string | undefined, pathname: string) {
  if (!method || ["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) return false;
  return !NOT_A_WRITE.test(pathname);
}

let watchedFetch: { wrapper: typeof fetch; original: typeof fetch } | null = null;
/** `useGroupRequest` 밖의 쓰기(차단, 하트, 응모 등)도 저장소를 비우게 한다. 호출부가 많아 fetch를 감싼다. */
export function installResourceWriteWatch() {
  if (typeof window === "undefined" || (watchedFetch && window.fetch === watchedFetch.wrapper)) return () => {};
  const original = window.fetch;
  const wrapper: typeof fetch = (input, init) => {
    const result = original.call(window, input, init);
    // 해석되지 않는 주소는 원래 fetch가 거절한다. 여기서 던지면 호출자의 catch를 건너뛴다.
    let url: URL;
    try { url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.href); }
    catch { return result; }
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/") || !isResourceWrite(method, url.pathname)) return result;
    return result.then((response) => { if (response.ok) clearResources(); return response; });
  };
  window.fetch = wrapper;
  watchedFetch = { wrapper, original };
  return () => {
    if (window.fetch === wrapper) window.fetch = original;
    if (watchedFetch?.wrapper === wrapper) watchedFetch = null;
  };
}

/** 같은 키의 진행 중 읽기에 합류한다. 성공한 값만 저장한다. 기다리던 쪽이 모두 떠나면(화면 이동, 소유자 변경) 요청을 중단한다. */
export function shareResourceRead<T>(key: string, load: (signal: AbortSignal) => Promise<T>, waiter?: AbortSignal): Promise<T> {
  let flight = inFlight.get(key) as Flight | undefined;
  if (!flight) {
    const controller = new AbortController();
    const created: Flight = { controller, waiters: 0, promise: undefined as unknown as Promise<unknown> };
    created.promise = load(controller.signal)
      .then((value) => { if (inFlight.get(key) === created) storeResource(key, value); return value; })
      .finally(() => { if (inFlight.get(key) === created) inFlight.delete(key); });
    created.promise.catch(() => {});
    inFlight.set(key, created);
    flight = created;
  }
  const joined = flight;
  joined.waiters += 1;
  waiter?.addEventListener("abort", () => {
    joined.waiters -= 1;
    if (joined.waiters > 0) return;
    joined.controller.abort();
    if (inFlight.get(key) === joined) inFlight.delete(key);
  }, { once: true });
  return joined.promise as Promise<T>;
}

export function syncResourceOwner(owner: string) {
  if (currentOwner !== null && currentOwner !== owner) clearResources();
  currentOwner = owner;
}
