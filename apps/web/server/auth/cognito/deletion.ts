import "server-only";
import { AdminDeleteUserCommand,CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { loadServerEnv } from "../../config/env";
import { cognitoConfig,emailCognitoConfig } from "./config";
import { createCognitoVerifier,cognitoDenied } from "./verifier";
import { identityDatabase } from "./identity-repository";
import { rpc } from "./browser-session";
export async function approvedCognitoDeletionSubject(token:string):Promise<string|null>{
  const identity=await createCognitoVerifier(cognitoConfig())(token);
  const result=await rpc(identityDatabase(),"approved_cognito_deletion_subject",{p_issuer:identity.issuer,p_subject:identity.subject});
  if(result===null)return null;if(typeof result!=="string" || !result.startsWith("did:privy:"))throw cognitoDenied();return result;
}
async function removeCognitoUser(subject:string,poolId?:string){
  const env=loadServerEnv();if(env.AUTH_PROVIDER!=="cognito")throw new Error("Cognito cleanup not configured");
  const pool=poolId??env.COGNITO_USER_POOL_ID!;
  const client=new CognitoIdentityProviderClient({region:pool.split("_")[0],maxAttempts:2,requestHandler:{connectionTimeout:3000,requestTimeout:8000}});
  try{await client.send(new AdminDeleteUserCommand({UserPoolId:pool,Username:subject}));}
  catch(error){if(!(error instanceof Error) || error.name!=="UserNotFoundException")throw new Error("Provider cleanup unavailable");}
}
export async function cleanupCognitoEmail(legacyUserId:string){
  const db=identityDatabase();const subject=await rpc(db,"cognito_email_cleanup_subject",{p_legacy_user_id:legacyUserId});
  if(typeof subject==="string")await removeCognitoUser(subject,emailCognitoConfig().userPoolId);
  await rpc(db,"disable_legacy_email_credential",{p_legacy_user_id:legacyUserId});
}
export async function cleanupCognitoSocial(privyUserId:string){
  if(process.env.AUTH_PROVIDER!=="cognito")return;
  const subjects=await rpc(identityDatabase(),"cognito_cleanup_subjects",{p_privy_user_id:privyUserId});
  if(!Array.isArray(subjects) || subjects.some(value=>typeof value!=="string"))throw new Error("Provider cleanup unavailable");
  for(const subject of subjects)await removeCognitoUser(subject);
}
