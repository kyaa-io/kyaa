import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), authorize: vi.fn() }));
vi.mock("@/server/social/dependencies", async () => {
  const { createSocialHandlers } = await import("@/server/social/routes");
  return { createSocialRouteHandlers: () => createSocialHandlers(state), socialUnavailable: () => Response.json({ error: { code: "SOCIAL_UNAVAILABLE" } }, { status: 503 }) };
});
import { GET } from "./route";
const id = "22222222-2222-4222-8222-222222222222";
const get = (body: { refs: unknown }, headers: Record<string, string> = {}) => new Request(`https://byus.test/api/profiles/refs-open?refs=${Buffer.from(JSON.stringify(body.refs)).toString("base64url")}`, { headers });
beforeEach(() => { vi.clearAllMocks(); state.authorize.mockResolvedValue({ appUserId: "11111111-1111-4111-8111-111111111111" }); });

it("asks for content refs only, signed in or out", async () => {
  state.rpc.mockResolvedValue({ open: [{ kind: "fan_post", id }] });
  expect((await GET(get({ refs: [{ kind: "fan_post", id }] }))).status).toBe(200);
  expect(state.rpc).toHaveBeenLastCalledWith("read_social_profile_refs_open", { p_viewer: null, p_refs: [{ kind: "fan_post", id }] });
  expect((await GET(get({ refs: [{ kind: "group_post", id }] }, { authorization: "Bearer ok" }))).status).toBe(200);
  expect(state.rpc).toHaveBeenLastCalledWith("read_social_profile_refs_open", { p_viewer: "11111111-1111-4111-8111-111111111111", p_refs: [{ kind: "group_post", id }] });
});
it("refuses member ids, tokens and more than 50 refs before SQL", async () => {
  for (const refs of [[{ kind: "profile", profileId: id }], [{ kind: "return", token: id }], Array.from({ length: 51 }, () => ({ kind: "fan_post", id })), []]) expect((await GET(get({ refs }))).status).toBe(400);
  expect(state.rpc).not.toHaveBeenCalled();
});
it("is a read: missing or broken refs are a bad request", async () => {
  expect((await GET(new Request("https://byus.test/api/profiles/refs-open"))).status).toBe(400);
  expect((await GET(new Request("https://byus.test/api/profiles/refs-open?refs=%%%"))).status).toBe(400);
});
