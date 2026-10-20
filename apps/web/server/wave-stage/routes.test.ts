import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AuthError } from "@/features/auth/domain/auth-errors";
import { createWaveStageHandlers } from "./routes";
const id = "91900000-0000-4000-8000-000000000001";
const stage = { stage: { eventKey: "kyaa-wave-20261022", asOf: "2026-10-21T12:00:00Z", liveSlug: "changha-kyaa-wave-20261022", creators: [], prizes: [], drawConflict: false, draw: null } };
const request = (body?: unknown) => new Request("https://byus.test/api/admin/wave-stage", { method: body ? "POST" : "GET", headers: { authorization: "Bearer test", "x-correlation-id": id }, ...(body ? { body: JSON.stringify(body) } : {}) });
function setup(role = "admin") {
  const deps = { authorizeAdmin: vi.fn().mockResolvedValue({ appUserId: id, allowlistId: id, role }), rpc: vi.fn().mockResolvedValue(stage) };
  return { deps, h: createWaveStageHandlers(deps) };
}
describe("Wave stage admin boundary", () => {
  it("uses authenticated identity and validates the private response", async () => {
    const { deps, h } = setup();
    const response = await h.read(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(stage);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(deps.rpc).toHaveBeenCalledWith("read_admin_wave_stage", { p_actor_app_user_id: id, p_actor_admin_allowlist_id: id });
  });
  it("passes the pair revisions and idempotency key together", async () => {
    const { deps, h } = setup();
    expect((await h.draw(request({ idempotencyKey: id, expectedRevisions: { changha: 4, wena: 4 } }))).status).toBe(200);
    expect(deps.rpc).toHaveBeenCalledWith("execute_admin_wave_stage_draw", { p_actor_app_user_id: id, p_actor_admin_allowlist_id: id, p_correlation_id: id, p_idempotency_key: id, p_changha_revision: 4, p_wena_revision: 4 });
  });
  it("rejects malformed and extra fields before RPC", async () => {
    const { deps, h } = setup();
    for (const body of [{}, { idempotencyKey: id, expectedRevisions: { changha: 4 } }, { idempotencyKey: id, expectedRevisions: { changha: 4, wena: 4 }, appUserId: id }]) expect((await h.draw(request(body))).status).toBe(400);
    expect(deps.rpc).not.toHaveBeenCalled();
  });
  it("denies viewer and unauthenticated sessions", async () => {
    const { deps, h } = setup("viewer");
    expect((await h.read(request())).status).toBe(200);
    expect((await h.draw(request({}))).status).toBe(403);
    deps.authorizeAdmin.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", 401, "Sign in"));
    expect((await h.read(request())).status).toBe(401);
    expect(deps.rpc).toHaveBeenCalledTimes(1);
  });
  it("fails closed for malformed or private RPC fields", async () => {
    const { deps, h } = setup();
    deps.rpc.mockResolvedValue({ ...stage, appUserId: id });
    expect((await h.read(request())).status).toBe(503);
  });
  it("returns conflict and empty-entry failures without leaking data", async () => {
    const { deps, h } = setup();
    for (const code of ["FAN_WEB_CONFLICT", "WAVE_STAGE_EMPTY_CAMPAIGN"]) {
      deps.rpc.mockRejectedValue(new Error(code));
      expect((await h.draw(request({ idempotencyKey: id, expectedRevisions: { changha: 4, wena: 4 } }))).status).toBe(409);
    }
  });
});
