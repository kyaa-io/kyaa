import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), authorize: vi.fn() }));
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: () => state }));
vi.mock("@/server/dukjil/creator-id", () => ({ resolveCreatorId: vi.fn(async () => null) }));
import { GET } from "./route";

// Answer copied from the local database: read_active_jjinfan_challenges('ko', 1), 2026-11-08 (synthetic local campaign).
const answer = { items: [{ name: "엘리나", slug: "elina", count: 101, title: "[합성] 찐팬 100명 게이지", endsOn: null, target: 100, imageUrl: "/images/guest-home/elina-card.jpg", description: "[합성] 로컬 시각 검토용 문구입니다." }] };

beforeEach(() => { vi.clearAllMocks(); state.rpc.mockResolvedValue(answer); });

it("passes the database's answer through the route schema, public and the same for everyone", async () => {
  const res = await GET(new Request("https://byus.test/api/rankings/challenges?locale=ko", { headers: { authorization: "Bearer t" } }));
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toContain("public");
  expect(await res.json()).toEqual({ items: [{ slug: "elina", name: "엘리나", imageUrl: "/images/guest-home/elina-card.jpg", title: "[합성] 찐팬 100명 게이지", description: "[합성] 로컬 시각 검토용 문구입니다.", endsOn: null, count: 101, target: 100 }] });
  expect(state.authorize).not.toHaveBeenCalled();
});

it("rejects a bad locale before the database and answers 503 for an old database", async () => {
  expect((await GET(new Request("https://byus.test/api/rankings/challenges?locale=%3Cx%3E"))).status).toBe(400);
  expect(state.rpc).not.toHaveBeenCalled();
  state.rpc.mockRejectedValue(new Error("Could not find the function"));
  expect((await GET(new Request("https://byus.test/api/rankings/challenges"))).status).toBe(503);
});
