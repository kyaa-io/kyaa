import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import terminalFixture from "./fixtures/sql-lucky-terminal.json";
import { freeLuckyTerminalSchema, createMobileBenefitsHandlers, type MobileBenefitsDependencies } from "./routes";

const owner = "11111111-1111-4111-8111-111111111111";
const benefit = "22222222-2222-4222-8222-222222222222";
const requestKey = "33333333-3333-4333-8333-333333333333";
const deps: MobileBenefitsDependencies = { authorize: vi.fn(async () => ({ appUserId: owner })), rpc: vi.fn() };
const api = createMobileBenefitsHandlers(deps);
const request = (path: string, init?: RequestInit) => new Request(`https://byus.test${path}`, { headers: { authorization: "Bearer valid", "content-type": "application/json" }, ...init });

beforeEach(() => vi.clearAllMocks());
describe("mobile benefits routes", () => {
  it("reads separate free and paid balances for the authenticated owner", async () => {
    vi.mocked(deps.rpc).mockResolvedValue({ celebrityId: benefit, balances: { free: 8, paid: 4, total: 12 } });
    const response = await api.tickets(request("/api/me/mobile-benefits/tickets?celebritySlug=nchive"));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ celebrityId: benefit, balances: { free: 8, paid: 4, total: 12 } });
    expect(deps.rpc).toHaveBeenCalledWith("read_owned_mobile_benefit_tickets", { p_app_user_id: owner, p_celebrity_slug: "nchive" });
  });
  it("reads configured mission policy and verified evidence without trusting client activity", async () => {
    vi.mocked(deps.rpc).mockResolvedValue({ celebrityId: benefit, policy: { status: "configured", activatedAt: "2026-10-12T00:00:00.000Z", ruleVersion: 2 }, missions: [
      { key: "daily_attendance", status: "available", ticketAmount: 1, ruleVersion: 2, scopeKey: "2026-10-12", eligibilitySource: "community_stamp_daily_checkin", requiresFanVerification: false, defaultPassportCounts: false, sourceId: null, occurredAt: null, ledgerId: null, awardedAt: null },
      { key: "eligible_comment", status: "available", ticketAmount: 1, ruleVersion: 2, scopeKey: "once", eligibilitySource: "eligible_fan_comment", requiresFanVerification: false, defaultPassportCounts: false, sourceId: null, occurredAt: null, ledgerId: null, awardedAt: null },
      { key: "first_signup", status: "awarded", ticketAmount: 1, ruleVersion: 2, scopeKey: "once", eligibilitySource: "quiz_pass", requiresFanVerification: true, defaultPassportCounts: false, sourceId: benefit, occurredAt: "2026-10-12T00:00:00.000Z", ledgerId: requestKey, awardedAt: "2026-10-12T00:00:00.000Z" },
    ] });
    const response = await api.freeTicketMissions(request("/api/me/mobile-benefits/free-ticket-missions?celebritySlug=nchive"));
    expect(response.status).toBe(200);
    expect(deps.rpc).toHaveBeenCalledWith("read_owned_mobile_benefit_free_ticket_missions", { p_app_user_id: owner, p_celebrity_slug: "nchive" });
  });
  it("passes the client request key and policy version to the atomic instant draw RPC", async () => {
    vi.mocked(deps.rpc).mockResolvedValue({ requestId: requestKey, benefitId: benefit, policyVersion: "gift-v2", outcome: "won", prizeId: benefit, awardId: benefit, freeTicketsUsed: 2, paidTicketsUsed: 0, replayed: false });
    const response = await api.draw(request("/api/me/mobile-benefits/instant-draws", { method: "POST", body: JSON.stringify({ requestKey, benefitId: benefit, policyVersion: "gift-v2" }) }));
    expect(response.status).toBe(200);
    expect(deps.rpc).toHaveBeenCalledWith("draw_owned_mobile_benefit", expect.objectContaining({ p_app_user_id: owner, p_request_key: requestKey, p_benefit_id: benefit, p_policy_version: "gift-v2" }));
  });
  it("binds opt-in free draw to the authenticated owner and original favorite", async () => {
    vi.mocked(deps.rpc).mockResolvedValue({ requestId: requestKey, benefitId: benefit, policyVersion: "gift-v2", outcome: "won", prizeId: benefit, awardId: benefit, freeTicketsUsed: 2, paidTicketsUsed: 0, replayed: false });
    const response = await api.draw(request("/api/me/mobile-benefits/instant-draws", { method: "POST", body: JSON.stringify({ requestKey, benefitId: benefit, policyVersion: "gift-v2", celebritySlug: "nchive", freeOnly: true }) }));
    expect(response.status).toBe(200);
    expect(deps.rpc).toHaveBeenCalledWith("submit_owned_mobile_free_lucky", { p_app_user_id: owner, p_request_key: requestKey, p_benefit_id: benefit, p_policy_version: "gift-v2", p_celebrity_slug: "nchive", p_ticket_amount: null });
  });
  it("rejects ambiguous free-only input without a favorite or with caller owner", async () => {
    for (const extra of [{ freeOnly: true }, { freeOnly: true, celebritySlug: "nchive", appUserId: owner }]) {
      expect((await api.draw(request("/api/me/mobile-benefits/instant-draws", { method: "POST", body: JSON.stringify({ requestKey, benefitId: benefit, policyVersion: "gift-v2", ...extra }) }))).status).toBe(400);
    }
    expect(deps.rpc).not.toHaveBeenCalled();
  });
  it.each([
    ["MOBILE_BENEFIT_POLICY_CHANGED", "POLICY_CHANGED"], ["MOBILE_BENEFIT_INSUFFICIENT_TICKETS", "INSUFFICIENT_TICKETS"],
    ["MOBILE_BENEFIT_DAILY_LIMIT", "DAILY_LIMIT_REACHED"], ["MOBILE_BENEFIT_SOLD_OUT", "SOLD_OUT"],
    ["MOBILE_BENEFIT_CLOSED", "BENEFIT_CLOSED"], ["PHASE4_BENEFIT_ENTRY_CLOSED", "ENTRY_REJECTED"],
  ])("returns exact known rejection %s for the original free-only POST", async (sqlCode, code) => {
    vi.mocked(deps.rpc).mockRejectedValueOnce(new Error(sqlCode));
    const response = await api.draw(request("/api/me/mobile-benefits/instant-draws", { method: "POST", body: JSON.stringify({ requestKey, benefitId: benefit, policyVersion: "gift-v2", celebritySlug: "nchive", freeOnly: true }) }));
    expect(response.status).toBe(409); expect(await response.json()).toEqual({ error: { code } });
  });
  it("parses the actual SQL terminal proof and returns it for POST and opted-in GET", async () => {
    expect(freeLuckyTerminalSchema.parse(terminalFixture)).toEqual(terminalFixture);
    const input={requestKey:terminalFixture.terminal.requestKey,...terminalFixture.terminal.input};
    vi.mocked(deps.rpc).mockResolvedValue(terminalFixture);
    const post=await api.draw(request("/api/me/mobile-benefits/instant-draws",{method:"POST",body:JSON.stringify(input)}));
    expect(post.status).toBe(409);expect(await post.json()).toEqual(terminalFixture);
    const get=await api.drawStatus(request(`/api/me/mobile-benefits/instant-draws/${input.requestKey}?freeOnly=1`),input.requestKey);
    expect(get.status).toBe(200);expect(await get.json()).toEqual(terminalFixture);
    expect(deps.rpc).toHaveBeenLastCalledWith("read_owned_mobile_free_lucky",{p_app_user_id:owner,p_request_key:input.requestKey,p_operation:"lucky_draw"});
  });
  it("rejects malformed terminal proof and never infers proof from a plain error code", async () => {
    vi.mocked(deps.rpc).mockResolvedValue({...terminalFixture,terminal:{...terminalFixture.terminal,proof:"client_guess"}});
    expect((await api.drawStatus(request(`/status/${requestKey}?freeOnly=1`),requestKey)).status).toBe(503);
    vi.mocked(deps.rpc).mockResolvedValue(null);
    expect(await(await api.drawStatus(request(`/status/${requestKey}?freeOnly=1`),requestKey)).json()).toEqual({status:"unknown"});
    vi.mocked(deps.rpc).mockRejectedValueOnce(new Error("MOBILE_BENEFIT_INSUFFICIENT_TICKETS"));
    const rejection=await api.draw(request("/draw",{method:"POST",body:JSON.stringify({requestKey,benefitId:benefit,policyVersion:"gift-v2",celebritySlug:"nchive",freeOnly:true})}));
    expect(await rejection.json()).toEqual({error:{code:"INSUFFICIENT_TICKETS"}});
  });
  it("maps stale policies and duplicate query values without exposing database details", async () => {
    vi.mocked(deps.rpc).mockRejectedValueOnce(new Error("MOBILE_BENEFIT_POLICY_CHANGED private"));
    expect((await api.draw(request("/api/me/mobile-benefits/instant-draws", { method: "POST", body: JSON.stringify({ requestKey, benefitId: benefit, policyVersion: "old" }) }))).status).toBe(409);
    const invalid = await api.catalog(request("/api/me/mobile-benefits?celebritySlug=a&celebritySlug=b"));
    expect(invalid.status).toBe(400); expect(deps.authorize).toHaveBeenCalledTimes(1);
  });
  it("returns stable unknown status for uncommitted draw and raffle requests", async () => {
    vi.mocked(deps.rpc).mockResolvedValue(null);
    expect(await (await api.drawStatus(request(`/api/me/mobile-benefits/instant-draws/${requestKey}`), requestKey)).json()).toEqual({ status: "unknown" });
    expect(await (await api.entryStatus(request(`/api/me/mobile-benefits/entries/${requestKey}`), requestKey)).json()).toEqual({ status: "unknown" });
  });
  it("issues an owner-bound pickup QR with an idempotency key", async () => {
    vi.mocked(deps.rpc).mockResolvedValue({ id: requestKey, awardId: benefit, rawCode: "byus_pickup_code", purpose: "prize_pickup", expiresAt: "2026-10-12T01:10:00.000Z", oneTime: true, staffConfirmationRequired: true, replayed: false });
    const response = await api.pickupQr(request(`/api/me/mobile-benefits/goods/${benefit}/pickup-qr`, { method: "POST", body: JSON.stringify({ requestKey }) }), benefit);
    expect(response.status).toBe(201);
    expect(deps.rpc).toHaveBeenCalledWith("issue_owned_mobile_benefit_pickup_qr", { p_app_user_id: owner, p_award_id: benefit, p_request_key: requestKey });
  });
});
