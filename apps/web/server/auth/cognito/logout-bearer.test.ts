import { TextEncoder as NodeTextEncoder } from "node:util";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { generateKeyPair, SignJWT } from "jose";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ key: undefined as unknown, db: undefined as unknown }));
const config = { issuer: "https://cognito-idp.ap-northeast-2.amazonaws.com/ap-northeast-2_pool", clientId: "client", domain: "https://pool.auth.ap-northeast-2.amazoncognito.com", redirectUri: "https://kyaa.io/api/auth/cognito/callback", logoutUri: "https://kyaa.io/login", origin: "https://kyaa.io", cookieSecret: Buffer.alloc(32, 7).toString("base64") };
vi.mock("./config", () => ({ cognitoConfig: () => config }));
vi.mock("../../config/env", () => ({ loadServerEnv: () => ({ GIWA_CHAIN_ID: 91342 }) }));
vi.mock("./identity-repository", () => ({ identityDatabase: () => state.db }));
vi.mock("./verifier", async (original) => {
  const actual = await original<typeof import("./verifier")>();
  return { ...actual, createCognitoVerifier: (c: { issuer: string; clientId: string }) => actual.createCognitoVerifier(c, async () => state.key as CryptoKey) };
});
import { resolveCognitoAccess } from "./access";
import { revokeSession, seal, digest } from "./browser-session";

let privateKey: CryptoKey;
beforeAll(async () => {
  Object.defineProperty(globalThis, "Uint8Array", { configurable: true, value: new NodeTextEncoder().encode("").constructor });
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey; state.key = pair.publicKey;
});
afterEach(() => vi.unstubAllGlobals());

// In-memory stand-in for the service-role RPCs with the same semantics as 20261224000000_kyaa_native_auth.sql.
function database(sessionKey: string, sealed: string) {
  const sessions = new Map([[digest(sessionKey), sealed]]), revoked = new Set<string>();
  const member = { appUserId: "11111111-1111-4111-8111-111111111111", identityKey: "did:privy:member", verifiedEmail: "fan@example.test", walletAddress: `0x${"1".repeat(40)}`, chainId: 91342, providerAccounts: [] };
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "read_cognito_browser_session") return { data: sessions.get(args.p_token_hash as string) ?? null, error: null };
    if (name === "delete_cognito_browser_session") { sessions.delete(args.p_token_hash as string); return { data: null, error: null }; }
    if (name === "revoke_cognito_token_family") { for (const id of args.p_token_ids as string[]) revoked.add(id); return { data: null, error: null }; }
    if (name === "resolve_kyaa_identity") return { data: (args.p_token_ids as string[]).some((id) => revoked.has(id)) ? null : member, error: null };
    return { data: null, error: { message: `unexpected ${name}` } };
  });
  return { rpc, sessions };
}

it("refuses a kyaa-cognito Bearer issued before logout, including a later refresh of the same sign-in", async () => {
  const issue = (jti: string) => new SignJWT({ sub: "cognito-sub", client_id: "client", token_use: "access", origin_jti: "origin-1", jti })
    .setProtectedHeader({ alg: "RS256" }).setIssuer(config.issuer).setIssuedAt().setExpirationTime("15m").sign(privateKey);
  const beforeLogout = await issue("jti-1");
  const sessionKey = "k".repeat(43);
  const sealed = seal({ accessToken: beforeLogout, idToken: "id", refreshToken: "refresh", subject: "cognito-sub", expiresAt: Date.now() + 600_000, sessionExpiresAt: Date.now() + 86_400_000 }, config.cookieSecret);
  const db = database(sessionKey, sealed); state.db = db;
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));

  await expect(resolveCognitoAccess(`kyaa-cognito:${beforeLogout}`)).resolves.toMatchObject({ member: { appUserId: "11111111-1111-4111-8111-111111111111" } });
  await revokeSession(sessionKey, config);
  expect(db.sessions.size).toBe(0);
  await expect(resolveCognitoAccess(`kyaa-cognito:${beforeLogout}`)).rejects.toMatchObject({ status: 401 });
  // A token refreshed from the same sign-in before logout shares origin_jti and is refused too.
  await expect(resolveCognitoAccess(`kyaa-cognito:${await issue("jti-2")}`)).rejects.toMatchObject({ status: 401 });
});

it("keeps the session and reports failure when the revocation record cannot be written", async () => {
  const token = await new SignJWT({ sub: "s", client_id: "client", token_use: "access", origin_jti: "origin-x", jti: "jti-x" }).setProtectedHeader({ alg: "RS256" }).setIssuer(config.issuer).setIssuedAt().setExpirationTime("15m").sign(privateKey);
  const sessionKey = "q".repeat(43);
  const db = database(sessionKey, seal({ accessToken: token, idToken: "id", refreshToken: "r", subject: "s", expiresAt: Date.now() + 600_000, sessionExpiresAt: Date.now() + 86_400_000 }, config.cookieSecret));
  const failing = { rpc: vi.fn(async (name: string, args: Record<string, unknown>) => name === "revoke_cognito_token_family" ? { data: null, error: { message: "down" } } : db.rpc(name, args)) };
  const fetcher = vi.fn(async () => new Response(null, { status: 200 })); vi.stubGlobal("fetch", fetcher);
  await expect(revokeSession(sessionKey, config, failing)).rejects.toThrow();
  expect(db.sessions.size).toBe(1);
  expect(fetcher).not.toHaveBeenCalled();
});
