import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ find: vi.fn(), read: vi.fn() }));
vi.mock("@/server/content/published-content-repository", () => ({ createPublishedContentRepositoryFromEnvironment: () => ({ findBySlug: state.find }) }));
vi.mock("@/server/youtube/youtube-uploads", () => ({ readYouTubeUploads: state.read }));
import { GET } from "./route";
const request = new Request("https://byus.kr/api/celebrities/elina/youtube");
afterEach(() => { vi.unstubAllEnvs(); });
beforeEach(() => { state.find.mockReset(); state.read.mockReset(); });
it("rechecks publication before serving cached public uploads", async () => {
  vi.stubEnv("YOUTUBE_DATA_API_KEY", "test-value");
  state.find.mockResolvedValue(null);
  expect((await GET(request, { params: Promise.resolve({ slug: "elina" }) })).status).toBe(404);
  expect(state.read).not.toHaveBeenCalled();
  state.find.mockResolvedValue({ socialLinks: [{ platform: "youtube", url: "https://youtube.com/@ElinaKarimova" }] });
  state.read.mockResolvedValue([]);
  expect(await (await GET(request, { params: Promise.resolve({ slug: "elina" }) })).json()).toEqual({ items: [], nextCursor: null });
  expect(state.read).toHaveBeenCalledWith("https://youtube.com/@ElinaKarimova");
  state.read.mockResolvedValue(null);
  expect((await GET(request, { params: Promise.resolve({ slug: "elina" }) })).status).toBe(503);
});
it("returns an empty list, not an error, when the API key is not set", async () => {
  vi.stubEnv("YOUTUBE_DATA_API_KEY", "");
  state.find.mockResolvedValue({ socialLinks: [{ platform: "youtube", url: "https://youtube.com/@ElinaKarimova" }] });
  const response = await GET(request, { params: Promise.resolve({ slug: "elina" }) });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ items: [], nextCursor: null });
  expect(state.read).not.toHaveBeenCalled();
});
it("returns uploads when the key is set and the read succeeds", async () => {
  vi.stubEnv("YOUTUBE_DATA_API_KEY", "test-value");
  state.find.mockResolvedValue({ socialLinks: [{ platform: "youtube", url: "https://youtube.com/@ElinaKarimova" }] });
  state.read.mockResolvedValue([{ id: "youtube:abcdefghijk" }]);
  expect((await (await GET(request, { params: Promise.resolve({ slug: "elina" }) })).json()).items).toHaveLength(1);
});
