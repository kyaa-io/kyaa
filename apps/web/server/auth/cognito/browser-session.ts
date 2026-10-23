import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { preferredLocaleSchema } from "../../../features/profile/domain/preferred-locale";
import { identityDatabase, type IdentityRpc } from "./identity-repository";
import type { CognitoConfig } from "./config";
import { createCognitoVerifier, cognitoDenied } from "./verifier";

export const SESSION_COOKIE = "__Host-kyaa-cognito";
export const FLOW_COOKIE = "__Host-kyaa-cognito-flow";
export const opaque = () => randomBytes(32).toString("base64url");
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export const challenge = (value: string) => createHash("sha256").update(value).digest("base64url");
export function seal(value: unknown, secret: string): string {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", Buffer.from(secret, "base64"), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}
export function unseal(value: string, secret: string): unknown {
  const bytes = Buffer.from(value, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(secret, "base64"), bytes.subarray(0,12));
  decipher.setAuthTag(bytes.subarray(12,28));
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8"));
}
export const sessionSchema = z.object({ accessToken: z.string().max(16_384), idToken: z.string().max(16_384), refreshToken: z.string().max(16_384), subject: z.string(), expiresAt: z.number(), sessionExpiresAt: z.number(), preferredLocale: preferredLocaleSchema.optional(),
  enrollment: z.object({ mode: z.enum(["new", "recovery", "blocked"]), provider: z.enum(["google", "apple"]).optional(), expectedPrivyUserId: z.string().optional(), permit: z.string().optional() }).optional(),
  linkProof: z.object({ privyUserId: z.string(), walletAddress: z.string(), chainId: z.number(), expiresAt: z.number() }).optional() });
export type BrowserSession = z.infer<typeof sessionSchema>;
export function cookie(name: string, value: string, age: number): string {
  return `${name}=${value}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Lax`;
}
export function readCookie(request: Request, name: string): string | null {
  const matches = (request.headers.get("cookie") ?? "").split(";").map(v => v.trim()).filter(v => v.startsWith(`${name}=`));
  if (matches.length !== 1) return null;
  const value = matches[0].slice(name.length + 1);
  return value.length <= 4096 && /^[A-Za-z0-9_-]+$/.test(value) ? value : null;
}
export async function rpc(db: IdentityRpc, name: string, args: Record<string, unknown>) {
  const result = await db.rpc(name, args);
  if (result.error) throw new Error("Authentication storage unavailable");
  return result.data;
}
export async function writeSession(key: string, value: BrowserSession, config: CognitoConfig, db = identityDatabase()) {
  await rpc(db, "write_cognito_browser_session", { p_token_hash: digest(key), p_encrypted_session: seal(value, config.cookieSecret), p_expires_at: new Date(value.sessionExpiresAt).toISOString() });
}
export async function revokeSession(key: string, config: CognitoConfig, db = identityDatabase()) {
  const encrypted = await rpc(db, "read_cognito_browser_session", { p_token_hash: digest(key) });
  if (typeof encrypted !== "string") return;
  const session = sessionSchema.parse(unseal(encrypted, config.cookieSecret));
  const response = await fetch(new URL("/oauth2/revoke", config.domain), { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: config.clientId, token: session.refreshToken }), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error("Token revocation unavailable");
  await rpc(db, "delete_cognito_browser_session", { p_token_hash: digest(key) });
}
export async function tokenRequest(config: CognitoConfig, parameters: URLSearchParams, fetcher = fetch) {
  const response = await fetcher(new URL("/oauth2/token", config.domain), { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: parameters, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw cognitoDenied();
  return z.object({ access_token: z.string().max(16_384), id_token: z.string().max(16_384), refresh_token: z.string().max(16_384).optional(), expires_in: z.number().int().positive().max(86400) }).parse(await response.json());
}
export async function readSession(request: Request, config: CognitoConfig, db = identityDatabase()): Promise<{ key: string; session: BrowserSession }> {
  const key = readCookie(request, SESSION_COOKIE);
  if (!key || key.length !== 43) throw cognitoDenied();
  const encrypted = await rpc(db, "read_cognito_browser_session", { p_token_hash: digest(key) });
  if (typeof encrypted !== "string") throw cognitoDenied();
  const session = sessionSchema.parse(unseal(encrypted, config.cookieSecret));
  if (session.sessionExpiresAt <= Date.now()) throw cognitoDenied();
  if (session.expiresAt <= Date.now() + 60_000) {
    const tokens = await tokenRequest(config, new URLSearchParams({ grant_type: "refresh_token", client_id: config.clientId, refresh_token: session.refreshToken }));
    const verify = createCognitoVerifier(config);
    const [access, id] = await Promise.all([verify(tokens.access_token), verify(tokens.id_token, "id")]);
    if (access.subject !== session.subject || id.subject !== session.subject) throw cognitoDenied();
    session.accessToken = tokens.access_token; session.idToken = tokens.id_token;
    session.refreshToken = tokens.refresh_token ?? session.refreshToken;
    session.expiresAt = Date.now() + tokens.expires_in * 1000;
    await writeSession(key, session, config, db);
  }
  return { key, session };
}
export function requireOrigin(request: Request, config: CognitoConfig): void {
  if (request.headers.get("origin") !== config.origin || request.headers.get("sec-fetch-site") === "cross-site") throw cognitoDenied();
}
export const authHeaders = () => new Headers({ "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" });

export async function boundedAuthJson(request:Request,maximum=2048):Promise<unknown>{
  if(request.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json")throw cognitoDenied();
  const reader=request.body?.getReader();if(!reader)throw cognitoDenied();
  const chunks:Uint8Array[]=[];let size=0;
  try{
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maximum){await reader.cancel();throw cognitoDenied();}chunks.push(value);}
  }finally{reader.releaseLock();}
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
