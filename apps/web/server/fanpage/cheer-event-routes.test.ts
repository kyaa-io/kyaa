import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createCheerEventHandlers } from "./cheer-event-routes";
import { AuthError } from "../../features/auth/domain/auth-errors";
const id = "11111111-1111-4111-8111-111111111111";
function setup() {
  const rpc = vi.fn().mockResolvedValue({ event: null });
  const authorize = vi.fn(async () => ({ appUserId: id }));
  const authorizeAdmin = vi.fn(async () => ({ appUserId: id, allowlistId: id, email: "admin@example.test", role: "viewer" as const }));
  return { rpc, authorize, authorizeAdmin, api: createCheerEventHandlers({ rpc, authorize, authorizeAdmin }) };
}
describe("cheer event reads", () => {
  it.each([true, false])("returns the LIVE schedule and authoritative reservation availability (%s)", async (reservationAvailable) => {
    const { api, rpc } = setup();
    const event = {
      campaignId: id, creatorSlug: "changha", liveEventId: id, liveSlug: "changha-wave",
      entryOpensAt: "2026-10-18T00:00:00Z", entryClosesAt: "2026-10-25T14:59:59Z", status: "open",
      liveStartsAt: "2026-10-22T12:00:00Z", reservationOpensAt: "2026-10-18T00:00:00Z", reservationClosesAt: "2026-10-22T12:00:00Z", reservationAvailable,
      prizes: [], participation: null,
    };
    rpc.mockResolvedValue({ event });
    const response = await api.event(new Request("https://byus.kr/api?liveState=1"), "changha");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ event });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("read_celebrity_cheer_event_live_state", { p_slug: "changha", p_app_user_id: null, p_locale: "ko" });
  });
  it("preserves the exact legacy response for clients without LIVE-state opt-in", async () => {
    const { api, rpc } = setup();
    const event = {
      campaignId: id, creatorSlug: "changha", liveEventId: id, liveSlug: "changha-wave",
      entryOpensAt: "2026-10-18T00:00:00Z", entryClosesAt: "2026-10-25T14:59:59Z", status: "open",
      prizes: [], participation: { entered: true, enteredAt: "2026-10-18T01:00:00Z", reserved: true, weight: 2 },
    };
    rpc.mockResolvedValue({ event });
    const response = await api.event(new Request("https://byus.kr/api?locale=en", { headers: { authorization: "Bearer owner" } }), "changha");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ event });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("read_celebrity_cheer_event", { p_slug: "changha", p_app_user_id: id, p_locale: "en" });
  });
  it.each(["liveState=0", "liveState=true", "liveState=", "liveState=1&liveState=1"])("rejects invalid or duplicate LIVE-state opt-in (%s)", async (query) => {
    const { api, rpc } = setup();
    expect((await api.event(new Request(`https://byus.kr/api?${query}`), "changha")).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("uses guest null ownership and never caches participation", async () => {
    const { api, rpc } = setup();
    const response = await api.event(new Request("https://byus.kr/api?locale=en"), "changha");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ event: null });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(rpc).toHaveBeenCalledWith("read_celebrity_cheer_event", { p_slug: "changha", p_app_user_id: null, p_locale: "en" });
  });
  it("rejects invalid credentials and duplicate locale before reading", async () => {
    const { api, authorize, rpc } = setup();
    authorize.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", 401, "Sign in"));
    expect((await api.event(new Request("https://byus.kr/api", { headers: { authorization: "invalid" } }), "wena")).status).toBe(401);
    expect((await api.event(new Request("https://byus.kr/api?locale=ko&locale=en"), "wena")).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("requires administrator authentication before reading participant identities", async () => {
    const { api, authorizeAdmin, rpc } = setup();
    authorizeAdmin.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", 403, "Forbidden"));
    expect((await api.participants(new Request("https://byus.kr/api"), id)).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("bounds pagination and calls only the read RPC", async () => {
    const { api, rpc } = setup();
    expect((await api.participants(new Request("https://byus.kr/api?limit=101"), id)).status).toBe(400);
    rpc.mockResolvedValue({ entrySource: "cheer", total: 1, totalWeight: 2, participants: [{ appUserId: id, enteredAt: "2026-10-18T12:00:00Z", weight: 2 }], nextOffset: null });
    const response = await api.participants(new Request("https://byus.kr/api?limit=1"), id);
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("read_admin_cheer_event_participants", { p_actor_app_user_id: id, p_actor_admin_allowlist_id: id, p_campaign_id: id, p_offset: 0, p_limit: 1 });
  });
  it.each(["", "?liveState=1"])("fails closed on unexpected private fields in RPC output (%s)", async (query) => {
    const { api, rpc } = setup();
    rpc.mockResolvedValue({ event: null, privateEmail: "secret@example.test" });
    const response = await api.event(new Request(`https://byus.kr/api${query}`), "changha");
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
  });
});
