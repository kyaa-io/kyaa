import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createEmailAuthHandler } from "./email-route";
import type { createEmailAuthClients } from "./email-auth";
const uid="11111111-1111-4111-8111-111111111111", aid="22222222-2222-4222-8222-222222222222", sid="33333333-3333-4333-8333-333333333333";
const config={url:"https://project.supabase.co",serviceRoleKey:"server-only"};
const exp=Math.floor(Date.now()/1000)+600;
const jwt=`eyJhbGciOiJFUzI1NiJ9.${Buffer.from(JSON.stringify({sub:uid,session_id:sid,iss:config.url+"/auth/v1",aud:"authenticated",exp})).toString("base64url")}.signature`;
const session={access_token:jwt,refresh_token:"rotated-refresh",expires_at:exp,user:{id:uid}};
const port={ auth:{ signInWithPassword:vi.fn(),refreshSession:vi.fn(),getUser:vi.fn(),admin:{signOut:vi.fn()} },database:{rpc:vi.fn()} };
const factory=vi.fn(()=>port as unknown as ReturnType<typeof createEmailAuthClients>);
const handler=(action:"login"|"refresh"|"logout")=>createEmailAuthHandler(action,()=>config,factory);
const request=(body:unknown,authorization?:string)=>new Request("https://kyaa.io/api/auth/email/login",{method:"POST",headers:{"content-type":"application/json",...(authorization?{authorization}:{})},body:JSON.stringify(body)});
beforeEach(()=>{
 vi.clearAllMocks();
 port.auth.signInWithPassword.mockResolvedValue({data:{session},error:null});port.auth.refreshSession.mockResolvedValue({data:{session},error:null});
 port.auth.getUser.mockResolvedValue({data:{user:{id:uid,email_confirmed_at:"2026-10-18"}},error:null});port.auth.admin.signOut.mockResolvedValue({error:null});
 port.database.rpc.mockImplementation(async name=>({error:null,data:name==="check_mobile_email_session"?{appUserId:aid,privyUserId:"did:privy:reviewer"}:name==="get_owned_user_profile"?{completed:false,nickname:null}:"ko"}));
});
it("returns the agreed owner DTO without trimming the password and rotates via request-scoped clients",async()=>{
 const response=await handler("login")(request({email:"Reviewer@example.test",password:" secret ",locale:"ko"}));
 expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("private, no-store");expect(response.headers.get("vary")).toBe("Authorization");
 expect(await response.json()).toEqual({accessToken:`kyaa-email:${jwt}`,refreshToken:"rotated-refresh",expiresAt:exp,userId:`supabase:${uid}`,appUserId:aid,profile:{completed:false,nickname:null}});
 expect(port.auth.signInWithPassword).toHaveBeenCalledWith({email:"reviewer@example.test",password:" secret "});
 const refresh=await handler("refresh")(request({refreshToken:"old",locale:"en"}));expect(refresh.status).toBe(200);
 expect(port.auth.refreshSession).toHaveBeenCalledWith({refresh_token:"old"});expect(factory).toHaveBeenCalledTimes(2);
});
it("strictly bounds bodies and rejects extra fields before creating any auth clients",async()=>{
 for(const body of [{email:"reviewer@example.test",password:"x",locale:"ko",role:"admin"},{email:"reviewer@example.test",password:"x"},{email:"a".repeat(9000)}]) expect((await handler("login")(request(body))).status).toBe(400);
 expect(factory).not.toHaveBeenCalled();
});
it("returns indistinguishable wrong-password/unbound failures and never includes provider details",async()=>{
 port.auth.signInWithPassword.mockResolvedValueOnce({data:{session:null},error:{status:400,message:"secret identity"}});
 const bad=await handler("login")(request({email:"reviewer@example.test",password:"wrong",locale:"ko"}));
 port.database.rpc.mockResolvedValueOnce({data:null,error:null});
 const unbound=await handler("login")(request({email:"reviewer@example.test",password:"right",locale:"ko"}));
 expect(bad.status).toBe(401);expect(unbound.status).toBe(401);expect(await bad.json()).toEqual(await unbound.json());
});
it("propagates provider throttling as a generic 429",async()=>{
 port.auth.signInWithPassword.mockResolvedValue({data:{session:null},error:{status:429,message:"private"}});
 const response=await handler("login")(request({email:"reviewer@example.test",password:"x",locale:"ko"}));expect(response.status).toBe(429);expect(await response.text()).not.toContain("private");
});
it("revokes the exact local session and rejects its reuse through the live gate",async()=>{
 const response=await handler("logout")(request(null,`Bearer kyaa-email:${jwt}`));expect(response.status).toBe(204);
 expect(port.auth.admin.signOut).toHaveBeenCalledWith(jwt,"local");
 port.database.rpc.mockResolvedValueOnce({data:null,error:null});
 expect((await handler("logout")(request(null,`Bearer kyaa-email:${jwt}`))).status).toBe(401);
 expect(port.auth.admin.signOut).toHaveBeenCalledTimes(1);
});
