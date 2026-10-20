import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AuthError } from "@/features/auth/domain/auth-errors";
import { WAVE_PRIZES, wavePreferencesSchema } from "@/features/fanpage/domain/wave-draw";
import { createWaveDrawHandlers } from "./draw";
const owner="91900000-0000-4000-8000-000000000001", allowlist="91900000-0000-4000-8000-000000000002", requestId="91900000-0000-4000-8000-000000000003";
const pub={entry:null,tickets:1,draw:null,result:{status:"not_entered"},published:[]};
const adm={draw:null,entryCount:0,results:[]};
const req=(body?:unknown)=>new Request("https://kyaa.test/api/kyaa-wave/draw?appUserId=other",{method:body?"POST":"GET",headers:{authorization:"Bearer test","x-correlation-id":requestId},...(body?{body:JSON.stringify(body)}:{})});
function setup(){const deps={authorize:vi.fn().mockResolvedValue({appUserId:owner}),authorizeAdmin:vi.fn().mockResolvedValue({appUserId:owner,allowlistId:allowlist}),rpc:vi.fn().mockResolvedValue(pub)};return{deps,h:createWaveDrawHandlers(deps)};}
describe("Wave event draw boundary",()=>{
 it("fixes catalog order, quantities and distinct Top3",()=>{
  expect(WAVE_PRIZES.map(p=>[p.key,p.quantity])).toEqual([["tshirt",15],["cap",20],["phonecase",10],["hoodie",3],["mousepad",5],["mirror",5],["golf",5],["camera",1],["meal",2],["blue",1]]);
  expect(wavePreferencesSchema.safeParse(["cap","camera","blue"]).success).toBe(true);
  for(const value of [["cap","cap","blue"],["cap"],["cap","camera","other"]]) expect(wavePreferencesSchema.safeParse(value).success).toBe(false);
 });
 it("reads owned data privately and strips internal fields",async()=>{
  const{deps,h}=setup();deps.rpc.mockResolvedValue({...pub,seed:"private"});const response=await h.read(req());
  expect(deps.rpc).toHaveBeenCalledWith("read_owned_kyaa_wave_draw",{p_app_user_id:owner});expect(await response.json()).toEqual(pub);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
 });
 it("saves ordered Top3 only for the authenticated owner",async()=>{
  const{deps,h}=setup();expect((await h.save(req({preferences:["camera","cap","blue"],requestId}))).status).toBe(200);
  expect(deps.rpc).toHaveBeenCalledWith("save_owned_kyaa_wave_draw_preferences",{p_app_user_id:owner,p_preferences:["camera","cap","blue"],p_request_id:requestId});
 });
 it("rejects invalid mutation inputs before RPC",async()=>{
  const{deps,h}=setup();for(const body of [{preferences:["cap","cap","blue"],requestId},{preferences:["cap","camera","blue"],requestId,appUserId:owner},{}])expect((await h.save(req(body))).status).toBe(400);
  expect((await h.execute(req({requestId,seed:"private"}))).status).toBe(400);
  for(const prizeIndex of [0,11,1.5])expect((await h.reveal(req({drawId:owner,prizeIndex,requestId}))).status).toBe(400);
  expect(deps.rpc).not.toHaveBeenCalled();
 });
 it("uses admin identity and correlation for execute/reveal",async()=>{
  const{deps,h}=setup();deps.rpc.mockResolvedValue(adm);
  expect((await h.adminRead(req())).status).toBe(200);
  expect(deps.rpc).toHaveBeenLastCalledWith("read_admin_kyaa_wave_draw",{p_actor_app_user_id:owner,p_actor_admin_allowlist_id:allowlist});
  expect((await h.execute(req({requestId}))).status).toBe(200);
  expect(deps.rpc).toHaveBeenLastCalledWith("execute_admin_kyaa_wave_draw",{p_actor_app_user_id:owner,p_actor_admin_allowlist_id:allowlist,p_correlation_id:requestId,p_request_id:requestId});
  expect((await h.reveal(req({drawId:owner,prizeIndex:1,requestId}))).status).toBe(200);
  expect(deps.rpc).toHaveBeenLastCalledWith("reveal_admin_kyaa_wave_draw",{p_actor_app_user_id:owner,p_actor_admin_allowlist_id:allowlist,p_correlation_id:requestId,p_request_id:requestId,p_draw_id:owner,p_prize_index:1});
 });
 it("requires the appropriate session for all handlers",async()=>{
  const{deps,h}=setup();deps.authorize.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED",401,"Sign in"));deps.authorizeAdmin.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED",401,"Sign in"));
  for(const response of [await h.read(req()),await h.save(req({})),await h.adminRead(req()),await h.execute(req({})),await h.reveal(req({}))])expect(response.status).toBe(401);
  expect(deps.rpc).not.toHaveBeenCalled();
 });
 it.each([["FAN_WEB_ACCOUNT_BUSY",409],["FAN_WEB_CONFLICT",409],["FAN_WEB_FORBIDDEN",403],["FAN_WEB_INVALID_INPUT",400],["internal seed secret",503]])("maps %s without exposing details",async(message,status)=>{
  const{deps,h}=setup();deps.rpc.mockRejectedValue(new Error(message));const response=await h.read(req());expect(response.status).toBe(status);expect(await response.text()).not.toContain("secret");
 });
 it("rejects invalid upstream results",async()=>{const{deps,h}=setup();deps.rpc.mockResolvedValue(null);for(const response of [await h.read(req()),await h.adminRead(req()),await h.save(req({preferences:["camera","cap","blue"],requestId})),await h.execute(req({requestId})),await h.reveal(req({drawId:owner,prizeIndex:1,requestId}))])expect(response.status).toBe(503);});
});
