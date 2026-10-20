import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AuthError } from "@/features/auth/domain/auth-errors";
import { WAVE_MISSIONS } from "@/features/fanpage/domain/wave-missions";
import { createWaveMissionHandlers } from "./wave-mission-routes";

const owner = "20000000-0000-4000-8000-000000000001", slug = "kyaa-wave-fanpage";
const progress = WAVE_MISSIONS.map(({ key }) => ({ key, status: key === "checkin" ? "completed" : "unverified" }));
const request = () => new Request(`https://kyaa.test/api/celebrities/${slug}/missions?appUserId=other`, { headers: { authorization: "Bearer token" } });
function setup() {
  const deps = { authorize: vi.fn().mockResolvedValue({ appUserId: owner }), rpc: vi.fn().mockResolvedValue({ progress }) };
  return { deps, handlers: createWaveMissionHandlers(deps) };
}
describe("Wave mission owned read", () => {
  it("uses only the authenticated owner and returns a private no-store response", async () => {
    const { deps, handlers } = setup();
    const result = await handlers.progress(request(), slug);
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ progress });
    expect(deps.authorize).toHaveBeenCalledWith("Bearer token");
    expect(deps.rpc).toHaveBeenCalledWith("read_owned_kyaa_wave_missions", { p_app_user_id: owner });
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect(result.headers.get("vary")).toContain("Authorization");
  });
  it("rejects missing authentication and other fan pages without querying", async () => {
    const { deps, handlers } = setup();
    deps.authorize.mockRejectedValueOnce(new AuthError("AUTHENTICATION_REQUIRED", 401, "Sign in required"));
    expect((await handlers.progress(new Request("https://kyaa.test"), slug)).status).toBe(401);
    expect((await handlers.progress(request(), "other-fanpage")).status).toBe(404);
    expect(deps.rpc).not.toHaveBeenCalled();
  });
  it.each([["FAN_WEB_FORBIDDEN", 403], ["FAN_WEB_ACTIVE_ACCOUNT_REQUIRED", 403], ["FAN_WEB_NOT_FOUND", 404], ["database connection failed", 503]])("preserves safe status for %s", async (message, status) => {
    const { deps, handlers } = setup();
    deps.rpc.mockRejectedValue(new Error(message));
    const result = await handlers.progress(request(), slug);
    expect(result.status).toBe(status);
    expect(await result.text()).not.toContain(owner);
  });
  it("fails closed on incomplete, duplicate, unknown or private fields in RPC responses", async () => {
    const { deps, handlers } = setup();
    for (const value of [null, { progress: [] }, { progress: [...progress.slice(1), progress[1]] },
      { progress: progress.map((item, index) => index ? item : { ...item, key: "unknown" }) },
      { progress: progress.map((item, index) => index ? item : { ...item, body: "private" }) }, { progress, appUserId: owner }]) {
      deps.rpc.mockResolvedValue(value);
      const result = await handlers.progress(request(), slug);
      expect(result.status).toBe(503);
      expect(await result.text()).not.toMatch(/private|20000000/);
    }
  });
});
