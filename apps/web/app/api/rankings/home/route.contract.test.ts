import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), authorize: vi.fn() }));
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: () => state }));
vi.mock("@/server/dukjil/creator-id", () => ({ resolveCreatorId: vi.fn(async () => null) }));
import { GET } from "./route";
// Real answers of read_home_fan_ranking_v2 / read_home_creator_ranking_v2 after 20261220010000, from a disposable database with every
// migration (supabase/tests/home_ranking_metrics_answers.sql, 2026-11-09): first built day, second day, empty day, late day; every metric.
import answers from "./v2-answers.fixture.json";

type Answer = Record<string, unknown> & { rows: Record<string, unknown>[] };
const answer = (name: string) => (answers as Record<string, Answer>)[name]!;
const ME = "11111111-1111-4111-8111-111111111111";

beforeEach(() => { vi.clearAllMocks(); state.authorize.mockResolvedValue({ appUserId: ME }); });
/** The fixture's day is in the past by the time the test runs, so the route asks ensure_home_rankings; it answers "nothing built" here. */
function serve(name: string) {
  state.rpc.mockImplementation(async (fn: string) => fn === "ensure_home_rankings" ? { day: "2026-11-09", built: false } : answer(name));
}

for (const label of ["first", "ready", "empty", "stale"]) {
  for (const [kind, metric] of [["fans", "hearts"], ["fans", "points"], ["creators", "fans"], ["creators", "hearts"]] as const) {
    it(`passes the database's ${label} ${kind} answer by ${metric} through the route schema`, async () => {
      serve(`${label}:${kind}:${metric}`);
      const res = await GET(new Request(`https://byus.test/api/rankings/home?kind=${kind}&metric=${metric}&locale=ko`));
      expect(res.status).toBe(200);
      const body = await res.json();
      const raw = answer(`${label}:${kind}:${metric}`);
      expect(body).toMatchObject({ state: raw.state, metric, day: raw.day, previousDay: raw.previousDay, comparable: raw.comparable, period: "day" });
      expect(body.rows).toHaveLength(raw.rows.length);
      expect(state.rpc).toHaveBeenCalledWith(kind === "fans" ? "read_home_fan_ranking_v2" : "read_home_creator_ranking_v2", expect.objectContaining({ p_metric: metric, p_limit: 5 }));
      if (label === "first") expect(body.rows.every((row: { delta: unknown }) => row.delta === null)).toBe(true);
      if (label === "empty") expect(body.rows).toEqual([]);
      if (label === "stale") expect(body.failedAt).not.toBeNull();
    });
  }
}

it("names the values: points only on the points metric, fans and hearts on both creator metrics", async () => {
  serve("ready:fans:points");
  const points = await (await GET(new Request("https://byus.test/api/rankings/home?kind=fans&metric=points"))).json();
  for (const row of points.rows) expect(row.points).toBe(row.score);
  serve("ready:fans:hearts");
  const hearts = await (await GET(new Request("https://byus.test/api/rankings/home?kind=fans&metric=hearts"))).json();
  for (const row of hearts.rows) { expect(row.hearts).toBe(row.score); expect(row.points).toBeNull(); }
  serve("ready:creators:hearts");
  const byHearts = await (await GET(new Request("https://byus.test/api/rankings/home?kind=creators&metric=hearts"))).json();
  serve("ready:creators:fans");
  const byFans = await (await GET(new Request("https://byus.test/api/rankings/home?kind=creators&metric=fans"))).json();
  for (const row of byHearts.rows) {
    expect(row.hearts).toBe(row.score);
    expect(row.fans).toBe(byFans.rows.find((other: { slug: string }) => other.slug === row.slug).fans);
  }
  for (const row of byFans.rows) expect(row.fans).toBe(row.score);
  // The second day compares with the first: numbers, not "new", for creators ranked on both days.
  expect(byHearts.rows.map((row: { delta: number | null }) => typeof row.delta)).toEqual(["number", "number"]);
});

it("passes my rank with its named values and movement for a signed-in viewer", async () => {
  serve("ready:fans:points:viewer");
  const res = await GET(new Request("https://byus.test/api/rankings/home?kind=fans&metric=points&limit=50", { headers: { authorization: "Bearer t" } }));
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  const body = await res.json();
  expect(body.me).toEqual({ rank: 2, score: 40, hearts: 3, points: 40, inTop: true, delta: 0 });
  expect(state.rpc).toHaveBeenCalledWith("read_home_fan_ranking_v2", { p_viewer: ME, p_metric: "points", p_limit: 50 });
});

it("keeps fan ids and e-mails out of every answer", async () => {
  for (const name of Object.keys(answers)) {
    serve(name);
    const [kind, metric] = name.split(":").slice(1);
    const text = await (await GET(new Request(`https://byus.test/api/rankings/home?kind=${kind}&metric=${metric}`))).text();
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-|@example\.test/);
  }
});

it("answers 503 when the database is older than the route", async () => {
  state.rpc.mockRejectedValue(Object.assign(new Error("Could not find the function public.read_home_fan_ranking_v2"), { code: "PGRST202" }));
  expect((await GET(new Request("https://byus.test/api/rankings/home"))).status).toBe(503);
});
