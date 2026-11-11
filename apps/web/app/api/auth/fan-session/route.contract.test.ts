import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ resolveFanSession: vi.fn(), findUserByPrivyId: vi.fn() }));
vi.mock("@/server/config/env", () => ({ loadServerEnv: () => ({
  PRIVY_APP_ID: "app-1", PRIVY_APP_SECRET: "secret-value", PRIVY_APP_ENVIRONMENT: "production", PRIVY_TEST_ACCOUNT_LOGIN_ENABLED: false,
  PRIVY_APPLE_LOGIN_ENABLED: false, NEXT_PUBLIC_APP_URL: "https://kyaa.io", AUTH_COOKIE_SECRET: Buffer.alloc(32, 7).toString("base64"),
  SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "service",
}) }));
vi.mock("@/server/auth/privy-node-verifier", () => ({ createPrivyNodeAccessVerifier: () => ({ resolveFanSession: state.resolveFanSession }) }));
vi.mock("@/server/fan-auth/supabase-fan-auth-repository", () => ({ createSupabaseFanAuthRepository: () => ({ findUserByPrivyId: state.findUserByPrivyId }) }));
import { fanSessionKey, openFanSession } from "@/server/auth/fan-session-cookie";
import { DELETE, POST } from "./route";

const UID = "11111111-1111-4111-8111-111111111111";
const req = (method: string, headers: Record<string, string>) => new Request("https://kyaa.io/api/auth/fan-session", { method, headers });
beforeEach(() => {
  vi.clearAllMocks();
  state.resolveFanSession.mockResolvedValue({
    privyUserId: "did:privy:user-1", sessionId: "s1", apple: null, google: null,
    identity: { privyUserId: "did:privy:user-1", verifiedEmail: "fan@example.com", providerAccounts: [], googleLinked: true },
  });
  state.findUserByPrivyId.mockResolvedValue({ id: UID, privyUserId: "did:privy:user-1", verifiedEmail: "fan@example.com", status: "active" });
});

it("answers 204 with a sealed cookie the server can open, keyed off AUTH_COOKIE_SECRET", async () => {
  const response = await POST(req("POST", { origin: "https://kyaa.io", authorization: "Bearer privy-jwt" }));
  expect(response.status).toBe(204);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const value = response.headers.get("set-cookie")!.split(";")[0].split("=")[1];
  const key = fanSessionKey(Buffer.alloc(32, 7).toString("base64"))!;
  expect(openFanSession(value, key)).toMatchObject({ v: 1, pid: "did:privy:user-1", uid: UID, sid: "s1" });
  expect(state.resolveFanSession).toHaveBeenCalledWith("privy-jwt");
});

it("refuses other origins, missing tokens and the sentinel before asking Privy", async () => {
  expect((await POST(req("POST", { origin: "https://evil.example", authorization: "Bearer privy-jwt" }))).status).toBe(403);
  expect((await POST(req("POST", { origin: "https://kyaa.io" }))).status).toBe(401);
  expect((await POST(req("POST", { origin: "https://kyaa.io", authorization: "Bearer kyaa-session" }))).status).toBe(401);
  expect(state.resolveFanSession).not.toHaveBeenCalled();
});

it("clears the cookie on DELETE and for a member who is no longer active", async () => {
  const cleared = await DELETE(req("DELETE", { origin: "https://kyaa.io" }));
  expect(cleared.status).toBe(204);
  expect(cleared.headers.get("set-cookie")).toContain("Max-Age=0");
  state.findUserByPrivyId.mockResolvedValueOnce({ id: UID, privyUserId: "did:privy:user-1", verifiedEmail: "fan@example.com", status: "disabled" });
  const refused = await POST(req("POST", { origin: "https://kyaa.io", authorization: "Bearer privy-jwt" }));
  expect(refused.status).toBe(403);
  expect(refused.headers.get("set-cookie")).toContain("Max-Age=0");
});
