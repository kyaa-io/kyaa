import {TextEncoder as NodeTextEncoder} from "node:util";
import {beforeAll,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
import {emailSessionClaims,isCognitoEmailToken,signEmailSession} from "./email-session";
const config={origin:"https://kyaa.io",cookieSecret:Buffer.alloc(32,7).toString("base64")};
beforeAll(()=>{Object.defineProperty(globalThis,"Uint8Array",{configurable:true,value:new NodeTextEncoder().encode("").constructor});});
it("keeps the existing three-segment kyaa-email JWT and legacy UUID contract",async()=>{
 const sessionId="11111111-1111-4111-8111-111111111111",legacyUserId="22222222-2222-4222-8222-222222222222";
 const token=await signEmailSession({sessionId,legacyUserId,expiresAt:Math.floor(Date.now()/1000)+600},config);
 expect(token).toMatch(/^kyaa-email:[^.]+\.[^.]+\.[^.]+$/);expect(isCognitoEmailToken(token)).toBe(true);
 await expect(emailSessionClaims(token,config)).resolves.toMatchObject({sub:legacyUserId,session_id:sessionId});
 await expect(emailSessionClaims(token,{...config,origin:"https://staging.kyaa.io"})).rejects.toMatchObject({status:401});
 await expect(emailSessionClaims(token,{...config,cookieSecret:Buffer.alloc(32,8).toString("base64")})).rejects.toMatchObject({status:401});
});
it("rejects expired wrappers and leaves legacy Supabase tokens on their original verifier path",async()=>{
 const token=await signEmailSession({sessionId:"11111111-1111-4111-8111-111111111111",legacyUserId:"22222222-2222-4222-8222-222222222222",expiresAt:1},config);
 await expect(emailSessionClaims(token,config)).rejects.toMatchObject({status:401});
 expect(isCognitoEmailToken("kyaa-email:eyJhbGciOiJFUzI1NiJ9.e30.signature")).toBe(false);
});
