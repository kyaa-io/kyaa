import {expect,it,vi} from "vitest";
// @ts-expect-error Lambda deployment entry point is JavaScript.
import {createMigrationHandler} from "./migration-lambda.mjs";
const base={userPoolId:"pool",callerContext:{clientId:"email-client"},triggerSource:"UserMigration_Authentication",userName:"old@example.test",request:{password:"never-log-password"},response:{}};
it("migrates a password-verified existing owner without resetting UUID or requiring password reset",async()=>{
 const verifyPassword=vi.fn().mockResolvedValue({legacyUserId:"legacy-uuid",appUserId:"owner-uuid",email:"old@example.test"});
 const handler=createMigrationHandler({verifyPassword,userPoolId:"pool",clientId:"email-client"});
 const result=await handler(structuredClone(base));
 expect(result.response).toMatchObject({finalUserStatus:"CONFIRMED",messageAction:"SUPPRESS",forceAliasCreation:false,userAttributes:{"custom:legacy_user_id":"legacy-uuid","custom:app_user_id":"owner-uuid",email_verified:"true"}});
 expect(verifyPassword).toHaveBeenCalledWith("old@example.test","never-log-password");
});
it("rejects unknown callers and unverified credentials without emitting secrets",async()=>{
 const verifyPassword=vi.fn().mockResolvedValue(null),log=vi.spyOn(console,"log");
 const handler=createMigrationHandler({verifyPassword,userPoolId:"pool",clientId:"email-client"});
 await expect(handler({...base,userPoolId:"other"})).rejects.toThrow();expect(verifyPassword).not.toHaveBeenCalled();
 await expect(handler(structuredClone(base))).rejects.toThrow("Authentication failed");expect(log).not.toHaveBeenCalled();log.mockRestore();
 expect(()=>createMigrationHandler({verifyPassword})).toThrow();
});
