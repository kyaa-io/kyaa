import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), authorize: vi.fn() }));
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: () => state }));
vi.mock("@/server/dukjil/creator-id", () => ({ resolveCreatorId: vi.fn(async () => null) }));
import { GET } from "./route";

// Answer from the local database (supabase/migrations/20261223120000): read_active_jjinfan_challenges('ko', 1) for a synthetic campaign with one fan holding three hearts.
const answer = { items: [{ name: "합성 크리에이터", slug: "jj-synth", count: 1, title: "합성 찐팬 100", endsOn: null, hearts: 3, target: 100, imageUrl: "/fixture.webp", description: "" }] };

beforeEach(() => { vi.clearAllMocks(); state.rpc.mockResolvedValue(answer); });

it("passes the database's answer through the route schema, public and the same for everyone", async () => {
  const res = await GET(new Request("https://byus.test/api/rankings/challenges?locale=ko", { headers: { authorization: "Bearer t" } }));
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toContain("public");
  expect(await res.json()).toEqual({ items: [{ slug: "jj-synth", name: "합성 크리에이터", imageUrl: "/fixture.webp", title: "합성 찐팬 100", description: "", endsOn: null, count: 1, hearts: 3, target: 100 }] });
  expect(state.authorize).not.toHaveBeenCalled();
});

it("answers an empty list for no challenge and fails loudly for an answer without hearts (old database)", async () => {
  state.rpc.mockResolvedValue({ items: [] });
  expect(await (await GET(new Request("https://byus.test/api/rankings/challenges"))).json()).toEqual({ items: [] });
  state.rpc.mockResolvedValue({ items: [{ ...answer.items[0], hearts: undefined }] });
  expect((await GET(new Request("https://byus.test/api/rankings/challenges"))).status).toBeGreaterThanOrEqual(500);
});

it("rejects a bad locale before the database and answers 503 for an old database", async () => {
  expect((await GET(new Request("https://byus.test/api/rankings/challenges?locale=%3Cx%3E"))).status).toBe(400);
  expect(state.rpc).not.toHaveBeenCalled();
  state.rpc.mockRejectedValue(new Error("Could not find the function"));
  expect((await GET(new Request("https://byus.test/api/rankings/challenges"))).status).toBe(503);
});
