import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), authorize: vi.fn() }));
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: () => state }));
vi.mock("@/server/dukjil/creator-id", () => ({ resolveCreatorId: vi.fn(async () => null) }));
import { GET } from "./route";

// Answers copied from the local database (read_home_fan_ranking(null, 20) cut to two rows, read_home_creator_ranking('ko', 2)), 2026-11-08.
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const fanAnswer = { me: null, day: today, rows: [
  { isMe: false, rank: 1, tier: "Gold", delta: null, score: 12, nickname: "시험팬 001", characterId: "star-pink" },
  { isMe: false, rank: 2, tier: "Gold", delta: null, score: 12, nickname: "시험팬 002", characterId: "fairy-lavender" },
], builtDay: today, comparable: false, computedAt: "2026-11-08T08:24:14.863107+09:00" };
const creatorAnswer = { day: today, rows: [
  { name: "[시험] 랭킹 확인 페이지", rank: 1, slug: "doc261107-test-ranking", delta: null, score: 125, hearts: 795, imageUrl: "/images/groups/capsule-machine.png", challenge: false },
  { name: "[P1 시험] 시험 크리에이터", rank: 2, slug: "p1-smoke-creator", delta: null, score: 3, hearts: 3, imageUrl: "/images/groups/nchive-pencil.jpg", challenge: false },
], builtDay: today, comparable: false, computedAt: "2026-11-08T08:24:14.863107+09:00" };

beforeEach(() => { vi.clearAllMocks(); state.rpc.mockImplementation(async (name: string) => name === "read_home_creator_ranking" ? creatorAnswer : fanAnswer); });

it("passes the database's fan answer through the route schema without the build mark", async () => {
  const res = await GET(new Request("https://byus.test/api/rankings/home"));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(Object.keys(body).sort()).toEqual(["comparable", "computedAt", "day", "me", "rows"]);
  expect(body.rows[0]).toEqual({ rank: 1, score: 12, nickname: "시험팬 001", characterId: "star-pink", tier: "Gold", isMe: false, delta: null });
  expect(state.rpc).toHaveBeenCalledTimes(1);
});

it("passes the database's creator answer through the route schema", async () => {
  const body = await (await GET(new Request("https://byus.test/api/rankings/home?kind=creators&locale=ko"))).json();
  expect(body.rows.map((row: { slug: string; score: number; hearts: number }) => [row.slug, row.score, row.hearts])).toEqual([["doc261107-test-ranking", 125, 795], ["p1-smoke-creator", 3, 3]]);
  expect(state.rpc).toHaveBeenCalledWith("read_home_creator_ranking", { p_locale: "ko", p_limit: 20 });
});

it("answers 503 when the database is older than the route", async () => {
  state.rpc.mockRejectedValue(Object.assign(new Error("Could not find the function public.read_home_fan_ranking"), { code: "PGRST202" }));
  expect((await GET(new Request("https://byus.test/api/rankings/home"))).status).toBe(503);
});
