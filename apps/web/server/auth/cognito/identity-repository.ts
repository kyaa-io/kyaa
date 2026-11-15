import "server-only";
import { z } from "zod";
import { createClient } from "../../data/client";
import { loadServerEnv } from "../../config/env";
import { AuthError } from "../../../features/auth/domain/auth-errors";
import type { CognitoIdentity } from "./verifier";

const mappingSchema = z.object({ appUserId: z.uuid(), privyUserId: z.string().startsWith("did:privy:"), verifiedEmail: z.email(), walletAddress: z.string().regex(/^0x[a-f0-9]{40}$/), chainId: z.number().int().positive() });
export type CognitoMapping = z.infer<typeof mappingSchema>;
export interface IdentityRpc { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }> }
export function identityDatabase(): IdentityRpc {
  const env = loadServerEnv();
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }) as unknown as IdentityRpc;
}
export async function readCognitoMapping(identity: CognitoIdentity, db = identityDatabase()): Promise<CognitoMapping | null> {
  const result = await db.rpc("resolve_external_auth_identity", { p_issuer: identity.issuer, p_subject: identity.subject });
  if (result.error) throw new Error("Identity service unavailable");
  return result.data === null ? null : mappingSchema.parse(result.data);
}
export async function linkCognitoMapping(identity: CognitoIdentity, input: { privyUserId: string; walletAddress: string; chainId: number; permit?: string }, db = identityDatabase()): Promise<CognitoMapping> {
  const result = await db.rpc("link_external_auth_identity", { p_issuer: identity.issuer, p_subject: identity.subject, p_privy_user_id: input.privyUserId, p_wallet_address: input.walletAddress, p_chain_id: input.chainId, p_verified_email: identity.email, p_permit_hash: input.permit ? (await import("./browser-session")).digest(input.permit) : null });
  if (result.error) throw new AuthError("IDENTITY_LINK_CONFLICT", 409, "Account linking requires review");
  return mappingSchema.parse(result.data);
}
