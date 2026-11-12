import "server-only";

/** 태스크 안에서 live-now 결과를 잠깐 나눠 쓴다. AWS에서는 `hostingCache`가 꺼져 있어 요청마다 외부 관측이 돌았다.
 * 같은 키의 동시 요청은 진행 중인 하나를 기다리고, 끝난 결과는 `ttlMs` 동안만 재사용한다. 실패는 보관하지 않는다.
 * 키는 (locale, v)뿐이라 개수가 작다. 비공개 필터처럼 요청마다 달라야 하는 값은 호출하는 쪽에서 다시 적용한다. */
export const LIVE_FEED_SHARE_TTL_MS = 15_000;

const IN_FLIGHT_LIMIT_MS = 30_000;

type Entry<T> = { promise: Promise<T>; expiresAt: number };

export function createSharedLiveFeed<T>(options: { ttlMs?: number; clock?: () => number } = {}) {
  const ttlMs = options.ttlMs ?? LIVE_FEED_SHARE_TTL_MS;
  const clock = options.clock ?? (() => Date.now());
  const entries = new Map<string, Entry<T>>();
  return function share(key: string, build: () => Promise<T>): Promise<T> {
    const existing = entries.get(key);
    if (existing && existing.expiresAt > clock()) return existing.promise;
    // 진행 중에는 한도(IN_FLIGHT_LIMIT_MS)까지만 기다리게 하고, 끝난 시각부터 ttl을 센다.
    const entry: Entry<T> = { promise: undefined as unknown as Promise<T>, expiresAt: clock() + IN_FLIGHT_LIMIT_MS };
    entry.promise = build().then(
      (value) => { entry.expiresAt = clock() + ttlMs; return value; },
      (error: unknown) => { if (entries.get(key) === entry) entries.delete(key); throw error; },
    );
    entries.set(key, entry);
    return entry.promise;
  };
}
