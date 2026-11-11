import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../../config/env", () => ({ loadServerEnv: () => { throw new Error("env must not be read when options are given"); } }));
vi.mock("./identity-repository", () => ({ identityDatabase: () => { throw new Error("default database must not be used"); } }));
import { HDKey } from "viem/accounts";
import { createAddressIssuer } from "../../wallet/address-issuer";
import { resolveKyaaMember, signInKyaaMember, SignInBlockedError } from "./kyaa-identity";

const xpub = HDKey.fromMasterSeed(new Uint8Array(32).fill(9)).derive("m/44'/60'/0'").publicExtendedKey;
const issuer = "https://cognito-idp.ap-northeast-2.amazonaws.com/ap-northeast-2_pool";
const identity = { issuer, subject: "cognito-sub", email: "fan@example.test", tokenId: "jti", provider: { name: "google" as const, issuer: "https://accounts.google.com", subject: "g-1" } };
const member = { appUserId: "11111111-1111-4111-8111-111111111111", identityKey: "did:privy:old", verifiedEmail: "fan@example.test", walletAddress: `0x${"1".repeat(40)}`, chainId: 91342, providerAccounts: [{ issuer: "https://accounts.google.com", subject: "g-1" }] };
function database(responses: Record<string, unknown>) {
  const rpc = vi.fn(async (name: string) => (name in responses ? { data: responses[name], error: null } : { data: null, error: { message: "unexpected" } }));
  return { rpc };
}

describe("signInKyaaMember", () => {
  it("links an existing member by its verified provider subject and returns the original DID and wallet", async () => {
    const db = database({ kyaa_sign_in: { mode: "linked", appUserId: member.appUserId }, resolve_kyaa_identity: member });
    await expect(signInKyaaMember(identity, { chainId: 91342, xpub, db })).resolves.toEqual(member);
    expect(db.rpc).toHaveBeenCalledWith("kyaa_sign_in", { p_issuer: issuer, p_subject: "cognito-sub", p_provider_issuer: "https://accounts.google.com", p_provider_subject: "g-1", p_verified_email: "fan@example.test", p_chain_id: 91342 });
    expect(db.rpc.mock.calls.map(([name]) => name)).not.toContain("create_kyaa_member");
  });
  it("creates a new member with the address derived at the reserved index", async () => {
    const created = { ...member, identityKey: "kyaa:7c9e6679-7425-40de-944b-e07fc1f90ae7", walletAddress: createAddressIssuer(xpub).addressAt(5) };
    const db = database({ kyaa_sign_in: { mode: "new", derivationIndex: 5 }, create_kyaa_member: created });
    await expect(signInKyaaMember(identity, { chainId: 91342, xpub, db })).resolves.toEqual(created);
    expect(db.rpc).toHaveBeenLastCalledWith("create_kyaa_member", expect.objectContaining({ p_derivation_index: 5, p_wallet_address: createAddressIssuer(xpub).addressAt(5) }));
  });
  it("never creates a member without a configured issuance key", async () => {
    const db = database({ kyaa_sign_in: { mode: "new", derivationIndex: 0 } });
    await expect(signInKyaaMember(identity, { chainId: 91342, xpub: "", db })).rejects.toThrow("Wallet issuance is not configured");
    expect(db.rpc).toHaveBeenCalledTimes(1);
  });
  it.each(["email_in_use", "inactive", "ambiguous", "wallet_missing"] as const)("reports a blocked sign-in (%s) without creating anything", async (reason) => {
    const db = database({ kyaa_sign_in: { mode: "blocked", reason } });
    await expect(signInKyaaMember(identity, { chainId: 91342, xpub, db })).rejects.toEqual(new SignInBlockedError(reason));
    expect(db.rpc).toHaveBeenCalledTimes(1);
  });
  it("requires a federated provider subject and email", async () => {
    const db = database({});
    await expect(signInKyaaMember({ ...identity, provider: undefined }, { chainId: 91342, xpub, db })).rejects.toMatchObject({ reason: "provider_required" });
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("maps a database conflict to a review error, not a merge", async () => {
    const db = { rpc: vi.fn(async (name: string) => name === "kyaa_sign_in" ? { data: { mode: "new", derivationIndex: 1 }, error: null } : { data: null, error: { message: "IDENTITY_LINK_CONFLICT" } }) };
    await expect(signInKyaaMember(identity, { chainId: 91342, xpub, db })).rejects.toMatchObject({ status: 409 });
  });
});

describe("resolveKyaaMember", () => {
  it("returns null for an unknown or inactive identity and fails closed on storage errors", async () => {
    await expect(resolveKyaaMember(identity, 91342, database({ resolve_kyaa_identity: null }))).resolves.toBeNull();
    await expect(resolveKyaaMember(identity, 91342, database({}))).rejects.toThrow("Identity service unavailable");
  });
});
