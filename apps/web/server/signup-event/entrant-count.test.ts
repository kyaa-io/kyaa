import { afterEach, expect, it, vi } from "vitest";

const { select, from } = vi.hoisted(() => {
  const select = vi.fn();
  return { select, from: vi.fn(() => ({ select })) };
});
vi.mock("./database", () => ({ createSignupRaffleDatabase: () => ({ from }) }));
afterEach(() => { vi.useRealTimers(); vi.resetModules(); vi.clearAllMocks(); });

it("shares one exact count for 60 seconds and keeps zero distinct from failure", async () => {
  vi.useFakeTimers();
  select.mockResolvedValueOnce({ count: 0 }).mockRejectedValueOnce(new Error("unavailable"))
    .mockResolvedValueOnce({ count: 14, error: {} }).mockResolvedValueOnce({ count: 1520 });
  const { readEntrantCount } = await import("./entrant-count");
  expect(await Promise.all([readEntrantCount(), readEntrantCount()])).toEqual([0, 0]);
  expect(from).toHaveBeenCalledWith("signup_raffle_entries");
  expect(select).toHaveBeenCalledWith("id", { count: "exact", head: true });
  vi.advanceTimersByTime(59_999);
  expect(await readEntrantCount()).toBe(0);
  expect(select).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(1);
  expect(await readEntrantCount()).toBeNull();
  vi.advanceTimersByTime(60_000);
  expect(await readEntrantCount()).toBeNull();
  vi.advanceTimersByTime(60_000);
  expect(await readEntrantCount()).toBe(1520);
});
