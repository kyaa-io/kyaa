import "server-only";

import { randomBytes } from "node:crypto";
import { z } from "zod";
import { APP_LOCALES } from "@/i18n/locales";
import { AuthError } from "../../../features/auth/domain/auth-errors";
import { privySessionHash, providerSubjectHash, sha256 } from "./apple-lifecycle";
import { boundedText } from "./reauthentication-provider";
import { createBrowserReauthenticationChallenge, type ReauthenticationRouteDependencies } from "./reauthentication-route";

const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const inputSchema = z.object({ provider: z.enum(["apple", "google"]), locale: z.enum(APP_LOCALES) }).strict();
const bindingSchema = inputSchema.extend({
  privyUserId: z.string().min(3).max(255),
  sessionHash: z.string().regex(/^[a-f0-9]{64}$/),
  providerSubjectHash: z.string().regex(/^[a-f0-9]{64}$/),
  generation: z.number().int().nonnegative(),
  returnState: token,
});
const responseHeaders = {
  "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff",
};

function failure(code: string, status: number): Response {
  return Response.json({ error: { code } }, { status, headers: responseHeaders });
}

export async function startNativeReauthentication(request: Request, deps: ReauthenticationRouteDependencies): Promise<Response> {
  try {
    if (new URL(request.url).origin !== deps.config.origin
      || (request.headers.has("origin") && request.headers.get("origin") !== deps.config.origin)
      || !request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      return failure("INVALID_REAUTHENTICATION_REQUEST", 400);
    }
    const bearer = /^Bearer[ \t]+([^\s]+)$/i.exec(request.headers.get("authorization")?.trim() ?? "");
    if (!bearer) return failure("AUTHENTICATION_REQUIRED", 401);
    const input = inputSchema.parse(JSON.parse(await boundedText(request, 4096)));
    const session = await deps.resolver.resolve(bearer[1]);
    const access = await deps.repository.check(session);
    const account = session[input.provider];
    const available = input.provider === "apple" ? access.appleRecoveryAllowed : access.googleRecoveryAllowed;
    if (!account || !available) return failure("REAUTHENTICATION_PROVIDER_UNAVAILABLE", 403);
    const handoff = randomBytes(32).toString("base64url");
    const state = randomBytes(32).toString("base64url");
    const created = await deps.repository.call("create_native_apple_reauth_handoff", { p_handoff: {
      ...input,
      handoffHash: sha256(handoff), returnState: state,
      privyUserId: session.privyUserId,
      sessionHash: privySessionHash(session.privyUserId, session.sessionId),
      providerSubjectHash: providerSubjectHash(input.provider, account.subject),
      generation: access.generation,
    } });
    if (created !== true) return failure("REAUTHENTICATION_UNAVAILABLE", 503);
    const browserUrl = new URL("/api/auth/apple/reauth/native/consume", deps.config.origin);
    browserUrl.searchParams.set("handoff", handoff);
    return Response.json({ browserUrl: browserUrl.toString(), state }, { headers: responseHeaders });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return failure("INVALID_REAUTHENTICATION_REQUEST", 400);
    if (error instanceof AuthError) return failure(error.code, error.status);
    return failure("REAUTHENTICATION_UNAVAILABLE", 503);
  }
}

export async function consumeNativeReauthentication(request: Request, deps: ReauthenticationRouteDependencies): Promise<Response> {
  try {
    const url = new URL(request.url);
    const handoff = token.safeParse(url.searchParams.get("handoff"));
    if (url.origin !== deps.config.origin || !handoff.success || url.searchParams.getAll("handoff").length !== 1) {
      return failure("INVALID_REAUTHENTICATION_REQUEST", 400);
    }
    const binding = bindingSchema.safeParse(await deps.repository.call("consume_native_apple_reauth_handoff", {
      p_handoff_hash: sha256(handoff.data),
    }));
    if (!binding.success) return failure("REAUTHENTICATION_EXPIRED", 410);
    const { locale, returnState, ...identity } = binding.data;
    const returnPath = `/login?${new URLSearchParams({ locale, nativeReauth: returnState })}`;
    const challenge = await createBrowserReauthenticationChallenge({ ...identity, returnPath }, deps);
    return new Response(null, { status: 303, headers: {
      ...responseHeaders, location: challenge.authorizationUrl, "set-cookie": challenge.cookie,
    } });
  } catch {
    return failure("REAUTHENTICATION_UNAVAILABLE", 503);
  }
}

export function nativeReauthenticationReturn(query: Record<string, string | string[] | undefined>): string | null {
  const state = token.safeParse(query.nativeReauth);
  if (!state.success || (query.reauth !== "complete" && query.reauth !== "failed")) return null;
  // The link only resumes the original app session; it never grants access.
  return `kyaa-app:///auth/reauth?state=${encodeURIComponent(state.data)}`;
}
