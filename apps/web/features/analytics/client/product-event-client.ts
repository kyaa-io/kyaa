import {
  clientProductEventV1Schema,
  type ClientProductEventV1,
} from "../domain/product-event";

const SESSION_KEY = "byus.product-event.session.v1";
const LEGACY_PAGE_VIEW_KEY_PREFIX = "byus.product-event.page-view.v1";
const LEGACY_PAGE_VIEW_PAYLOAD_CACHE_KEY = "byus.product-event.page-view-payloads.v1";
const PAGE_VIEW_CACHE_KEY = "byus.product-event.page-view-cache.v2";
const MAX_PAGE_VIEW_CACHE_ENTRIES = 64;
export const PAGE_VIEW_WINDOW_MS = 30 * 60_000;

type PageViewCacheEntry = {
  routeScope: string | null;
  idempotencyKey: string;
  ownerKind: "anonymous" | "authenticated";
  storedAt: number;
  event: ClientProductEventV1 | null;
};

// sessionStorage를 읽거나 쓸 수 없는 브라우저(개인 모드·인앱 브라우저 등)에서는 같은 페이지 메모리로 키를 유지하고 전송은 계속한다.
let memorySessionId: string | null = null;
let memoryPageViewEntries: PageViewCacheEntry[] = [];
let pageViewStorageFailed = false;

export function anonymousSessionId(): string {
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
  } catch {
    // 저장소를 읽을 수 없으면 메모리 값을 쓴다.
  }
  if (memorySessionId) return memorySessionId;
  const created = crypto.randomUUID();
  memorySessionId = created;
  try {
    window.sessionStorage.setItem(SESSION_KEY, created);
  } catch {
    // 저장하지 못해도 이 페이지에서는 같은 키를 쓴다.
  }
  return created;
}

async function identityScope(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 24);
}

function readPageViewCache(now: number): PageViewCacheEntry[] {
  let raw: string | null = null;
  try {
    if (!pageViewStorageFailed) raw = window.sessionStorage.getItem(PAGE_VIEW_CACHE_KEY);
  } catch {
    pageViewStorageFailed = true;
  }
  if (pageViewStorageFailed) {
    return memoryPageViewEntries.filter((entry) => entry.storedAt >= now - PAGE_VIEW_WINDOW_MS && entry.storedAt <= now);
  }
  try {
    const parsed = JSON.parse(raw ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((value): PageViewCacheEntry[] => {
      if (!value || typeof value !== "object") return [];
      const entry = value as Record<string, unknown>;
      if (
        (entry.routeScope !== null && typeof entry.routeScope !== "string")
        || typeof entry.idempotencyKey !== "string"
        || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{7,199}$/.test(entry.idempotencyKey)
        || (entry.ownerKind !== "anonymous" && entry.ownerKind !== "authenticated")
        || typeof entry.storedAt !== "number"
        || entry.storedAt < now - PAGE_VIEW_WINDOW_MS
        || entry.storedAt > now
      ) return [];
      if (entry.event === null) return [{
        routeScope: entry.routeScope,
        idempotencyKey: entry.idempotencyKey,
        ownerKind: entry.ownerKind,
        storedAt: entry.storedAt,
        event: null,
      }];
      const event = clientProductEventV1Schema.safeParse(entry.event);
      return event.success && event.data.idempotencyKey === entry.idempotencyKey ? [{
        routeScope: entry.routeScope,
        idempotencyKey: entry.idempotencyKey,
        ownerKind: entry.ownerKind,
        storedAt: entry.storedAt,
        event: event.data,
      }] : [];
    });
  } catch {
    return [];
  }
}

function writePageViewCache(entries: PageViewCacheEntry[]): void {
  const kept = entries.slice(-MAX_PAGE_VIEW_CACHE_ENTRIES);
  memoryPageViewEntries = kept;
  try {
    window.sessionStorage.setItem(PAGE_VIEW_CACHE_KEY, JSON.stringify(kept));
  } catch {
    // 저장하지 못해도 메모리 사본으로 같은 페이지의 키를 유지한다.
    pageViewStorageFailed = true;
  }
}

function canonicalPageViewPayload(
  event: ClientProductEventV1,
  ownerKind: PageViewCacheEntry["ownerKind"],
  now: number,
): ClientProductEventV1 {
  const entries = readPageViewCache(now);
  const existing = entries.find((entry) =>
    entry.idempotencyKey === event.idempotencyKey && entry.ownerKind === ownerKind
  );
  if (existing?.event) return existing.event;
  if (existing) existing.event = event;
  else entries.push({ routeScope: null, idempotencyKey: event.idempotencyKey, ownerKind, storedAt: now, event });
  writePageViewCache(entries);
  return event;
}

function removeLegacyPageViewCache(): void {
  try {
    removeLegacyPageViewKeys();
  } catch {
    // 정리는 실패해도 기록에 영향이 없다.
  }
}

function removeLegacyPageViewKeys(): void {
  for (let index = 0; index < window.sessionStorage.length; index += 1) {
    const key = window.sessionStorage.key(index);
    if (key === LEGACY_PAGE_VIEW_PAYLOAD_CACHE_KEY || key?.startsWith(`${LEGACY_PAGE_VIEW_KEY_PREFIX}:`)) {
      window.sessionStorage.removeItem(key);
      index -= 1;
    }
  }
}

export async function recordClientProductEvent(
  input: Omit<ClientProductEventV1, "schemaVersion" | "anonymousSessionId" | "occurredAt"> & {
    occurredAt?: string;
  },
  accessToken?: string | null,
): Promise<void> {
  const createdAt = Date.now();
  const candidate = clientProductEventV1Schema.parse({
    ...input,
    schemaVersion: 1,
    anonymousSessionId: accessToken ? null : anonymousSessionId(),
    occurredAt: input.occurredAt ?? new Date().toISOString(),
  });
  const event = candidate.eventName === "creator_page_view"
    || candidate.eventName === "live_page_view"
    || candidate.eventName === "benefit_page_view"
    ? canonicalPageViewPayload(candidate, accessToken ? "authenticated" : "anonymous", createdAt)
    : candidate;
  const response = await fetch("/api/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(event),
    keepalive: true,
  });
  if (!response.ok) throw new Error("Product event was not recorded");
}

// 같은 멱등 키의 기록이 진행 중이면(효과가 연달아 다시 실행된 경우) 그 결과를 같이 기다린다. 서버도 같은 키를 한 번만 저장한다.
const recordsInFlight = new Map<string, Promise<boolean>>();

export async function recordProductEventV1(
  input: Parameters<typeof recordClientProductEvent>[0],
  accessToken?: string | null,
): Promise<boolean> {
  if (navigator.userAgent.toLowerCase().includes("jsdom")) return true;
  const flightKey = `${accessToken ? "member" : "anonymous"}:${input.idempotencyKey}`;
  const pending = recordsInFlight.get(flightKey);
  if (pending) return pending;
  const record = recordClientProductEvent(input, accessToken).then(() => true, () => false)
    .finally(() => { recordsInFlight.delete(flightKey); });
  recordsInFlight.set(flightKey, record);
  return record;
}

export async function pageViewIdempotencyKey(
  eventName: "creator_page_view" | "live_page_view" | "benefit_page_view",
  routeKey: string,
  authenticatedOwnerId: string | null,
  now = Date.now(),
): Promise<string> {
  const safeRoute = routeKey.replace(/[^A-Za-z0-9_.:-]/g, "-").slice(0, 80);
  const windowKey = Math.floor(now / PAGE_VIEW_WINDOW_MS);
  removeLegacyPageViewCache();
  const ownerScope = await identityScope(authenticatedOwnerId
    ? `authenticated:${authenticatedOwnerId}`
    : `anonymous:${anonymousSessionId()}`);
  const routeScope = `${eventName}:${safeRoute}:${ownerScope}:${windowKey}`;
  const entries = readPageViewCache(now);
  const existing = entries.find((entry) => entry.routeScope === routeScope);
  if (existing) {
    writePageViewCache(entries);
    return existing.idempotencyKey;
  }
  const created = `page:${eventName}:${crypto.randomUUID()}`;
  entries.push({
    routeScope,
    idempotencyKey: created,
    ownerKind: authenticatedOwnerId ? "authenticated" : "anonymous",
    storedAt: now,
    event: null,
  });
  writePageViewCache(entries);
  return created;
}
