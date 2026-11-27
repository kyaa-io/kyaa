import { expect, it, vi } from "vitest";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("./database", () => ({ createSignupRaffleDatabase: () => ({ from }) }));
import { readHomeScale } from "./home-scale";

it("counts issued passports as of the member cutoff and caches independent results for 60 seconds", async () => {
  vi.useFakeTimers();
  const eq = vi.fn();
  const lt = vi.fn();
  let failPassports = true;
  from.mockImplementation((table: string) => {
    const query = {
      select: () => query,
      eq: (...args: string[]) => { eq(...args); return query; },
      lt: (...args: string[]) => { lt(...args); return query; },
      then: (resolve: (data: object) => void) => resolve(table === "app_users"
        ? { count: 0 }
        : failPassports ? { error: "unavailable" } : { count: 10000 }),
    };
    return query;
  });
  try {
    const asOf = "2026-11-27T00:00:00.000Z";
    vi.setSystemTime(new Date(asOf));
    const pending = readHomeScale();
    expect(await pending).toEqual({ asOf, members: 0, passports: null });
    expect(eq).toHaveBeenCalledWith("business_status", "issued");
    expect(lt.mock.calls).toEqual([["created_at", asOf], ["issued_at", asOf]]);
    failPassports = false;
    vi.advanceTimersByTime(59999);
    expect(readHomeScale()).toBe(pending);
    expect(from).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1);
    expect(await readHomeScale()).toMatchObject({ members: 0, passports: 10000 });
  } finally {
    vi.useRealTimers();
  }
});
