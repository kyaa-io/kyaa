import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../auth/email/email-auth", () => ({ EMAIL_TOKEN_PREFIX: "kyaa-email:", authenticateEmailAccessToken: vi.fn() }));

import { AppleReauthenticationRequiredError } from "../auth/apple-notifications/apple-lifecycle";
import { authenticatePrivyAccessToken } from "../auth/authenticate-privy";
import { createFanSessionRoute } from "../auth/fan-session-route";
import { fanSessionKey } from "../auth/fan-session-cookie";
import { SupabaseSessionSyncRepository } from "../auth/supabase-session-sync-repository";
import { authorizeFanRequest, type FanAuthRepository } from "../fan-auth/fan-auth-gate";
import { AUTH_DENIED_REASONS, recordAuthDeniedReason, requestStateStore, type AuthDeniedReason, type RequestState } from "./auth-denied-reason";

/** 요청 맥락 안에서 실행하고, 그 맥락에 기록된 거부 사유를 돌려준다. */
async function reasonOf(run: () => Promise<unknown>): Promise<AuthDeniedReason | undefined> {
  const state: RequestState = {};
  await requestStateStore().run(state, async () => { await run().catch(() => undefined); });
  return state.authDeniedReason;
}

const active = { id: "user-1", privyUserId: "did:privy:fan", verifiedEmail: "fan@example.com", status: "active" as const };
const verifier = { verify: vi.fn().mockResolvedValue({ privyUserId: "did:privy:fan", verifiedEmail: "fan@example.com", providerAccounts: [] }) };
const gate = (user: Awaited<ReturnType<FanAuthRepository["findUserByPrivyId"]>>, extra: Partial<Parameters<typeof authorizeFanRequest>[0]> = {}) =>
  () => authorizeFanRequest({ authorization: "Bearer token", verifier, repository: { findUserByPrivyId: vi.fn().mockResolvedValue(user) }, ...extra });

describe("auth denied reason: fan auth gate", () => {
  it("user_missing / user_inactive", async () => {
    expect(await reasonOf(gate(null))).toBe("user_missing");
    expect(await reasonOf(gate({ ...active, status: "disabled" }))).toBe("user_inactive");
  });

  it("fan_session_revoked", async () => {
    const revoked = { ...active, sessionsValidAfter: new Date(2_000_000).toISOString() };
    const sessionVerifier = { verify: vi.fn().mockResolvedValue({
      privyUserId: "did:privy:fan", verifiedEmail: "fan@example.com", providerAccounts: [],
      fanSession: { appUserId: "user-1", authenticatedAt: 1_000_000 },
    }) };
    expect(await reasonOf(gate(revoked as never, { verifier: sessionVerifier }))).toBe("fan_session_revoked");
  });

  it("records nothing for an allowed fan", async () => {
    expect(await reasonOf(gate(active))).toBeUndefined();
  });
});

describe("auth denied reason: identity checks", () => {
  it("verified_email_required", async () => {
    const noEmail = { verify: vi.fn().mockResolvedValue({ privyUserId: "did:privy:fan", verifiedEmail: null, providerAccounts: [] }) };
    expect(await reasonOf(() => authenticatePrivyAccessToken("token", noEmail))).toBe("verified_email_required");
    expect(await reasonOf(gate(active, { verifier: noEmail }))).toBe("verified_email_required");
  });

  it("apple_reauth_required", async () => {
    const apple = { verify: vi.fn().mockRejectedValue(new AppleReauthenticationRequiredError(["apple"])) };
    expect(await reasonOf(() => authenticatePrivyAccessToken("token", apple))).toBe("apple_reauth_required");
  });

  it("a bad token is not given a specific reason", async () => {
    const bad = { verify: vi.fn().mockRejectedValue(new Error("expired")) };
    expect(await reasonOf(() => authenticatePrivyAccessToken("token", bad))).toBeUndefined();
  });
});

describe("auth denied reason: session sync", () => {
  const identity = { privyUserId: "did:privy:user-1", providerAccounts: [], verifiedEmail: "fan@example.com" };
  const wallet = { chainId: 91342, address: "0x82162619589cfe3e0dcc58c43dfbf121844f8e9c" };
  const syncWith = (message: string) => () => new SupabaseSessionSyncRepository({ rpc: vi.fn().mockResolvedValue({ data: null, error: { message } }) } as never)
    .sync(identity as never, wallet, "en");

  it("account_deleted / active_account_required", async () => {
    expect(await reasonOf(syncWith("ACCOUNT_DELETED"))).toBe("account_deleted");
    expect(await reasonOf(syncWith("FAN_WEB_ACTIVE_ACCOUNT_REQUIRED"))).toBe("active_account_required");
  });

  it("another database error records nothing", async () => {
    expect(await reasonOf(syncWith("boom"))).toBeUndefined();
  });
});

describe("auth denied reason: /api/auth/fan-session", () => {
  const key = fanSessionKey(Buffer.alloc(32, 7).toString("base64"))!;
  const NOW = Date.UTC(2026, 10, 12);
  const resolved = {
    privyUserId: "did:privy:user-1", sessionId: "s1", tokenIssuedAt: NOW,
    identity: { privyUserId: "did:privy:user-1", verifiedEmail: "fan@example.com", providerAccounts: [], googleLinked: true },
    apple: null, google: null,
  };
  const route = (user: unknown) => createFanSessionRoute({
    appOrigin: "https://kyaa.io", key, now: () => NOW,
    resolve: vi.fn(async () => resolved), verifyCookie: vi.fn(), isPrivileged: vi.fn(async () => false), revokeSessions: vi.fn(),
    repository: { findUserByPrivyId: vi.fn(async () => user as never) },
  });
  const post = (origin: string | null) => new Request("https://kyaa.io/api/auth/fan-session", {
    method: "POST", headers: { ...(origin ? { origin } : {}), authorization: "Bearer privy-jwt" },
  });

  it("same_origin", async () => {
    expect(await reasonOf(() => route(active).POST(post("https://evil.example")))).toBe("same_origin");
    expect(await reasonOf(() => route(active).POST(post(null)))).toBe("same_origin");
  });

  it("user_missing / user_inactive, with a body code the browser can act on", async () => {
    expect(await reasonOf(() => route(null).POST(post("https://kyaa.io")))).toBe("user_missing");
    expect(await reasonOf(() => route({ ...active, status: "disabled" }).POST(post("https://kyaa.io")))).toBe("user_inactive");
    // A new Privy user before the session sync created the account row: no session, no sign-out signal (11/20 signup logout fix).
    const missing = await route(null).POST(post("https://kyaa.io"));
    expect([missing.status, await missing.json()]).toEqual([200, { session: false }]);
    expect(missing.headers.get("set-cookie")).toContain("Max-Age=0");
    const inactive = await route({ ...active, status: "disabled" }).POST(post("https://kyaa.io"));
    expect([inactive.status, await inactive.json()]).toEqual([403, { error: { code: "FAN_ACCOUNT_UNAVAILABLE" } }]);
    expect(inactive.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});

describe("auth denied reason: list", () => {
  it("is the fixed list of reasons", () => {
    expect([...AUTH_DENIED_REASONS]).toEqual([
      "user_missing", "user_inactive", "account_deleted", "active_account_required", "verified_email_required",
      "apple_reauth_required", "same_origin", "fan_session_revoked", "other",
    ]);
  });

  it("recording outside a request does nothing", () => {
    expect(() => recordAuthDeniedReason("other")).not.toThrow();
  });
});
