import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), authorize: vi.fn() }));
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: () => state }));
vi.mock("@/server/dukjil/creator-id", () => ({ resolveCreatorId: vi.fn(async () => null) }));
import { GET } from "./route";

// Answers copied from the local database after 20261216020000 (2026-11-08): read_home_fan_ranking(null, 20) cut to two rows,
// read_home_creator_ranking('ko', 2) as stored (first day, nothing to compare), and the same read with a built day three days earlier
// (a copy of today's first creator with 12 fewer 찐팬, inside a transaction that was rolled back).
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const favorite = { slug: "doc261107-test-ranking", names: { en: "[Test] Ranking page", ko: "[시험] 랭킹 확인 페이지" } };
const fanAnswer = { me: null, day: today, rows: [
  { isMe: false, rank: 1, tier: "Gold", delta: null, score: 12, favorite, nickname: "시험팬 001", characterId: "star-pink" },
  { isMe: false, rank: 2, tier: "Gold", delta: null, score: 12, favorite: null, nickname: "시험팬 002", characterId: "fairy-lavender" },
], builtDay: today, comparable: false, computedAt: "2026-11-08T13:03:15.230491+09:00" };
const creatorRows = [
  { name: "[시험] 랭킹 확인 페이지", rank: 1, slug: "doc261107-test-ranking", delta: null, score: 125, hearts: 795, imageUrl: "/images/groups/capsule-machine.png", weekGain: null, challenge: false },
  { name: "[P1 시험] 시험 크리에이터", rank: 2, slug: "p1-smoke-creator", delta: null, score: 3, hearts: 3, imageUrl: "/images/groups/nchive-pencil.jpg", weekGain: null, challenge: false },
];
const creatorAnswer = { day: today, rows: creatorRows, builtDay: today, comparable: false, computedAt: "2026-11-08T13:03:15.230491+09:00", weekGainDays: null };
const creatorWeekAnswer = { ...creatorAnswer, weekGainDays: 3, rows: [{ ...creatorRows[0], weekGain: 12 }, { ...creatorRows[1], weekGain: 3 }] };

beforeEach(() => { vi.clearAllMocks(); state.rpc.mockImplementation(async (name: string) => name === "read_home_creator_ranking" ? creatorAnswer : fanAnswer); });

it("passes the database's fan answer through the route schema without the build mark, naming the favorite in the viewer's language", async () => {
  const res = await GET(new Request("https://byus.test/api/rankings/home"));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(Object.keys(body).sort()).toEqual(["comparable", "computedAt", "day", "me", "rows"]);
  expect(body.rows[0]).toEqual({ rank: 1, score: 12, nickname: "시험팬 001", characterId: "star-pink", tier: "Gold", isMe: false, delta: null, favorite: { slug: "doc261107-test-ranking", name: "[시험] 랭킹 확인 페이지" } });
  expect(body.rows[1].favorite).toBeNull();
  expect(state.rpc).toHaveBeenCalledTimes(1);
  const english = await (await GET(new Request("https://byus.test/api/rankings/home?kind=fans&locale=en"))).json();
  expect(english.rows[0].favorite).toEqual({ slug: "doc261107-test-ranking", name: "[Test] Ranking page" });
  // No stored Japanese name: Korean first.
  const japanese = await (await GET(new Request("https://byus.test/api/rankings/home?kind=fans&locale=ja"))).json();
  expect(japanese.rows[0].favorite.name).toBe("[시험] 랭킹 확인 페이지");
});

it("passes the database's creator answer through the route schema, first day without a week gain", async () => {
  const body = await (await GET(new Request("https://byus.test/api/rankings/home?kind=creators&locale=ko"))).json();
  expect(body.rows.map((row: { slug: string; score: number; hearts: number; weekGain: number | null }) => [row.slug, row.score, row.hearts, row.weekGain]))
    .toEqual([["doc261107-test-ranking", 125, 795, null], ["p1-smoke-creator", 3, 3, null]]);
  expect(body.weekGainDays).toBeNull();
  expect(state.rpc).toHaveBeenCalledWith("read_home_creator_ranking", { p_locale: "ko", p_limit: 20 });
});

it("carries the week gain and the days it spans once an earlier day is kept", async () => {
  state.rpc.mockImplementation(async () => creatorWeekAnswer);
  const body = await (await GET(new Request("https://byus.test/api/rankings/home?kind=creators&locale=ko"))).json();
  expect(body.weekGainDays).toBe(3);
  expect(body.rows.map((row: { weekGain: number }) => row.weekGain)).toEqual([12, 3]);
});

it("answers 503 when the database is older than the route", async () => {
  state.rpc.mockRejectedValue(Object.assign(new Error("Could not find the function public.read_home_fan_ranking"), { code: "PGRST202" }));
  expect((await GET(new Request("https://byus.test/api/rankings/home"))).status).toBe(503);
});
