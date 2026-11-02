import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createGroupActivityHandler } from "./routes";
import { AuthError } from "@/features/auth/domain/auth-errors";
const owner = "11111111-1111-4111-8111-111111111111", page = "22222222-2222-4222-8222-222222222222", item = "33333333-3333-4333-8333-333333333333", key = "44444444-4444-4444-8444-444444444444";
const authorize = vi.fn(async () => ({ appUserId: owner }));
const authorizeAdmin = vi.fn(); const rpc = vi.fn();
const api = createGroupActivityHandler({ authorize, authorizeAdmin, rpc });
const req = (body?: unknown, guest = false) => new Request("https://fixture.test/api/groups/fixture", { method: body ? "POST" : "GET", headers: guest ? {} : { authorization: "Bearer fixture" }, body: body ? JSON.stringify(body) : undefined });
beforeEach(() => { vi.clearAllMocks(); rpc.mockResolvedValue({ events: [], canManage: false, nextCursor: null }); });
describe("group activities ownership boundary", () => {
  it("reads public events without inventing a member identity", async () => {
    expect((await api("events", req(undefined, true), { id: page })).status).toBe(200);
    expect(authorize).not.toHaveBeenCalled(); expect(rpc).toHaveBeenCalledWith("group_activities_dispatch", expect.objectContaining({ p_actor: null, p_page_id: page }));
  });
  it("forwards authenticated applications with only server ownership", async () => {
    rpc.mockResolvedValueOnce({status:"pending",eventId:item});
    expect((await api("event-apply", req({ requestId: key }), { id: page, itemId: item })).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("group_activities_dispatch", expect.objectContaining({ p_actor: owner, p_item_id: item, p_input: { requestId: key } }));
  });
  it("rejects injected owner or attendance state", async () => {
    for (const body of [{ requestId: key, appUserId: owner }, { requestId: key, status: "confirmed" }]) expect((await api("event-apply", req(body), { id: page, itemId: item })).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects unsafe collection destinations without fetching a URL", async () => {
    for (const externalUrl of ["javascript:alert(1)", "https://user:pass@example.test/private"]) expect((await api("collection-save", req({ requestId: key, title: "Merch", externalUrl, status: "active" }), { id: page })).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("does not let a page manager assign an invented mission reward", async () => {
    expect((await api("mission-save", req({ requestId: key, title: "Mission", instructions: "Proof", state: "published", rewardPoints: 100 }), { id: page })).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("requires a writable platform admin for reward policies", async () => {
    authorizeAdmin.mockResolvedValue({ appUserId: owner, allowlistId: key, role: "viewer" });
    expect((await api("mission-reward-policy", req({ requestId: key, rewardPoints: 10, budgetPoints: 100 }), { id: page, itemId: item })).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("does not forge a successful platform review on failed auth", async () => {
    authorizeAdmin.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", 403, "Denied"));
    expect((await api("official-review", req({ requestId: key, action: "approve" }), { id: page, itemId: item, subId: key })).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("combines the actual page raffle catalog for activities", async () => {
    rpc.mockResolvedValueOnce({ events: [], missions: [], certificationHref: null }).mockResolvedValueOnce({ raffles: [{ id: item }] });
    expect(await (await api("activities", req(), { id: page })).json()).toEqual({ events: [], missions: [], certificationHref: null, raffles: [{ id: item }] });
    expect(rpc).toHaveBeenLastCalledWith("group_raffle_list", { p_page_id: page, p_actor: owner });
  });
  it("returns unavailable for a corrupt DB result", async () => {
    rpc.mockResolvedValue(null); expect((await api("events", req(), { id: page })).status).toBe(503);
  });
});
describe("event operations and supporting evidence",()=>{
 it("requires a confirmed-name check and a reason for manual attendance",async()=>{
  expect((await api("event-manual-check-in",req({requestId:key,confirmedName:"Member"}),{id:page,itemId:item,subId:key})).status).toBe(400);expect(rpc).not.toHaveBeenCalled();
  rpc.mockResolvedValue({status:"checked_in",registrationId:key,checkedInAt:"2026-11-01T00:00:00Z",alreadyCheckedIn:false,replayed:false});
  expect((await api("event-manual-check-in",req({requestId:key,confirmedName:"Member",reason:"Phone cannot display QR"}),{id:page,itemId:item,subId:key})).status).toBe(200);
  expect(rpc).toHaveBeenCalledWith("group_activities_dispatch",expect.objectContaining({p_operation:"event-manual-check-in",p_actor:owner,p_sub_id:key,p_input:{requestId:key,confirmedName:"Member",reason:"Phone cannot display QR"}}));
 });
 it("preserves the distinction between replay and a separate QR scan",async()=>{
  const result={status:"checked_in",registrationId:key,checkedInAt:"2026-11-01T00:00:00Z",alreadyCheckedIn:true,replayed:false};rpc.mockResolvedValue(result);
  const response=await api("event-check-in",req({requestId:key,qrPayload:`kyaa-event:${key}:${"a".repeat(64)}`}),{id:page,itemId:item});expect(await response.json()).toEqual(result);
 });
 it("bounds participant nickname search before persistence",async()=>{
  rpc.mockResolvedValue({items:[],nextCursor:null});const request=new Request("https://fixture.test/api?search=Manual&limit=1",{headers:{authorization:"Bearer fixture"}});
  expect((await api("event-participants",request,{id:page,itemId:item})).status).toBe(200);expect(rpc).toHaveBeenCalledWith("group_activities_dispatch",expect.objectContaining({p_input:expect.objectContaining({search:"Manual",limit:1})}));
 });
 it("keeps supporting evidence independent with exact URL and prior revision",async()=>{
  const sourceUrl="https://example.test/evidence?keep=1#source",result={id:key,eventId:item,revision:2,description:"Supplemented",sourceUrl,status:"submitted",reason:null,createdAt:"2026-11-01T00:00:00Z",reviewedAt:null,previousSubmissionId:page};rpc.mockResolvedValue(result);
  expect((await api("event-support-submit",req({requestId:key,description:"Supplemented",sourceUrl,previousSubmissionId:page}),{id:page,itemId:item})).status).toBe(200);
  expect(rpc).toHaveBeenCalledWith("group_activities_dispatch",expect.objectContaining({p_operation:"event-support-submit",p_input:{requestId:key,description:"Supplemented",sourceUrl,previousSubmissionId:page}}));
 });
 it("allows official status reads but prevents viewer support reviews",async()=>{
  rpc.mockResolvedValue({items:[],nextCursor:null});expect((await api("official-applications",req(),{id:page,itemId:item})).status).toBe(200);
  authorizeAdmin.mockResolvedValue({appUserId:owner,allowlistId:key,role:"viewer"});rpc.mockClear();expect((await api("event-support-review",req({requestId:key,action:"approve"}),{id:page,itemId:item,subId:key})).status).toBe(403);expect(rpc).not.toHaveBeenCalled();
 });
});

it('returns the self-ticket participant name without accepting a client identity',async()=>{
 const result={qrPayload:`kyaa-event:${key}:${'a'.repeat(64)}`,status:'valid',participantName:'하늘'};rpc.mockResolvedValue(result);
 const response=await api('event-ticket',req(),{id:page,itemId:item});expect(response.status).toBe(200);expect(await response.json()).toEqual(result);expect(rpc).toHaveBeenCalledWith('group_activities_dispatch',expect.objectContaining({p_actor:owner}));expect(response.headers.get('cache-control')).toBe('private, no-store');
});
it('accepts an original blank survey opinion and bounded private evidence fields without accepting actor injection',async()=>{
 rpc.mockResolvedValue({id:item,body:'',status:'pending',reason:null,rewardPoints:0});const input={requestId:key,body:'',surveyChoice:1,expectedMissionRevision:2};expect((await api('mission-submit',req(input),{id:page,itemId:item})).status).toBe(200);expect(rpc).toHaveBeenLastCalledWith('group_activities_dispatch',expect.objectContaining({p_actor:owner,p_input:input}));
 for(const patch of [{surveyChoice:3},{imageAssetId:'https://example.test/photo'},{expectedMissionRevision:0},{appUserId:owner}])expect((await api('mission-submit',req({...input,...patch}),{id:page,itemId:item})).status).toBe(400);
});
it('requires exact revision for review and validates all three persisted survey choices',async()=>{
 rpc.mockRejectedValueOnce(new Error('GROUP_ACTIVITY_CONFLICT'));expect((await api('mission-review',req({requestId:key,action:'approve'}),{id:page,itemId:item,subId:owner})).status).toBe(409);
 rpc.mockResolvedValueOnce({id:item,body:'Original proof',status:'completed',reason:null,rewardPoints:0});expect((await api('mission-review',req({requestId:key,action:'approve',expectedSubmissionRevision:2}),{id:page,itemId:item,subId:owner})).status).toBe(200);
 for(const surveyOptions of [['One','Two'],['One','One','Three'],['One','','Three']])expect((await api('mission-save',req({requestId:key,title:'Survey',instructions:'Original',state:'published',submissionKind:'survey',surveyQuestion:'Question',surveyOptions}),{id:page})).status).toBe(400);
});

it('replays the exact legacy immutable receipts while keeping new GET evidence validation strict',async()=>{
 for(const [operation,input,receipt]of[
 ['mission-submit',{requestId:key,body:'Original'},{id:item,status:'pending'}],
 ['mission-review',{requestId:key,action:'approve'},{id:item,status:'completed',rewardPoints:50}],
 ['event-review-write',{requestId:key,body:'Original review'},{status:'saved',eventId:item}]
 ]as const){rpc.mockResolvedValueOnce(receipt);const response=await api(operation,req(input),{id:page,itemId:item,subId:owner});expect(response.status).toBe(200);expect(await response.json()).toEqual(receipt);}
 rpc.mockResolvedValueOnce({id:item,status:'pending',imageUrl:'/invented.png'});expect((await api('mission-submit',req({requestId:key,body:'Original'}),{id:page,itemId:item})).status).toBe(503);
 rpc.mockResolvedValueOnce({mission:{},submission:{id:item,status:'pending'},canSubmit:false,canReview:false});expect((await api('mission',req(),{id:page,itemId:item})).status).toBe(503);
});
it('validates organizer notes without altering the original or accepting participant identity fields',async()=>{
 const applicationMessage='  원문 메모  ';rpc.mockResolvedValueOnce({status:'pending',eventId:item});const response=await api('event-apply',req({requestId:key,applicationMessage}),{id:page,itemId:item});expect(response.status).toBe(200);expect(rpc).toHaveBeenLastCalledWith('group_activities_dispatch',expect.objectContaining({p_actor:owner,p_input:{requestId:key,applicationMessage}}));
 for(const patch of [{applicationMessage:'x'.repeat(1001)},{applicationMessage:42},{participantName:'Injected'},{appUserId:page}])expect((await api('event-apply',req({requestId:key,...patch}),{id:page,itemId:item})).status).toBe(400);
});
