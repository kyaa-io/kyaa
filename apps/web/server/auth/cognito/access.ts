import "server-only";
import { loadServerEnv } from "../../config/env";
import { cognitoConfig } from "./config";
import { createCognitoVerifier, cognitoDenied } from "./verifier";
import { resolveKyaaMember } from "./kyaa-identity";

/** Cognito access token -> active kyaa member. Local JWT check (cached JWKS) and one DB read; no Privy call. */
export async function resolveCognitoAccess(token: string) {
  const identity = await createCognitoVerifier(cognitoConfig())(token);
  const member = await resolveKyaaMember(identity, loadServerEnv().GIWA_CHAIN_ID);
  if (!member) throw cognitoDenied();
  return { identity, member };
}
