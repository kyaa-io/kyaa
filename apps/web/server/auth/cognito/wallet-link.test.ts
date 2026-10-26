import{afterEach,expect,it,vi}from"vitest";
vi.mock("server-only",()=>({}));
const mock=vi.hoisted(()=>({read:vi.fn(),resolve:vi.fn(),verify:vi.fn(),access:vi.fn(),extract:vi.fn(),mapping:vi.fn(),link:vi.fn(),sync:vi.fn(),rpc:vi.fn(),get:vi.fn(),getCustom:vi.fn(),write:vi.fn()}));
vi.mock("./config",()=>({cognitoConfig:()=>({origin:"https://kyaa.io"})}));
vi.mock("../../config/env",()=>({loadServerEnv:()=>({PRIVY_APP_ID:"app",PRIVY_APP_SECRET:"secret",PRIVY_APP_ENVIRONMENT:"production",PRIVY_APPLE_LOGIN_ENABLED:true,GIWA_CHAIN_ID:91342,COGNITO_ENROLLMENT_ENABLED:true})}));
vi.mock("@privy-io/node",()=>({NotFoundError:class extends Error{},PrivyClient:class{users=()=>({_get:mock.get,getByCustomAuthID:mock.getCustom});}}));
vi.mock("../privy-node-verifier",()=>({createPrivyNodeSessionResolver:()=>({resolve:mock.resolve}),createPrivyNodeAccessVerifier:()=>({verify:mock.access}),extractEmbeddedEvmWallet:mock.extract}));
vi.mock("../session-sync",()=>({syncAuthenticatedSession:mock.sync}));
vi.mock("../supabase-session-sync-repository",()=>({createSupabaseSessionSyncRepository:()=>({})}));
vi.mock("./identity-repository",()=>({identityDatabase:()=>({rpc:mock.rpc}),readCognitoMapping:mock.mapping,linkCognitoMapping:mock.link}));
vi.mock("./verifier",async original=>({...await original<typeof import("./verifier")>(),createCognitoVerifier:()=>mock.verify}));
vi.mock("./browser-session",async original=>({...await original<typeof import("./browser-session")>(),readSession:mock.read,writeSession:mock.write}));
import{walletLink}from"./wallet-link";
import{NotFoundError}from"@privy-io/node";
const wallet={chainId:91342,address:"0x1111111111111111111111111111111111111111"};
const request=(token="privy-token")=>new Request("https://origin-alb.test/api/auth/cognito/wallet-link/start",{method:"POST",headers:{origin:"https://kyaa.io",authorization:`Bearer ${token}`}});
afterEach(()=>{vi.clearAllMocks();vi.useRealTimers();});
function setup(){
 mock.access.mockResolvedValue({privyUserId:"did:privy:old"});mock.extract.mockReturnValue(wallet);
 mock.read.mockResolvedValue({key:"opaque",session:{idToken:"cognito-id",enrollment:{mode:"recovery",expectedPrivyUserId:"did:privy:old"},linkProof:{privyUserId:"did:privy:old",walletAddress:wallet.address,chainId:91342,expiresAt:Date.now()+60000}}});
 mock.verify.mockResolvedValue({issuer:"issuer",subject:"cognito-sub",email:"fan@example.test",tokenId:"jti"});
 mock.resolve.mockResolvedValue({identity:{privyUserId:"did:privy:old",verifiedEmail:"fan@example.test"},wallet});
 mock.mapping.mockResolvedValue(null);mock.rpc.mockResolvedValue({data:null,error:null});
 mock.get.mockResolvedValue({id:"did:privy:old",linked_accounts:[{type:"custom_auth",custom_user_id:"cognito-sub"}]});
 mock.getCustom.mockResolvedValue({id:"did:privy:old",linked_accounts:[]});
}
it("requires existing Privy proof before exposing the token used to link a JWT account",async()=>{
 setup();expect((await walletLink(request("kyaa-cognito:not-a-privy-proof"))).status).toBe(401);expect(mock.resolve).not.toHaveBeenCalled();
 const response=await walletLink(request());expect(response.status).toBe(200);
 expect(await response.json()).toEqual({walletToken:"cognito-id",privyUserId:"did:privy:old",walletAddress:wallet.address,alreadyLinked:true});
 expect(mock.link).not.toHaveBeenCalled();expect(mock.write).toHaveBeenCalled();expect(mock.getCustom).not.toHaveBeenCalled();
});
function newEnrollment(){
 setup();mock.read.mockResolvedValue({key:"opaque",session:{idToken:"cognito-id",enrollment:{mode:"new",permit:"permit"}}});
 mock.verify.mockResolvedValue({issuer:"issuer",subject:"cognito-sub",email:"fan@example.test",tokenId:"jti",provider:{name:"google",issuer:"https://accounts.google.com",subject:"google-sub"}});
 mock.get.mockResolvedValue({id:"did:privy:old",linked_accounts:[{type:"google_oauth",subject:"google-sub",verified_at:1}]});mock.extract.mockReturnValue(null);mock.rpc.mockResolvedValue({data:true,error:null});
}
it("allows one initial wallet only after live provider and permit checks without exposing a JWT",async()=>{
 newEnrollment();const response=await walletLink(request());expect(response.status).toBe(200);expect(await response.json()).toEqual({walletCreationAllowed:true,privyUserId:"did:privy:old"});
 expect(mock.access).toHaveBeenCalledWith("privy-token");expect(mock.rpc).toHaveBeenCalledWith("cognito_initial_wallet_allowed",expect.objectContaining({p_subject:"cognito-sub",p_provider_subject:"google-sub",p_privy_user_id:"did:privy:old"}));expect(mock.resolve).not.toHaveBeenCalled();expect(mock.sync).not.toHaveBeenCalled();expect(mock.write).not.toHaveBeenCalled();
});
it("denies initial creation for expired or reserved permits and a mismatched provider or DID",async()=>{
 newEnrollment();mock.rpc.mockResolvedValue({data:false,error:null});expect((await walletLink(request())).status).toBe(401);
 mock.rpc.mockResolvedValue({data:true,error:null});mock.get.mockResolvedValue({id:"did:privy:old",linked_accounts:[{type:"google_oauth",subject:"different",verified_at:1}]});expect((await walletLink(request())).status).toBe(401);
 mock.get.mockResolvedValue({id:"did:privy:different",linked_accounts:[{type:"google_oauth",subject:"google-sub",verified_at:1}]});expect((await walletLink(request())).status).toBe(401);expect(mock.resolve).not.toHaveBeenCalled();
});
it("never offers wallet creation to recovery sessions",async()=>{
 setup();mock.resolve.mockRejectedValueOnce(new Error("Missing original wallet"));expect((await walletLink(request())).status).toBe(503);expect(mock.access).not.toHaveBeenCalled();expect(mock.rpc).not.toHaveBeenCalled();
});
it("requires the server-observed custom JWT subject and unchanged DID/address before committing mapping",async()=>{
 setup();mock.link.mockResolvedValue({privyUserId:"did:privy:old",walletAddress:wallet.address});
 expect((await walletLink(request(),true)).status).toBe(200);expect(mock.link).toHaveBeenCalledWith(expect.any(Object),expect.objectContaining({privyUserId:"did:privy:old",walletAddress:wallet.address}));
 mock.get.mockResolvedValueOnce({id:"did:privy:old",linked_accounts:[{type:"custom_auth",custom_user_id:"other-sub"}]});
 expect((await walletLink(request(),true)).status).toBe(401);expect(mock.link).toHaveBeenCalledOnce();
 mock.resolve.mockResolvedValueOnce({identity:{privyUserId:"did:privy:other",verifiedEmail:"fan@example.test"},wallet});
 expect((await walletLink(request(),true)).status).toBe(401);expect(mock.link).toHaveBeenCalledOnce();
});
it.each(["expired","missing","owner","wallet","chain"])("rejects %s link proof before committing mapping",async(kind)=>{
 setup();const state=await mock.read();
 if(kind==="missing")delete state.session.linkProof;
 else Object.assign(state.session.linkProof,kind==="expired"?{expiresAt:0}:kind==="owner"?{privyUserId:"did:privy:other"}:kind==="wallet"?{walletAddress:"0x2222222222222222222222222222222222222222"}:{chainId:1});
 expect((await walletLink(request(),true)).status).toBe(401);expect(mock.link).not.toHaveBeenCalled();expect(mock.write).not.toHaveBeenCalled();
});
it("waits briefly for the linked subject to become visible before committing",async()=>{
 vi.useFakeTimers();setup();mock.link.mockResolvedValue({privyUserId:"did:privy:old",walletAddress:wallet.address});
 mock.get.mockResolvedValueOnce({id:"did:privy:old",linked_accounts:[]});
 const response=walletLink(request(),true);await vi.runAllTimersAsync();
 expect((await response).status).toBe(200);expect(mock.get).toHaveBeenCalledTimes(2);expect(mock.link).toHaveBeenCalledOnce();
});
it.each(["missing","different-subject","different-owner","expired-during-wait"])("does not commit when delayed link remains %s",async(kind)=>{
 vi.useFakeTimers();setup();
 if(kind==="expired-during-wait")(await mock.read()).session.linkProof.expiresAt=Date.now()+250;
 mock.get.mockResolvedValueOnce({id:"did:privy:old",linked_accounts:[]});
 if(kind!=="expired-during-wait")mock.get.mockResolvedValue({id:kind==="different-owner"?"did:privy:other":"did:privy:old",linked_accounts:kind==="different-subject"?[{type:"custom_auth",custom_user_id:"other-sub"}]:[]});
 const response=walletLink(request(),true);await vi.runAllTimersAsync();
 expect((await response).status).toBe(401);expect(mock.get).toHaveBeenCalledTimes(kind==="missing"?5:2);expect(mock.link).not.toHaveBeenCalled();expect(mock.write).not.toHaveBeenCalled();
 expect(mock.getCustom).toHaveBeenCalledTimes(kind==="missing"?1:0);
});
it("uses the exact linked subject when the original owner's general lookup stays stale",async()=>{
 vi.useFakeTimers();setup();mock.get.mockResolvedValue({id:"did:privy:old",linked_accounts:[]});
 mock.getCustom.mockResolvedValue({id:"did:privy:old",linked_accounts:[{type:"custom_auth",custom_user_id:"cognito-sub"}]});
 mock.link.mockResolvedValue({privyUserId:"did:privy:old",walletAddress:wallet.address});
 const response=walletLink(request(),true);await vi.runAllTimersAsync();
 expect((await response).status).toBe(200);expect(mock.getCustom).toHaveBeenCalledExactlyOnceWith({custom_user_id:"cognito-sub"},{timeout:5_000,maxRetries:0});expect(mock.link).toHaveBeenCalledOnce();
});
it.each(["different-owner","different-subject","expired"])("rejects a direct lookup with %s",async(kind)=>{
 vi.useFakeTimers();setup();mock.get.mockResolvedValue({id:"did:privy:old",linked_accounts:[]});
 if(kind==="expired")(await mock.read()).session.linkProof.expiresAt=Date.now()+2050;
 mock.getCustom.mockImplementation(async()=>{await new Promise(resolve=>setTimeout(resolve,100));return{id:kind==="different-owner"?"did:privy:other":"did:privy:old",linked_accounts:[{type:"custom_auth",custom_user_id:kind==="different-subject"?"other-sub":"cognito-sub"}]};});
 const response=walletLink(request(),true);await vi.runAllTimersAsync();
 expect((await response).status).toBe(401);expect(mock.getCustom).toHaveBeenCalledOnce();expect(mock.link).not.toHaveBeenCalled();expect(mock.write).not.toHaveBeenCalled();
});
it.each([404,503])("fails closed when the direct lookup fails with %s",async(status)=>{
 vi.useFakeTimers();setup();mock.get.mockResolvedValue({id:"did:privy:old",linked_accounts:[]});
 mock.getCustom.mockRejectedValue(status===404?new NotFoundError(404,{},"Not found",new Headers()):new Error("Provider unavailable"));
 const response=walletLink(request(),true);await vi.runAllTimersAsync();
 expect((await response).status).toBe(status===404?401:503);expect(mock.link).not.toHaveBeenCalled();expect(mock.write).not.toHaveBeenCalled();
});
