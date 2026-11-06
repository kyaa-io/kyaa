// 클라이언트 읽기의 모듈 단위 저장소. 원본 JSON을 담고 해석은 부르는 쪽이 한다(같은 주소를 다른 스키마로 읽는 화면이 있다).
// 키에는 항상 소유자가 들어가고, 소유자가 바뀌면(로그인·로그아웃) 전부 지운다. 다른 회원의 값이 남지 않게 한다.
export const RESOURCE_FRESH_MS = 30_000;

type Entry = { value: unknown; storedAt: number };
const entries = new Map<string, Entry>();
type Flight = { promise: Promise<unknown>; controller: AbortController; waiters: number };
const inFlight = new Map<string, Flight>();
let currentOwner: string | null = null;

/** `/api/me/*`는 다른 경로의 지급·교환으로 바뀌므로 바로 보여 주되 항상 뒤에서 다시 읽는다. */
const alwaysRevalidate = (key: string) => key.includes("/api/me/");

export function peekResource(key: string): (Entry & { fresh: boolean }) | undefined {
  const entry = entries.get(key);
  if (!entry) return undefined;
  return { ...entry, fresh: !alwaysRevalidate(key) && Date.now() - entry.storedAt < RESOURCE_FRESH_MS };
}
export function storeResource(key: string, value: unknown) { entries.set(key, { value, storedAt: Date.now() }); }
export function dropResource(key: string) { entries.delete(key); inFlight.delete(key); }
export function clearResources() { entries.clear(); inFlight.clear(); }

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
