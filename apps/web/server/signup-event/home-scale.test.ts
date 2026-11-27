import { expect, it, vi } from "vitest";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("./database", () => ({ createSignupRaffleDatabase: () => ({ from }) }));
import { readHomeScale } from "./home-scale";

it("shares in-flight counts, rolls over at KST midnight and hides closed raffles", async () => {
  vi.useFakeTimers();
  const filters: string[] = [];
  from.mockImplementation((table: string) => {
    const query = {
      select: () => query,
      lt: () => query,
      gte: (key: string, value: string) => { filters.push(key + "=" + value); return query; },
      lte: () => query,
      then: (resolve: (data: object) => void) => resolve(table === "app_users" ? { count: 0 } : { error: "unavailable" }),
    };
    return query;
  });
  try {
    vi.setSystemTime(new Date("2026-11-27T14:59:59Z"));
    const pending = readHomeScale(true);
    expect(readHomeScale(true)).toBe(pending);
    expect(await pending).toMatchObject({ members: 0, today: 0, entrants: null });
    expect(from).toHaveBeenCalledTimes(3);
    vi.setSystemTime(new Date("2026-11-27T15:00:00Z"));
    await readHomeScale(true);
    expect(filters).toContain("created_at=2026-11-27T15:00:00.000Z");
    vi.setSystemTime(new Date("2026-12-13T15:00:00Z"));
    from.mockClear();
    expect((await readHomeScale(true)).entrants).toBeNull();
    expect(from).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
  }
});
