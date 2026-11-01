import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AuthError } from "@/features/auth/domain/auth-errors";
import { createGroupHandler } from "./routes";
const me = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
function setup() {
 const rpc = vi.fn().mockResolvedValue({ items: [] });
 const authorize = vi.fn(async (auth: string | null) => { if (auth !== "Bearer valid") throw new AuthError("AUTHENTICATION_REQUIRED", 401, "Login"); return { appUserId: me }; });
 const authorizeAdmin = vi.fn(async () => ({ appUserId: me, allowlistId: other, role: "viewer" as const, email: "viewer@example.com" }));
 return { rpc, authorize, authorizeAdmin, handler: createGroupHandler({ rpc, authorize, authorizeAdmin }) };
}
function req(path: string, input?: unknown, auth: string | null = "Bearer valid") { return new Request(`https://kyaa.test${path}`, { method: input === undefined ? "GET" : "POST", headers: { ...(auth ? { authorization: auth } : {}), "content-type": "application/json" }, body: input === undefined ? undefined : JSON.stringify(input) }); }
describe("group boundaries", () => {
 it("allows public bounded discovery without inventing owner", async () => { const s = setup(); expect((await s.handler("directory", req("/api/groups?limit=8&type=hobby", undefined, null))).status).toBe(200); expect(s.rpc).toHaveBeenCalledWith("groups_dispatch", expect.objectContaining({ p_actor: null, p_input: expect.objectContaining({ limit: 8, type: "hobby" }) })); expect(s.authorize).not.toHaveBeenCalled(); });
 it("rejects invalid supplied credentials on public reads", async () => { const s = setup(); expect((await s.handler("directory", req("/api/groups", undefined, "bad"))).status).toBe(401); expect(s.rpc).not.toHaveBeenCalled(); });
 it("requires ownership for joined directory and all mutations", async () => { const s = setup(); expect((await s.handler("directory", req("/api/groups?mine=joined", undefined, null))).status).toBe(401); expect((await s.handler("join", req("/api/groups", { requestId: other }, null), { id: me })).status).toBe(401); expect(s.rpc).not.toHaveBeenCalled(); });
 it("rejects client actor injection and duplicate queries", async () => { const s = setup(); expect((await s.handler("join", req("/api", { requestId: other, appUserId: other }), { id: me })).status).toBe(400); expect((await s.handler("directory", req("/api?type=fan&type=hobby"))).status).toBe(400); expect(s.rpc).not.toHaveBeenCalled(); });
 it("injects server actor and preserves replay key", async () => { const s = setup(); expect((await s.handler("join", req("/api", { requestId: other, answer: " hello " }), { id: me })).status).toBe(200); expect(s.rpc).toHaveBeenCalledWith("groups_dispatch", { p_operation: "join", p_actor: me, p_page_id: me, p_item_id: null, p_admin_id: null, p_input: { requestId: other, answer: "hello" } }); });
 it("blocks viewer approvals before RPC", async () => { const s = setup(); expect((await s.handler("review", req("/api", { action: "approve", requestId: other }), { itemId: me })).status).toBe(403); expect(s.rpc).not.toHaveBeenCalled(); });
 it("fails closed and does not return private SQL errors", async () => { const s = setup(); s.rpc.mockRejectedValue(new Error("private row contents")); const r = await s.handler("detail", req("/api"), { id: me }); expect(r.status).toBe(503); expect(await r.text()).not.toContain("private row"); });
 it("bounds streamed messages before persistence", async () => { const s = setup(); const r = await s.handler("message", req("/api", { body: "x".repeat(99000), requestId: other }), { id: me, itemId: other }); expect(r.status).toBe(413); expect(s.rpc).not.toHaveBeenCalled(); });
});
