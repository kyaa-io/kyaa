import {afterEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const mock=vi.hoisted(()=>({config:{issuer:"https://cognito-idp.ap-northeast-2.amazonaws.com/ap-northeast-2_pool",clientId:"client",domain:"https://pool.auth.ap-northeast-2.amazoncognito.com",redirectUri:"https://kyaa.io/api/auth/cognito/callback",logoutUri:"https://kyaa.io/login",origin:"https://kyaa.io",cookieSecret:Buffer.alloc(32,7).toString("base64")},verify:vi.fn(),tokenRequest:vi.fn(),writeSession:vi.fn(),mapping:vi.fn(),classify:vi.fn(),rpc:vi.fn()}));
vi.mock("./config",()=>({cognitoConfig:()=>mock.config}));
vi.mock("../../config/env",()=>({loadServerEnv:()=>({COGNITO_ENROLLMENT_ENABLED:true})}));
vi.mock("./verifier",async original=>({...await original<typeof import("./verifier")>(),createCognitoVerifier:()=>mock.verify}));
vi.mock("./identity-repository",()=>({identityDatabase:()=>({rpc:mock.rpc}),readCognitoMapping:mock.mapping}));
vi.mock("./enrollment",()=>({classifyEnrollment:mock.classify}));
vi.mock("./browser-session",async original=>({...await original<typeof import("./browser-session")>(),tokenRequest:mock.tokenRequest,writeSession:mock.writeSession}));
import{start,callback}from"./browser-routes";
import{seal,FLOW_COOKIE,unseal}from"./browser-session";
afterEach(()=>{vi.clearAllMocks();vi.unstubAllEnvs();});
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
