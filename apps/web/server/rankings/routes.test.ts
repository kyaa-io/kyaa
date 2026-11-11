import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { REFRESH_AFTER_MS, createRankingsHandlers } from "./routes";

const ME = "11111111-1111-4111-8111-111111111111";
const CEL = "22222222-2222-4222-8222-222222222222";
const fanRef = (rank = 1, metric = "hearts") => ({ kind: "home_ranking", day: "2026-11-08", computedAt: "2026-11-08T00:00:00Z", metric, rank });
const req = (path: string, headers: Record<string, string> = {}) => new Request(`http://x${path}`, { headers });

function make(rpcImpl: (name: string, args: Record<string, unknown>) => unknown, extra = {}) {
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => rpcImpl(name, args));
  const authorize = vi.fn(async () => ({ appUserId: ME }));
  const resolveCreatorId = vi.fn(async (slug: string) => (slug === "star" ? CEL : null));
  return { rpc, authorize, handlers: createRankingsHandlers({ profileRefSecret: randomBytes(32).toString("base64"), rpc, authorize, resolveCreatorId, ...extra }) };
}

describe("rankings routes", () => {
  it("returns a public creator ranking without viewer values", async () => {
    const { handlers, rpc } = make(() => ({ period: "week", periodStart: "2026-11-02", computedAt: "2026-11-06T00:00:00Z", rows: [{ rank: 1, slug: "a", name: "A", imageUrl: null, score: 5, jjinfanCount: 3, myHearts: 9 }] }));
    const res = await handlers.creators(req("/api/rankings/creators"));
    const body = await res.json();
    expect(res.headers.get("cache-control")).toBe("private, max-age=60");
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
    const { handlers } = make((name) => (name === "read_jjinfan_gauge" ? { count: 37, target: 100 } : { periodStart: "2026-11-02", computedAt: null, rows: [], me: null }));
    const empty = await (await handlers.page(req("/x"), "star")).json();
    expect(empty.rows).toEqual([]);
    expect(empty.computedAt).toBeNull();
    expect(await (await handlers.challenge(req("/x"), "star")).json()).toEqual({ count: 37, target: 100 });
  });

  it("answers a rejected token as a signed-out reader, keeps other auth refusals, and answers 503 for a database failure", async () => {
    const { AuthError } = await import("@/features/auth/domain/auth-errors");
    const a = make(() => ({ period: "week", periodStart: "2026-11-02", computedAt: "2026-11-06T00:00:00Z", rows: [] }));
    a.authorize.mockRejectedValueOnce(new AuthError("AUTHENTICATION_REQUIRED", 401, "no"));
    const guest = await a.handlers.creators(req("/x", { authorization: "Bearer bad" }));
    expect(guest.status).toBe(200);
    // The answer went to a request that carried a token: never shared through a public cache.
    expect(guest.headers.get("cache-control")).toBe("private, no-store");
    expect(a.rpc).toHaveBeenCalledWith("read_creator_ranking", { p_period: "week", p_viewer: null, p_locale: "ko" });
    a.authorize.mockRejectedValueOnce(new AuthError("AUTHENTICATION_REQUIRED", 403, "blocked"));
    expect((await a.handlers.creators(req("/x", { authorization: "Bearer blocked" }))).status).toBe(403);
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
    expect(signedOut.headers.get("cache-control")).toBe("private, max-age=60");
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
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(body).toMatchObject({ metric: "fans", rows: [{ rank: 1, slug: "a", score: 136, myHearts: null }] });
    expect((await handlers.creators(req("/x?metric=money"))).status).toBe(400);
  });

  /** 09:05 KST on 2026-11-08, five minutes after the fixture snapshot: an ordinary read is one call. */
  const fresh = { now: () => Date.parse("2026-11-08T00:05:00Z") };
  const head = (extra: Record<string, unknown> = {}) => ({ state: "ready", day: "2026-11-08", today: "2026-11-08", previousDay: "2026-11-07", builtDay: "2026-11-08", computedAt: "2026-11-08T00:00:00Z", failedAt: null, comparable: true, weekGainDays: 7, ...extra });

  it("answers home fans with profile refs only for a verified member", async () => {
    const { handlers, rpc } = make(() => ({
      ...head({ metric: "hearts" }),
      rows: [{ rank: 1, score: 7, hearts: 7, points: 35, nickname: "A", characterId: "star-pink", tier: "Gold", fans: 2, liveNow: true, isNew: true, isMe: true, delta: 2, weekGain: 1, subjectId: ME, profileRef: fanRef() }, { rank: 2, score: 3, hearts: 3, points: null, nickname: "B", characterId: "x", tier: null, isMe: false, delta: null, weekGain: null, profileRef: fanRef(2) }],
      me: { rank: 1, score: 7, hearts: 7, points: 35, inTop: true, delta: 2, subjectId: ME },
    }), fresh);
    const signedOut = await handlers.home(req("/api/rankings/home"));
    const body = await signedOut.json();
    expect(signedOut.headers.get("cache-control")).toBe("private, max-age=60");
    expect(signedOut.headers.get("vary")).toBe("Authorization");
    expect(rpc).toHaveBeenCalledWith("read_home_fan_ranking_v2", { p_viewer: null, p_metric: "hearts", p_limit: 10 });
    expect(body).toMatchObject({ state: "ready", metric: "hearts", previousDay: "2026-11-07", failedAt: null, period: "day", closesAt: "2026-11-09T00:00:00+09:00" });
    expect(body.rows.map((r: { delta: number | null }) => r.delta)).toEqual([2, null]);
    expect(body.rows[0]).toMatchObject({ hearts: 7, points: 35, fans: 2, isNew: true, isMe: false });
    expect(body.rows[0]).not.toHaveProperty("liveNow");
    expect(body.me).toBeNull();
    expect(JSON.stringify(body)).not.toContain(ME);
    const signedIn = await handlers.home(req("/api/rankings/home?kind=fans&limit=50", { authorization: "Bearer t" }));
    const mine = await signedIn.json();
    expect(signedIn.headers.get("cache-control")).toBe("private, no-store");
    expect(rpc).toHaveBeenLastCalledWith("read_home_fan_ranking_v2", { p_viewer: ME, p_metric: "hearts", p_limit: 50 });
    expect(mine.rows[0].isMe).toBe(true);
    expect(mine.me).toEqual({ rank: 1, score: 7, hearts: 7, points: 35, inTop: true, delta: 2 });
    expect(mine.rows[0].profileRef).toEqual({ ...fanRef(), signature: expect.any(String) });
    expect(mine.rows[0]).not.toHaveProperty("subjectId");
  });

  it.each(["hearts", "points"])("returns both fan values and the actual comparison period when sorted by %s", async (metric) => {
    const { handlers } = make(() => ({
      ...head({ metric, weekGainDays: 3 }),
      rows: [{ rank: 1, score: metric === "hearts" ? 7 : 42, hearts: 7, points: 42, fans: 2,
        nickname: "A", characterId: "star-pink", tier: "Gold", isMe: true, isNew: true,
        delta: -2, weekGain: 35, liveNow: true, subjectId: ME, profileRef: fanRef(1, metric) }],
      me: { rank: 1, score: metric === "hearts" ? 7 : 42, hearts: 7, points: 42, inTop: true, delta: -2 },
    }), fresh);
    for (const authorization of [undefined, "Bearer t"]) {
      const body = await (await handlers.home(req(`/x?kind=fans&metric=${metric}`, authorization ? { authorization } : {}))).json();
      expect(body).toMatchObject({ metric, weekGainDays: 3, computedAt: "2026-11-08T00:00:00Z" });
      expect(body.rows[0]).toMatchObject({ hearts: 7, points: 42, delta: -2, weekGain: 35, isNew: true });
      expect(body.rows[0]).not.toHaveProperty("liveNow");
      expect(JSON.stringify(body)).not.toContain(ME);
      if (authorization) expect(body.rows[0].profileRef).toEqual({ ...fanRef(1, metric), signature: expect.any(String) });
      if (authorization) expect(body.me).toMatchObject({ hearts: 7, points: 42 });
      else expect(body.me).toBeNull();
    }
  });

  it.each(["fans", "hearts"])("keeps creator LIVE and unknown creator points for %s", async (metric) => {
    const { handlers } = make(() => ({
      ...head({ metric, weekGainDays: 1 }),
      rows: [{ rank: 1, slug: "a", name: "A", imageUrl: null, score: metric === "fans" ? 2 : 7,
        hearts: 7, points: null, fans: 2, liveNow: true, isNew: false, challenge: false, delta: 0, weekGain: 0 }],
    }), fresh);
    const body = await (await handlers.home(req(`/x?kind=creators&metric=${metric}`))).json();
    expect(body).toMatchObject({ weekGainDays: 1, computedAt: "2026-11-08T00:00:00Z" });
    expect(body.rows[0]).toMatchObject({ hearts: 7, points: null, fans: 2, liveNow: true, delta: 0, weekGain: 0, isNew: false });
  });

  it("keeps each list's default metric when none is asked for, and passes the asked one (unit regression)", async () => {
    const { handlers, rpc } = make((name, args) => ({ ...head(), metric: args.p_metric, rows: [], me: null }), fresh);
    expect((await (await handlers.home(req("/x?kind=fans"))).json()).metric).toBe("hearts");
    expect(rpc).toHaveBeenLastCalledWith("read_home_fan_ranking_v2", expect.objectContaining({ p_metric: "hearts" }));
    expect((await (await handlers.home(req("/x?kind=creators"))).json()).metric).toBe("fans");
    expect(rpc).toHaveBeenLastCalledWith("read_home_creator_ranking_v2", expect.objectContaining({ p_metric: "fans" }));
    await handlers.creators(req("/api/rankings/creators"));
    expect(rpc).toHaveBeenLastCalledWith("read_creator_ranking", expect.anything());
    expect((await (await handlers.home(req("/x?kind=fans&metric=points"))).json()).metric).toBe("points");
    expect((await (await handlers.home(req("/x?kind=creators&metric=hearts"))).json()).metric).toBe("hearts");
    for (const bad of ["/x?kind=fans&metric=fans", "/x?kind=creators&metric=points", "/x?metric=hearts&metric=points", "/x?limit=51", "/x?kind=money"]) {
      expect((await handlers.home(req(bad))).status, bad).toBe(400);
    }
  });

  it("answers the home creator ranking with fans and hearts by name, an empty day and a late day", async () => {
    const { handlers, rpc, authorize } = make(() => ({
      ...head({ comparable: false, previousDay: null, weekGainDays: null }), metric: "hearts",
      rows: [{ rank: 1, slug: "a", name: "A", imageUrl: null, score: 795, hearts: 795, points: null, fans: 125, liveNow: false, isNew: false, challenge: true, delta: null, weekGain: null, id: "x" }],
    }));
    const res = await handlers.home(req("/api/rankings/home?kind=creators&metric=hearts&locale=en&limit=10", { authorization: "Bearer t" }));
    const body = await res.json();
    expect(rpc).toHaveBeenCalledWith("read_home_creator_ranking_v2", { p_locale: "en", p_metric: "hearts", p_limit: 10 });
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(body.rows).toEqual([{ rank: 1, slug: "a", name: "A", imageUrl: null, score: 795, hearts: 795, points: null, fans: 125, liveNow: false, isNew: false, challenge: true, delta: null, weekGain: null, dayGain: null }]);
    const empty = make(() => ({ ...head({ state: "empty", comparable: false, previousDay: null, weekGainDays: null }), rows: [] }));
    expect(await (await empty.handlers.home(req("/x?kind=creators"))).json()).toMatchObject({ state: "empty", day: "2026-11-08", rows: [] });
    const late = make(() => ({ ...head({ state: "stale", day: "2026-11-07", today: "2026-11-08", failedAt: "2026-11-08T00:01:00Z" }), rows: [], me: null }));
    expect(await (await late.handlers.home(req("/x"))).json()).toMatchObject({ state: "stale", day: "2026-11-07", failedAt: "2026-11-08T00:01:00Z" });
  });

  it("answers at most five rows signed out on every platform ranking list, also with a rejected token", async () => {
    const { AuthError } = await import("@/features/auth/domain/auth-errors");
    const rows = Array.from({ length: 9 }, (_, i) => ({ rank: i + 1, slug: `s${i}`, name: "N", imageUrl: null, score: 9 - i, jjinfanCount: 1, myHearts: null }));
    const { handlers, rpc, authorize } = make((name) => name === "read_creator_ranking" ? { period: "all", periodStart: "2026-11-02", computedAt: null, rows }
      : name === "read_creator_fan_ranking" ? { rows: [] } : { ...head(), periodStart: "2026-11-02", rows: [], me: null }, fresh);
    await handlers.home(req("/x?kind=fans&limit=50"));
    expect(rpc).toHaveBeenLastCalledWith("read_home_fan_ranking_v2", expect.objectContaining({ p_limit: 10 }));
    await handlers.home(req("/x?kind=creators&limit=50"));
    expect(rpc).toHaveBeenLastCalledWith("read_home_creator_ranking_v2", expect.objectContaining({ p_limit: 10 }));
    await handlers.fans(req("/x?limit=50"));
    expect(rpc).toHaveBeenLastCalledWith("read_platform_fan_ranking", expect.objectContaining({ p_limit: 5 }));
    await handlers.creators(req("/x?metric=fans&limit=50"));
    expect(rpc).toHaveBeenLastCalledWith("read_creator_fan_ranking", expect.objectContaining({ p_limit: 5 }));
    const all = await handlers.creators(req("/x?period=all"));
    expect((await all.json()).rows).toHaveLength(5);
    for (const path of ["/x?kind=fans", "/x?kind=creators"]) expect((await handlers.home(req(path))).headers.get("cache-control")).toBe("private, max-age=60");
    for (const res of [await handlers.fans(req("/x")), await handlers.creators(req("/x")), await handlers.creators(req("/x?metric=fans"))]) {
      expect(res.headers.get("cache-control")).not.toContain("public");
      expect(res.headers.get("vary")).toBe("Authorization");
    }
    authorize.mockRejectedValueOnce(new AuthError("AUTHENTICATION_REQUIRED", 401, "expired"));
    await handlers.home(req("/x?kind=fans&limit=50", { authorization: "Bearer old" }));
    expect(rpc).toHaveBeenLastCalledWith("read_home_fan_ranking_v2", { p_viewer: null, p_metric: "hearts", p_limit: 10 });
    await handlers.home(req("/x?kind=fans&limit=50", { authorization: "Bearer t" }));
    expect(rpc).toHaveBeenLastCalledWith("read_home_fan_ranking_v2", expect.objectContaining({ p_limit: 50 }));
    const member = await handlers.creators(req("/x?period=all", { authorization: "Bearer t" }));
    expect((await member.json()).rows).toHaveLength(9);
  });

  it("reads once while today's snapshot is under ten minutes old, and asks for a build after that (one call, then two or three)", async () => {
    const t = Date.parse("2026-11-08T15:30:00Z"); // 2026-11-09 00:30 KST
    let computedAt = new Date(t - (9 * 60 + 59) * 1000).toISOString();
    let builtDay = "2026-11-09";
    let ensure: Record<string, unknown> = { built: true };
    const { handlers, rpc } = make((name) => {
      if (name === "ensure_home_rankings") return ensure;
      return { ...head(), builtDay, computedAt, rows: [], me: null };
    }, { now: () => t });
    const calls = async (path: string) => { rpc.mockClear(); await handlers.home(req(path)); return rpc.mock.calls.map(([n]) => n); };
    expect(await calls("/x")).toEqual(["read_home_fan_ranking_v2"]);
    computedAt = new Date(t - (10 * 60 + 1) * 1000).toISOString();
    expect(await calls("/x?kind=creators")).toEqual(["read_home_creator_ranking_v2", "ensure_home_rankings", "read_home_creator_ranking_v2"]);
    for (const answer of [{ built: false, busy: true }, { built: false, waiting: true }, { built: false, failed: true }, { built: false }]) {
      ensure = answer;
      expect(await calls("/x"), JSON.stringify(answer)).toEqual(["read_home_fan_ranking_v2", "ensure_home_rankings"]);
    }
    // Midnight: yesterday's build. ensure builds today, or another reader did while this one waited: read again.
    builtDay = "2026-11-08";
    ensure = { built: false };
    expect(await calls("/x")).toEqual(["read_home_fan_ranking_v2", "ensure_home_rankings", "read_home_fan_ranking_v2"]);
    ensure = { built: true };
    expect(await calls("/x")).toEqual(["read_home_fan_ranking_v2", "ensure_home_rankings", "read_home_fan_ranking_v2"]);
  });

  it("moves to the next KST day exactly at midnight", async () => {
    let t = Date.parse("2026-11-08T14:59:59.999Z"); // 23:59:59.999 KST on 11-08
    const { handlers, rpc } = make((name) => name === "ensure_home_rankings" ? { built: false } : { ...head(), builtDay: "2026-11-08", computedAt: new Date(t).toISOString(), rows: [], me: null }, { now: () => t });
    await handlers.home(req("/x"));
    expect(rpc.mock.calls.map(([n]) => n)).toEqual(["read_home_fan_ranking_v2"]);
    rpc.mockClear();
    t += 1;
    await handlers.home(req("/x"));
    expect(rpc.mock.calls.map(([n]) => n)).toContain("ensure_home_rankings");
  });

  it("lists the challenges switched on, and fails closed on an odd answer", async () => {
    const { handlers, rpc } = make(() => ({ items: [{ slug: "elina", name: "엘리나", imageUrl: null, title: "찐팬 100명", description: "", endsOn: "2026-11-30", count: 47, hearts: 212, target: 100, celebrityId: CEL }] }));
    const res = await handlers.challenges(req("/api/rankings/challenges?locale=ko"));
    expect(rpc).toHaveBeenCalledWith("read_active_jjinfan_challenges", { p_locale: "ko", p_limit: 10 });
    expect(res.headers.get("cache-control")).toContain("public");
    expect(await res.json()).toEqual({ items: [{ slug: "elina", name: "엘리나", imageUrl: null, title: "찐팬 100명", description: "", endsOn: "2026-11-30", count: 47, hearts: 212, target: 100 }] });
    const odd = make(() => ({ items: [{ slug: "a", name: "A", imageUrl: null, title: "", description: "", count: 1, hearts: 1, target: 100 }] }));
    expect((await odd.handlers.challenges(req("/x"))).status).toBe(503);
  });

  // The answer the local database gave (read_active_jjinfan_challenges, supabase/migrations/20261223120000): one fan holding three hearts, so count 1 and hearts 3.
  it("passes the real database answer: hearts are the gauge value, fans stay in count; an empty list and an answer without hearts (old database) fail honestly", async () => {
    const real = { items: [{ name: "합성 크리에이터", slug: "jj-synth", count: 1, title: "합성 찐팬 100", endsOn: null, hearts: 3, target: 100, imageUrl: "/fixture.webp", description: "" }] };
    const ok = make(() => real);
    const body = await (await ok.handlers.challenges(req("/api/rankings/challenges?locale=ko"))).json();
    expect(body.items[0]).toMatchObject({ slug: "jj-synth", count: 1, hearts: 3, target: 100 });
    expect(await (await make(() => ({ items: [] })).handlers.challenges(req("/x"))).json()).toEqual({ items: [] });
    const { hearts: _hearts, ...old } = real.items[0]!;
    expect((await make(() => ({ items: [old] })).handlers.challenges(req("/x"))).status).toBe(503);
  });
});
