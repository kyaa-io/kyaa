import { describe, expect, it, vi } from "vitest";
import { APP_LOCALES } from "../../i18n/locales";

vi.mock("server-only", () => ({}));

import { SupabaseSettingsRepository } from "./settings-repository";

function queryResult(data: unknown) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
  };
  return query;
}

describe("SupabaseSettingsRepository", () => {
  it.each(APP_LOCALES)("returns persisted %s locale and masks wallet data", async (locale) => {
    const queries = {
      user_profiles: queryResult({ nickname: "Kamilia" }),
      user_wallets: queryResult({
        chain_id: 91342,
        address: "0x1234567890abcdef1234567890abcdef1234cdef",
      }),
      app_users: queryResult({ preferred_locale: locale }),
    };
    const repository = new SupabaseSettingsRepository({
      from: vi.fn((table: keyof typeof queries) => queries[table]),
      rpc: vi.fn(),
    });

    await expect(repository.get("user-1")).resolves.toEqual({
      nickname: "Kamilia",
      preferredLocale: locale,
      wallet: { chainId: 91342, maskedAddress: "0x1234…cdef" },
    });
  });

  it("uses Korean only as the read fallback for an uninitialized locale", async () => {
    const queries = {
      user_profiles: queryResult({ nickname: "Kamilia" }),
      user_wallets: queryResult(null),
      app_users: queryResult({ preferred_locale: null }),
    };
    const repository = new SupabaseSettingsRepository({
      from: vi.fn((table: keyof typeof queries) => queries[table]),
      rpc: vi.fn(),
    });

    await expect(repository.get("user-1")).resolves.toMatchObject({
      preferredLocale: "ko",
    });
  });

  it.each(APP_LOCALES)("updates %s locale through the owner-scoped database function", async (locale) => {
    const rpc = vi.fn().mockResolvedValue({ data: locale, error: null });
    const repository = new SupabaseSettingsRepository({
      from: vi.fn(),
      rpc,
    });

    await expect(repository.setPreferredLocale("user-1", locale)).resolves.toBe(
      locale,
    );
    expect(rpc).toHaveBeenCalledWith("set_owned_preferred_locale", {
      p_app_user_id: "user-1",
      p_locale: locale,
    });
  });
});
