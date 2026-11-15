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
it("preserves mapped DID, email and wallet rather than Cognito email or a new wallet",async()=>{
 mock.resolve.mockResolvedValue({identity:{subject:"cognito-sub",tokenId:"jti"},mapping:{privyUserId:"did:privy:old",verifiedEmail:"original@example.test",walletAddress:"0x1111111111111111111111111111111111111111",chainId:91342}});
 mock.get.mockResolvedValue({id:"did:privy:old",linked_accounts:[{type:"google_oauth",subject:"google-original",email:"original@example.test",verified_at:1},{type:"custom_auth",custom_user_id:"cognito-sub"},{type:"wallet",address:"0x1111111111111111111111111111111111111111",chain_type:"ethereum",connector_type:"embedded",wallet_client:"privy"}]});
 const result=await createPrivyNodeSessionResolver(config,port).resolve("kyaa-cognito:token",91342);
 expect(result).toEqual({identity:{privyUserId:"did:privy:old",verifiedEmail:"original@example.test",googleLinked:true,providerAccounts:[{issuer:"https://accounts.google.com",subject:"google-original"}]},wallet:{chainId:91342,address:"0x1111111111111111111111111111111111111111"}});
 const access=await createPrivyNodeAccessVerifier(config,port).verify("kyaa-cognito:token");
 expect(access.providerAccounts).toEqual([{issuer:"https://accounts.google.com",subject:"google-original"}]);
 expect(mock.verify).not.toHaveBeenCalled();
 mock.get.mockResolvedValueOnce({id:"did:privy:new",linked_accounts:[]});
 await expect(createPrivyNodeAccessVerifier(config,port).verify("kyaa-cognito:token")).rejects.toMatchObject({status:409});
});

it("keeps Apple reauthentication on the verified Cognito refresh family while preserving the original Privy owner",async()=>{
 mock.resolve.mockResolvedValue({identity:{subject:"cognito-sub",tokenId:"stable-origin-jti"},mapping:{privyUserId:"did:privy:old",walletAddress:"0x1111111111111111111111111111111111111111",chainId:91342}});
 mock.get.mockResolvedValue({id:"did:privy:old",linked_accounts:[{type:"google_oauth",subject:"google-original",email:"original@example.test",verified_at:1},{type:"custom_auth",custom_user_id:"cognito-sub"},{type:"wallet",address:"0x1111111111111111111111111111111111111111",chain_type:"ethereum",connector_type:"embedded",wallet_client:"privy"}]});
 const result=await createPrivyNodeReauthenticationResolver(config,port).resolve("kyaa-cognito:token");
 expect(result).toMatchObject({privyUserId:"did:privy:old",sessionId:"cognito:stable-origin-jti",google:{subject:"google-original"}});
 expect(mock.verify).not.toHaveBeenCalled();
});
