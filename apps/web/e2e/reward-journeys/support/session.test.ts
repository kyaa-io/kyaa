import { describe, expect, it, vi } from "vitest";
import { sessionToken } from "./session";

describe("email browser session contract", () => {
  it("accepts an authenticated cookie session and keeps the cookie on the session request", async () => {
    const fetcher = vi.fn(async () => Response.json({ authenticated: true, accessToken: "kyaa-email:fixture" }));
    expect(await sessionToken("http://localhost:3002", "__Host-kyaa-email=opaque", fetcher as typeof fetch)).toBe("kyaa-email:fixture");
    expect(fetcher).toHaveBeenCalledWith("http://localhost:3002/api/auth/cognito/session", { headers: { cookie: "__Host-kyaa-email=opaque" }, redirect: "error" });
  });
  it("rejects a login-shaped response with no session token", async () => {
    await expect(sessionToken("http://localhost:3002", "__Host-kyaa-email=opaque", async () => Response.json({ authenticated: true }))).rejects.toThrow("REWARD_E2E_SESSION_INVALID");
  });
});
