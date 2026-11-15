import "server-only";
import { z } from "zod";
import { loadServerEnv } from "../../config/env";
import { cognitoConfig } from "./config";
import { cognitoDenied, createCognitoVerifier, COGNITO_TOKEN_PREFIX } from "./verifier";
import { identityDatabase, readCognitoMapping } from "./identity-repository";
import { authHeaders, boundedAuthJson, challenge, digest, opaque, readSession, requireOrigin, revokeSession, rpc, seal, sessionSchema, unseal, writeSession } from "./browser-session";

const opaqueSchema=z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const stateSchema=z.string().regex(/^[A-Za-z0-9_-]{16,128}$/);
export async function nativeBridge(request:Request,operation:"issue"|"exchange"|"refresh"|"logout"):Promise<Response>{
  try{
    const config=cognitoConfig(),db=identityDatabase();
    const callback=loadServerEnv().COGNITO_NATIVE_REDIRECT_URI;
    if(!callback)throw cognitoDenied();
    const body=await boundedAuthJson(request);
    if(operation==="issue"){
      requireOrigin(request,config);
      const input=z.object({challenge:opaqueSchema,state:stateSchema}).strict().parse(body);
      const {session}=await readSession(request,config,db);
      const identity=await createCognitoVerifier(config)(session.idToken,"id");
      if(!await readCognitoMapping(identity,db))throw cognitoDenied();
      const code=opaque();
      await rpc(db,"create_cognito_native_handoff",{p_code_hash:digest(code),p_challenge:input.challenge,p_encrypted_session:seal(session,config.cookieSecret)});
      const url=new URL(callback);url.search=new URLSearchParams({code,state:input.state}).toString();
      return Response.json({redirectUrl:url.toString()},{headers:authHeaders()});
    }
    // Flutter uses HTTPS POST. Browser requests must remain same-origin.
    if(request.headers.has("origin"))requireOrigin(request,config);
    let key:string;
    if(operation==="exchange"){
      const input=z.object({code:opaqueSchema,verifier:z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/)}).strict().parse(body);
      const encrypted=await rpc(db,"consume_cognito_native_handoff",{p_code_hash:digest(input.code),p_challenge:challenge(input.verifier)});
      if(typeof encrypted!=="string")throw cognitoDenied();
      const session=sessionSchema.parse(unseal(encrypted,config.cookieSecret));
      const identity=await createCognitoVerifier(config)(session.idToken,"id");
      if(session.subject!==identity.subject || !await readCognitoMapping(identity,db))throw cognitoDenied();
      key=opaque();await writeSession(key,session,config,db);
    }else{
      key=z.object({sessionToken:opaqueSchema}).strict().parse(body).sessionToken;
    }
    if(operation==="logout"){
      await revokeSession(key,config,db);
      return Response.json({signedOut:true},{headers:authHeaders()});
    }
    const synthetic=new Request(config.origin,{headers:{cookie:`__Host-kyaa-cognito=${key}`}});
    const {session}=await readSession(synthetic,config,db);
    const identity=await createCognitoVerifier(config)(session.idToken,"id");
    const mapping=await readCognitoMapping(identity,db);
    if(!mapping)throw cognitoDenied();
    const {appUserId,privyUserId,walletAddress,chainId}=mapping;
    return Response.json({sessionToken:key,accessToken:COGNITO_TOKEN_PREFIX+session.accessToken,walletToken:session.idToken,expiresAt:session.expiresAt,appUserId,privyUserId,walletAddress,chainId},{headers:authHeaders()});
  }catch{return Response.json({error:{code:"INVALID_NATIVE_AUTH_HANDOFF"}},{status:401,headers:authHeaders()});}
}
