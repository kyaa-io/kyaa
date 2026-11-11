import{afterEach,expect,it,vi}from"vitest";
vi.mock("server-only",()=>({}));
const mock=vi.hoisted(()=>({resolve:vi.fn(),verify:vi.fn(),get:vi.fn()}));
vi.mock("./access",()=>({resolveCognitoAccess:mock.resolve}));
vi.mock("../apple-notifications/apple-lifecycle",()=>({createConfiguredAppleLifecycleGuard:()=>null}));
import{createPrivyNodeAccessVerifier,createPrivyNodeSessionResolver,createPrivyNodeReauthenticationResolver}from"../privy-node-verifier";
const config={appId:"app",appSecret:"secret",appleLoginEnabled:true};
const port={utils:()=>({auth:()=>({verifyAccessToken:mock.verify})}),users:()=>({_get:mock.get})};
afterEach(()=>vi.clearAllMocks());
it("never sends a rejected Cognito token to the legacy Privy verifier",async()=>{
 mock.resolve.mockRejectedValue(new Error("invalid"));
 await expect(createPrivyNodeAccessVerifier(config,port).verify("kyaa-cognito:invalid")).rejects.toThrow();
 expect(mock.verify).not.toHaveBeenCalled();
});
const member={appUserId:"00000000-0000-4000-8000-000000000001",identityKey:"did:privy:old",verifiedEmail:"original@example.test",walletAddress:"0x1111111111111111111111111111111111111111",chainId:91342,providerAccounts:[{issuer:"https://accounts.google.com",subject:"google-original"}]};
it("resolves a Cognito member from kyaa records only: original DID, email and wallet, no Privy call",async()=>{
 mock.resolve.mockResolvedValue({identity:{subject:"cognito-sub",tokenId:"jti"},member});
 const result=await createPrivyNodeSessionResolver(config,port).resolve("kyaa-cognito:token",91342);
 expect(result).toEqual({identity:{privyUserId:"did:privy:old",verifiedEmail:"original@example.test",googleLinked:true,providerAccounts:[{issuer:"https://accounts.google.com",subject:"google-original"}]},wallet:{chainId:91342,address:"0x1111111111111111111111111111111111111111"}});
 const access=await createPrivyNodeAccessVerifier(config,port).verify("kyaa-cognito:token");
 expect(access).toEqual({privyUserId:"did:privy:old",verifiedEmail:"original@example.test",googleLinked:true,providerAccounts:member.providerAccounts});
 expect(mock.verify).not.toHaveBeenCalled();
 expect(mock.get).not.toHaveBeenCalled();
});
it("serves a member who joined after Privy with its kyaa key and issued address",async()=>{
 mock.resolve.mockResolvedValue({identity:{subject:"cognito-sub",tokenId:"jti"},member:{...member,identityKey:"kyaa:7c9e6679-7425-40de-944b-e07fc1f90ae7",walletAddress:"0x2222222222222222222222222222222222222222",providerAccounts:[{issuer:"https://appleid.apple.com",subject:"apple-1"}]}});
 const access=await createPrivyNodeAccessVerifier(config,port).verify("kyaa-cognito:token");
 expect(access).toMatchObject({privyUserId:"kyaa:7c9e6679-7425-40de-944b-e07fc1f90ae7",googleLinked:false});
 await expect(createPrivyNodeSessionResolver(config,port).resolve("kyaa-cognito:token",1)).rejects.toMatchObject({status:422});
 expect(mock.get).not.toHaveBeenCalled();
});

it("keeps Apple reauthentication on the verified Cognito refresh family while preserving the original owner",async()=>{
 mock.resolve.mockResolvedValue({identity:{subject:"cognito-sub",tokenId:"stable-origin-jti"},member});
 const result=await createPrivyNodeReauthenticationResolver(config,port).resolve("kyaa-cognito:token");
 expect(result).toMatchObject({privyUserId:"did:privy:old",sessionId:"cognito:stable-origin-jti",google:{subject:"google-original"}});
 expect(mock.verify).not.toHaveBeenCalled();
 expect(mock.get).not.toHaveBeenCalled();
});
