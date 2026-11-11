import "server-only";
import { z } from "zod";
import { AuthError } from "@/features/auth/domain/auth-errors";
import { preferredLocaleSchema } from "@/features/profile/domain/preferred-locale";
import { loadServerEnv } from "@/server/config/env";
import { createEmailAuthHandler } from "../email/email-route";
import { authenticateCognitoEmail, cognitoEmailOperation } from "./email-session";
import { emailCognitoConfig } from "./config";
import { identityDatabase } from "./identity-repository";
import { cognitoDenied } from "./verifier";
import { authHeaders, boundedAuthJson, cookie, digest, opaque, readCookie, requireOrigin, rpc, seal, SESSION_COOKIE, unseal } from "./browser-session";

export const EMAIL_BROWSER_COOKIE = "__Host-kyaa-email";
const lifetime = 86400;
const credentials = z.object({ accessToken: z.string().startsWith("kyaa-email:"), refreshToken: z.string(), expiresAt: z.number() });
const storedSchema = credentials.extend({ kind: z.literal("email"), locale: preferredLocaleSchema, sessionExpiresAt: z.number() });
type Stored = z.infer<typeof storedSchema>;
async function write(key: string, value: Stored) {
  const config = emailCognitoConfig();
  await rpc(identityDatabase(), "write_cognito_browser_session", { p_token_hash: digest(key), p_encrypted_session: seal(value, config.cookieSecret), p_expires_at: new Date(value.sessionExpiresAt).toISOString() });
}
async function read(request: Request) {
  const config = emailCognitoConfig(), key = readCookie(request, EMAIL_BROWSER_COOKIE);
  if (!key || key.length !== 43) throw cognitoDenied();
  const encrypted = await rpc(identityDatabase(), "read_cognito_browser_session", { p_token_hash: digest(key) });
  if (typeof encrypted !== "string") throw cognitoDenied();
  let value = storedSchema.parse(unseal(encrypted, config.cookieSecret));
  if (value.sessionExpiresAt <= Date.now()) throw cognitoDenied();
  if (value.expiresAt * 1000 <= Date.now() + 60_000) {
    const refreshed = credentials.parse(await cognitoEmailOperation("refresh", { refreshToken: value.refreshToken, locale: value.locale }));
    value = { ...value, ...refreshed };
    await write(key, value);
  }
  return { key, value };
}
export async function emailBrowserSession(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") throw cognitoDenied();
  const { value } = await read(request);
  const owner = await authenticateCognitoEmail(value.accessToken);
  return Response.json({ authenticated: true, walletLinked: true, userId: owner.privyUserId, accessToken: value.accessToken, expiresAt: value.expiresAt * 1000 }, { headers: authHeaders() });
}
export async function logoutEmailBrowser(request: Request) {
  requireOrigin(request, emailCognitoConfig());
  const key = readCookie(request, EMAIL_BROWSER_COOKIE);
  if (!key || key.length !== 43) throw cognitoDenied();
  try {
    const { value } = await read(request);
    await cognitoEmailOperation("logout", { accessToken: value.accessToken });
  } catch (error) {
    // An expired or already revoked credential cannot authorize requests; storage/provider outages still fail closed.
    if (!(error instanceof AuthError) || error.status !== 401) throw error;
  }
  await rpc(identityDatabase(), "delete_cognito_browser_session", { p_token_hash: digest(key) });
}
export async function loginEmailBrowser(request: Request) {
  try {
    if (loadServerEnv().AUTH_PROVIDER !== "cognito") throw cognitoDenied();
    requireOrigin(request, emailCognitoConfig());
    const body = await boundedAuthJson(request, 8192);
    const locale = preferredLocaleSchema.parse((body as { locale?: unknown })?.locale);
    // The existing handler validates credentials and preserves Cognito's password-attempt throttling.
    const result = await createEmailAuthHandler("login")(new Request(request.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
    if (!result.ok) return result;
    const tokens = credentials.parse(await result.json());
    await authenticateCognitoEmail(tokens.accessToken);
    const key = opaque();
    await write(key, { ...tokens, kind: "email", locale, sessionExpiresAt: Date.now() + lifetime * 1000 });
    const headers = authHeaders();
    headers.append("set-cookie", cookie(EMAIL_BROWSER_COOKIE, key, lifetime));
    headers.append("set-cookie", cookie(SESSION_COOKIE, "", 0));
    return Response.json({ authenticated: true }, { headers });
  } catch (error) {
    return Response.json({ error: { code: error instanceof AuthError ? error.code : "EMAIL_AUTH_UNAVAILABLE" } }, { status: error instanceof AuthError ? error.status : error instanceof z.ZodError ? 400 : 503, headers: authHeaders() });
  }
}
