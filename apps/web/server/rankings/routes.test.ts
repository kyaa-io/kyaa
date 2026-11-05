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
});
