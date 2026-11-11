import "server-only";
import { z } from "zod";
import { AuthError } from "../../../features/auth/domain/auth-errors";
import { loadServerEnv } from "../../config/env";
import { createAddressIssuer } from "../../wallet/address-issuer";
import { identityDatabase, type IdentityRpc } from "./identity-repository";
import type { CognitoIdentity } from "./verifier";

const providerAccountSchema = z.object({ issuer: z.enum(["https://accounts.google.com", "https://appleid.apple.com", "https://kauth.kakao.com"]), subject: z.string().min(1).max(256) });
const memberSchema = z.object({
  appUserId: z.uuid(),
  identityKey: z.string().min(1),
  verifiedEmail: z.email(),
  walletAddress: z.string().regex(/^0x[a-f0-9]{40}$/).nullable(),
  chainId: z.number().int().positive().nullable(),
  providerAccounts: z.array(providerAccountSchema),
});
export type KyaaMember = z.infer<typeof memberSchema>;
export type SignInBlockReason = "inactive" | "ambiguous" | "email_in_use" | "wallet_missing" | "provider_required";
export class SignInBlockedError extends Error {
  constructor(readonly reason: SignInBlockReason) { super(`Sign-in blocked: ${reason}`); this.name = "SignInBlockedError"; }
}

async function call(db: IdentityRpc, name: string, args: Record<string, unknown>): Promise<unknown> {
  const result = await db.rpc(name, args);
  if (result.error) {
    if (result.error.message?.includes("IDENTITY_LINK_CONFLICT")) throw new AuthError("IDENTITY_LINK_CONFLICT", 409, "Account linking requires review");
    throw new Error("Identity service unavailable");
  }
  return result.data;
}

/** Request-time lookup: (Cognito issuer, subject) -> active member. No provider network call. */
export async function resolveKyaaMember(identity: Pick<CognitoIdentity, "issuer" | "subject">, chainId: number, db: IdentityRpc = identityDatabase()): Promise<KyaaMember | null> {
  const data = await call(db, "resolve_kyaa_identity", { p_issuer: identity.issuer, p_subject: identity.subject, p_chain_id: chainId });
  return data === null ? null : memberSchema.parse(data);
}

const signInSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("linked"), appUserId: z.uuid() }),
  z.object({ mode: z.literal("new"), derivationIndex: z.number().int().min(0) }),
  z.object({ mode: z.literal("blocked"), reason: z.enum(["inactive", "ambiguous", "email_in_use", "wallet_missing"]) }),
]);

/**
 * After a verified Cognito callback: link to the existing member by exact Google/Apple subject, or create a new member
 * with a server-issued wallet address. A matching email alone never links (blocked: email_in_use).
 */
export async function signInKyaaMember(identity: CognitoIdentity, options: { chainId?: number; xpub?: string; db?: IdentityRpc } = {}): Promise<KyaaMember> {
  const env = options.chainId === undefined || options.xpub === undefined ? loadServerEnv() : null;
  const chainId = options.chainId ?? env!.GIWA_CHAIN_ID;
  const db = options.db ?? identityDatabase();
  if (!identity.provider || !identity.email) throw new SignInBlockedError("provider_required");
  const provider = identity.provider;
  const result = signInSchema.parse(await call(db, "kyaa_sign_in", {
    p_issuer: identity.issuer, p_subject: identity.subject, p_provider_issuer: provider.issuer, p_provider_subject: provider.subject,
    p_verified_email: identity.email, p_chain_id: chainId,
  }));
  if (result.mode === "blocked") throw new SignInBlockedError(result.reason);
  if (result.mode === "new") {
    const xpub = options.xpub ?? env!.KYAA_WALLET_XPUB;
    if (!xpub) throw new Error("Wallet issuance is not configured");
    const walletAddress = createAddressIssuer(xpub).addressAt(result.derivationIndex);
    return memberSchema.parse(await call(db, "create_kyaa_member", {
      p_issuer: identity.issuer, p_subject: identity.subject, p_provider_issuer: provider.issuer, p_provider_subject: provider.subject,
      p_verified_email: identity.email, p_chain_id: chainId, p_derivation_index: result.derivationIndex, p_wallet_address: walletAddress,
    }));
  }
  const member = await resolveKyaaMember(identity, chainId, db);
  if (!member) throw new SignInBlockedError("inactive");
  return member;
}
