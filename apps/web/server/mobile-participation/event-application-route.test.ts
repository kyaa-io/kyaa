import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AuthError } from "@/features/auth/domain/auth-errors";
import { createMobileParticipationHandlers } from "./routes";

const owner = "11111111-1111-4111-8111-111111111111";
const eventId = "22222222-2222-4222-8222-222222222222";
const request = (body: unknown = {}) => new Request(`https://byus.test/api/me/participation/events/${eventId}/application-link`, {
  method: "POST", headers: { authorization: "Bearer test", "content-type": "application/json" }, body: JSON.stringify(body),
});
function setup(destination = "https://byus.test/connect/kyaa-wave?utm_source=original#rsvp") {
  const authorize = vi.fn(async () => ({ appUserId: owner }));
  const rpc = vi.fn(async () => ({ applicationUrl: destination, linkSupported: true, expiresAt: "2026-10-12T12:00:00Z" }));
  return { authorize, rpc, api: createMobileParticipationHandlers({ authorize, rpc, applicationOrigin: "https://byus.test" }) };
}
describe("owner-bound event application handoff", () => {
  it.each(["/connect/kyaa-wave", "/connect/byus-day"])("stores only a hash and supports the owned form at %s", async formPath => {
    const { api, rpc } = setup(`https://byus.test${formPath}?utm_source=original#rsvp`);
    const response = await api.eventApplicationLink(request(), eventId);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json();
    const uri = new URL(body.applicationUrl);
    const fragment = new URLSearchParams(uri.hash.slice(1));
    const code = fragment.get("app_code")!;
    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(uri.search).toBe("?utm_source=original");
    expect(fragment.get("app_anchor")).toBe("rsvp");
    expect(rpc).toHaveBeenCalledWith("create_owned_mobile_event_application_link", { p_app_user_id: owner, p_event_id: eventId, p_code_hash: createHash("sha256").update(code).digest("hex") });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(code);
    expect(body).not.toHaveProperty("appUserId");
  });
  it.each(["https://elsewhere.test/connect/byus-day#rsvp", "https://byus.test/another-form#rsvp"])("does not send an app code to unsupported destination %s", async destination => {
    const { api } = setup(destination);
    const response = await api.eventApplicationLink(request(), eventId);
    expect(await response.json()).toEqual({ applicationUrl: destination, linkSupported: false });
  });
  it("requires authentication before creating a handoff", async () => {
    const { api, rpc, authorize } = setup();
    authorize.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", 401, "Authentication required"));
    expect((await api.eventApplicationLink(request(), eventId)).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects caller-supplied ownership and surfaces bounded rate limiting", async () => {
    const { api, rpc } = setup();
    expect((await api.eventApplicationLink(request({ appUserId: owner }), eventId)).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockRejectedValue(new Error("MOBILE_PARTICIPATION_APPLICATION_RATE_LIMITED"));
    expect((await api.eventApplicationLink(request(), eventId)).status).toBe(429);
  });
});
