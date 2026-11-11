import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { TextEncoder as NodeTextEncoder } from "node:util";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// jsdom's Uint8Array is from another realm than Node's TextEncoder output, which jose refuses (same fix as cognito/verifier.test.ts).
beforeAll(() => { Object.defineProperty(globalThis, "Uint8Array", { configurable: true, value: new NodeTextEncoder().encode("").constructor }); });

import { createPrivyTokenVerifier } from "./privy-jwks";

afterEach(() => { vi.restoreAllMocks(); });

describe("local Privy token check", () => {
  async function keys() {
    const { publicKey, privateKey } = await generateKeyPair("ES256");
    const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "ES256" };
    const sign = (sub = "did:privy:user-1") => new SignJWT({ sid: "s1" }).setProtectedHeader({ alg: "ES256", typ: "JWT", kid: "k1" })
      .setIssuer("privy.io").setAudience("app-1").setSubject(sub).setIssuedAt().setExpirationTime("1h").sign(privateKey);
    return { jwk, sign };
  }

  it("fetches the key set once and keeps the last good set when a refresh fails", async () => {
    const { jwk, sign } = await keys();
    let clock = Date.now();
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ keys: [jwk] })).mockRejectedValue(new Error("privy down"));
    vi.spyOn(console, "info").mockImplementation(() => {});
    const verify = createPrivyTokenVerifier("app-1", { fetcher, now: () => clock });
    await expect(verify(await sign())).resolves.toEqual({ app_id: "app-1", user_id: "did:privy:user-1", session_id: "s1" });
    await verify(await sign());
    expect(fetcher).toHaveBeenCalledTimes(1);
    clock += 2 * 60 * 60_000;
    await expect(verify(await sign())).resolves.toMatchObject({ user_id: "did:privy:user-1" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetcher).toHaveBeenCalledTimes(2);
    await expect(verify(await sign())).resolves.toMatchObject({ user_id: "did:privy:user-1" });
  });

  it("rejects a token signed by another key or for another app", async () => {
    const { jwk } = await keys();
    const other = await keys();
    vi.spyOn(console, "info").mockImplementation(() => {});
    const verify = createPrivyTokenVerifier("app-1", { fetcher: vi.fn(async () => Response.json({ keys: [jwk] })) });
    await expect(verify(await other.sign())).rejects.toThrow();
    await expect(createPrivyTokenVerifier("app-2", { fetcher: vi.fn(async () => Response.json({ keys: [jwk] })) })(await other.sign())).rejects.toThrow();
  });
});

