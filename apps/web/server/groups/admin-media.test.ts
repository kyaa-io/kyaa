import {describe,it,expect,vi}from "vitest";
vi.mock("server-only",()=>({}));
import {AuthError}from "@/features/auth/domain/auth-errors";
import {createGroupReportMediaHandler}from "./admin-media";
const id="10000000-0000-4000-8000-000000000001",params={id,itemId:id,assetId:id};
function setup(){const authorizeAdmin=vi.fn().mockResolvedValue({appUserId:id,allowlistId:id,role:"viewer"}),rpc=vi.fn().mockResolvedValue({storagePath:"private/evidence.png",contentType:"image/png"}),stream=vi.fn().mockResolvedValue(new Response("private bytes",{status:206,headers:{"content-range":"bytes 0-12/13"}}));return{authorizeAdmin,rpc,stream,handler:createGroupReportMediaHandler({authorizeAdmin,rpc,stream})};}
describe("report media authority",()=>{
 it("requires admin identity before SQL or storage",async()=>{const s=setup();s.authorizeAdmin.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED",401,"Login"));expect((await s.handler(new Request("https://kyaa.test/evidence"),params)).status).toBe(401);expect(s.rpc).not.toHaveBeenCalled();expect(s.stream).not.toHaveBeenCalled();});
 it("streams only SQL-authorized report assets and preserves private range headers",async()=>{const s=setup();const r=await s.handler(new Request("https://kyaa.test/evidence?variant=thumbnail",{headers:{authorization:"Bearer valid",range:"bytes=0-12"}}),params);expect(r.status).toBe(206);expect(r.headers.get("cache-control")).toBe("private, no-store");expect(r.headers.get("content-range")).toBe("bytes 0-12/13");expect(s.rpc).toHaveBeenCalledWith("authorize_group_report_media_read",expect.objectContaining({p_actor:id,p_admin_id:id,p_page_id:id,p_report_id:id,p_asset_id:id,p_variant:"thumbnail",p_request_id:expect.any(String)}));expect(s.stream).toHaveBeenCalledWith("private/evidence.png","bytes=0-12","GET");});
 it("does not read storage when an asset is unrelated or removed",async()=>{const s=setup();s.rpc.mockResolvedValue(null);expect((await s.handler(new Request("https://kyaa.test/evidence"),params)).status).toBe(404);expect(s.stream).not.toHaveBeenCalled();});
 it("rejects duplicate variants before SQL authorization",async()=>{const s=setup();expect((await s.handler(new Request("https://kyaa.test/evidence?variant=original&variant=thumbnail"),params)).status).toBe(400);expect(s.rpc).not.toHaveBeenCalled();});
});
