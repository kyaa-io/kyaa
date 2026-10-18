import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AuthError } from "../../features/auth/domain/auth-errors";
import { createMobileAccountInfoHandler } from "./account-info";

const appUserId = "11111111-1111-4111-8111-111111111111";
const account = {
  verifiedEmail: "fan@example.com",
  privyUserId: "did:privy:owner",
  lastAuthenticatedAt: "2026-10-12T00:41:00.000Z",
  publicAddress: "0x1234567890abcdef1234567890abcdef12345678",
  passportCount: 2,
  activityCount: 42,
};

function setup() {
  const authorize = vi.fn(async () => ({ appUserId }));
  const find = vi.fn(async () => account);
  const readProviders = vi.fn<
    (ids: string[]) => Promise<
      Map<string, Array<"google" | "apple" | "email"> | null>
    >
  >(async () => new Map([[account.privyUserId, ["google"]]]));
  return {
    authorize,
    find,
    readProviders,
    run: createMobileAccountInfoHandler({
      authorize,
      repository: { find },
      readProviders,
    }),
  };
}

describe("mobile owner account info", () => {
  it("returns only the authorized account identity and real authentication time", async () => {
    const { run, find, readProviders } = setup();
    const response = await run(new Request("https://byus.test/api/me/mobile-profile/account", {
      headers: { authorization: "Bearer token" },
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(find).toHaveBeenCalledWith(appUserId);
    expect(readProviders).toHaveBeenCalledWith([account.privyUserId]);
    expect(await response.json()).toEqual({ account: {
      email: "fan@example.com",
      loginProviders: ["google"],
      lastAuthenticatedAt: account.lastAuthenticatedAt,
      publicAddress: account.publicAddress,
      passportCount: 2,
      activityCount: 42,
    } });
  });

  it("does not query private account data when owner authorization fails", async () => {
    const fixture = setup();
    fixture.authorize.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", 401, "private"));
    const response = await fixture.run(new Request("https://byus.test/api/me/mobile-profile/account"));
    expect(response.status).toBe(401);
    expect(fixture.find).not.toHaveBeenCalled();
    expect(fixture.readProviders).not.toHaveBeenCalled();
  });

  it("keeps provider outage distinct from an actually unlinked account", async () => {
    const fixture = setup();
    fixture.readProviders.mockResolvedValue(new Map([[account.privyUserId, null]]));
    const response = await fixture.run(new Request("https://byus.test/api/me/mobile-profile/account", {
      headers: { authorization: "Bearer token" },
    }));
    expect(await response.json()).toMatchObject({ account: { loginProviders: null } });
  });
});
