import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AuthError } from "@/features/auth/domain/auth-errors";
import { createGroupGiftHandler } from "./routes";
const actor="e9200000-0000-4000-8000-000000000001", page="e9200000-0000-4000-8000-000000000002", application="e9200000-0000-4000-8000-000000000003";
const rpc=vi.fn(), authorize=vi.fn(async(token:string|null)=>{if(token!=="Bearer valid")throw new AuthError("AUTHENTICATION_REQUIRED",401,"Sign in");return {appUserId:actor};});
const authorizeAdmin=vi.fn(async()=>({appUserId:actor,allowlistId:page,email:"reviewer@example.test",role:"viewer" as const}));
const handle=createGroupGiftHandler({rpc,authorize,authorizeAdmin});
const fields={requestId:application,name:"Gift",imageAssetId:application,quantity:10,providerName:"Provider",fulfillmentMethod:"on_site_pickup",fulfillmentDescription:"At venue",conditions:""};
const request=(body:unknown,token="Bearer valid")=>new Request("https://dev.kyaa.io/api",{method:"POST",headers:{authorization:token},body:JSON.stringify(body)});
beforeEach(()=>{vi.clearAllMocks();rpc.mockResolvedValue({id:application,status:"submitted",revision:1});});
it("binds the actor to authentication and rejects identity injection and invalid stock",async()=>{
 expect((await handle("submit",request(fields),{id:page})).status).toBe(200);
 expect(rpc).toHaveBeenCalledWith("group_gifts_dispatch",expect.objectContaining({p_actor:actor,p_page_id:page,p_admin_id:null,p_input:fields}));
 for(const patch of [{appUserId:page},{quantity:0},{quantity:1.5},{imageAssetId:"https://example.test/image"}])expect((await handle("submit",request({...fields,...patch}),{id:page})).status).toBe(400);
 expect(rpc).toHaveBeenCalledTimes(1);
 expect((await handle("submit",request(fields,"Bearer invalid"),{id:page})).status).toBe(401);
});
it("requires a submission revision and prevents viewer review",async()=>{
 expect((await handle("revise",request(fields),{id:page,applicationId:application})).status).toBe(400);
 expect((await handle("revise",request({...fields,expectedRevision:2}),{id:page,applicationId:application})).status).toBe(200);
 expect((await handle("review",request({requestId:application,expectedRevision:2,decision:"approved",reason:""}),{applicationId:application})).status).toBe(403);
 expect(rpc).toHaveBeenCalledTimes(1);
});
it("keeps private read routes authenticated and maps stale review conflicts without error leaks",async()=>{
 expect((await handle("detail",new Request("https://dev.kyaa.io/api"),{id:page,applicationId:application})).status).toBe(401);
 rpc.mockRejectedValueOnce(new Error("GROUP_GIFT_CONFLICT"));
 expect((await handle("revise",request({...fields,expectedRevision:1}),{id:page,applicationId:application})).status).toBe(409);
 rpc.mockRejectedValueOnce(new Error("private database connection detail"));
 const response=await handle("list",request({}),{id:page});expect(response.headers.get("cache-control")).toBe("private, no-store");expect(response.status).toBe(503);expect(await response.text()).not.toContain("database connection");
});
it("validates private list filters and rejects malformed persisted DTOs",async()=>{
 rpc.mockResolvedValueOnce({items:[],nextCursor:null});
 const response=await handle("list",new Request("https://dev.kyaa.io/api?status=approved&limit=100",{headers:{authorization:"Bearer valid"}}),{id:page});expect(response.status).toBe(200);expect(rpc).toHaveBeenCalledWith("group_gifts_dispatch",expect.objectContaining({p_input:{status:"approved",limit:100}}));
 expect((await handle("list",new Request("https://dev.kyaa.io/api?limit=999",{headers:{authorization:"Bearer valid"}}),{id:page})).status).toBe(400);
 rpc.mockResolvedValueOnce({items:[{id:application}],nextCursor:null});const invalid=await handle("list",request({}),{id:page});expect(invalid.status).toBe(503);expect(await invalid.json()).toEqual({error:{code:"GROUP_GIFT_UNAVAILABLE"}});
});
