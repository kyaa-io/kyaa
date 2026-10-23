import{afterEach,expect,it,vi}from"vitest";
vi.mock("server-only",()=>({}));
const mock=vi.hoisted(()=>({rpc:vi.fn(),enabled:true}));
vi.mock("../../config/env",()=>({loadServerEnv:()=>({COGNITO_ENROLLMENT_ENABLED:mock.enabled})}));
vi.mock("./identity-repository",()=>({identityDatabase:()=>({rpc:mock.rpc})}));
import{classifyEnrollment}from"./enrollment";
const identity={issuer:"https://cognito-idp.ap-northeast-2.amazonaws.com/ap-northeast-2_pool",subject:"cognito-sub",email:"fan@example.test",tokenId:"jti",provider:{name:"google" as const,issuer:"https://accounts.google.com",subject:"google-sub"}};
afterEach(()=>{vi.clearAllMocks();mock.enabled=true;});
const value=(data:unknown)=>({data,error:null});
it("recovers a durable pending link without enabling another wallet signup",async()=>{
 mock.rpc.mockResolvedValue(value("did:privy:pending"));
 await expect(classifyEnrollment(identity)).resolves.toMatchObject({mode:"recovery",expectedPrivyUserId:"did:privy:pending"});
 expect(mock.rpc).toHaveBeenCalledOnce();
});
it("issues a single-use enrollment permit only after full database classification and the feature gate",async()=>{
 mock.rpc.mockResolvedValueOnce(value(null)).mockResolvedValueOnce(value({mode:"new"})).mockResolvedValueOnce(value(null));
 await expect(classifyEnrollment(identity)).resolves.toMatchObject({mode:"new",provider:"google",permit:expect.stringMatching(/^[A-Za-z0-9_-]{43}$/)});
 expect(mock.rpc).toHaveBeenLastCalledWith("create_cognito_enrollment_permit",expect.objectContaining({p_subject:"cognito-sub",p_provider_subject:"google-sub",p_verified_email:"fan@example.test"}));
 mock.enabled=false;mock.rpc.mockResolvedValueOnce(value(null)).mockResolvedValueOnce(value({mode:"new"}));
 await expect(classifyEnrollment(identity)).resolves.toEqual({mode:"blocked"});
});
it("keeps imported existing identities on their original DID and blocks email collisions",async()=>{
 mock.rpc.mockResolvedValueOnce(value(null)).mockResolvedValueOnce(value({mode:"recovery",expectedPrivyUserId:"did:privy:old"}));
 await expect(classifyEnrollment(identity)).resolves.toMatchObject({mode:"recovery",expectedPrivyUserId:"did:privy:old"});
 mock.rpc.mockResolvedValueOnce(value(null)).mockResolvedValueOnce(value({mode:"blocked"}));
 await expect(classifyEnrollment(identity)).resolves.toMatchObject({mode:"blocked"});
});
