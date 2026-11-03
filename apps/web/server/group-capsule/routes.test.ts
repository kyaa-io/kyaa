import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AuthError } from "@/features/auth/domain/auth-errors";
import { createCapsuleHandler } from "./routes";
const owner = "11111111-1111-4111-8111-111111111111", key = "22222222-2222-4222-8222-222222222222";
const rpc = vi.fn(), authorize = vi.fn(async (token: string | null) => { if (token !== "Bearer valid") throw new AuthError("AUTHENTICATION_REQUIRED", 401, "Sign in"); return { appUserId: owner }; });
const authorizeAdmin = vi.fn(async () => ({ appUserId: owner, allowlistId: key, email: "test@example.test", role: "admin" as "admin" | "viewer" }));
const handle = createCapsuleHandler({ rpc, authorize, authorizeAdmin });
const request = (input: unknown, token = "valid") => new Request("https://kyaa.io/api", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(input) });
beforeEach(() => { vi.clearAllMocks(); rpc.mockResolvedValue({}); });
it("takes debit ownership from authentication and rejects injected identities/counts", async () => {
 expect((await handle("draw", request({ requestKey: key, count: 10 }), key)).status).toBe(200);
 expect(rpc).toHaveBeenCalledWith("group_capsule_dispatch", { p_operation: "draw", p_actor: owner, p_campaign: key, p_input: { requestKey: key, count: 10 }, p_admin_id: null });
 expect((await handle("draw", request({ requestKey: key, count: 1, ownerId: key }), key)).status).toBe(400);
 expect((await handle("draw", request({ requestKey: key, count: 2 }), key)).status).toBe(400);
 expect((await handle("draw", request({ requestKey: key, count: 1 }, "invalid"), key)).status).toBe(401);
 expect(rpc).toHaveBeenCalledTimes(1);
});
it("blocks viewer writes and invalid total probabilities", async () => {
 authorizeAdmin.mockResolvedValueOnce({ appUserId: owner, allowlistId: key, email: "test@example.test", role: "viewer" });
 expect((await handle("activate", request({}), key)).status).toBe(403);
 expect((await handle("create", request({ requestKey: key, name: "Prize", blankWeight: 10, prizes: [{ name: "A", weight: 10, stock: 2 }] }))).status).toBe(400);
 expect(rpc).not.toHaveBeenCalled();
});
it("returns a recoverable stock or balance error without fabricating a result", async () => {
 rpc.mockRejectedValueOnce(new Error("CAPSULE_INSUFFICIENT_STOCK"));
 const response = await handle("draw", request({ requestKey: key, count: 10 }), key);
 expect(response.status).toBe(409); expect(await response.json()).toEqual({ error: { code: "CAPSULE_INSUFFICIENT_STOCK" } });
 expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("recovers the authenticated user's original request", async () => {
 await handle("receipt", new Request("https://kyaa.io/api", { headers: { authorization: "Bearer valid" } }), undefined, key);
 expect(rpc).toHaveBeenCalledWith("group_capsule_dispatch", expect.objectContaining({ p_actor: owner, p_input: { requestKey: key }, p_operation: "receipt" }));
});
