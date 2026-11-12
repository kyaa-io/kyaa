import{TextEncoder as NodeTextEncoder}from"node:util";
import{afterEach,beforeAll,expect,it,vi}from"vitest";
vi.mock("server-only",()=>({}));
vi.mock("next/server",()=>({after:vi.fn()}));
const mock=vi.hoisted(()=>({provider:"privy",send:vi.fn(),rpc:vi.fn(),verify:vi.fn(),config:{issuer:"https://cognito-idp.ap-northeast-2.amazonaws.com/ap-northeast-2_pool",clientId:"browser-client",domain:"https://pool.auth.ap-northeast-2.amazoncognito.com",redirectUri:"https://kyaa.io/api/auth/cognito/callback",logoutUri:"https://kyaa.io/login",origin:"https://kyaa.io",cookieSecret:Buffer.alloc(32,7).toString("base64")}}));
vi.mock("@aws-sdk/client-cognito-identity-provider",async original=>({...await original<typeof import("@aws-sdk/client-cognito-identity-provider")>(),CognitoIdentityProviderClient:class{send=mock.send;}}));
vi.mock("../../config/env",()=>({loadServerEnv:()=>({EMAIL_AUTH_PROVIDER:"cognito",AUTH_PROVIDER:mock.provider,COGNITO_EMAIL_CLIENT_ID:"email-client",COGNITO_EMAIL_USER_POOL_ID:"ap-northeast-2_emailpool",COGNITO_USER_POOL_ID:"ap-northeast-2_pool"})}));
vi.mock("./config",()=>({emailCognitoConfig:()=>({...mock.config,issuer:"https://cognito-idp.ap-northeast-2.amazonaws.com/ap-northeast-2_emailpool",clientId:"email-client",region:"ap-northeast-2"})}));
vi.mock("./identity-repository",()=>({identityDatabase:()=>({rpc:mock.rpc})}));
vi.mock("./verifier",async original=>({...await original<typeof import("./verifier")>(),createCognitoVerifier:()=>mock.verify}));
import{authenticateCognitoEmail,cognitoEmailOperation,emailSessionClaims,signEmailSession}from"./email-session";
import{seal,digest}from"./browser-session";
import{session as browserSession}from"./browser-routes";
import{EMAIL_BROWSER_COOKIE}from"./email-browser";
const legacy="11111111-1111-4111-8111-111111111111",owner="22222222-2222-4222-8222-222222222222";
const idToken=`header.${Buffer.from(JSON.stringify({"custom:legacy_user_id":legacy})).toString("base64url")}.signature`;
beforeAll(()=>{Object.defineProperty(globalThis,"Uint8Array",{configurable:true,value:new NodeTextEncoder().encode("").constructor});});
afterEach(()=>{vi.resetAllMocks();mock.provider="privy";});
it("keeps the mobile DTO and old UUID while password verification moves to Cognito",async()=>{
 mock.send.mockResolvedValue({AuthenticationResult:{AccessToken:"cognito-access",IdToken:idToken,RefreshToken:"private-refresh",ExpiresIn:600}});
 mock.verify.mockResolvedValue({issuer:mock.config.issuer,subject:"cognito-owner",email:"old@example.test",tokenId:"jti"});
 mock.rpc.mockImplementation(async(name:string)=>({data:name==="resolve_cognito_email_owner"?{appUserId:owner,privyUserId:"did:privy:original"}:name==="get_owned_user_profile"?{completed:false,nickname:null}:null,error:null}));
 const result=await cognitoEmailOperation("login",{email:"old@example.test",password:"private-password",locale:"en"});
 expect(result).toMatchObject({userId:`supabase:${legacy}`,appUserId:owner,profile:{completed:false,nickname:null},refreshToken:expect.stringMatching(/^[A-Za-z0-9_-]{43}$/)});
 expect(result?.accessToken).toMatch(/^kyaa-email:[^.]+\.[^.]+\.[^.]+$/);
 expect(JSON.stringify(result)).not.toContain("private-password");expect(JSON.stringify(result)).not.toContain("private-refresh");
 expect(mock.send.mock.calls[0][0].input).toEqual({ClientId:"email-client",AuthFlow:"USER_PASSWORD_AUTH",AuthParameters:{USERNAME:"old@example.test",PASSWORD:"private-password"}});
 await expect(emailSessionClaims(result!.accessToken,mock.config)).resolves.toHaveProperty("sub",legacy);
});
it("rotates a server-side refresh handle and does not use it directly as a Cognito credential",async()=>{
 const session={accessToken:"old-access",idToken,refreshToken:"provider-refresh",subject:"cognito-owner",legacyUserId:legacy};
 mock.verify.mockResolvedValue({issuer:mock.config.issuer,subject:"cognito-owner",email:"old@example.test",tokenId:"jti"});
 mock.send.mockResolvedValue({AuthenticationResult:{AccessToken:"new-access",IdToken:idToken,ExpiresIn:600}});
 mock.rpc.mockImplementation(async(name:string)=>({data:name==="read_cognito_email_session"?{sessionId:owner,legacyUserId:legacy,encryptedSession:seal(session,mock.config.cookieSecret)}:name==="resolve_cognito_email_owner"?{appUserId:owner,privyUserId:"did:privy:original"}:name==="get_owned_user_profile"?{completed:false,nickname:null}:null,error:null}));
 const result=await cognitoEmailOperation("refresh",{refreshToken:"a".repeat(43),locale:"ko"});
 expect(result?.userId).toBe(`supabase:${legacy}`);
 expect(mock.send.mock.calls[0][0].input.AuthParameters).toEqual({REFRESH_TOKEN:"provider-refresh"});
 expect(mock.rpc).toHaveBeenCalledWith("write_cognito_email_session",expect.objectContaining({p_previous_refresh_hash:expect.stringMatching(/^[a-f0-9]{64}$/)}));
});

async function accessToken(){
 return signEmailSession({sessionId:owner,legacyUserId:legacy,expiresAt:Math.floor(Date.now()/1000)+600},mock.config);
}
function sessionRow(){
 return {sessionId:owner,legacyUserId:legacy,encryptedSession:seal({accessToken:"cognito-access",idToken,refreshToken:"provider-refresh",subject:"cognito-owner",legacyUserId:legacy},mock.config.cookieSecret)};
}
it.each(["authenticate","refresh","logout"] as const)("denies a missing or revoked session during %s before provider calls",async action=>{
 mock.rpc.mockResolvedValue({data:null,error:null});
 const token=await accessToken();
 const result=action==="authenticate"?authenticateCognitoEmail(token):cognitoEmailOperation(action,{accessToken:token,refreshToken:"a".repeat(43)});
 await expect(result).rejects.toMatchObject({status:401,code:"AUTHENTICATION_REQUIRED"});
 expect(mock.send).not.toHaveBeenCalled();expect(mock.verify).not.toHaveBeenCalled();
});
it.each(["authenticate","login","refresh"] as const)("denies a disabled or absent email owner during %s without writing a session",async action=>{
 mock.verify.mockResolvedValue({issuer:mock.config.issuer,subject:"cognito-owner",email:"old@example.test",tokenId:"jti"});
 mock.send.mockResolvedValue({AuthenticationResult:{AccessToken:"cognito-access",IdToken:idToken,RefreshToken:"provider-refresh",ExpiresIn:600}});
 mock.rpc.mockImplementation(async(name:string)=>({data:name==="read_cognito_email_session"?sessionRow():null,error:null}));
 const token=await accessToken();
 const result=action==="authenticate"?authenticateCognitoEmail(token):cognitoEmailOperation(action,{email:"old@example.test",password:"password",refreshToken:"a".repeat(43)});
 await expect(result).rejects.toMatchObject({status:401,code:"AUTHENTICATION_REQUIRED"});
 expect(mock.rpc.mock.calls.some(([name])=>name==="write_cognito_email_session")).toBe(false);
});
it("permits only an approved deletion retry after the ordinary email owner gate denies access",async()=>{
 mock.verify.mockResolvedValue({issuer:mock.config.issuer,subject:"cognito-owner",email:"old@example.test",tokenId:"jti"});
 mock.rpc.mockImplementation(async(name:string)=>({data:name==="read_cognito_email_session"?sessionRow():name==="has_approved_email_account_deletion"?true:null,error:null}));
 const token=await accessToken();
 await expect(authenticateCognitoEmail(token)).rejects.toMatchObject({status:401});
 await expect(authenticateCognitoEmail(token,true)).resolves.toMatchObject({privyUserId:`supabase-email:${legacy}`,supabaseUserId:legacy});
 mock.rpc.mockImplementation(async(name:string)=>({data:name==="read_cognito_email_session"?sessionRow():false,error:null}));
 await expect(authenticateCognitoEmail(token,true)).rejects.toMatchObject({status:401});
});
it.each(["read_cognito_email_session","resolve_cognito_email_owner"])("preserves storage and malformed nonnull failures from %s",async failingRpc=>{
 mock.verify.mockResolvedValue({issuer:mock.config.issuer,subject:"cognito-owner",email:"old@example.test",tokenId:"jti"});
 const token=await accessToken();
 mock.rpc.mockImplementation(async(name:string)=>name===failingRpc?{data:null,error:{message:"unavailable"}}:{data:sessionRow(),error:null});
 await expect(authenticateCognitoEmail(token)).rejects.toThrow("Authentication storage unavailable");
 mock.rpc.mockImplementation(async(name:string)=>({data:name===failingRpc?{}:sessionRow(),error:null}));
 await expect(authenticateCognitoEmail(token)).rejects.toMatchObject({name:"ZodError"});
});


it("recovers an email refresh profile outage with the same browser cookie and no password login",async()=>{
 mock.provider="cognito";
 const key="b".repeat(43),oldRefresh="a".repeat(43);
 let currentRefresh=digest(oldRefresh),emailRow=sessionRow(),profileUnavailable=true,rotations=0;
 let browserRow=seal({kind:"email",locale:"ko",accessToken:await accessToken(),refreshToken:oldRefresh,expiresAt:Math.floor(Date.now()/1000)+30,sessionExpiresAt:Date.now()+86400000},mock.config.cookieSecret);
 mock.verify.mockResolvedValue({issuer:mock.config.issuer,subject:"cognito-owner",email:"old@example.test",tokenId:"jti"});
 mock.send.mockResolvedValue({AuthenticationResult:{AccessToken:"new-access",IdToken:idToken,ExpiresIn:600}});
 mock.rpc.mockImplementation(async(name:string,args:Record<string,string>)=>{
  if(name==="read_cognito_browser_session")return {data:browserRow};
  if(name==="write_cognito_browser_session"){browserRow=args.p_encrypted_session;return {data:null};}
  if(name==="read_cognito_email_session")return {data:(args.p_refresh_hash?args.p_refresh_hash===currentRefresh:args.p_session_id===emailRow.sessionId)?emailRow:null};
  if(name==="write_cognito_email_session"){
   if(args.p_previous_refresh_hash!==currentRefresh)return {data:null,error:{message:"old refresh rejected"}};
   rotations++;currentRefresh=args.p_refresh_hash;
   emailRow={sessionId:args.p_session_id,legacyUserId:legacy,encryptedSession:args.p_encrypted_session};
   return {data:null};
  }
  if(name==="resolve_cognito_email_owner")return {data:{appUserId:owner,privyUserId:"did:privy:original"}};
  if(name==="get_owned_user_profile"){
   if(profileUnavailable){profileUnavailable=false;return {data:null,error:{message:"profile unavailable"}};}
   return {data:{completed:false,nickname:null}};
  }
  return {data:null};
 });
 const request=()=>new Request("https://kyaa.io/api/auth/cognito/session",{headers:{cookie:`${EMAIL_BROWSER_COOKIE}=${key}`}});
 const failed=await browserSession(request());
 expect(failed.status).toBe(503);expect(failed.headers.has("set-cookie")).toBe(false);
 expect(rotations).toBe(0);expect(currentRefresh).toBe(digest(oldRefresh));
 const recovered=await browserSession(request());
 expect(recovered.status).toBe(200);
 expect(await recovered.json()).toMatchObject({authenticated:true,userId:"did:privy:original"});
 expect(rotations).toBe(1);
 expect(mock.send.mock.calls.every(([command])=>command.input.AuthFlow==="REFRESH_TOKEN_AUTH")).toBe(true);
});
