import "server-only";
import { z } from "zod";
import { loadServerEnv } from "../../config/env";
import { identityDatabase } from "./identity-repository";
import { digest, opaque, rpc } from "./browser-session";
import type { CognitoIdentity } from "./verifier";

export async function classifyEnrollment(identity: CognitoIdentity) {
  const pending=await rpc(identityDatabase(),"read_cognito_pending_identity",{p_issuer:identity.issuer,p_subject:identity.subject});
  if(typeof pending==="string")return{mode:"recovery" as const,expectedPrivyUserId:pending,provider:identity.provider?.name};
  const blocked={mode:"blocked" as const};
  if(!identity.provider || !identity.email)return blocked;
  const result=z.object({mode:z.enum(["new","recovery","blocked"]),expectedPrivyUserId:z.string().optional()}).parse(await rpc(identityDatabase(),"classify_cognito_enrollment",{p_provider_issuer:identity.provider.issuer,p_provider_subject:identity.provider.subject,p_verified_email:identity.email}));
  if(result.mode!=="new")return{...result,provider:identity.provider.name};
  if(!loadServerEnv().COGNITO_ENROLLMENT_ENABLED)return blocked;
  const permit=opaque();
  await rpc(identityDatabase(),"create_cognito_enrollment_permit",{p_token_hash:digest(permit),p_issuer:identity.issuer,p_subject:identity.subject,p_provider_issuer:identity.provider.issuer,p_provider_subject:identity.provider.subject,p_verified_email:identity.email});
  return{mode:"new" as const,provider:identity.provider.name,permit};
}
