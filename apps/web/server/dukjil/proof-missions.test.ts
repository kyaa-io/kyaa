import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/server/config/env", () => ({ loadServerEnv: () => ({ SUPABASE_URL: "http://x", SUPABASE_SERVICE_ROLE_KEY: "k" }) }));
const calls: { table: string; ops: [string, unknown[]][] }[] = [];
vi.mock("@/server/data/client", () => ({
  createClient: () => ({
    from: (table: string) => {
      const rec = { table, ops: [] as [string, unknown[]][] };
      calls.push(rec);
      const chain: Record<string, unknown> = {};
      for (const op of ["select", "eq", "not", "is", "lte", "gt", "gte", "in", "order", "limit"]) chain[op] = (...a: unknown[]) => { rec.ops.push([op, a]); return chain; };
      chain.then = (res: (v: unknown) => unknown) => res({ data: [], count: 0, error: null });
      return chain;
    },
  }),
}));
import { MONTH_STATUSES, kstMonthStart, readProofMissions } from "./proof-missions";

describe("kstMonthStart", () => {
  it("returns the KST month start as a UTC instant", () => {
    expect(kstMonthStart(new Date("2026-11-06T05:00:00Z"))).toBe("2026-10-31T15:00:00.000Z");
    expect(kstMonthStart(new Date("2026-10-31T16:00:00Z"))).toBe("2026-10-31T15:00:00.000Z");
    expect(kstMonthStart(new Date("2026-10-31T14:59:00Z"))).toBe("2026-09-30T15:00:00.000Z");
  });
});

describe("monthly count (synthetic mock client)", () => {
  beforeEach(() => { calls.length = 0; });
  it("counts only the states the submit RPC counts, not rejected", async () => {
    await readProofMissions("c", "u");
    expect(MONTH_STATUSES).toEqual(["pending", "in_review", "changes_requested", "approved"]);
    const month = calls.filter((c) => c.table === "certification_submissions").find((c) => c.ops.some(([op]) => op === "gte"));
    const statuses = month?.ops.find(([op]) => op === "in")?.[1] as [string, string[]];
    expect(statuses[1]).toEqual(MONTH_STATUSES);
    expect(statuses[1]).not.toContain("rejected");
  });
});
