import "server-only";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { APP_LOCALES } from "@/i18n/locales";
import { canonicalUrl, SITE_URL, type SeoLocale } from "@/seo/metadata";
import { isPublicationPath } from "@/seo/sitemap";

export const INDEXNOW_KEY = "e2d7ecf40bd744df9ecf1b04ad64d485";
export type PublicationSnapshot = Record<string, string>;
export interface IndexNowStore {
  claim(token: string): Promise<PublicationSnapshot | null>;
  acknowledge(token: string, snapshot: PublicationSnapshot): Promise<boolean>;
  release(token: string): Promise<void>;
}

export function validatePublicationSnapshot(value: unknown, allowEmpty = false): PublicationSnapshot {
  const invalid = () => { throw new Error("INVALID_PUBLICATION_SNAPSHOT"); };
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const entries = Object.entries(value);
  if ((!allowEmpty && entries.length === 0) || entries.length > 100_000) return invalid();
  for (const [address, digest] of entries) {
    let url: URL;
    try { url = new URL(address); } catch { return invalid(); }
    const locale = url.searchParams.get("locale") as SeoLocale;
    const path = url.pathname;
    if (url.origin !== SITE_URL || url.username || url.password || url.hash
      || !APP_LOCALES.includes(locale) || address !== canonicalUrl(path, locale)
      || !isPublicationPath(path)
      || typeof digest !== "string" || !/^[a-f0-9]{64}$/.test(digest)) return invalid();
  }
  return value as PublicationSnapshot;
}

const knownCodes = new Set([
  "INDEXNOW_STORE_NOT_CONFIGURED", "INDEXNOW_STORE_UNAVAILABLE",
  "INVALID_PUBLICATION_SNAPSHOT", "INDEXNOW_LEASE_EXPIRED",
]);

class SubmissionError extends Error {
  constructor(readonly status: number) { super("INDEXNOW_REJECTED"); }
}

function logFailure(stage: string, error: unknown, retry = false) {
  const code = error instanceof SubmissionError ? "INDEXNOW_REJECTED"
    : error instanceof Error && knownCodes.has(error.message) ? error.message
    : stage === "submit" ? "INDEXNOW_TRANSPORT_FAILED" : "INDEXNOW_STAGE_FAILED";
  const entry = { event: "indexnow_failure", stage, code, retry,
    ...(error instanceof SubmissionError ? { upstreamStatus: error.status } : {}) };
  if (retry) console.warn(entry);
  else console.error(entry);
}

export async function runIndexNow(input: {
  store: IndexNowStore | (() => IndexNowStore);
  loadSnapshot(): Promise<PublicationSnapshot>;
  transport?: typeof fetch;
}): Promise<{ status: "busy" | "unchanged" | "submitted" | "deferred"; submitted: number }> {
  const token = randomUUID();
  let stage = "configure_store";
  let claimedStore: IndexNowStore | undefined;
  let failed = false;
  try {
    const store = typeof input.store === "function" ? input.store() : input.store;
    stage = "claim";
    const previous = await store.claim(token);
    if (previous === null) return { status: "busy", submitted: 0 };
    claimedStore = store;
    stage = "validate_previous";
    validatePublicationSnapshot(previous, true);
    stage = "load_snapshot";
    const snapshot = await input.loadSnapshot();
    stage = "validate_current";
    const current = validatePublicationSnapshot(snapshot);
    const changed = [...new Set([...Object.keys(previous), ...Object.keys(current)])]
      .filter((url) => previous[url] !== current[url]).sort();
    stage = "submit";
    const networkDeadline = AbortSignal.timeout(20_000);
    for (let offset = 0; offset < changed.length; offset += 10_000) {
      const response = await (input.transport ?? fetch)("https://api.indexnow.org/indexnow", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ host: "kyaa.io", key: INDEXNOW_KEY, keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`, urlList: changed.slice(offset, offset + 10_000) }),
        redirect: "manual", signal: AbortSignal.any([networkDeadline, AbortSignal.timeout(8_000)]),
      });
      if (response.status !== 200 && response.status !== 202) throw new SubmissionError(response.status);
    }
    stage = "acknowledge";
    if (!await store.acknowledge(token, current)) throw new Error("INDEXNOW_LEASE_EXPIRED");
    return { status: changed.length ? "submitted" : "unchanged", submitted: changed.length };
  } catch (error) {
    const retry = stage === "submit" && (error instanceof SubmissionError
      ? error.status === 429 || (error.status >= 500 && error.status <= 599)
      : error instanceof TypeError || (error instanceof DOMException && error.name === "TimeoutError"));
    logFailure(stage, error, retry);
    if (retry) return { status: "deferred", submitted: 0 };
    failed = true;
    throw error;
  } finally {
    if (claimedStore) {
      try { await claimedStore.release(token); }
      catch (error) {
        logFailure("release", error);
        if (!failed) throw error;
      }
    }
  }
}

export function createIndexNowHandler(input: {
  secret?: string; production: boolean; execute(): ReturnType<typeof runIndexNow>;
}) {
  return async (request: Request) => {
    const headers = { "cache-control": "no-store" };
    const authorization = Buffer.from(request.headers.get("authorization") ?? "");
    const expected = Buffer.from(`Bearer ${input.secret ?? ""}`);
    if (!input.secret || input.secret.length < 32 || authorization.length !== expected.length || !timingSafeEqual(authorization, expected))
      return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401, headers });
    if (!input.production) return Response.json({ error: { code: "PRODUCTION_ONLY" } }, { status: 409, headers });
    try {
      const result = await input.execute();
      return Response.json(result, { status: result.status === "deferred" ? 202 : 200, headers });
    }
    catch { return Response.json({ error: { code: "INDEXNOW_UNAVAILABLE" } }, { status: 503, headers }); }
  };
}
