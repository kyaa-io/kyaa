import { applyEmailUnsubscribe, resolveEmailUnsubscribeTarget, type EmailUnsubscribeRpcClient, type EmailUnsubscribeScope } from "./email-unsubscribe";

export interface EmailUnsubscribeRouteDependencies {
  key: Buffer | null;
  client: EmailUnsubscribeRpcClient | null;
  now?: () => Date;
}

const noStore = { "cache-control": "private, no-store" };

function pageLocation(request: Request, params: Record<string, string>): string {
  const url = new URL(request.url);
  const query = new URLSearchParams({ t: url.searchParams.get("t") ?? "" });
  const locale = url.searchParams.get("locale");
  if (locale) query.set("locale", locale);
  for (const [key, value] of Object.entries(params)) query.set(key, value);
  return `/email/unsubscribe?${query.toString()}`;
}

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { ...noStore, location } });
}

/** A mail client or person opening the header link lands on the page; nothing changes on GET. */
export function createEmailUnsubscribeGetHandler() {
  return (request: Request): Response => redirect(pageLocation(request, {}));
}

/**
 * POST with `List-Unsubscribe=One-Click` (RFC 8058) switches off the mail's own kind and answers JSON.
 * POST from the page's form carries `scope` and `enabled`, and answers with a redirect back to the page.
 */
export function createEmailUnsubscribePostHandler(dependencies: () => EmailUnsubscribeRouteDependencies) {
  return async (request: Request): Promise<Response> => {
    let form: FormData;
    try { form = await request.formData(); } catch { return Response.json({ error: { code: "INVALID_REQUEST" } }, { status: 400, headers: noStore }); }
    const oneClick = form.get("List-Unsubscribe") === "One-Click";
    const scopeField = form.get("scope");
    const enabledField = form.get("enabled");
    const fromPage = !oneClick && (scopeField === "preference" || scopeField === "email") && (enabledField === "true" || enabledField === "false");
    if (!oneClick && !fromPage) return Response.json({ error: { code: "INVALID_REQUEST" } }, { status: 400, headers: noStore });

    const fail = (code: "expired" | "invalid" | "failed", status: number) => fromPage
      ? redirect(pageLocation(request, { done: code }))
      : Response.json({ error: { code: code.toUpperCase() } }, { status, headers: noStore });
    let deps: EmailUnsubscribeRouteDependencies;
    try { deps = dependencies(); } catch { return fail("failed", 503); }
    const target = resolveEmailUnsubscribeTarget(deps.key, new URL(request.url).searchParams.get("t"), deps.now?.());
    if (target.state !== "ok") return fail(target.state, target.state === "expired" ? 410 : 400);
    if (!deps.client) return fail("failed", 503);

    const scope: EmailUnsubscribeScope = fromPage ? (scopeField as EmailUnsubscribeScope) : target.preference ? "preference" : "email";
    const enabled = fromPage ? enabledField === "true" : false;
    let outcome;
    try { outcome = await applyEmailUnsubscribe(deps.client, target, { scope, enabled }); } catch { outcome = "unavailable" as const; }
    if (outcome === "unavailable") return fail("failed", 503);
    if (outcome === "not_found") return fail("invalid", 404);
    if (outcome === "expired") return fail("expired", 410);
    return fromPage
      ? redirect(pageLocation(request, { done: `${enabled ? "on" : "off"}-${scope}` }))
      : Response.json({ ok: true, scope, enabled }, { headers: noStore });
  };
}
