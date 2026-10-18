import { describe, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
import { SupabaseLiveMissionRepository } from "./live-mission-repository";
const owner="11111111-1111-4111-8111-111111111111", missionId="22222222-2222-4222-8222-222222222222", responseId="33333333-3333-4333-8333-333333333333";
const legacy={mission:{id:missionId,type:"quiz",completed:true,correctness:true,scorePoints:1,ticketAmount:0,stamp:{id:owner,businessStatus:"completed",mintStatus:"queued"}}};
const input={appUserId:owner,missionId,idempotencyKey:owner,answers:[]};
describe("mission committed reward source",()=>{
 it("strips internal responseId before exact legacy parser",async()=>{const rpc=vi.fn().mockResolvedValue({data:{...legacy,responseId},error:null});expect(await new SupabaseLiveMissionRepository({rpc} as never).submit(input)).toEqual(legacy);expect(rpc).toHaveBeenCalledTimes(1);});
 it("uses response UUID rather than mission UUID on opt-in",async()=>{const reward={status:"awarded",asset:"fan_point",amount:10,policyVersion:"p1",sourceId:responseId,ledgerId:owner};const rpc=vi.fn().mockResolvedValueOnce({data:{...legacy,responseId},error:null}).mockResolvedValueOnce({data:reward,error:null});expect(await new SupabaseLiveMissionRepository({rpc} as never).submit({...input,fanRewardContract:true})).toEqual({...legacy,fanReward:reward});expect(rpc).toHaveBeenLastCalledWith("read_owned_mobile_fan_reward",{p_app_user_id:owner,p_source_id:responseId});});
});
