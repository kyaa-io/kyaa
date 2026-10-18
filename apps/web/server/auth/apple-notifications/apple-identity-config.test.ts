import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

beforeEach(() => {
  vi.resetModules();
  for (const key of ["APPLE_TEAM_ID", "APPLE_PRIMARY_APP_ID", "APPLE_SERVICE_ID", "APPLE_KEY_ID"]) vi.stubEnv(key, undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("Apple app identity isolation", () => {
  it("preserves the existing ByUs identity when no override is configured", async () => {
    const identity = await import("./apple-lifecycle");
    expect(identity.APPLE_NOTIFICATION_AUDIENCES).toEqual(["kr.byus.app", "kr.byus.web"]);
    expect(identity.providerSubjectHash("apple", "subject")).toBe(identity.sha256("apple:7RFN3TFR5K:kr.byus.app:subject"));
  });

  it("binds native Dev recovery and notification audiences to the configured app", async () => {
    vi.stubEnv("APPLE_TEAM_ID", "7RFN3TFR5K");
    vi.stubEnv("APPLE_PRIMARY_APP_ID", "kr.kyaa.app");
    vi.stubEnv("APPLE_SERVICE_ID", "kr.kyaa.web");
    vi.stubEnv("APPLE_KEY_ID", "LJ3VAQYLP7");
    const identity = await import("./apple-lifecycle");
    const provider = await import("./reauthentication-provider");
    expect(identity.APPLE_NOTIFICATION_AUDIENCES).toEqual(["kr.kyaa.app", "kr.kyaa.web"]);
    expect(identity.APPLE_KEY_ID).toBe("LJ3VAQYLP7");
    expect(identity.providerSubjectHash("apple", "subject")).toBe(identity.sha256("apple:7RFN3TFR5K:kr.kyaa.app:subject"));
    const url = new URL(provider.reauthenticationAuthorizationUrl({ provider: "apple", state: "state", nonce: "nonce", config: { origin: "https://internal.example.com", googleClientId: "test.apps.googleusercontent.com", googleClientSecret: "test-only", applePrivateKey: "unused-in-authorization" } }));
    expect(url.searchParams.get("client_id")).toBe("kr.kyaa.web");
  });

  it("rejects malformed configured identities before accepting notifications", async () => {
    vi.stubEnv("APPLE_PRIMARY_APP_ID", "https://untrusted.example/app");
    await expect(import("./apple-lifecycle")).rejects.toThrow();
  });
});
