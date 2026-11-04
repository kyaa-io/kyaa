import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createGroupOperatorStatsHandler } from "./routes";
import { AuthError } from "@/features/auth/domain/auth-errors";
const actor = "11111111-1111-4111-8111-111111111111", page = "22222222-2222-4222-8222-222222222222";
const authorize = vi.fn(async () => ({ appUserId: actor })), rpc = vi.fn();
const handler = createGroupOperatorStatsHandler({ authorize, rpc });
const request = (query = "") => new Request(`https://fixture.test/api/groups/${page}/stats${query}`, { headers: { authorization: "Bearer fixture" } });
const stats = { days: 7, from: "2026-10-29", to: "2026-11-04", members: 3, joinedInPeriod: 1, posts: 2, postsInPeriod: 1, notices: 1, visitors: 2, visitDays: 3, daily: [{ day: "2026-11-04", visitors: 2 }] };
beforeEach(() => { vi.clearAllMocks(); authorize.mockResolvedValue({ appUserId: actor }); rpc.mockResolvedValue(stats); });
describe("group operator stats boundary", () => {
  it("fixes the actor from authorization and defaults to 7 days", async () => {
    const r = await handler(request(), { id: page });
    expect(r.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("read_group_operator_stats", { p_actor: actor, p_page_id: page, p_days: 7 });
    expect(await r.json()).toEqual(stats);
  });
  it("accepts 30 days", async () => { await handler(request("?days=30"), { id: page }); expect(rpc).toHaveBeenCalledWith("read_group_operator_stats", expect.objectContaining({ p_days: 30 })); });
  it.each(["?days=9", "?days=0", "?days=x", "?days=7&days=30", "?actor=other", "?pageId=x"])("rejects query %s", async (q) => { expect((await handler(request(q), { id: page })).status).toBe(400); expect(rpc).not.toHaveBeenCalled(); });
  it("rejects a malformed page id", async () => { expect((await handler(request(), { id: "x" })).status).toBe(400); });
  it("does not fall back to guest", async () => { authorize.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", 401, "Denied")); expect((await handler(request(), { id: page })).status).toBe(401); expect(rpc).not.toHaveBeenCalled(); });
  it("maps a non-staff caller to 403", async () => { rpc.mockRejectedValue(new Error("GROUP_STATS_FORBIDDEN private")); const r = await handler(request(), { id: page }); expect(r.status).toBe(403); expect(JSON.stringify(await r.json())).not.toContain("private"); });
  it("hides unknown failures as unavailable", async () => { rpc.mockRejectedValue(new Error("relation missing")); expect((await handler(request(), { id: page })).status).toBe(503); });
  it("treats a response with unlisted fields such as member ids as unavailable and does not return them", async () => { rpc.mockResolvedValue({ ...stats, memberIds: ["x"] }); const r = await handler(request(), { id: page }); expect(r.status).toBe(503); expect(JSON.stringify(await r.json())).not.toContain("memberIds"); });
});
