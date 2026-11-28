import { afterEach, expect, it, vi } from "vitest";
const { query, createDatabase } = vi.hoisted(() => ({ query: vi.fn(), createDatabase: vi.fn() }));
vi.mock("./database", () => ({ createSignupRaffleDatabase: createDatabase }));

afterEach(() => { vi.useRealTimers(); vi.resetModules(); vi.resetAllMocks(); });

it("counts issued passports and shares the pending result for sixty seconds, including zero", async () => {
  vi.useFakeTimers();
  const db = { from: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), lt: query };
  createDatabase.mockReturnValue(db);
  query.mockResolvedValueOnce({ count: 0, error: null }).mockResolvedValueOnce({ count: 7, error: null });
  const { readIssuedPassports } = await import("./issued-passports");
  const first = readIssuedPassports();
  expect(readIssuedPassports()).toBe(first);
  expect(await first).toBe(0);
  expect(db.from).toHaveBeenCalledWith("fan_passports");
  expect(db.eq).toHaveBeenCalledWith("business_status", "issued");
  expect(query).toHaveBeenCalledWith("issued_at", new Date().toISOString());
  vi.advanceTimersByTime(60_000);
  expect(await readIssuedPassports()).toBe(7);
});

it("hides the count when the database is unavailable", async () => {
  createDatabase.mockImplementation(() => { throw new Error("unavailable"); });
  const { readIssuedPassports } = await import("./issued-passports");
  expect(await readIssuedPassports()).toBeNull();
});
