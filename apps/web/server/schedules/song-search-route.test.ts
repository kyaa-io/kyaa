import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AuthError } from "../../features/auth/domain/auth-errors";
import { createSongSearchHandler } from "./song-search-route";
import { SongCatalogError } from "./song-catalog";
const owner = "10000000-0000-4000-8000-000000000001";
const request = (query = "IU", authenticated = true) => new Request(`https://kyaa.io/api/music/search?slug=event&q=${encodeURIComponent(query)}`, { headers: authenticated ? { authorization: "Bearer valid" } : {} });
function dependencies() {
  return { authorize: vi.fn(async (authorization: string | null) => { if (authorization !== "Bearer valid") throw new AuthError("AUTHENTICATION_REQUIRED", 401, "invalid"); return { appUserId: owner }; }), rpc: vi.fn(async () => null), search: vi.fn(async () => []) };
}
it("authenticates and checks the event quota before using the catalog", async () => {
  const deps = dependencies(), run = createSongSearchHandler(deps);
  expect((await run(request("IU", false))).status).toBe(401);
  expect(deps.rpc).not.toHaveBeenCalled(); expect(deps.search).not.toHaveBeenCalled();
  const response = await run(request());
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ items: [] });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(deps.rpc).toHaveBeenCalledWith("fan_web_authorize_song_search", { p_app_user_id: owner, p_live_slug: "event" });
  expect(deps.search).toHaveBeenCalledWith("IU");
});
it("rejects invalid query and never calls Spotify after gate or rate-limit failure", async () => {
  const deps = dependencies(), run = createSongSearchHandler(deps);
  expect((await run(request("x"))).status).toBe(422); expect(deps.rpc).not.toHaveBeenCalled();
  for (const [code, status] of [["MEMBERS_REQUIRED", 403], ["CLOSED", 409], ["RATE_LIMIT", 429], ["NOT_FOUND", 404]] as const) {
    deps.rpc.mockRejectedValueOnce(new Error(`FAN_WEB_${code} private details`));
    expect((await run(request())).status).toBe(status);
  }
  expect(deps.search).not.toHaveBeenCalled();
});
it("does not leak provider or database errors and preserves safe retry information", async () => {
  const deps = dependencies(), run = createSongSearchHandler(deps);
  deps.search.mockRejectedValueOnce(new SongCatalogError(429, "60"));
  const limited = await run(request());
  expect(limited.status).toBe(429); expect(limited.headers.get("retry-after")).toBe("60");
  deps.rpc.mockRejectedValueOnce(new Error("database password test-secret"));
  const failed = await run(request());
  expect(failed.status).toBe(503); expect(await failed.text()).toBe('{"error":{"code":"SONG_SEARCH_UNAVAILABLE"}}');
});
