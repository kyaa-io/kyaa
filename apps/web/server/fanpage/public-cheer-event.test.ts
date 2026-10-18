import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
const mocks=vi.hoisted(()=>({rpc:vi.fn(),abortSignal:vi.fn()}));
vi.mock("@supabase/supabase-js",()=>({createClient:()=>({rpc:mocks.rpc})}));
import { readPublicCheerEvent } from "./public-cheer-event";
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
describe("public event initial render",()=>{
 it("reads anonymously with a deadline and returns an explicit no-campaign state",async()=>{
  vi.stubEnv("SUPABASE_URL","https://database.test");vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY","test-key");
  mocks.rpc.mockReturnValue({abortSignal:mocks.abortSignal});mocks.abortSignal.mockResolvedValue({data:{event:null},error:null});
  expect(await readPublicCheerEvent("changha","ko")).toBeNull();
  expect(mocks.rpc).toHaveBeenCalledWith("read_celebrity_cheer_event_live_state",{p_slug:"changha",p_app_user_id:null,p_locale:"ko"});
  expect(mocks.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
 });
 it("never serializes owner confirmation into public initial props",async()=>{
  vi.stubEnv("SUPABASE_URL","https://database.test");vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY","test-key");
  const id="11111111-1111-4111-8111-111111111111", at="2026-10-22T10:45:00Z";
  const event={campaignId:id,creatorSlug:"changha",liveEventId:id,liveSlug:"changha-wave",entryOpensAt:at,entryClosesAt:at,liveStartsAt:at,reservationOpensAt:at,reservationClosesAt:at,reservationAvailable:false,status:"open",prizes:[],participation:{entered:true,enteredAt:at,reserved:true,weight:2}};
  mocks.rpc.mockReturnValue({abortSignal:mocks.abortSignal});mocks.abortSignal.mockResolvedValue({data:{event},error:null});
  expect(await readPublicCheerEvent("changha","ko")).toEqual({...event,participation:null});
 });
 it.each([{data:null,error:{message:"offline"}},{data:{event:{privateEmail:"private"}},error:null}])("leaves API recovery available on unavailable or invalid data",async response=>{
  vi.stubEnv("SUPABASE_URL","https://database.test");vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY","test-key");
  mocks.rpc.mockReturnValue({abortSignal:mocks.abortSignal});mocks.abortSignal.mockResolvedValue(response);
  expect(await readPublicCheerEvent("wena","en")).toBeUndefined();
 });
 it("does not require optional event configuration to render the fanpage",async()=>{
  vi.stubEnv("SUPABASE_URL","");expect(await readPublicCheerEvent("changha","ko")).toBeUndefined();expect(mocks.rpc).not.toHaveBeenCalled();
 });
});
