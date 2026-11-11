import {afterEach,beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("next/server",()=>({after:vi.fn()}));
const mock=vi.hoisted(()=>({
 config:{issuer:"https://cognito-idp.ap-northeast-2.amazonaws.com/ap-northeast-2_pool",clientId:"client",domain:"https://pool.auth.ap-northeast-2.amazoncognito.com",origin:"https://kyaa.io",cookieSecret:Buffer.alloc(32,7).toString("base64")},
 rpc:vi.fn(),verify:vi.fn(),mapping:vi.fn(),fetch:vi.fn(),
}));
vi.mock("./config",()=>({cognitoConfig:()=>mock.config}));
vi.mock("../../config/env",()=>({loadServerEnv:()=>({COGNITO_NATIVE_REDIRECT_URI:"kyaa-app://auth/cognito",GIWA_CHAIN_ID:91342})}));
vi.mock("./verifier",async original=>({...await original<typeof import("./verifier")>(),createCognitoVerifier:()=>mock.verify}));
vi.mock("./identity-repository",()=>({identityDatabase:()=>({rpc:mock.rpc})}));
vi.mock("./kyaa-identity",()=>({resolveKyaaMember:mock.mapping}));
const accessJwt=(claims:Record<string,unknown>)=>`${Buffer.from(JSON.stringify({alg:"RS256"})).toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
import {nativeBridge} from "./native-bridge";
import {challenge,digest,seal} from "./browser-session";
const key="k".repeat(43),verifier="v".repeat(43),code="c".repeat(43);
const mapping={appUserId:"11111111-1111-4111-8111-111111111111",identityKey:"did:privy:existing",walletAddress:`0x${"1".repeat(40)}`,chainId:91342,verifiedEmail:"fan@example.test",providerAccounts:[]};
const request=(body:unknown,origin?:string)=>new Request("https://kyaa.io/api/auth/cognito/native/exchange",{method:"POST",headers:{"content-type":"application/json",...(origin?{origin}:{})},body:JSON.stringify(body)});
beforeEach(()=>{
 vi.clearAllMocks();vi.stubGlobal("fetch",mock.fetch);
 mock.verify.mockResolvedValue({issuer:mock.config.issuer,subject:"same-owner"});mock.mapping.mockResolvedValue(mapping);
 const encrypted=seal({accessToken:accessJwt({sub:"same-owner",origin_jti:"origin-native",jti:"jti-native"}),idToken:"test-id",refreshToken:"test-refresh",subject:"same-owner",expiresAt:Date.now()+600_000,sessionExpiresAt:Date.now()+86400_000},mock.config.cookieSecret);
 mock.rpc.mockImplementation(async(name:string)=>({data:["read_cognito_browser_session","consume_cognito_native_handoff"].includes(name)?encrypted:null,error:null}));
 mock.fetch.mockResolvedValue(new Response(null,{status:200}));
});
afterEach(()=>vi.unstubAllGlobals());
it.each(["exchange","refresh"] as const)("returns the server-verified wallet identity with %s credentials",async operation=>{
 const response=await nativeBridge(request(operation==="exchange"?{code,verifier}:{sessionToken:key}),operation);
 expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("no-store");
 const body=await response.json();expect(body).toMatchObject({appUserId:mapping.appUserId,privyUserId:mapping.identityKey,walletAddress:mapping.walletAddress,chainId:mapping.chainId});expect(body).not.toHaveProperty("walletToken");
 expect(body).not.toHaveProperty("verifiedEmail");expect(body).not.toHaveProperty("refreshToken");
 if(operation==="exchange")expect(mock.rpc).toHaveBeenCalledWith("consume_cognito_native_handoff",{p_code_hash:digest(code),p_challenge:challenge(verifier)});
});
it("fails closed without a verified wallet mapping",async()=>{
 mock.mapping.mockResolvedValue(null);
 expect((await nativeBridge(request({sessionToken:key}),"refresh")).status).toBe(401);
});
it("commits native local logout without waiting for remote revocation",async()=>{
 mock.fetch.mockResolvedValue(new Response(null,{status:503}));
 const response=await nativeBridge(request({sessionToken:key}),"logout");
 expect(response.status).toBe(200);expect(await response.json()).toEqual({signedOut:true});
 expect(mock.fetch).not.toHaveBeenCalled();
 expect(mock.rpc.mock.calls.map(([name])=>name)).toEqual(["read_cognito_browser_session","logout_cognito_browser_session"]);
 expect(mock.rpc).toHaveBeenCalledWith("logout_cognito_browser_session",expect.objectContaining({p_token_ids:["origin-native","jti-native"],p_token_hash:digest(key)}));
 expect(mock.verify).not.toHaveBeenCalled();
});
it("makes repeated logout idempotent and rejects cross-origin browser logout before storage access",async()=>{
 mock.rpc.mockResolvedValue({data:null,error:null});
 expect((await nativeBridge(request({sessionToken:key}),"logout")).status).toBe(200);
 expect(mock.fetch).not.toHaveBeenCalled();mock.rpc.mockClear();
 expect((await nativeBridge(request({sessionToken:key},"https://attacker.test"),"logout")).status).toBe(401);
 expect(mock.rpc).not.toHaveBeenCalled();
});

it.each([503,400])("native refresh maps provider HTTP %s without hiding a retryable outage",async status=>{
 const encrypted=seal({accessToken:accessJwt({origin_jti:"family",jti:"token"}),idToken:"id",refreshToken:"refresh",subject:"same-owner",expiresAt:Date.now()-1,sessionExpiresAt:Date.now()+600000},mock.config.cookieSecret);
 mock.rpc.mockImplementation(async(name:string)=>({data:name==="read_cognito_browser_session"?encrypted:null}));
 mock.fetch.mockResolvedValue(Response.json({error:"invalid_grant"},{status}));
 const response=await nativeBridge(request({sessionToken:key}),"refresh");
 expect(response.status).toBe(status===503?503:401);
 expect(mock.rpc.mock.calls.some(([name])=>name==="logout_cognito_browser_session")).toBe(status===400);
});
