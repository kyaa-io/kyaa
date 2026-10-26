import "server-only";
import { randomUUID } from "node:crypto";
import { InitiateAuthCommand, RevokeTokenCommand, CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";
import { AuthError } from "../../../features/auth/domain/auth-errors";
import { fanProfileSchema } from "../../../features/profile/domain/profile";
import { emailCognitoConfig } from "./config";
import { createCognitoVerifier,cognitoDenied } from "./verifier";
import { identityDatabase } from "./identity-repository";
import { digest,opaque,rpc,seal,unseal } from "./browser-session";

const PREFIX="kyaa-email:";
export const emailSessionIssuer=(origin:string)=>`${origin}/auth/email`;
export function isCognitoEmailToken(token:string):boolean{
  if(!token.startsWith(PREFIX))return false;
  try{const payload=JSON.parse(Buffer.from(token.slice(PREFIX.length).split(".")[1],"base64url").toString("utf8"));return payload.auth_source==="cognito-email";}catch{return false;}
}
const storedSchema=z.object({accessToken:z.string(),idToken:z.string(),refreshToken:z.string(),subject:z.string(),legacyUserId:z.uuid()});
const rowSchema=z.object({sessionId:z.uuid(),legacyUserId:z.uuid(),encryptedSession:z.string()});
const ownerSchema=z.object({appUserId:z.uuid(),privyUserId:z.string().startsWith("did:privy:")});
const configuration=emailCognitoConfig;
export async function signEmailSession(input:{sessionId:string;legacyUserId:string;expiresAt:number},config:{origin:string;cookieSecret:string}){
  return PREFIX+await new SignJWT({auth_source:"cognito-email",session_id:input.sessionId}).setProtectedHeader({alg:"HS256",typ:"JWT"}).setIssuer(emailSessionIssuer(config.origin)).setAudience("kyaa-mobile-email").setSubject(input.legacyUserId).setIssuedAt().setExpirationTime(input.expiresAt).sign(Buffer.from(config.cookieSecret,"base64"));
}
export async function emailSessionClaims(token:string,config:{origin:string;cookieSecret:string}){
  try{
    if(!token.startsWith(PREFIX)||token.length>16_384)throw cognitoDenied();
    const {payload}=await jwtVerify(token.slice(PREFIX.length),Buffer.from(config.cookieSecret,"base64"),{issuer:emailSessionIssuer(config.origin),audience:"kyaa-mobile-email",algorithms:["HS256"],requiredClaims:["exp","iat","sub","session_id"]});
    if(payload.auth_source!=="cognito-email")throw cognitoDenied();
    return z.object({sub:z.uuid(),session_id:z.uuid(),exp:z.number()}).parse(payload);
  }catch{throw cognitoDenied();}
}
export async function authenticateCognitoEmail(token:string,acceptedDeletion=false){
  const config=configuration(),db=identityDatabase(),claims=await emailSessionClaims(token,config);
  const session=await rpc(db,"read_cognito_email_session",{p_session_id:claims.session_id,p_refresh_hash:null});
  if(session===null)throw cognitoDenied();
  const row=rowSchema.parse(session);
  if(row.legacyUserId!==claims.sub)throw cognitoDenied();
  const stored=storedSchema.parse(unseal(row.encryptedSession,config.cookieSecret));
  if(stored.legacyUserId!==claims.sub)throw cognitoDenied();
  const identity=await createCognitoVerifier(config)(stored.accessToken);
  if(identity.subject!==stored.subject)throw cognitoDenied();
  if(acceptedDeletion){
    if(await rpc(db,"has_approved_email_account_deletion",{p_supabase_user_id:claims.sub})!==true)throw cognitoDenied();
    return{appUserId:"",privyUserId:`supabase-email:${claims.sub}`,supabaseUserId:claims.sub};
  }
  const id=await createCognitoVerifier(config)(stored.idToken,"id");
  if(id.subject!==identity.subject || !id.email)throw cognitoDenied();
  const resolved=await rpc(db,"resolve_cognito_email_owner",{p_legacy_user_id:claims.sub,p_issuer:identity.issuer,p_subject:identity.subject,p_verified_email:id.email});
  if(resolved===null)throw cognitoDenied();
  const owner=ownerSchema.parse(resolved);
  return{...owner,supabaseUserId:claims.sub};
}
function providerFailure(error:unknown):never{
  const name=error instanceof Error?error.name:"";
  if(name==="TooManyRequestsException")throw new AuthError("AUTH_RATE_LIMITED",429,"Try again later");
  if(["NotAuthorizedException","UserNotFoundException","PasswordResetRequiredException","UserNotConfirmedException"].includes(name))throw cognitoDenied();
  throw new Error("Email authentication unavailable");
}
export async function cognitoEmailOperation(action:"login"|"refresh"|"logout",input:{email?:string;password?:string;refreshToken?:string;locale?:string;accessToken?:string}){
  const config=configuration(),db=identityDatabase(),client=new CognitoIdentityProviderClient({region:config.region,maxAttempts:2,requestHandler:{connectionTimeout:3000,requestTimeout:8000}});
  if(action==="logout"){
    const claims=await emailSessionClaims(input.accessToken??"",config);
    const session=await rpc(db,"read_cognito_email_session",{p_session_id:claims.session_id,p_refresh_hash:null});
    if(session===null)throw cognitoDenied();
    const row=rowSchema.parse(session);
    const stored=storedSchema.parse(unseal(row.encryptedSession,config.cookieSecret));
    if(stored.legacyUserId!==claims.sub)throw cognitoDenied();
    try{await client.send(new RevokeTokenCommand({ClientId:config.clientId,Token:stored.refreshToken}));}catch(error){providerFailure(error);}
    await rpc(db,"revoke_cognito_email_session",{p_session_id:claims.session_id});return null;
  }
  let previous:z.infer<typeof rowSchema>|undefined,refreshToken=input.refreshToken;
  let old:z.infer<typeof storedSchema>|undefined;
  if(action==="refresh"){
    if(!refreshToken || !/^[A-Za-z0-9_-]{43}$/.test(refreshToken))throw cognitoDenied();
    const session=await rpc(db,"read_cognito_email_session",{p_session_id:null,p_refresh_hash:digest(refreshToken)});
    if(session===null)throw cognitoDenied();
    previous=rowSchema.parse(session);
    old=storedSchema.parse(unseal(previous.encryptedSession,config.cookieSecret));
  }
  let result;
  try{result=await client.send(new InitiateAuthCommand({ClientId:config.clientId,AuthFlow:action==="login"?"USER_PASSWORD_AUTH":"REFRESH_TOKEN_AUTH",AuthParameters:action==="login"?{USERNAME:input.email!,PASSWORD:input.password!}:{REFRESH_TOKEN:old!.refreshToken}}));}catch(error){providerFailure(error);}
  const tokens=result.AuthenticationResult;
  if(!tokens?.AccessToken || !tokens.IdToken || !tokens.ExpiresIn || (!tokens.RefreshToken && !old))throw cognitoDenied();
  const verify=createCognitoVerifier(config);
  const [identity,id]=await Promise.all([verify(tokens.AccessToken),verify(tokens.IdToken,"id")]);
  if(identity.subject!==id.subject || !id.email || (old && old.subject!==identity.subject))throw cognitoDenied();
  // This immutable claim is written only by the password migration Lambda, never by an app client.
  const idClaims=JSON.parse(Buffer.from(tokens.IdToken.split(".")[1],"base64url").toString("utf8"));
  const legacyUserId=z.uuid().parse(idClaims["custom:legacy_user_id"]);
  if(old && old.legacyUserId!==legacyUserId)throw cognitoDenied();
  const resolved=await rpc(db,"resolve_cognito_email_owner",{p_legacy_user_id:legacyUserId,p_issuer:identity.issuer,p_subject:identity.subject,p_verified_email:id.email});
  if(resolved===null)throw cognitoDenied();
  const owner=ownerSchema.parse(resolved);
  const sessionId=randomUUID(),newRefresh=opaque(),expiresAt=Math.floor(Date.now()/1000)+tokens.ExpiresIn;
  const stored={accessToken:tokens.AccessToken,idToken:tokens.IdToken,refreshToken:tokens.RefreshToken??old!.refreshToken,subject:identity.subject,legacyUserId};
  await rpc(db,"write_cognito_email_session",{p_session_id:sessionId,p_legacy_user_id:legacyUserId,p_encrypted_session:seal(stored,config.cookieSecret),p_refresh_hash:digest(newRefresh),p_expires_at:new Date(expiresAt*1000).toISOString(),p_previous_refresh_hash:action==="refresh"?digest(refreshToken!):null});
  await rpc(db,"initialize_owned_preferred_locale",{p_app_user_id:owner.appUserId,p_locale:input.locale});
  const profile=fanProfileSchema.parse(await rpc(db,"get_owned_user_profile",{p_app_user_id:owner.appUserId}));
  return{accessToken:await signEmailSession({sessionId,legacyUserId,expiresAt},config),refreshToken:newRefresh,expiresAt,userId:`supabase:${legacyUserId}`,appUserId:owner.appUserId,profile};
}
