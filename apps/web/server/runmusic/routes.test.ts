import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AuthError } from "@/features/auth/domain/auth-errors";
import { createRunmusicHandlers } from "./routes";
import type { FanpageDependencies } from "@/server/fanpage/routes";
const id = "10000000-0000-4000-8000-000000000001";
const campaign = { slug: "runmusic-2026", published: true, registrationOpensAt: "2026-10-20", registrationClosesAt: "2026-10-24", eventStartsAt: "2026-10-24", eventEndsAt: "2026-10-25", prizeCount: 100, prizeLabel: "스타벅스 1만원 상품권", drawn: false, resultsPublished: false };
const state = { campaign, registered: false, missions: [], multiplier: 1, tickets: 0, result: "pending", receiptId: null, receivedAt: null };
function setup() {
  const deps: FanpageDependencies = { authorize: vi.fn().mockResolvedValue({ appUserId: id }), authorizeAdmin: vi.fn().mockResolvedValue({ appUserId: id, allowlistId: id }), rpc: vi.fn().mockResolvedValue(state) };
  return { deps, handlers: createRunmusicHandlers(deps) };
}
const request = (body: unknown) => new Request("https://byus.test/api/me/runmusic", { method: "POST", headers: { authorization: "Bearer test", "content-type": "application/json" }, body: JSON.stringify(body) });
describe("Runmusic routes", () => {
  it("uses authenticated owner and only validated inputs", async () => {
    const { deps, handlers } = setup();
    expect((await handlers.me(request({ action: "quiz", requestKey: id, answer: "안동체육관" }))).status).toBe(200);
    expect(deps.rpc).toHaveBeenCalledWith("submit_owned_runmusic", { p_app_user_id: id, p_input: { action: "quiz", requestKey: id, answer: "안동체육관" } });
    expect((await handlers.me(request({ action: "quiz", requestKey: id, appUserId: id }))).status).toBe(400);
  });
  it("does not call RPC when authentication fails", async () => {
    const { deps, handlers } = setup(); vi.mocked(deps.authorize).mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", 401, "required"));
    expect((await handlers.me(request({ action: "register", requestKey: id }))).status).toBe(401); expect(deps.rpc).not.toHaveBeenCalled();
  });
  it.each([ ["RUNMUSIC_RATE_LIMITED", 429], ["RUNMUSIC_INVALID_CODE", 400], ["RUNMUSIC_WRONG_ANSWER", 400] ])("preserves committed attempt errors %s", async (code, status) => {
    const { deps, handlers } = setup(); vi.mocked(deps.rpc).mockResolvedValue({ error: { code } });
    expect((await handlers.me(request({ action: "quiz", requestKey: id, answer: "wrong" }))).status).toBe(status);
  });
  it("rejects response secrets rather than serializing unchecked DB data", async () => {
    const { deps, handlers } = setup(); vi.mocked(deps.rpc).mockResolvedValue({ ...campaign, checkin_hash: "private" });
    const response = await handlers.campaign(); expect(response.status).toBe(503); expect(await response.text()).not.toContain("private");
  });
  it("requires admin authorization and excludes client-supplied actor", async () => {
    const { deps, handlers } = setup(); vi.mocked(deps.rpc).mockResolvedValue({ campaign, revision: 1, participantCount: 0, drawId: null, winnerCount: 0, receivedCount: 0 });
    const response = await handlers.admin(request({ requestKey: id }), "draw"); expect(response.status).toBe(200);
    expect(deps.authorizeAdmin).toHaveBeenCalled(); expect(deps.rpc).toHaveBeenCalledWith("admin_runmusic", expect.objectContaining({ p_actor_app_user_id: id, p_actor_admin_allowlist_id: id, p_action: "draw" }));
  });
});
