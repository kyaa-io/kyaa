import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AuthError } from "@/features/auth/domain/auth-errors";
import { createRunmusicHandlers } from "./routes";
import { decryptRunmusicContact, encryptRunmusicContact } from "./contact-crypto";
import type { FanpageDependencies } from "@/server/fanpage/routes";

const id = "10000000-0000-4000-8000-000000000001", other = "10000000-0000-4000-8000-000000000002";
const key = Buffer.alloc(32, 42);
const campaign = { slug: "runmusic-2026", published: true, entryOpensAt: "2026-10-20T00:00:00Z", entryClosesAt: "2026-10-24T14:59:00Z", resultsAt: "2026-10-24T14:59:00Z", prizes: [
  { code: "andong_yogurt_1l", label: "안동참마요거트 1L", count: 15, imageUrl: "/images/runmusic/andong-yogurt-1l.png" },
  { code: "starbucks_10000", label: "스타벅스 1만원 상품권", count: 150, imageUrl: "/images/kyaa-wave/starbucks-10000-voucher.jpg" },
], drawn: false, resultsPublished: false };
const state = { campaign, entered: true, liked: true, contact: { saved: false, masked: null }, result: "pending", prizeCode: null, receiptId: null, receivedAt: null };
const admin = { campaign, revision: 1, participantCount: 0, drawId: null, winnerCount: 0, receivedCount: 0, autoPublishEnabled: false, winners: [], delivery: { pending: 0, sent: 0, failed: 0, skipped: 0 } };
function setup() {
  const deps: FanpageDependencies = { authorize: vi.fn().mockResolvedValue({ appUserId: id }), authorizeAdmin: vi.fn().mockResolvedValue({ appUserId: id, allowlistId: id }), rpc: vi.fn().mockResolvedValue(state) };
  return { deps, handlers: createRunmusicHandlers(deps, () => key) };
}
const request = (body: unknown) => new Request("https://kyaa.test/api/me/runmusic", { method: "POST", headers: { authorization: "Bearer test", "content-type": "application/json" }, body: JSON.stringify(body) });
describe("Runmusic V2 routes", () => {
  it("takes identity from authorization and rejects old missions and spoofed fields", async () => {
    const { deps, handlers } = setup();
    expect((await handlers.me(request({ action: "enter", requestKey: id }))).status).toBe(200);
    expect(deps.rpc).toHaveBeenCalledWith("submit_owned_runmusic_v2", { p_app_user_id: id, p_input: { action: "enter", requestKey: id } });
    expect((await handlers.me(request({ action: "enter", requestKey: id, appUserId: other }))).status).toBe(400);
    expect((await handlers.me(request({ action: "quiz", requestKey: id, answer: "안동체육관" }))).status).toBe(400);
  });
  it("uses only V2 read projections with private response caching", async () => {
    const { deps, handlers } = setup();
    const response = await handlers.me(new Request("https://kyaa.test/api/me/runmusic"));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(deps.rpc).toHaveBeenCalledWith("read_owned_runmusic_v2", { p_app_user_id: id });
    vi.mocked(deps.rpc).mockResolvedValue(campaign);
    expect((await handlers.campaign()).status).toBe(200);
    expect(deps.rpc).toHaveBeenCalledWith("read_runmusic_campaign_v2", {});
  });
  it("never sends plaintext contact to SQL, and keeps retry fingerprint stable", async () => {
    const { deps, handlers } = setup();
    const payload = { action: "save_contact", requestKey: id, kakaoId: "  private-kakao-id  " };
    expect((await handlers.me(request(payload))).status).toBe(200);
    expect((await handlers.me(request(payload))).status).toBe(200);
    const [a,b] = vi.mocked(deps.rpc).mock.calls.map(([,args]) => args.p_input as { ciphertext: string; fingerprint: string });
    expect(JSON.stringify(vi.mocked(deps.rpc).mock.calls)).not.toContain("private-kakao-id");
    expect(a.fingerprint).toBe(b.fingerprint); expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(decryptRunmusicContact(a.ciphertext,id,key)).toBe("private-kakao-id");
  });
  it("fails closed for invalid/missing encryption key without blocking participation", async () => {
    const { deps } = setup();
    const handlers = createRunmusicHandlers(deps, () => { throw new Error("RUNMUSIC_CONTACT_UNAVAILABLE"); });
    expect((await handlers.me(request({ action: "save_contact", requestKey: id, kakaoId: "my-id" }))).status).toBe(503);
    expect(deps.rpc).not.toHaveBeenCalled();
    expect((await handlers.me(request({ action: "enter", requestKey: id }))).status).toBe(200);
  });
  it("authenticates before reading private payloads or calling SQL", async () => {
    const { deps, handlers } = setup(); vi.mocked(deps.authorize).mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", 401, "required"));
    expect((await handlers.me(request({ action: "enter", requestKey: id }))).status).toBe(401); expect(deps.rpc).not.toHaveBeenCalled();
  });
  it.each(["RUNMUSIC_LIKE_REQUIRED","RUNMUSIC_ENTRY_REQUIRED","RUNMUSIC_CLOSED","RUNMUSIC_CONFLICT"])("returns actionable conflict %s",async code=>{
    const {deps,handlers}=setup();vi.mocked(deps.rpc).mockRejectedValue(new Error(code));
    const response=await handlers.me(request({action:"enter",requestKey:id}));expect(response.status).toBe(409);expect((await response.json()).error.code).toBe(code);
  });
  it("rejects response secrets and oversized bodies", async () => {
    const { deps, handlers } = setup(); vi.mocked(deps.rpc).mockResolvedValue({ ...campaign, draw_seed: "private-seed" });
    const response = await handlers.campaign(); expect(response.status).toBe(503); expect(await response.text()).not.toContain("private-seed");
    expect((await handlers.me(request({ action: "save_contact", requestKey: id, kakaoId: "a".repeat(2500) }))).status).toBe(413);
  });
  it("authorizes admin and rejects client-supplied actor", async () => {
    const { deps, handlers } = setup(); vi.mocked(deps.rpc).mockResolvedValue(admin);
    expect((await handlers.admin(request({ requestKey: id }), "draw")).status).toBe(200);
    expect(deps.rpc).toHaveBeenCalledWith("admin_runmusic_v2", expect.objectContaining({ p_actor_app_user_id: id, p_actor_admin_allowlist_id: id, p_action: "draw" }));
    expect((await handlers.admin(request({ requestKey: id, actor: other }), "draw")).status).toBe(400);
  });
  it("keeps legacy draws larger than the new 165-prize allocation readable", async () => {
    const { deps, handlers } = setup();
    const winners = Array.from({ length: 166 }, (_, index) => ({
      appUserId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      prizeCode: "starbucks_10000", receiptId: id, receivedAt: null, contactSaved: false, contactMasked: null,
    }));
    vi.mocked(deps.rpc).mockResolvedValue({ ...admin, winners, winnerCount: winners.length });
    const response = await handlers.admin(new Request("https://kyaa.test/api/admin/runmusic"));
    expect(response.status).toBe(200);
    expect((await response.json()).winners).toHaveLength(166);
  });
  it("reveals only the authorized target and never returns ciphertext", async () => {
    const {deps,handlers}=setup();const encrypted=encryptRunmusicContact("private-id",other,key);
    vi.mocked(deps.rpc).mockResolvedValue({appUserId:other,ciphertext:encrypted.ciphertext});
    const response=await handlers.admin(request({appUserId:other}),"contact");
    expect(await response.json()).toEqual({kakaoId:"private-id"});
    vi.mocked(deps.rpc).mockResolvedValue({appUserId:id,ciphertext:encrypted.ciphertext});
    expect((await handlers.admin(request({appUserId:other}),"contact")).status).toBe(503);
    vi.mocked(deps.authorizeAdmin).mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED",403,"denied"));
    vi.mocked(deps.rpc).mockClear();
    expect((await handlers.admin(request({appUserId:other}),"contact")).status).toBe(403);
    expect(deps.rpc).not.toHaveBeenCalled();
  });
});
