import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AuthError } from "@/features/auth/domain/auth-errors";
import { createWaveBingoStampHandler } from "./bingo-stamp";
const id = "10000000-0000-4000-8000-000000000001";
const stamp = { id, bingoCompletedAt: "2026-10-22T09:00:00Z" };
const deps = { authorizeAdmin: vi.fn(), rpc: vi.fn() };
const request = () => new Request("https://kyaa.io/api/admin/kyaa-wave-participants/bingo-stamp", { method: "POST", headers: { authorization: "Bearer admin-token", "x-correlation-id": id } });
beforeEach(() => { vi.resetAllMocks(); deps.authorizeAdmin.mockResolvedValue({ appUserId: id, allowlistId: id }); deps.rpc.mockResolvedValue(stamp); });
it("uses the verified admin identity and checks returned target", async () => {
 const response = await createWaveBingoStampHandler(deps)(request(), id);
 expect(response.status).toBe(200); expect(await response.json()).toEqual(stamp);
 expect(response.headers.get("cache-control")).toBe("private, no-store");
 expect(deps.rpc).toHaveBeenCalledWith("grant_admin_kyaa_wave_bingo_stamp", { p_actor_app_user_id: id, p_actor_admin_allowlist_id: id, p_participant_id: id, p_correlation_id: id });
});
it("does not reach the database without admin authentication", async () => {
 deps.authorizeAdmin.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", 401, "Login required"));
 expect((await createWaveBingoStampHandler(deps)(request(), id)).status).toBe(401); expect(deps.rpc).not.toHaveBeenCalled();
});
it("rejects invalid participant identifiers", async () => {
 expect((await createWaveBingoStampHandler(deps)(request(), "invalid")).status).toBe(400); expect(deps.rpc).not.toHaveBeenCalled();
});
it.each([["FAN_WEB_FORBIDDEN",403],["FAN_WEB_NOT_FOUND",404],["FAN_WEB_CONFLICT",409]] as const)("maps %s", async (error,status) => {
 deps.rpc.mockRejectedValue(new Error(error)); expect((await createWaveBingoStampHandler(deps)(request(), id)).status).toBe(status);
});
it("fails closed for mismatched or malformed results", async () => {
 deps.rpc.mockResolvedValue({ ...stamp, id: "10000000-0000-4000-8000-000000000002" });
 expect((await createWaveBingoStampHandler(deps)(request(), id)).status).toBe(503);
});
