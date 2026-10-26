import {afterEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const mock=vi.hoisted(()=>({provider:"cognito",config:{issuer:"https://cognito-idp.ap-northeast-2.amazonaws.com/ap-northeast-2_pool",clientId:"client",domain:"https://pool.auth.ap-northeast-2.amazoncognito.com",redirectUri:"https://kyaa.io/api/auth/cognito/callback",logoutUri:"https://kyaa.io/login",origin:"https://kyaa.io",cookieSecret:Buffer.alloc(32,7).toString("base64")},verify:vi.fn(),tokenRequest:vi.fn(),writeSession:vi.fn(),mapping:vi.fn(),classify:vi.fn(),rpc:vi.fn()}));
vi.mock("./config",()=>({cognitoConfig:()=>mock.config,cognitoCleanupConfig:()=>mock.config}));
vi.mock("../../config/env",()=>({loadServerEnv:()=>({AUTH_PROVIDER:mock.provider,NEXT_PUBLIC_APP_URL:mock.config.origin,COGNITO_ENROLLMENT_ENABLED:true})}));
vi.mock("./verifier",async original=>({...await original<typeof import("./verifier")>(),createCognitoVerifier:()=>mock.verify}));
vi.mock("./identity-repository",()=>({identityDatabase:()=>({rpc:mock.rpc}),readCognitoMapping:mock.mapping}));
vi.mock("./enrollment",()=>({classifyEnrollment:mock.classify}));
vi.mock("./browser-session",async original=>({...await original<typeof import("./browser-session")>(),tokenRequest:mock.tokenRequest,writeSession:mock.writeSession}));
import{start,callback,session,logout}from"./browser-routes";
import{seal,FLOW_COOKIE,SESSION_COOKIE,unseal,digest}from"./browser-session";
afterEach(()=>{mock.provider="cognito";vi.clearAllMocks();vi.unstubAllEnvs();vi.unstubAllGlobals();});
it("creates S256 PKCE, state and nonce in an encrypted HttpOnly flow cookie",async()=>{
 const response=await start(new Request("https://kyaa.io/api/auth/cognito/start?provider=google&returnTo=%2Fpassport"));
 expect(response.status).toBe(303);const url=new URL(response.headers.get("location")!);
 expect(url.origin).toBe(mock.config.domain);expect(url.searchParams.get("code_challenge_method")).toBe("S256");
 const raw=response.headers.get("set-cookie")!;expect(raw).toContain("HttpOnly; Secure; SameSite=Lax");
 const flow=unseal(raw.split(";")[0].split("=")[1],mock.config.cookieSecret) as {state:string;nonce:string;verifier:string};
 expect(flow.state).toBe(url.searchParams.get("state"));expect(flow.nonce).toBe(url.searchParams.get("nonce"));expect(flow.verifier).toHaveLength(43);
 expect(url.searchParams.has("code_verifier")).toBe(false);
});
it("moves an approved www alias to the canonical auth origin before setting the host-only flow cookie",async()=>{
 vi.stubEnv("HOSTING_PROVIDER","aws");
 const response=await start(new Request("https://origin.kyaa.io/api/auth/cognito/start?provider=google&returnTo=%2Fpassport&locale=ja",{headers:{"x-forwarded-host":"www.kyaa.io","x-forwarded-proto":"https","sec-fetch-site":"same-origin"}}));
 expect(response.status).toBe(303);expect(response.headers.get("location")).toBe("https://kyaa.io/api/auth/cognito/start?provider=google&returnTo=%2Fpassport&locale=ja");
 expect(response.headers.has("set-cookie")).toBe(false);expect(mock.tokenRequest).not.toHaveBeenCalled();
 const rejected=await start(new Request("https://attacker.test/api/auth/cognito/start?provider=google"));
 expect(rejected.status).toBe(503);expect(rejected.headers.has("set-cookie")).toBe(false);
});
it("rejects state replay, duplicate code and a different callback origin before provider exchange",async()=>{
 const cookie=`${FLOW_COOKIE}=${seal({state:"state",verifier:"verifier",nonce:"nonce",expiresAt:Date.now()+60000,returnTo:"/passport"},mock.config.cookieSecret)}`;
 for(const url of ["https://kyaa.io/api/auth/cognito/callback?code=x&state=wrong","https://kyaa.io/api/auth/cognito/callback?code=x&code=y&state=state","https://attacker.test/api/auth/cognito/callback?code=x&state=state"]){
  expect((await callback(new Request(url,{headers:{cookie}}))).status).toBe(400);
 }
 expect(mock.tokenRequest).not.toHaveBeenCalled();
});
it("validates ID nonce and moves an unlinked account to recovery without exposing tokens in the URL",async()=>{
 vi.stubEnv("HOSTING_PROVIDER","aws");
 mock.tokenRequest.mockResolvedValue({access_token:"secret-access",id_token:"secret-id",refresh_token:"secret-refresh",expires_in:600});
 mock.verify.mockResolvedValue({issuer:mock.config.issuer,subject:"subject",email:"fan@example.test",tokenId:"id"});
 mock.mapping.mockResolvedValue(null);mock.classify.mockResolvedValue({mode:"recovery",expectedPrivyUserId:"did:privy:old"});
 const cookie=`${FLOW_COOKIE}=${seal({state:"state",verifier:"verifier",nonce:"nonce",expiresAt:Date.now()+60000,returnTo:"/passport"},mock.config.cookieSecret)}`;
 const response=await callback(new Request("https://origin-alb.test/api/auth/cognito/callback?code=one-time-code&state=state",{headers:{cookie,"x-forwarded-host":"kyaa.io","x-forwarded-proto":"https"}}));
 expect(response.status).toBe(303);expect(response.headers.get("location")).toBe("https://kyaa.io/auth/cognito/link?returnTo=%2Fpassport&locale=ko");
 expect(mock.verify).toHaveBeenCalledWith("secret-id","id","nonce");
 expect(response.headers.get("set-cookie")).not.toContain("secret-");expect(response.headers.get("location")).not.toContain("secret-");
 expect(mock.writeSession).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({subject:"subject",enrollment:{mode:"recovery",expectedPrivyUserId:"did:privy:old"}}),mock.config);
});

it("starts authorization while global legacy inventory is incomplete", async () => {
 mock.rpc.mockResolvedValue({data:false,error:null});
 const response=await start(new Request("https://kyaa.io/api/auth/cognito/start?provider=apple"));
 expect(response.status).toBe(303);
 expect(new URL(response.headers.get("location")!).searchParams.get("identity_provider")).toBe("SignInWithApple");
 expect(mock.rpc).not.toHaveBeenCalled();
});
it("keeps failed enrollment classification closed after successful provider authentication", async () => {
 mock.tokenRequest.mockResolvedValue({access_token:"access",id_token:"id",refresh_token:"refresh",expires_in:600});
 mock.verify.mockResolvedValue({issuer:mock.config.issuer,subject:"subject",email:"fan@example.test",tokenId:"id"});
 mock.mapping.mockResolvedValue(null);mock.classify.mockRejectedValue(new Error("Legacy identity inventory incomplete"));
 const cookie=`${FLOW_COOKIE}=${seal({state:"state",verifier:"verifier",nonce:"nonce",expiresAt:Date.now()+60000,returnTo:"/passport"},mock.config.cookieSecret)}`;
 const response=await callback(new Request("https://kyaa.io/api/auth/cognito/callback?code=code&state=state",{headers:{cookie}}));
 expect(response.status).toBe(400);
 expect(mock.classify).toHaveBeenCalledOnce();
 expect(mock.writeSession).not.toHaveBeenCalled();
});

it("retires old social entry points with only sanitized login context",async()=>{
 mock.provider="privy";
 for(const returnTo of ["/passport?tab=stamps","https://evil.test","//evil.test","/auth/cognito/link?returnTo=/passport","/api/auth/cognito/start"]){
  const response=await start(new Request(`https://kyaa.io/api/auth/cognito/start?provider=google&returnTo=${encodeURIComponent(returnTo)}&locale=ja&code=secret&state=secret`));
  expect(response.status).toBe(303);
  const target=new URL(response.headers.get("location")!);
  expect(target.origin+target.pathname).toBe("https://kyaa.io/login");
  expect(target.searchParams.get("returnTo")).toBe(returnTo.startsWith("/passport")?returnTo:"/");
  expect(target.searchParams.get("locale")).toBe("ja");
  expect(target.searchParams.has("code")).toBe(false);expect(target.searchParams.has("state")).toBe(false);
  expect(response.headers.get("set-cookie")).toContain(`${FLOW_COOKIE}=; Path=/; Max-Age=0`);
 }
 expect(mock.tokenRequest).not.toHaveBeenCalled();
});
it("retires callbacks without exchanging a code and trusts only a valid matching encrypted flow",async()=>{
 mock.provider="privy";
 const flow={state:"state",verifier:"verifier",nonce:"nonce",expiresAt:Date.now()+60000,returnTo:"/passport",locale:"ja"};
 for(const [value,state,expected] of [
  [seal(flow,mock.config.cookieSecret),"state","https://kyaa.io/login?returnTo=%2Fpassport&locale=ja"],
  [seal({...flow,returnTo:"https://evil.test"},mock.config.cookieSecret),"state","https://kyaa.io/login?returnTo=%2F&locale=ja"],
  [seal({...flow,returnTo:"/auth/cognito/link"},mock.config.cookieSecret),"state","https://kyaa.io/login?returnTo=%2F&locale=ja"],
  [seal({...flow,expiresAt:0},mock.config.cookieSecret),"state","https://kyaa.io/login"],
  [seal(flow,mock.config.cookieSecret),"wrong","https://kyaa.io/login"],
  ["tampered","state","https://kyaa.io/login"],
  ["","state","https://kyaa.io/login"],
 ] as const){
  const response=await callback(new Request(`https://kyaa.io/api/auth/cognito/callback?code=secret&state=${state}`,{headers:{cookie:`${FLOW_COOKIE}=${value}`}}));
  expect(response.status).toBe(303);expect(response.headers.get("location")).toBe(expected);
  expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
 }
 expect(mock.tokenRequest).not.toHaveBeenCalled();expect(mock.verify).not.toHaveBeenCalled();expect(mock.writeSession).not.toHaveBeenCalled();
});
it("does not retain callback context from foreign origins, duplicate states or OAuth errors",async()=>{
 mock.provider="privy";
 const cookie=`${FLOW_COOKIE}=${seal({state:"state",verifier:"v",nonce:"n",expiresAt:Date.now()+60000,returnTo:"/passport",locale:"ja"},mock.config.cookieSecret)}`;
 for(const url of ["https://evil.test/api/auth/cognito/callback?state=state","https://kyaa.io/api/auth/cognito/callback?state=state&state=state","https://kyaa.io/api/auth/cognito/callback?state=state&error=access_denied"]){
  const response=await callback(new Request(url,{headers:{cookie}}));
  expect(response.headers.get("location")).toBe("https://kyaa.io/login");
 }
 expect(mock.tokenRequest).not.toHaveBeenCalled();
});
it("returns JSON 401 for retired sessions",async()=>{
 mock.provider="privy";
 const response=await session(new Request("https://kyaa.io/api/auth/cognito/session"));
 expect(response.status).toBe(401);expect(await response.json()).toEqual({error:{code:"AUTHENTICATION_REQUIRED"}});expect(response.headers.has("location")).toBe(false);
 expect(mock.verify).not.toHaveBeenCalled();expect(mock.rpc).not.toHaveBeenCalled();
});
const logoutRequest=(cookie=true,origin="https://kyaa.io")=>new Request("https://kyaa.io/api/auth/cognito/logout",{method:"POST",headers:{origin,...(cookie?{cookie:`${SESSION_COOKIE}=${"a".repeat(43)}`}:{})}});
function oldSession(){
 return seal({accessToken:"old-access",idToken:"old-id",refreshToken:"old-refresh",subject:"old-subject",expiresAt:0,sessionExpiresAt:Date.now()+60000},mock.config.cookieSecret);
}
it.each(["privy","cognito"])("revokes the remote token and deletes the old session before clearing its cookie under %s",async provider=>{
 mock.provider=provider;
 mock.rpc.mockImplementation(async(name:string)=>({data:name==="read_cognito_browser_session"?oldSession():null,error:null}));
 const fetcher=vi.fn(async()=>{
  expect(mock.rpc).not.toHaveBeenCalledWith("delete_cognito_browser_session",expect.anything());
  return new Response(null,{status:200});
 });vi.stubGlobal("fetch",fetcher);
 const response=await logout(logoutRequest());
 expect(response.status).toBe(200);
 expect(fetcher).toHaveBeenCalledWith(new URL("/oauth2/revoke",mock.config.domain),expect.objectContaining({body:new URLSearchParams({client_id:"client",token:"old-refresh"}),redirect:"error"}));
 expect(mock.rpc).toHaveBeenLastCalledWith("delete_cognito_browser_session",{p_token_hash:digest("a".repeat(43))});
 expect(response.headers.get("set-cookie")).toContain(`${SESSION_COOKIE}=; Path=/; Max-Age=0`);
 expect(await response.json()).toEqual({logoutUrl:provider==="privy"?null:"https://pool.auth.ap-northeast-2.amazoncognito.com/logout?client_id=client&logout_uri=https%3A%2F%2Fkyaa.io%2Flogin"});
});
it.each(["read","remote","delete"])("preserves logout failure at %s without clearing the browser cookie",async failure=>{
 mock.provider="privy";
 mock.rpc.mockImplementation(async(name:string)=>({data:name==="read_cognito_browser_session"?oldSession():null,error:(failure==="read" && name==="read_cognito_browser_session") || (failure==="delete" && name==="delete_cognito_browser_session")?{message:"offline"}:null}));
 const fetcher=vi.fn().mockResolvedValue(new Response(null,{status:failure==="remote"?503:200}));vi.stubGlobal("fetch",fetcher);
 const response=await logout(logoutRequest());
 expect(response.status).toBe(503);expect(await response.json()).toEqual({error:{code:"AUTH_UNAVAILABLE"}});expect(response.headers.has("set-cookie")).toBe(false);
 if(failure!=="delete")expect(mock.rpc).not.toHaveBeenCalledWith("delete_cognito_browser_session",expect.anything());
});
it("requires same-origin logout before touching stale sessions",async()=>{
 mock.provider="privy";
 for(const origin of ["https://evil.test",""]){expect((await logout(logoutRequest(true,origin))).status).toBe(401);}
 const crossSite=logoutRequest();crossSite.headers.set("sec-fetch-site","cross-site");expect((await logout(crossSite)).status).toBe(401);
 expect(mock.rpc).not.toHaveBeenCalled();
});
it("finishes retired logout when its cookie or server session has already expired",async()=>{
 mock.provider="privy";mock.rpc.mockResolvedValue({data:null,error:null});
 for(const request of [logoutRequest(false),logoutRequest()]){
  const response=await logout(request);expect(response.status).toBe(200);expect(await response.json()).toEqual({logoutUrl:null});expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
 }
 mock.provider="cognito";expect((await logout(logoutRequest(false))).status).toBe(401);
});
