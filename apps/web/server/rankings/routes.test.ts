import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { REFRESH_AFTER_MS, createRankingsHandlers } from "./routes";

const ME = "11111111-1111-4111-8111-111111111111";
const CEL = "22222222-2222-4222-8222-222222222222";
const req = (path: string, headers: Record<string, string> = {}) => new Request(`http://x${path}`, { headers });

function make(rpcImpl: (name: string, args: Record<string, unknown>) => unknown, extra = {}) {
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => rpcImpl(name, args));
  const authorize = vi.fn(async () => ({ appUserId: ME }));
  const resolveCreatorId = vi.fn(async (slug: string) => (slug === "star" ? CEL : null));
  return { rpc, authorize, handlers: createRankingsHandlers({ rpc, authorize, resolveCreatorId, ...extra }) };
}

describe("rankings routes", () => {
  it("returns a public creator ranking without viewer values", async () => {
    const { handlers, rpc } = make(() => ({ period: "week", periodStart: "2026-11-02", computedAt: "2026-11-06T00:00:00Z", rows: [{ rank: 1, slug: "a", name: "A", imageUrl: null, score: 5, jjinfanCount: 3, myHearts: 9 }] }));
    const res = await handlers.creators(req("/api/rankings/creators"));
    const body = await res.json();
    expect(res.headers.get("cache-control")).toContain("public");
    expect(body.rows[0].myHearts).toBeNull();
    expect(rpc).toHaveBeenCalledWith("read_creator_ranking", { p_period: "week", p_viewer: null, p_locale: "ko" });
  });

  it("keeps fan ids private and marks the viewer's row", async () => {
    const { handlers } = make(() => ({
      period: "week", periodStart: "2026-11-02", computedAt: "2026-11-06T00:00:00Z",
      rows: [{ rank: 1, subjectId: ME, score: 4, nickname: "Me", characterId: "star-pink" }, { rank: 2, subjectId: "x", score: 3, nickname: "Other", characterId: "star-pink" }],
      me: { rank: 105, subjectId: ME, score: 1, inTop: false },
    }));
    const res = await handlers.page(req("/x?metric=hearts", { authorization: "Bearer t" }), "star");
    const body = await res.json();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(JSON.stringify(body)).not.toContain(ME);
    expect(body.rows.map((r: { isMe: boolean }) => r.isMe)).toEqual([true, false]);
    expect(body.me).toEqual({ rank: 105, score: 1, inTop: false });
  });

  it("passes a closed ranking through with my own rank, and leaves the key off an open one", async () => {
    const closed = make(() => ({ periodStart: "2026-11-02", computedAt: null, rows: [], me: { rank: 3, score: 9, inTop: true }, available: false }));
    const body = await (await closed.handlers.page(req("/x?metric=hearts&period=all"), "star")).json();
    expect(body.available).toBe(false); expect(body.rows).toEqual([]); expect(body.me).toEqual({ rank: 3, score: 9, inTop: true });
    const open = make(() => ({ periodStart: "2026-11-02", computedAt: null, rows: [], me: null }));
    expect(await (await open.handlers.page(req("/x?metric=hearts&period=all"), "star")).json()).not.toHaveProperty("available");
  });

  it("maps metrics, rejects bad input and unknown pages", async () => {
    const { handlers, rpc } = make(() => ({ periodStart: "2026-11-02", computedAt: null, rows: [], me: null }));
    expect((await handlers.page(req("/x?metric=dukjil&period=month"), "star")).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("read_page_ranking", expect.objectContaining({ p_kind: "dukjil", p_period: "month" }));
    expect((await handlers.page(req("/x?period=year"), "star")).status).toBe(400);
    expect((await handlers.page(req("/x?period=week&period=all"), "star")).status).toBe(400);
    expect((await handlers.page(req("/x"), "nobody")).status).toBe(404);
    expect((await handlers.page(req("/x"), "Bad Slug")).status).toBe(400);
  });

  it("returns an empty ranking and the challenge count", async () => {
    const { handlers } = make((name) => (name === "read_jjinfan_challenge" ? { count: 37, target: 100 } : { periodStart: "2026-11-02", computedAt: null, rows: [], me: null }));
    const empty = await (await handlers.page(req("/x"), "star")).json();
    expect(empty.rows).toEqual([]);
    expect(empty.computedAt).toBeNull();
    expect(await (await handlers.challenge(req("/x"), "star")).json()).toEqual({ count: 37, target: 100 });
  });

  it("answers 401 for a rejected token and 503 for a database failure", async () => {
    const { AuthError } = await import("@/features/auth/domain/auth-errors");
    const a = make(() => ({}));
    a.authorize.mockRejectedValueOnce(new AuthError("AUTHENTICATION_REQUIRED", 401, "no"));
    expect((await a.handlers.creators(req("/x", { authorization: "Bearer bad" }))).status).toBe(401);
    const b = make(() => { throw new Error("boom"); });
    expect((await b.handlers.creators(req("/x"))).status).toBe(503);
  });

  it("refreshes on read only in development and at most once per window", async () => {
    let t = 1_000_000_000_000;
    const stale = { period: "week", periodStart: "2026-11-02", computedAt: null, rows: [] };
    const off = make(() => stale, { now: () => t });
    await off.handlers.creators(req("/x"));
    expect(off.rpc).not.toHaveBeenCalledWith("refresh_ranking_snapshots", {});
    const on = make(() => stale, { refreshOnRead: true, now: () => t });
    await on.handlers.creators(req("/x"));
    await on.handlers.creators(req("/x"));
    expect(on.rpc.mock.calls.filter(([n]) => n === "refresh_ranking_snapshots")).toHaveLength(1);
    t += REFRESH_AFTER_MS + 1;
    await on.handlers.creators(req("/x"));
    expect(on.rpc.mock.calls.filter(([n]) => n === "refresh_ranking_snapshots")).toHaveLength(2);
  });

  it("answers the platform fan ranking with grade and hearts only, and no member id", async () => {
    const { handlers, rpc } = make(() => ({
      period: "week", periodStart: "2026-11-02", computedAt: "2026-11-06T00:00:00Z",
      rows: [{ rank: 1, score: 7, nickname: "A", characterId: "star-pink", tier: "Gold", isMe: true, subjectId: ME, amount: 5000 }, { rank: 2, score: 3, nickname: "B", characterId: "x", tier: null, isMe: false }],
      me: { rank: 1, subjectId: ME, score: 7, inTop: true },
    }));
    const signedOut = await handlers.fans(req("/api/rankings/fans?limit=5"));
    const body = await signedOut.json();
    expect(signedOut.headers.get("cache-control")).toContain("public");
    expect(rpc).toHaveBeenCalledWith("read_platform_fan_ranking", { p_period: "week", p_viewer: null, p_limit: 5 });
    expect(body.rows[0]).toEqual({ rank: 1, score: 7, nickname: "A", characterId: "star-pink", tier: "Gold", isMe: false });
    expect(body.me).toBeNull();
    expect(JSON.stringify(body)).not.toContain(ME);
    expect(JSON.stringify(body)).not.toContain("5000");
    const signedIn = await (await handlers.fans(req("/api/rankings/fans", { authorization: "Bearer t" }))).json();
    expect(signedIn.rows[0].isMe).toBe(true);
    expect(signedIn.me).toEqual({ rank: 1, score: 7, inTop: true });
    expect(JSON.stringify(signedIn)).not.toContain(ME);
  });

  it("rejects a bad limit or grade and keeps an empty platform ranking", async () => {
    const empty = make(() => ({ period: "week", periodStart: "2026-11-02", computedAt: null, rows: [], me: null }));
    expect((await empty.handlers.fans(req("/x?limit=0"))).status).toBe(400);
    expect((await empty.handlers.fans(req("/x?limit=51"))).status).toBe(400);
    expect(await (await empty.handlers.fans(req("/x?period=all"))).json()).toMatchObject({ period: "all", rows: [], me: null });
    const odd = make(() => ({ periodStart: "2026-11-02", computedAt: null, rows: [{ rank: 1, score: 1, nickname: "A", characterId: "c", tier: "Mythic", isMe: false }], me: null }));
    expect((await odd.handlers.fans(req("/x"))).status).toBe(503);
  });

  it("ranks creators by fan count without a viewer value", async () => {
    const { handlers, rpc, authorize } = make(() => ({ rows: [{ rank: 1, slug: "a", name: "A", imageUrl: null, score: 136, jjinfanCount: 2 }] }));
    const res = await handlers.creators(req("/api/rankings/creators?metric=fans&limit=5&locale=en", { authorization: "Bearer t" }));
    const body = await res.json();
    expect(rpc).toHaveBeenCalledWith("read_creator_fan_ranking", { p_locale: "en", p_limit: 5 });
    expect(authorize).not.toHaveBeenCalled();
    expect(res.headers.get("cache-control")).toContain("public");
    expect(body).toMatchObject({ metric: "fans", rows: [{ rank: 1, slug: "a", score: 136, myHearts: null }] });
    expect((await handlers.creators(req("/x?metric=money"))).status).toBe(400);
  });

  it("answers the home fan ranking by day with movement, and no member id", async () => {
    const { handlers, rpc } = make(() => ({
      day: "2026-11-08", computedAt: "2026-11-08T00:00:00Z", comparable: true,
      rows: [{ rank: 1, score: 7, nickname: "A", characterId: "star-pink", tier: "Gold", isMe: true, delta: 2, subjectId: ME }, { rank: 2, score: 3, nickname: "B", characterId: "x", tier: null, isMe: false, delta: null }],
      me: { rank: 1, score: 7, inTop: true, subjectId: ME },
    }));
    const signedOut = await handlers.home(req("/api/rankings/home"));
    const body = await signedOut.json();
    expect(signedOut.headers.get("cache-control")).toContain("public");
    expect(rpc).toHaveBeenCalledWith("read_home_fan_ranking", { p_viewer: null, p_limit: 20 });
    expect(body.rows.map((r: { delta: number | null }) => r.delta)).toEqual([2, null]);
    expect(body.rows[0].isMe).toBe(false);
    expect(body.me).toBeNull();
    expect(JSON.stringify(body)).not.toContain(ME);
    const signedIn = await handlers.home(req("/api/rankings/home?kind=fans", { authorization: "Bearer t" }));
    const mine = await signedIn.json();
    expect(signedIn.headers.get("cache-control")).toBe("private, no-store");
    expect(mine.rows[0].isMe).toBe(true);
    expect(mine.me).toEqual({ rank: 1, score: 7, inTop: true });
    expect(JSON.stringify(mine)).not.toContain(ME);
  });

  it("answers the home creator ranking by fans holding hearts, and an empty first day", async () => {
    const { handlers, rpc, authorize } = make(() => ({
      day: "2026-11-08", computedAt: null, comparable: false,
      rows: [{ rank: 1, slug: "a", name: "A", imageUrl: null, score: 125, hearts: 795, challenge: true, delta: null, id: "x" }],
    }));
    const body = await (await handlers.home(req("/api/rankings/home?kind=creators&locale=en&limit=10", { authorization: "Bearer t" }))).json();
    expect(rpc).toHaveBeenCalledWith("read_home_creator_ranking", { p_locale: "en", p_limit: 10 });
    expect(authorize).not.toHaveBeenCalled();
    expect(body).toEqual({ day: "2026-11-08", computedAt: null, comparable: false, rows: [{ rank: 1, slug: "a", name: "A", imageUrl: null, score: 125, hearts: 795, challenge: true, delta: null }] });
    const empty = make(() => ({ day: null, computedAt: null, comparable: false, rows: [], me: null }));
    expect(await (await empty.handlers.home(req("/x"))).json()).toEqual({ day: null, computedAt: null, comparable: false, rows: [], me: null });
    expect((await handlers.home(req("/x?kind=money"))).status).toBe(400);
    expect((await handlers.home(req("/x?limit=21"))).status).toBe(400);
  });

  it("answers at once with an earlier day and builds today behind the response, once", async () => {
    const t = Date.parse("2026-11-08T15:30:00Z"); // 2026-11-09 00:30 KST
    let release!: () => void;
    const { handlers, rpc } = make((name) => name === "ensure_home_rankings" ? new Promise((done) => { release = () => done({ built: true }); })
      : { day: "2026-11-08", builtDay: "2026-11-08", computedAt: null, comparable: false, rows: [], me: null }, { now: () => t });
    const [first, second] = await Promise.all([handlers.home(req("/x")), handlers.home(req("/x?kind=creators"))]);
    expect([first.status, second.status]).toEqual([200, 200]);
    expect((await first.json()).day).toBe("2026-11-08");
    expect(rpc.mock.calls.filter(([n]) => n === "ensure_home_rankings")).toHaveLength(1);
    release();
  });

  it("waits for the build only when no day exists, and never answers 503 because the build failed", async () => {
    const t = Date.parse("2026-11-08T15:30:00Z");
    let built = false;
    const empty = { day: null, builtDay: null, computedAt: null, comparable: false, rows: [], me: null };
    const { handlers, rpc } = make((name) => {
      if (name === "ensure_home_rankings") { built = true; return { built: true }; }
      return built ? { ...empty, day: "2026-11-09", builtDay: "2026-11-09" } : empty;
    }, { now: () => t });
    const body = await (await handlers.home(req("/x"))).json();
    expect(rpc.mock.calls.map(([n]) => n)).toEqual(["read_home_fan_ranking", "ensure_home_rankings", "read_home_fan_ranking"]);
    expect(body.day).toBe("2026-11-09");
    const failing = make((name) => { if (name === "ensure_home_rankings") throw new Error("statement timeout"); return empty; }, { now: () => t });
    const res = await failing.handlers.home(req("/x"));
    expect(res.status).toBe(200);
    expect((await res.json()).rows).toEqual([]);
  });

  it("lists the challenges switched on, and fails closed on an odd answer", async () => {
    const { handlers, rpc } = make(() => ({ items: [{ slug: "elina", name: "엘리나", imageUrl: null, title: "찐팬 100명", description: "", endsOn: "2026-11-30", count: 47, target: 100, celebrityId: CEL }] }));
    const res = await handlers.challenges(req("/api/rankings/challenges?locale=ko"));
    expect(rpc).toHaveBeenCalledWith("read_active_jjinfan_challenges", { p_locale: "ko", p_limit: 10 });
    expect(res.headers.get("cache-control")).toContain("public");
    expect(await res.json()).toEqual({ items: [{ slug: "elina", name: "엘리나", imageUrl: null, title: "찐팬 100명", description: "", endsOn: "2026-11-30", count: 47, target: 100 }] });
    const odd = make(() => ({ items: [{ slug: "a", name: "A", imageUrl: null, title: "", description: "", count: 1, target: 100 }] }));
    expect((await odd.handlers.challenges(req("/x"))).status).toBe(503);
  });
});
