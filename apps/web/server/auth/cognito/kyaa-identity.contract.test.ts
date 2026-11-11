import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../../config/env", () => ({ loadServerEnv: () => { throw new Error("unused"); } }));
vi.mock("./identity-repository", () => ({ identityDatabase: () => { throw new Error("unused"); } }));
import { HDKey } from "viem/accounts";
import { resolveKyaaMember, signInKyaaMember, SignInBlockedError } from "./kyaa-identity";

// Verbatim JSON returned by the local database after applying 20261224000000_kyaa_native_auth.sql inside a rolled-back
// transaction (2026-11-12, synthetic accounts). Keeps the route schemas honest about the real SQL shapes.
const SQL = {
  linked: {"mode": "linked", "appUserId": "5d9b25b2-c3e1-43d2-aaba-554619392b08"},
  legacyMember: {"chainId": 91342, "appUserId": "5d9b25b2-c3e1-43d2-aaba-554619392b08", "identityKey": "did:privy:contract-legacy", "verifiedEmail": "contract-legacy@example.test", "walletAddress": "0x1111111111111111111111111111111111111111", "providerAccounts": [{"issuer": "https://accounts.google.com", "subject": "g-contract"}]},
  newMode: {"mode": "new", "derivationIndex": 0},
  newMember: {"chainId": 91342, "appUserId": "adb31190-62c5-4ade-8cc5-0055c107b641", "identityKey": "kyaa:b314fb41-69e8-4f88-89b0-8b6a760fbc6e", "verifiedEmail": "contract-new@example.test", "walletAddress": "0x2222222222222222222222222222222222222222", "providerAccounts": [{"issuer": "https://appleid.apple.com", "subject": "a-contract"}]},
  blocked: {"mode": "blocked", "reason": "email_in_use"},
} as const;
const xpub = HDKey.fromMasterSeed(new Uint8Array(32).fill(3)).derive("m/44'/60'/0'").publicExtendedKey;
const identity = (provider: "google" | "apple", subject: string) => ({ issuer: "https://cognito-idp.ap-northeast-2.amazonaws.com/ap-northeast-2_contract", subject, email: "contract@example.test", tokenId: "jti",
  provider: { name: provider, issuer: provider === "google" ? "https://accounts.google.com" : "https://appleid.apple.com", subject: "s" } });
const db = (map: Record<string, unknown>) => ({ rpc: vi.fn(async (name: string) => ({ data: map[name], error: null })) });

it("parses the real linked, new, member and blocked responses", async () => {
  await expect(signInKyaaMember(identity("google", "c-legacy"), { chainId: 91342, xpub, db: db({ kyaa_sign_in: SQL.linked, resolve_kyaa_identity: SQL.legacyMember }) }))
    .resolves.toMatchObject({ identityKey: "did:privy:contract-legacy", walletAddress: "0x1111111111111111111111111111111111111111" });
  await expect(signInKyaaMember(identity("apple", "c-new"), { chainId: 91342, xpub, db: db({ kyaa_sign_in: SQL.newMode, create_kyaa_member: SQL.newMember }) }))
    .resolves.toMatchObject({ identityKey: expect.stringMatching(/^kyaa:/), providerAccounts: [{ issuer: "https://appleid.apple.com", subject: "a-contract" }] });
  await expect(signInKyaaMember(identity("google", "c-x"), { chainId: 91342, xpub, db: db({ kyaa_sign_in: SQL.blocked }) })).rejects.toEqual(new SignInBlockedError("email_in_use"));
  await expect(resolveKyaaMember(identity("google", "c-legacy"), 91342, db({ resolve_kyaa_identity: SQL.legacyMember }))).resolves.toMatchObject({ chainId: 91342 });
});
