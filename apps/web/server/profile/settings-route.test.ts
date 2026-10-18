import { describe, expect, it, vi } from "vitest";
import { APP_LOCALES } from "../../i18n/locales";
vi.mock("server-only", () => ({}));
import { AuthError } from "../../features/auth/domain/auth-errors";
import { createGetSettingsHandler } from "./settings-route";

describe("FAN-020 settings route", () => {
  it("returns only nickname and a masked wallet summary", async () => {
    const repository = {
      get: vi.fn().mockResolvedValue({
        nickname: "Kamilia",
        preferredLocale: "en",
        wallet: { chainId: 91342, maskedAddress: "0x1234…cdef" },
      }),
      setPreferredLocale: vi.fn(),
    };
    const response = await createGetSettingsHandler({
      authorize: vi.fn().mockResolvedValue({ appUserId: "user-1" }),
      repository,
    })(
      new Request("https://byus.kr/api/me/settings", {
        headers: { authorization: "Bearer valid" },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      settings: {
        nickname: "Kamilia",
        preferredLocale: "en",
        wallet: { chainId: 91342, maskedAddress: "0x1234…cdef" },
      },
    });
  });

  it("rejects unauthenticated requests without consulting storage", async () => {
    const repository = { get: vi.fn(), setPreferredLocale: vi.fn() };
    const response = await createGetSettingsHandler({
      authorize: vi
        .fn()
        .mockRejectedValue(
          new AuthError("AUTHENTICATION_REQUIRED", 401, "required"),
        ),
      repository,
    })(new Request("https://byus.kr/api/me/settings"));
    expect(response.status).toBe(401);
    expect(repository.get).not.toHaveBeenCalled();
  });

  it.each(APP_LOCALES)("persists authenticated %s preferred locale", async (locale) => {
    const repository = {
      get: vi.fn(),
      setPreferredLocale: vi.fn().mockResolvedValue(locale),
    };
    const { createPatchSettingsHandler } = await import("./settings-route");
    const response = await createPatchSettingsHandler({
      authorize: vi.fn().mockResolvedValue({ appUserId: "user-1" }),
      repository,
    })(
      new Request("https://byus.kr/api/me/settings", {
        method: "PATCH",
        headers: {
          authorization: "Bearer valid",
          "content-type": "application/json",
        },
        body: JSON.stringify({ preferredLocale: locale }),
      }),
    );

    expect(response.status).toBe(200);
    expect(repository.setPreferredLocale).toHaveBeenCalledWith("user-1", locale);
    expect(await response.json()).toEqual({
      settings: { preferredLocale: locale },
    });
  });

  it.each(["de", null, 1])("rejects invalid preferred locale %s", async (preferredLocale) => {
    const repository = { get: vi.fn(), setPreferredLocale: vi.fn() };
    const { createPatchSettingsHandler } = await import("./settings-route");
    const response = await createPatchSettingsHandler({
      authorize: vi.fn().mockResolvedValue({ appUserId: "user-1" }),
      repository,
    })(
      new Request("https://byus.kr/api/me/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ preferredLocale }),
      }),
    );

    expect(response.status).toBe(400);
    expect(repository.setPreferredLocale).not.toHaveBeenCalled();
  });
});
