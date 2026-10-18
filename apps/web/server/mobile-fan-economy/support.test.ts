import legacySql from "./fixtures/sql-support-legacy-projections.json";
import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createFanEconomyHandlers, type FanEconomyDependencies } from "./routes";
import { historySchema, walletSchema } from "./domain";
const owner="11111111-1111-4111-8111-111111111111", creator="22222222-2222-4222-8222-222222222222", key="33333333-3333-4333-8333-333333333333";
const deps:FanEconomyDependencies={authorize:vi.fn(async()=>({appUserId:owner})),rpc:vi.fn(),verifyApple:vi.fn(),verifyGoogle:vi.fn()};
const api=createFanEconomyHandlers(deps);
const wallet={celebrityId:creator,fanPoints:100,freeDrawEntries:2,freeVotes:3,paidVotes:{available:0,held:0},legacyPaidDraw:4,policy:{status:"unconfigured"}};
const receipt={requestKey:key,celebrityId:creator,units:1,supportKrw:100,voucherLedgerId:owner,policyVersion:"support-v1",createdAt:"2026-10-18",replayed:false};
const request=(path:string,body?:unknown,support=false)=>new Request(`https://fixture.test${path}`,{method:body===undefined?"GET":"POST",headers:{"content-type":"application/json",...(support?{"X-Kyaa-Asset-Contract":"support-v1"}:{})},body:body===undefined?undefined:JSON.stringify(body)});
beforeEach(()=>vi.clearAllMocks());
it("selects the separate support wallet only for the explicit contract",async()=>{
 vi.mocked(deps.rpc).mockResolvedValue({...wallet,supportVouchers:2,fanPointLedgerSequence:0});
 expect((await api.wallet(request("/wallet?celebritySlug=creator",undefined,true))).status).toBe(200);
 expect(deps.rpc).toHaveBeenCalledWith("read_owned_mobile_fan_support_wallet",{p_app_user_id:owner,p_celebrity_slug:"creator"});
 expect(walletSchema.safeParse({...wallet,supportVouchers:2,fanPointLedgerSequence:0}).success).toBe(false);
});
it("sends only the authorized owner's exact input and validates internal KRW",async()=>{
 vi.mocked(deps.rpc).mockResolvedValue(receipt);
 const response=await api.support(request("/support",{requestKey:key,celebritySlug:"creator",policyVersion:"support-v1",units:1}));
 expect(response.status).toBe(200);expect(await response.json()).toEqual(receipt);
 expect(deps.rpc).toHaveBeenCalledWith("send_owned_mobile_fan_support",{p_app_user_id:owner,p_request_key:key,p_celebrity_slug:"creator",p_policy_version:"support-v1",p_units:1});
 vi.mocked(deps.rpc).mockResolvedValue({...receipt,supportKrw:99});
 expect((await api.support(request("/support",{requestKey:key,celebritySlug:"creator",policyVersion:"support-v1",units:1}))).status).toBe(503);
});
it("preserves the old history strict enum",()=>{
 expect(historySchema.safeParse({entries:[{id:key,asset:"support_voucher",amount:1,sourceType:"exchange",sourceId:key,createdAt:"2026-10-18"}]}).success).toBe(false);
});

it("keeps legacy wallet on its original RPC and selects support history only on opt-in",async()=>{
 vi.mocked(deps.rpc).mockResolvedValue(wallet);expect((await api.wallet(request("/wallet?celebritySlug=creator"))).status).toBe(200);
 expect(deps.rpc).toHaveBeenLastCalledWith("read_owned_mobile_fan_economy_wallet",expect.anything());
 vi.mocked(deps.rpc).mockResolvedValue({entries:[]});expect((await api.history(request("/history?celebritySlug=creator",undefined,true))).status).toBe(200);
 expect(deps.rpc).toHaveBeenLastCalledWith("read_owned_mobile_fan_support_history",expect.anything());
});
it("rejects support owner injection, wrong units and client-supplied money",async()=>{
 for(const extra of[{owner},{units:0},{units:1.5},{supportKrw:100}])expect((await api.support(request("/support",{requestKey:key,celebritySlug:"creator",policyVersion:"p",units:1,...extra}))).status).toBe(400);
 expect(deps.rpc).not.toHaveBeenCalled();
});
it("recovers support without current favorite and cancels exact original support input",async()=>{
 vi.mocked(deps.rpc).mockResolvedValue({status:"unknown"});expect((await api.supportStatus(request("/status"),key)).status).toBe(200);
 expect(deps.rpc).toHaveBeenLastCalledWith("read_owned_mobile_fan_economy_request",{p_app_user_id:owner,p_request_key:key,p_operation:"support"});
 vi.mocked(deps.rpc).mockResolvedValue({status:"committed",result:receipt});const input={celebritySlug:"creator",policyVersion:"support-v1",units:1};
 expect((await api.cancel(request("/cancel",{operation:"support",input}),key)).status).toBe(200);
 expect(deps.rpc).toHaveBeenLastCalledWith("cancel_owned_mobile_fan_economy_request",{p_app_user_id:owner,p_request_key:key,p_operation:"support",p_input:input});
});
it("normalizes relative ranking photos to the configured public HTTPS origin",async()=>{
 vi.mocked(deps.rpc).mockResolvedValue({items:[{rank:1,celebrityId:creator,celebritySlug:"creator",name:"Creator",imageUrl:"/fixture.webp",supportUnits:1,supportKrw:100}],nextOffset:null});
 const response=await createFanEconomyHandlers({...deps,publicOrigin:"https://kyaa.io"}).supportRankings(request("/support/rankings?locale=en&limit=1&offset=0"));
 expect(response.status).toBe(200);expect((await response.json()).items[0].imageUrl).toBe("https://kyaa.io/fixture.webp");
 expect(deps.rpc).toHaveBeenCalledWith("read_owned_mobile_fan_support_rankings",{p_app_user_id:owner,p_locale:"en",p_limit:1,p_offset:0});
});
it("requires actual owned ledger proof for the cursor reward envelope",async()=>{
 const reward={status:"awarded",asset:"fan_point",amount:100,policyVersion:"p",sourceId:key,ledgerId:creator};
 vi.mocked(deps.rpc).mockResolvedValue({reward,ledgerSequence:3,newlyAwarded:true});expect((await api.reward(request("/rewards/id?afterSequence=2&celebritySlug=creator",undefined,true),key)).status).toBe(200);
 expect(deps.rpc).toHaveBeenLastCalledWith("read_owned_mobile_fan_support_reward",{p_app_user_id:owner,p_source_id:key,p_after_sequence:2,p_celebrity_slug:"creator"});
 vi.mocked(deps.rpc).mockResolvedValue({reward,ledgerSequence:null,newlyAwarded:true});expect((await api.reward(request("/rewards/id?afterSequence=2&celebritySlug=creator",undefined,true),key)).status).toBe(503);
 vi.mocked(deps.rpc).mockResolvedValue(reward);expect((await api.reward(request("/rewards/id"),key)).status).toBe(200);
});
it("forwards checkin to its canonical source proof without accepting an owner",async()=>{
 vi.mocked(deps.rpc).mockResolvedValue({awarded:true,sourceId:key,replayed:false});expect((await api.checkIn(request("/activities/check-in",{celebritySlug:"creator"}))).status).toBe(200);
 expect(deps.rpc).toHaveBeenLastCalledWith("check_in_mobile_fan_support",{p_app_user_id:owner,p_celebrity_slug:"creator"});
});

it("parses actual upgraded SQL with the unchanged base strict wallet/history contracts",()=>{
 const base=execFileSync("git",["show","422045cc8:apps/web/server/mobile-fan-economy/domain.ts"],{encoding:"utf8"});
 const current=readFileSync("server/mobile-fan-economy/domain.ts","utf8");
 for(const name of["walletSchema","exchangePolicySchema","historySchema"])expect(current.split("\n").find(l=>l.startsWith(`export const ${name} =`))).toBe(base.split("\n").find(l=>l.startsWith(`export const ${name} =`)));
 for(const raw of legacySql.wallets)expect(walletSchema.safeParse(raw).success).toBe(true);
 for(const raw of legacySql.histories)expect(historySchema.safeParse(raw).success).toBe(true);
});

it("rejects missing creator and duplicate cursors for reward proof",async()=>{
 for(const path of["/rewards/id?afterSequence=0","/rewards/id?afterSequence=0&afterSequence=1&celebritySlug=creator"])
 expect((await api.reward(request(path,undefined,true),key)).status).toBe(400);
 expect(deps.rpc).not.toHaveBeenCalled();
});
