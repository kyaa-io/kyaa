import "server-only";
import { z } from "zod";
import { AuthError } from "@/features/auth/domain/auth-errors";
import { preferredLocaleSchema } from "@/features/profile/domain/preferred-locale";
import { fanProfileSchema } from "@/features/profile/domain/profile";
import { withOperationDeadline } from "@/features/reliability/client/request-deadline";
import { authenticateEmailAccessToken, createEmailAuthClients, emailAuthConfig, emailAuthDenied, EMAIL_TOKEN_PREFIX, validatedEmailClaims, requireEmailProviderSuccess, type EmailAuthConfig } from "./email-auth";

const headers = { "cache-control": "private, no-store", vary: "Authorization" };
const loginSchema = z.object({ email: z.email().max(254).transform(value => value.toLowerCase()), password: z.string().min(1).max(1024), locale: preferredLocaleSchema }).strict();
const refreshSchema = z.object({ refreshToken: z.string().min(1).max(4096), locale: preferredLocaleSchema }).strict();
type Action = "login" | "refresh" | "logout";
async function readBody(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new z.ZodError([]);
  const reader = request.body?.getReader();
  if (!reader) throw new z.ZodError([]);
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > 8192) { await reader.cancel(); throw new z.ZodError([]); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export function createEmailAuthHandler(action: Action, configFactory = emailAuthConfig, clientsFactory = createEmailAuthClients) {
  return async (request: Request): Promise<Response> => {
    try {
      return await withOperationDeadline((async () => {
        const body = action === "logout" ? null : await readBody(request);
        const parsed = action === "login" ? loginSchema.parse(body) : action === "refresh" ? refreshSchema.parse(body) : null;
        const config: EmailAuthConfig = configFactory();
        const clients = clientsFactory(config);
        if (action === "logout") {
          const token = /^Bearer[ \t]+([^\s]+)$/i.exec(request.headers.get("authorization")?.trim() ?? "")?.[1];
          if (!token) throw emailAuthDenied();
          await authenticateEmailAccessToken(token, config, clients);
          const result = await clients.auth.admin.signOut(token.slice(EMAIL_TOKEN_PREFIX.length), "local");
          requireEmailProviderSuccess(result.error);
          return new Response(null, { status: 204, headers });
        }
        const result = parsed && "email" in parsed
          ? await clients.auth.signInWithPassword({ email: parsed.email, password: parsed.password })
          : await clients.auth.refreshSession({ refresh_token: (parsed as z.infer<typeof refreshSchema>).refreshToken });
        requireEmailProviderSuccess(result.error);
        const session = result.data.session;
        if (!session?.access_token || !session.refresh_token || !session.expires_at) throw emailAuthDenied();
        const token = `${EMAIL_TOKEN_PREFIX}${session.access_token}`;
        const owner = await authenticateEmailAccessToken(token, config, clients);
        const claims = validatedEmailClaims(session.access_token, config.url);
        if (session.user.id !== owner.supabaseUserId || session.expires_at !== claims.exp) throw emailAuthDenied();
        const locale = await clients.database.rpc("initialize_owned_preferred_locale", { p_app_user_id: owner.appUserId, p_locale: parsed!.locale });
        if (locale.error) throw new Error("Email profile unavailable");
        const profile = await clients.database.rpc("get_owned_user_profile", { p_app_user_id: owner.appUserId });
        if (profile.error) throw new Error("Email profile unavailable");
        return Response.json({ accessToken: token, refreshToken: session.refresh_token, expiresAt: claims.exp,
          userId: `supabase:${owner.supabaseUserId}`, appUserId: owner.appUserId, profile: fanProfileSchema.parse(profile.data) }, { headers });
      })(), 20_000);
    } catch (error) {
      const invalid = error instanceof z.ZodError || error instanceof SyntaxError;
      const status = invalid ? 400 : error instanceof AuthError ? error.status : 503;
      return Response.json({ error: { code: invalid ? "INVALID_EMAIL_AUTH_REQUEST" : error instanceof AuthError ? error.code : "EMAIL_AUTH_UNAVAILABLE" } }, { status, headers });
    }
  };
}
