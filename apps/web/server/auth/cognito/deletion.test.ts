import{beforeEach,expect,it,vi}from"vitest";
vi.mock("server-only",()=>({}));
const mock=vi.hoisted(()=>({send:vi.fn(),rpc:vi.fn(),env:{AUTH_PROVIDER:"privy",EMAIL_AUTH_PROVIDER:"cognito",COGNITO_USER_POOL_ID:"ap-northeast-2_social",COGNITO_EMAIL_USER_POOL_ID:"ap-northeast-2_email",COGNITO_EMAIL_CLIENT_ID:"email-client",NEXT_PUBLIC_APP_URL:"https://kyaa.io"}}));
vi.mock("../../config/env",()=>({loadServerEnv:()=>mock.env}));
vi.mock("./identity-repository",()=>({identityDatabase:()=>({rpc:mock.rpc})}));
vi.mock("@aws-sdk/client-cognito-identity-provider",async original=>({...await original<typeof import("@aws-sdk/client-cognito-identity-provider")>(),CognitoIdentityProviderClient:class{send=mock.send;}}));
import{cleanupCognitoEmail,cleanupCognitoSocial}from"./deletion";
beforeEach(()=>{vi.resetAllMocks();mock.env.EMAIL_AUTH_PROVIDER="cognito";mock.send.mockResolvedValue({});});
it("deletes the mapped email subject from its dedicated pool before disabling the old credential",async()=>{
 mock.rpc.mockResolvedValueOnce({data:"email-subject"}).mockResolvedValueOnce({data:null});
 await cleanupCognitoEmail("legacy-owner");
 expect(mock.send.mock.calls[0][0].input).toEqual({UserPoolId:"ap-northeast-2_email",Username:"email-subject"});
 expect(mock.rpc).toHaveBeenLastCalledWith("disable_legacy_email_credential",{p_legacy_user_id:"legacy-owner"});
});
it("cleans only already mapped social subjects even while Privy owns login",async()=>{
 mock.rpc.mockResolvedValue({data:["linked-subject"]});
 await cleanupCognitoSocial("did:privy:owner");
 expect(mock.rpc).toHaveBeenCalledWith("cognito_cleanup_subjects",{p_privy_user_id:"did:privy:owner"});
 expect(mock.send).toHaveBeenCalledTimes(1);
 expect(mock.send.mock.calls[0][0].input).toEqual({UserPoolId:"ap-northeast-2_social",Username:"linked-subject"});
 mock.send.mockClear();mock.rpc.mockResolvedValue({data:[]});
 await cleanupCognitoSocial("did:privy:unlinked");
 expect(mock.send).not.toHaveBeenCalled();
});
it("preserves retryable cleanup when provider deletion fails",async()=>{
 mock.rpc.mockResolvedValue({data:"email-subject"});mock.send.mockRejectedValue(new Error("unavailable"));
 await expect(cleanupCognitoEmail("legacy-owner")).rejects.toThrow("Provider cleanup unavailable");
 expect(mock.rpc).toHaveBeenCalledTimes(1);
});
it("skips Cognito cleanup when both providers are legacy",async()=>{
 mock.env.EMAIL_AUTH_PROVIDER="legacy";
 await cleanupCognitoSocial("did:privy:owner");
 expect(mock.rpc).not.toHaveBeenCalled();expect(mock.send).not.toHaveBeenCalled();
});
