import type { BrowserContext } from "@playwright/test";

// Writes a read-only smoke may let through. Same-origin: the analytics beacon only (an analytics write, not a business write).
// Third party: exact host AND exact path. Everything else that is not GET/HEAD/OPTIONS is aborted inside the browser by route interception, before any network I/O.
export const ALLOWED_SAME_ORIGIN_WRITES: ReadonlySet<string> = new Set(["/api/events"]);
export const ALLOWED_EXTERNAL_WRITES: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["auth.privy.io", new Set(["/api/v1/sessions", "/api/v1/analytics_events"])],
]);

export type WriteGuard = {
  /** Same-origin writes that were aborted. A non-empty list fails the smoke. */
  blocked: string[];
  /** Third-party writes that were aborted (not on the exact allow-list). Reported, never sent. */
  externalAborted: string[];
};

export async function guardWrites(context: BrowserContext, origin: string): Promise<WriteGuard> {
  const guard: WriteGuard = { blocked: [], externalAborted: [] };
  await context.route("**/*", async (route) => {
    const request = route.request();
    const method = request.method();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") return route.continue();
    const url = new URL(request.url());
    if (url.origin === new URL(origin).origin) {
      if (ALLOWED_SAME_ORIGIN_WRITES.has(url.pathname)) return route.continue();
      guard.blocked.push(`${method} ${url.origin}${url.pathname}`);
      return route.abort("blockedbyclient");
    }
    if (ALLOWED_EXTERNAL_WRITES.get(url.hostname)?.has(url.pathname) && url.protocol === "https:") return route.continue();
    guard.externalAborted.push(`${method} ${url.hostname}${url.pathname}`);
    return route.abort("blockedbyclient");
  });
  return guard;
}
