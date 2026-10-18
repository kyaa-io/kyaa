import "server-only";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { APP_LOCALES } from "@/i18n/locales";
import { canonicalUrl, isPrivatePath, isRehearsalPath, SITE_URL, type SeoLocale } from "@/seo/metadata";
import { STATIC_PUBLIC_PATHS } from "@/seo/sitemap";
import { creatorSlugFromHomePath } from "@/features/creator/domain/creator-navigation";

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
    const publicPath = STATIC_PUBLIC_PATHS.includes(path)
      || (!path.startsWith("/c/") && creatorSlugFromHomePath(path) !== null)
      || /^\/live\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path)
      || /^\/c\/[a-z0-9]+(?:-[a-z0-9]+)*\/raffles(?:\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$/.test(path);
    if (url.origin !== SITE_URL || url.username || url.password || url.hash
      || !APP_LOCALES.includes(locale) || address !== canonicalUrl(path, locale)
      || !publicPath || isPrivatePath(path) || isRehearsalPath(path)
      || typeof digest !== "string" || !/^[a-f0-9]{64}$/.test(digest)) return invalid();
  }
  return value as PublicationSnapshot;
}

export async function runIndexNow(input: {
  store: IndexNowStore;
  loadSnapshot(): Promise<PublicationSnapshot>;
  transport?: typeof fetch;
}): Promise<{ status: "busy" | "unchanged" | "submitted"; submitted: number }> {
  const token = randomUUID();
  const previous = await input.store.claim(token);
  if (previous === null) return { status: "busy", submitted: 0 };
  try {
    validatePublicationSnapshot(previous, true);
    const current = validatePublicationSnapshot(await input.loadSnapshot());
    const changed = [...new Set([...Object.keys(previous), ...Object.keys(current)])]
      .filter((url) => previous[url] !== current[url]).sort();
    const networkDeadline = AbortSignal.timeout(20_000);
    for (let offset = 0; offset < changed.length; offset += 10_000) {
      const response = await (input.transport ?? fetch)("https://api.indexnow.org/indexnow", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ host: "kyaa.io", key: INDEXNOW_KEY, keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`, urlList: changed.slice(offset, offset + 10_000) }),
        redirect: "error", signal: AbortSignal.any([networkDeadline, AbortSignal.timeout(8_000)]),
      });
      if (response.status !== 200 && response.status !== 202) throw new Error("INDEXNOW_REJECTED");
    }
    if (!await input.store.acknowledge(token, current)) throw new Error("INDEXNOW_LEASE_EXPIRED");
    return { status: changed.length ? "submitted" : "unchanged", submitted: changed.length };
  } finally {
    await input.store.release(token);
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
    try { return Response.json(await input.execute(), { headers }); }
    catch { return Response.json({ error: { code: "INDEXNOW_UNAVAILABLE" } }, { status: 503, headers }); }
  };
}
