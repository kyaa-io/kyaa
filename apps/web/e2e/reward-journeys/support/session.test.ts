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

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { storedCredential } from "./session";
describe("fan cookie smoke credentials", () => {
  it.each([false, true])("uses our valid cookie when Privy is missing or expired (%s)", (expired) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kyaa-smoke-session-"));
    const file = path.join(directory, "state.json");
    try {
      const jwt = `e30.${Buffer.from(JSON.stringify({ exp: 1 })).toString("base64url")}.signature`;
      fs.writeFileSync(file, JSON.stringify({ cookies: [{ name: "__Host-kyaa-fan-session", value: "sealed-fixture", domain: "localhost", expires: Date.now() / 1000 + 3600 }], origins: [{ localStorage: expired ? [{ name: "privy:token", value: JSON.stringify(jwt) }] : [] }] }));
      expect(storedCredential(file)).toEqual({ token: "kyaa-session", cookie: "__Host-kyaa-fan-session=sealed-fixture" });
    } finally { fs.rmSync(directory, { recursive: true }); }
  });
});
