import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createTodayFanpageLoader } from "./today-fanpage";

const row = (slug: string, score: number) => ({ slug, name: slug, periodDays: 7, score, posts: 2, comments: 5, likes: 9, missions: 0, fans: 3 });
const day = (iso: string) => () => Date.parse(iso);

describe("today fan pages loader", () => {
  it("computes once for many requests that arrive while nothing is stored, and all get the same list", async () => {
    let release!: (value: unknown) => void;
    const rpc = vi.fn(() => new Promise((resolve) => { release = resolve; }));
    const load = createTodayFanpageLoader(rpc, 3, day("2026-11-14T03:00:00Z"));
    const pending = Array.from({ length: 5 }, () => load("ko"));
    release([row("elina", 40), row("wena", 30)]);
    const results = await Promise.all(pending);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("read_today_fanpages", { p_locale: "ko", p_limit: 3 });
    expect(new Set(results).size).toBe(1);
    expect(results[0]!.map((item) => item.slug)).toEqual(["elina", "wena"]);
    await load("ko");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("keeps the ranking order from the RPC alone: the same top slug with no detail lookup at all", async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name !== "read_today_fanpages") throw new Error(`503 ${name}`);
      return [row("elina", 40), row("wena", 30)];
    });
    expect((await createTodayFanpageLoader(rpc, 3)("ko")).map((item) => item.slug)).toEqual(["elina", "wena"]);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["read_today_fanpages"]);
  });
  it("computes again on the next KST day, not before", async () => {
    let now = Date.parse("2026-11-14T14:59:00Z");
    const rpc = vi.fn(async () => [row("elina", 40)]);
    const load = createTodayFanpageLoader(rpc, 3, () => now);
    await load("ko");
    now = Date.parse("2026-11-14T14:59:59Z"); await load("ko");
    expect(rpc).toHaveBeenCalledTimes(1);
    now = Date.parse("2026-11-14T15:00:00Z"); await load("ko");
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("falls back to an empty list when the ranking fails and does not keep that for the day", async () => {
    expect(await createTodayFanpageLoader(vi.fn(async () => ({ slug: "x" })), 3)("ko")).toEqual([]);
    const rpc = vi.fn().mockRejectedValueOnce(new Error("503")).mockResolvedValueOnce([row("elina", 40)]);
    const load = createTodayFanpageLoader(rpc, 3, day("2026-11-14T03:00:00Z"));
    expect(await load("ko")).toEqual([]);
    expect((await load("ko")).map((item) => item.slug)).toEqual(["elina"]);
    expect(rpc).toHaveBeenCalledTimes(2);
    await load("ko");
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
