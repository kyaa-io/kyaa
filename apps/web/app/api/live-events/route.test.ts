import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ authorize: vi.fn(), rpc: vi.fn(), catalog: vi.fn() }));
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: () => state }));
vi.mock("@/server/g3/live-event-route-dependencies", () => ({
  createLiveEventRouteDependencies: () => ({ authorize: state.authorize, repository: { listPublishedCatalog: state.catalog }, now: () => new Date("2026-10-21T00:00:00Z") }),
  liveEventUnavailableResponse: () => Response.json({ error: { code: "LIVE_UNAVAILABLE" } }, { status: 503 }),
}));
import { GET } from "./route";
const wavePath = "https://byus.test/api/live-events?locale=ko&creator=kyaa-wave-fanpage";
const user = "00000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.clearAllMocks();
  state.authorize.mockResolvedValue({ appUserId: user });
  state.rpc.mockResolvedValue({ participation: { id: user, createdAt: "2026-10-21T00:00:00Z" } });
  state.catalog.mockResolvedValue({ liveNow: [], upcoming: [], replay: [] });
});
it("requires login and check-in before the scoped Wave repository read", async () => {
  expect((await GET(new Request(wavePath))).status).toBe(401);
  state.rpc.mockResolvedValue({ participation: null });
  expect((await GET(new Request(wavePath, { headers: { authorization: "Bearer verified" } }))).status).toBe(403);
  expect(state.catalog).not.toHaveBeenCalled();
});
it("passes only the requested creator to the checked-in private catalog", async () => {
  const response = await GET(new Request(wavePath, { headers: { authorization: "Bearer verified" } }));
  expect(response.status).toBe(200);
  expect(state.catalog).toHaveBeenCalledWith({ creatorSlug: "kyaa-wave-fanpage", locale: "ko", appUserId: user, now: new Date("2026-10-21T00:00:00Z") });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("keeps the unscoped public catalog unchanged", async () => {
  expect((await GET(new Request("https://byus.test/api/live-events?locale=en"))).status).toBe(200);
  expect(state.catalog).toHaveBeenCalledWith({ locale: "en", appUserId: null, now: new Date("2026-10-21T00:00:00Z") });
  expect(state.authorize).not.toHaveBeenCalled(); expect(state.rpc).not.toHaveBeenCalled();
});
