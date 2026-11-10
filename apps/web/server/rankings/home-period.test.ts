import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { homeCreatorRankingSchema, homeFanRankingSchema } from "@/features/rankings/domain/types";
import { createRankingsHandlers } from "./routes";

/** Answers of the period readers (20261221010000) taken from the local database after the activity-history seed, so the route and its schema meet the real shape. */
const sql = JSON.parse(readFileSync(resolve(__dirname, "home-period-sql-responses.json"), "utf8")) as Record<string, Record<string, unknown> & { rows: Record<string, unknown>[] }>;
const ME = "11111111-1111-4111-8111-111111111111";
const today = () => new Date(sql.fans_day_viewer!.computedAt as string).getTime();

function make(answer: (name: string) => unknown) {
  const rpc = vi.fn(async (name: string, _args: Record<string, unknown>) => answer(name));
  const handlers = createRankingsHandlers({ profileRefSecret: randomBytes(32).toString("base64"), rpc, authorize: async () => ({ appUserId: ME }), resolveCreatorId: async () => null, now: today });
  return { rpc, handlers };
}
const req = (path: string, headers: Record<string, string> = {}) => new Request(`http://x${path}`, { headers });

describe("home ranking by period", () => {
  it("asks the period reader for fans, with the viewer, and passes the real answer through the schema: gain as the value, no movement", async () => {
    const { rpc, handlers } = make(() => sql.fans_day_viewer);
    const res = await handlers.home(req("/api/rankings/home?kind=fans&period=day&limit=10&metric=hearts", { authorization: "Bearer t" }));
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("read_home_fan_ranking_period", { p_viewer: ME, p_period: "day", p_limit: 10 });
    const body = homeFanRankingSchema.parse(await res.json());
    expect(body.metric).toBe("hearts");
    expect(body.comparable).toBe(false);
    expect(body.rows.length).toBeGreaterThan(0);
    for (const row of body.rows) { expect(row.hearts).toBeGreaterThan(0); expect(row.delta).toBeNull(); expect(row.hearts).toBe(row.dayGain); expect(row.profileRef).toBeDefined(); }
    expect(body.rows.map((r) => r.rank)).toEqual(body.rows.map((_, i) => i + 1));
    const values = body.rows.map((r) => r.hearts ?? 0);
    expect(values).toEqual([...values].sort((a, b) => b - a));
  });

  it("signed out reads at most ten rows of the week and no profile refs", async () => {
    const { rpc, handlers } = make(() => sql.fans_week_guest);
    const res = await handlers.home(req("/api/rankings/home?kind=fans&period=week&limit=50"));
    expect(rpc).toHaveBeenCalledWith("read_home_fan_ranking_period", { p_viewer: null, p_period: "week", p_limit: 10 });
    const body = homeFanRankingSchema.parse(await res.json());
    expect(body.rows.every((r) => r.profileRef === undefined)).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/subjectId|app_user_id/);
  });

  it("asks the period reader for creators and keeps hearts as the value", async () => {
    const { rpc, handlers } = make((name) => name === "read_home_creator_ranking_period" ? sql.creators_week : undefined);
    const res = await handlers.home(req("/api/rankings/home?kind=creators&period=week&limit=10"));
    expect(rpc).toHaveBeenCalledWith("read_home_creator_ranking_period", { p_locale: "ko", p_period: "week", p_limit: 10 });
    const body = homeCreatorRankingSchema.parse(await res.json());
    expect(body.metric).toBe("hearts");
    for (const row of body.rows) { expect(row.hearts).toBeGreaterThan(0); expect(row.delta).toBeNull(); expect(row.hearts).toBe(row.weekGain); }
  });

  it("keeps the cumulative readers for the default and rejects an unknown period before the database", async () => {
    const { rpc, handlers } = make(() => ({ ...sql.fans_day_viewer, comparable: true }));
    await handlers.home(req("/api/rankings/home?kind=fans&metric=hearts&period=all"));
    expect(rpc.mock.calls[0]![0]).toBe("read_home_fan_ranking_v2");
    rpc.mockClear();
    expect((await handlers.home(req("/api/rankings/home?kind=fans&period=year"))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
