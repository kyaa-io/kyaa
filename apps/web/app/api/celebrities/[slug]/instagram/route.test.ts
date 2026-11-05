import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ read: vi.fn(), fail: false }));
vi.mock("../../../../../server/instagram/dependencies", () => ({ createInstagramDependencies: () => { if (state.fail) throw new Error("x"); return { readMedia: state.read }; } }));
vi.mock("../../../../../server/instagram/pages", () => ({ privateHeaders: { "cache-control": "private, no-store" } }));
vi.mock("@/server/wave/access", () => ({ withWaveAccess: (handler: unknown) => handler }));
import { GET } from "./route";
const request = new Request("https://byus.kr/api/celebrities/elina/instagram");
const call = () => GET(request, { params: Promise.resolve({ slug: "elina" }) });
beforeEach(() => { state.read.mockReset(); state.fail = false; });
afterEach(() => vi.unstubAllEnvs());
it("returns an empty list, not an error, when the integration is off", async () => {
  vi.stubEnv("INSTAGRAM_INTEGRATION_ENABLED", "false");
  const response = await call();
  expect(response.status).toBe(200);
  expect((await response.json()).items).toEqual([]);
  expect(state.read).not.toHaveBeenCalled();
});
it("keeps the error when the integration is on and reading fails", async () => {
  vi.stubEnv("INSTAGRAM_INTEGRATION_ENABLED", "true");
  state.fail = true;
  expect((await call()).status).toBe(503);
});
it("returns media when the integration is on and reading succeeds", async () => {
  vi.stubEnv("INSTAGRAM_INTEGRATION_ENABLED", "true");
  state.read.mockResolvedValue({ items: [{ id: "1" }], updatedAt: null });
  const response = await call();
  expect(response.status).toBe(200);
  expect((await response.json()).items).toHaveLength(1);
});
it("returns 404 for a malformed slug even when the integration is off", async () => {
  vi.stubEnv("INSTAGRAM_INTEGRATION_ENABLED", "false");
  const response = await GET(request, { params: Promise.resolve({ slug: "Bad Slug" }) });
  expect(response.status).toBe(404);
});
