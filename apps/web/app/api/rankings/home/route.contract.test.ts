import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), authorize: vi.fn(), secret: crypto.randomUUID() }));
vi.mock("@/server/config/env", () => ({ loadServerEnv: () => ({ PRIVY_APP_SECRET: state.secret }) }));
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: () => state }));
vi.mock("@/server/dukjil/creator-id", () => ({ resolveCreatorId: vi.fn(async () => null) }));
import { GET } from "./route";
// Real DB answers regenerated after 20261220150000 with supabase/tests/home_ranking_metrics_answers.sql.
// SQL emits coordinates; the HTTP route adds the viewer-bound signature.
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
      expect(state.rpc).toHaveBeenCalledWith(kind === "fans" ? "read_home_fan_ranking_v2" : "read_home_creator_ranking_v2", expect.objectContaining({ p_metric: metric, p_limit: 10 }));
      if (label === "first") expect(body.rows.every((row: { delta: unknown }) => row.delta === null)).toBe(true);
      if (label === "empty") expect(body.rows).toEqual([]);
      if (label === "stale") expect(body.failedAt).not.toBeNull();
    });
  }
}

it("names both fan values under either metric, and fans and hearts under both creator metrics", async () => {
  serve("ready:fans:points");
  const points = await (await GET(new Request("https://byus.test/api/rankings/home?kind=fans&metric=points"))).json();
  for (const row of points.rows) expect(row.points).toBe(row.score);
  serve("ready:fans:hearts");
  const hearts = await (await GET(new Request("https://byus.test/api/rankings/home?kind=fans&metric=hearts"))).json();
  for (const row of hearts.rows) { expect(row.hearts).toBe(row.score); expect(row.points).toBe(points.rows.find((other: { nickname: string }) => other.nickname === row.nickname)?.points ?? 0); }
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
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  const body = await res.json();
  for (const row of body.rows) {
    expect(Object.keys(row.profileRef).sort()).toEqual(["computedAt", "day", "kind", "metric", "rank", "signature"]);
    expect(row.profileRef).toMatchObject({ kind: "home_ranking", day: body.day, computedAt: body.computedAt, metric: "points", signature: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) });
    expect(row.profileRef).not.toHaveProperty("profileId");
  }
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
