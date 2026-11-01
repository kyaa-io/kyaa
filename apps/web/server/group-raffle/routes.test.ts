import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AuthError } from "@/features/auth/domain/auth-errors";
import { createGroupRaffleHandler } from "./routes";
const id="e9200000-0000-4000-8000-000000000001",other="e9200000-0000-4000-8000-000000000002";
const rpc=vi.fn(),authorize=vi.fn(async(token:string|null)=>{if(token!=="Bearer valid")throw new AuthError("AUTHENTICATION_REQUIRED",401,"Sign in");return {appUserId:id};}),authorizeAdmin=vi.fn(async()=>({appUserId:id,allowlistId:other,email:"test@example.test",role:"viewer" as const}));
const handle=createGroupRaffleHandler({rpc,authorize,authorizeAdmin});
const request=(body:unknown)=>new Request("https://kyaa.io/api",{method:"POST",headers:{authorization:"Bearer valid"},body:JSON.stringify(body)});
beforeEach(()=>{vi.clearAllMocks();rpc.mockResolvedValue({});});
it("injects only authenticated actor and validates ticket amount and request identity",async()=>{
 expect((await handle("enter",request({requestId:other,amount:2}),id,other)).status).toBe(200);
 expect(rpc).toHaveBeenCalledWith("group_raffle_dispatch",expect.objectContaining({p_actor:id,p_page_id:id,p_id:other,p_input:{requestId:other,amount:2}}));
 expect((await handle("enter",request({requestId:other,amount:0}),id,other)).status).toBe(400);
 expect((await handle("enter",request({requestId:other,amount:2,appUserId:other}),id,other)).status).toBe(400);
 expect(rpc).toHaveBeenCalledTimes(1);
});
it("rejects viewer administration and exposes atomic transaction errors",async()=>{
 expect((await handle("cancel",request({requestId:other}),id,other,true)).status).toBe(403);
 expect(rpc).not.toHaveBeenCalled();rpc.mockRejectedValueOnce(new Error("GROUP_RAFFLE_LIMIT"));
 expect((await handle("enter",request({requestId:other,amount:2}),id,other)).status).toBe(409);
});
it("rejects recipient information without consent",async()=>{
 expect((await handle("recipient",request({requestId:other,name:"A",phone:"01012345678",consented:false,consentVersion:"2026-09-v1"}),id,other)).status).toBe(400);
 expect(rpc).not.toHaveBeenCalled();
});
