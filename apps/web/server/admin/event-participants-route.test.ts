import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AuthError } from "../../features/auth/domain/auth-errors";
import { createEventParticipantsHandler } from "./event-participants-route";

const id = "10000000-0000-4000-8000-000000000001";
const actor = { appUserId: id, allowlistId: id, email: "admin@example.com", role: "viewer" as const };
const row = { id, nickname: "이벤트팬", signedUpAt: "2026-11-13T04:00:00+00:00", participatedAt: "2026-11-13T05:00:00+00:00", status: "completed" };
const asOf = "2026-11-14T05:00:00.123456+00:00";
const page = { asOf, total: 1, rows: [row], next: null };
const deps = { authorizeAdmin: vi.fn(), rpc: vi.fn() };
const handler = createEventParticipantsHandler(deps);
const request = (query = "event=x-mission") => new Request(`https://kyaa.io/api/admin/event-participants?${query}`, { headers: { authorization: "Bearer token" } });

beforeEach(() => {
  vi.resetAllMocks();
  deps.authorizeAdmin.mockResolvedValue(actor);
  deps.rpc.mockResolvedValue(page);
});

describe("admin event participants read", () => {
  it("lets a read-only admin read, passes the verified actor, and returns only the projection without caching", async () => {
    deps.rpc.mockResolvedValue({ ...page, rows: [{ ...row, email: "private@example.com", phone: "+821000000001" }], internal: "private" });
    const response = await handler(request(`event=signup-raffle&limit=50&asOf=${encodeURIComponent(asOf)}&afterAt=${encodeURIComponent(asOf)}&afterId=${id}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual(page);
    expect(deps.rpc).toHaveBeenCalledWith("list_admin_event_participants", { p_actor_app_user_id: id, p_actor_admin_allowlist_id: id, p_event: "signup-raffle", p_as_of: asOf, p_after_at: asOf, p_after_id: id, p_limit: 50 });
  });
  it.each([401, 403] as const)("rejects unauthorized access (%s) before reading", async status => {
    deps.authorizeAdmin.mockRejectedValue(new AuthError("ADMIN_DISABLED", status, "private identity"));
    const response = await handler(request());
    expect(response.status).toBe(status);
    expect(await response.text()).not.toContain("private");
    expect(deps.rpc).not.toHaveBeenCalled();
  });
  it.each(["", "event=other", "event=x-mission&limit=0", "event=x-mission&limit=1001", "event=x-mission&offset=1", "event=x-mission&asOf=yesterday", `event=x-mission&afterAt=${encodeURIComponent(asOf)}&afterId=${id}`, `event=x-mission&asOf=${encodeURIComponent(asOf)}&afterId=${id}`, `event=x-mission&asOf=${encodeURIComponent(asOf)}&afterAt=${encodeURIComponent(asOf)}&afterId=nope`, `event=x-mission&p_actor_app_user_id=${id}`])("rejects invalid query %s", async query => {
    expect((await handler(request(query))).status).toBe(400);
    expect(deps.rpc).not.toHaveBeenCalled();
  });
  it("first read sends no instant or cursor and passes the database instant back", async () => {
    await handler(request());
    expect(deps.rpc).toHaveBeenCalledWith("list_admin_event_participants", expect.objectContaining({ p_as_of: null, p_after_at: null, p_after_id: null, p_limit: 100 }));
  });
  it("fails closed if database authorization is revoked", async () => {
    deps.rpc.mockRejectedValue(new Error("EVENT_PARTICIPANTS_FORBIDDEN"));
    expect((await handler(request())).status).toBe(403);
  });
  it("does not expose database errors or malformed responses", async () => {
    for (const value of [new Error("private SQL details"), { ...page, rows: [{ ...row, status: "broken" }] }]) {
      if (value instanceof Error) deps.rpc.mockRejectedValueOnce(value); else deps.rpc.mockResolvedValueOnce(value);
      const response = await handler(request());
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: { code: "EVENT_PARTICIPANTS_UNAVAILABLE" } });
    }
  });
});
