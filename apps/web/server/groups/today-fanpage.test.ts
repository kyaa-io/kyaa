import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createTodayFanpageLoader } from "./today-fanpage";

const row = (slug: string, score: number) => ({ slug, name: slug, periodDays: 7, score, posts: 2, comments: 5, likes: 9, missions: 0, fans: 3 });
const detail = vi.fn(async (slug: string) => ({ page: { name: `${slug}!`, imageUrl: `/${slug}.webp` } }) as never);
const day = (iso: string) => () => Date.parse(iso);

describe("today fan pages loader", () => {
  it("computes once for many requests that arrive while nothing is stored, and all get the same list", async () => {
    let release!: (value: unknown) => void;
    const rpc = vi.fn(() => new Promise((resolve) => { release = resolve; }));
    const load = createTodayFanpageLoader(rpc, detail, 3, day("2026-11-14T03:00:00Z"));
    const pending = Array.from({ length: 5 }, () => load("ko"));
    release([row("elina", 40), row("wena", 30)]);
    const results = await Promise.all(pending);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("read_today_fanpages", { p_locale: "ko", p_limit: 3 });
    expect(new Set(results).size).toBe(1);
    expect(results[0]!.map((item) => [item.slug, item.name, item.imageUrl])).toEqual([["elina", "elina!", "/elina.webp"], ["wena", "wena!", "/wena.webp"]]);
    await load("ko");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("computes again on the next KST day, not before", async () => {
    let now = Date.parse("2026-11-14T14:59:00Z");
    const rpc = vi.fn(async () => [row("elina", 40)]);
    const load = createTodayFanpageLoader(rpc, detail, 3, () => now);
    await load("ko");
    now = Date.parse("2026-11-14T14:59:59Z"); await load("ko");
    expect(rpc).toHaveBeenCalledTimes(1);
    now = Date.parse("2026-11-14T15:00:00Z"); await load("ko");
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("returns an empty list when nothing qualifies, and on failure without keeping the failure", async () => {
    expect(await createTodayFanpageLoader(vi.fn(async () => []), detail, 3)("ko")).toEqual([]);
    expect(await createTodayFanpageLoader(vi.fn(async () => ({ slug: "x" })), detail, 3)("ko")).toEqual([]);
    const rpc = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce([row("elina", 40)]);
    const load = createTodayFanpageLoader(rpc, detail, 3);
    expect(await load("ko")).toEqual([]);
    expect((await load("ko")).map((item) => item.slug)).toEqual(["elina"]);
  });
  it("drops a page whose public detail cannot be read", async () => {
    const read = vi.fn(async (slug: string) => slug === "gone" ? null : ({ page: { name: slug, imageUrl: null } }) as never);
    const load = createTodayFanpageLoader(vi.fn(async () => [row("gone", 50), row("elina", 40)]), read, 3);
    expect((await load("ko")).map((item) => item.slug)).toEqual(["elina"]);
  });
});
