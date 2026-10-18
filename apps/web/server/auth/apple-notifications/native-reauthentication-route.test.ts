import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AppleLifecycleRepository, privySessionHash, providerSubjectHash, sha256 } from "./apple-lifecycle";
import { consumeNativeReauthentication, nativeReauthenticationReturn, startNativeReauthentication } from "./native-reauthentication-route";
import { completeReauthentication, type ReauthenticationRouteDependencies } from "./reauthentication-route";

const origin = "https://byus.test";
const session = {
  privyUserId: "did:privy:native-owner", sessionId: "original-native-session",
  apple: null, google: { subject: "verified-google-subject", email: "test@example.invalid" },
};

function fixture() {
  let handoff: Record<string, unknown> | null = null;
  let challenge: Record<string, unknown> | null = null;
  const call = vi.fn(async (name: string, params: Record<string, unknown>): Promise<unknown> => {
    if (name === "create_native_apple_reauth_handoff") { handoff = params.p_handoff as Record<string, unknown>; return true; }
    if (name === "consume_native_apple_reauth_handoff") {
      if (!handoff || handoff.handoffHash !== params.p_handoff_hash) return null;
      const binding = { ...handoff }; delete binding.handoffHash; handoff = null; return binding;
    }
    if (name === "create_apple_reauth_challenge") { challenge = params.p_challenge as Record<string, unknown>; return true; }
    if (name === "read_apple_reauth_challenge") {
      return challenge?.stateHash === params.p_state_hash && challenge?.cookieHash === params.p_cookie_hash ? challenge : null;
    }
    if (name === "complete_apple_reauthentication") return true;
    throw new Error("Unexpected RPC");
  });
  const repository = new AppleLifecycleRepository({ rpc: vi.fn() });
  repository.call = call as AppleLifecycleRepository["call"];
  repository.check = vi.fn(async () => ({ allowed: false, generation: 4, appleState: "revoked" as const, appleRecoveryAllowed: false, googleRecoveryAllowed: true }));
  const deps: ReauthenticationRouteDependencies = {
    config: { origin, googleClientId: "test-client", googleClientSecret: "test-secret", applePrivateKey: "test-key" },
    repository,
    resolver: { resolve: vi.fn(async () => session), findProviderSubject: vi.fn(async () => session.google.subject) },
    verifyCode: vi.fn(async (input) => input.expectedSubjectHash),
    now: () => new Date("2026-10-11T12:00:00Z"),
  };
  const request = (body: unknown = { provider: "google", locale: "zh-Hant" }, headers: Record<string, string> = {}) =>
    new Request(`${origin}/api/auth/apple/reauth/native/start`, { method: "POST", headers: {
      authorization: "Bearer native-token", "content-type": "application/json", ...headers,
    }, body: JSON.stringify(body) });
  return { deps, call, request };
}

describe("native Apple lifecycle recovery", () => {
  it("hands off the original native session once and completes the existing browser challenge", async () => {
    const { deps, call, request } = fixture();
    const start = await startNativeReauthentication(request(), deps);
    expect(start.status).toBe(200);
    expect(start.headers.get("set-cookie")).toBeNull();
    expect(start.headers.get("cache-control")).toBe("no-store");
    const { browserUrl, state } = await start.json() as { browserUrl: string; state: string };
    expect(browserUrl).not.toContain("native-token");
    expect(browserUrl).not.toContain(session.privyUserId);
    expect(browserUrl).not.toContain(session.sessionId);
    const handoff = new URL(browserUrl).searchParams.get("handoff")!;
    expect(call).toHaveBeenCalledWith("create_native_apple_reauth_handoff", { p_handoff: expect.objectContaining({
      handoffHash: sha256(handoff), returnState: state, privyUserId: session.privyUserId,
      sessionHash: privySessionHash(session.privyUserId, session.sessionId), generation: 4,
    }) });
    const browser = await consumeNativeReauthentication(new Request(browserUrl), deps);
    expect(browser.status).toBe(303);
    expect(browser.headers.get("referrer-policy")).toBe("no-referrer");
    const authorization = new URL(browser.headers.get("location")!);
    const cookie = browser.headers.get("set-cookie")!.split(";")[0];
    expect(call).toHaveBeenCalledWith("create_apple_reauth_challenge", { p_challenge: expect.objectContaining({
      privyUserId: session.privyUserId, sessionHash: privySessionHash(session.privyUserId, session.sessionId),
      providerSubjectHash: providerSubjectHash("google", session.google.subject), generation: 4,
      returnPath: `/login?locale=zh-Hant&nativeReauth=${state}`,
    }) });
    const callback = new URL(`${origin}/api/auth/apple/reauth/callback/google`);
    callback.searchParams.set("state", authorization.searchParams.get("state")!);
    callback.searchParams.set("code", "provider-code");
    const complete = await completeReauthentication(new Request(callback, { headers: { cookie } }), "google", deps);
    expect(complete.status).toBe(303);
    const destination = new URL(complete.headers.get("location")!);
    expect(destination.pathname).toBe("/login");
    expect(nativeReauthenticationReturn(Object.fromEntries(destination.searchParams))).toBe(`kyaa-app:///auth/reauth?state=${state}`);
    expect((await consumeNativeReauthentication(new Request(browserUrl), deps)).status).toBe(410);
  });

  it.each([
    { provider: "facebook", locale: "ko" },
    { provider: "google", locale: "de" },
    { provider: "google", locale: "ko", returnTo: "https://attacker.test" },
  ])("rejects untrusted native input %j", async (input) => {
    const { deps, request, call } = fixture();
    expect((await startNativeReauthentication(request(input), deps)).status).toBe(400);
    expect(call).not.toHaveBeenCalled();
  });

  it("rejects a browser from another origin and unavailable providers", async () => {
    const { deps, request } = fixture();
    expect((await startNativeReauthentication(request(undefined, { origin: "https://attacker.test" }), deps)).status).toBe(400);
    expect((await startNativeReauthentication(request({ provider: "apple", locale: "ko" }), deps)).status).toBe(403);
    expect((await startNativeReauthentication(request(undefined, { authorization: "" }), deps)).status).toBe(401);
  });

  it("does not consume malformed or duplicate browser tokens", async () => {
    const { deps, call } = fixture();
    for (const query of ["", "handoff=short", `handoff=${"a".repeat(43)}&handoff=${"b".repeat(43)}`]) {
      expect((await consumeNativeReauthentication(new Request(`${origin}/api/auth/apple/reauth/native/consume?${query}`), deps)).status).toBe(400);
    }
    expect(call).not.toHaveBeenCalled();
  });

  it("only returns an allowlisted app destination with opaque correlation state", () => {
    expect(nativeReauthenticationReturn({ nativeReauth: "https://attacker.test", reauth: "complete" })).toBeNull();
    expect(nativeReauthenticationReturn({ nativeReauth: ["a".repeat(43)], reauth: "complete" })).toBeNull();
    expect(nativeReauthenticationReturn({ nativeReauth: "a".repeat(43), reauth: "unknown" })).toBeNull();
    expect(nativeReauthenticationReturn({ nativeReauth: "a".repeat(43), reauth: "failed" })).toBe(`kyaa-app:///auth/reauth?state=${"a".repeat(43)}`);
  });
});
