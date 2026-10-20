import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createSupabaseFanAuthRepository } from "./supabase-fan-auth-repository";

function queryResult(data: unknown, error: unknown = null) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    maybeSingle: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({ data, error });
  return query;
}

describe("Supabase fan auth repository", () => {
  it("resolves the canonical app user by verified Privy subject", async () => {
    const query = queryResult({
      id: "054dbe1b-a924-4957-bdbf-474906737a5e",
      privy_user_id: "did:privy:fan",
      verified_email: "fan@example.com",
      status: "active",
    });
    const client = { from: vi.fn((table: string) => table === "app_user_moderation_restrictions" ? queryResult(null) : query) };
    const repository = createSupabaseFanAuthRepository(
      { url: "https://example.supabase.co", serviceRoleKey: "unused-in-test" },
      client as never,
    );

    await expect(repository.findUserByPrivyId("did:privy:fan")).resolves.toStrictEqual({
      id: "054dbe1b-a924-4957-bdbf-474906737a5e",
      privyUserId: "did:privy:fan",
      verifiedEmail: "fan@example.com",
      status: "active",
    });
    expect(client.from).toHaveBeenCalledWith("app_users");
    expect(query.select).toHaveBeenCalledWith("id, privy_user_id, verified_email, status");
    expect(query.eq).toHaveBeenCalledWith("privy_user_id", "did:privy:fan");
  });

  it("returns null for an unknown subject and hides database details", async () => {
    const missing = queryResult(null);
    await expect(
      createSupabaseFanAuthRepository(
        { url: "https://example.supabase.co", serviceRoleKey: "unused-in-test" },
        { from: () => missing } as never,
      ).findUserByPrivyId("did:privy:missing"),
    ).resolves.toBeNull();

    const failed = queryResult(null, { message: "service role secret" });
    await expect(
      createSupabaseFanAuthRepository(
        { url: "https://example.supabase.co", serviceRoleKey: "unused-in-test" },
        { from: () => failed } as never,
      ).findUserByPrivyId("did:privy:fan"),
    ).rejects.toThrow("Fan identity lookup failed");
  });
});

it("denies restricted identities and fails closed on restriction lookup errors", async () => {
  for (const restriction of [queryResult({ app_user_id: "owner" }), queryResult(null, { message: "private" })]) {
    const identity = queryResult({ id: "owner", privy_user_id: "did:privy:owner", status: "active" });
    const repository = createSupabaseFanAuthRepository({url:"https://example.supabase.co",serviceRoleKey:"unused"}, {from:(table:string)=>table === "app_users" ? identity : restriction} as never);
    const result = repository.findUserByPrivyId("did:privy:owner");
    if ((await restriction.maybeSingle()).error) await expect(result).rejects.toThrow("Fan moderation lookup failed");
    else await expect(result).resolves.toBeNull();
  }
});

it("keeps the dedicated account-deletion lookup available for restricted users", async () => {
  const identity = queryResult({ id: "owner", privy_user_id: "did:privy:owner", status: "active" });
  const from = vi.fn(() => identity);
  const repository = createSupabaseFanAuthRepository({ url: "https://example.supabase.co", serviceRoleKey: "unused", allowModerationRestricted: true }, { from } as never);
  expect(await repository.findUserByPrivyId("did:privy:owner")).toMatchObject({ id: "owner" });
  expect(from).toHaveBeenCalledTimes(1);
});
