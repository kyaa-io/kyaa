import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), authorize: vi.fn() }));
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: () => state }));
vi.mock("@/server/dukjil/creator-id", () => ({ resolveCreatorId: vi.fn(async () => null) }));
import { GET } from "./route";

const MEMBER = "11111111-1111-4111-8111-111111111111";
const url = (query = "") => `https://byus.test/api/rankings/fans${query}`;
const stored = {
  period: "week", periodStart: "2026-11-02", computedAt: new Date().toISOString(),
  rows: [{ rank: 1, score: 7, nickname: "A", characterId: "star-pink", tier: "Gold", isMe: false, subjectId: MEMBER, amount: 5000 }],
  me: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  state.authorize.mockResolvedValue({ appUserId: MEMBER });
  state.rpc.mockResolvedValue(stored);
});

it("answers 200 with the public ranking shape and no amount or member id", async () => {
  const res = await GET(new Request(url("?limit=5")));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(Object.keys(body).sort()).toEqual(["computedAt", "me", "period", "periodStart", "rows"]);
  expect(body.rows[0]).toEqual({ rank: 1, score: 7, nickname: "A", characterId: "star-pink", tier: "Gold", isMe: false });
  expect(JSON.stringify(body)).not.toMatch(/subjectId|amount|5000/);
  expect(JSON.stringify(body)).not.toContain(MEMBER);
  expect(state.rpc).toHaveBeenCalledWith("read_platform_fan_ranking", { p_period: "week", p_viewer: null, p_limit: 5 });
});

it("rejects a limit outside 1 to 50 with 400 before reading the database", async () => {
  for (const limit of ["0", "51", "abc"]) expect((await GET(new Request(url(`?limit=${limit}`)))).status).toBe(400);
  expect(state.rpc).not.toHaveBeenCalled();
});
