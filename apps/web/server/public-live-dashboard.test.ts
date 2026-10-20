import { describe, expect, it, vi } from "vitest";
import { createPublicLiveDashboardHandler } from "./public-live-dashboard";
import type { PublicOnchainSnapshot } from "./onchain/public-types";
vi.mock("server-only", () => ({}));
vi.mock("./onchain/public-snapshot", () => ({ getPublicOnchainResult: vi.fn() }));

const asOf = "2026-10-21T00:00:00Z";
const database = { asOf, approvedParticipation: 12, participatingBroadcasts: 2, sentHearts: 3, process: { pending: 1, approved: 12, rejected: 0 } };
const metrics = { uniqueActiveWallets: 8, actionCounts: { 1: 12 }, passportCredentials: 8, mintedCredentials: 6, lifecycleTransactions: 12, currentActionTransactions: 11 };

describe("public live dashboard aggregates", () => {
  it.each(["database", "onchain"])("returns the other source before the screen deadline when %s stalls", async (slow) => {
    vi.useFakeTimers();
    try {
      const snapshot = { generatedAt: asOf, blockTimestamp: asOf, business: metrics } as unknown as PublicOnchainSnapshot;
      let response: Response | undefined;
      void createPublicLiveDashboardHandler({
        readDatabase: () => slow === "database" ? new Promise(() => {}) : Promise.resolve(database),
        readOnchain: () => slow === "onchain" ? new Promise(() => {}) : Promise.resolve({ state: "available", snapshot }),
      })().then(result => { response = result; });
      await vi.advanceTimersByTimeAsync(6000);
      expect(response).toBeDefined();
      const result = await response!.json();
      expect(result[slow]).toEqual({ state: "unavailable" });
      expect(result[slow === "database" ? "onchain" : "database"].state).toBe("available");
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
  it("returns only the allowlisted aggregate even when the source contains private identifiers", async () => {
    const snapshot = { generatedAt: asOf, blockTimestamp: asOf, business: metrics, actions: [{ wallet: "private-wallet" }], excludedQaWallets: ["qa-wallet"] } as unknown as PublicOnchainSnapshot;
    const response = await createPublicLiveDashboardHandler({ readDatabase: async () => database, readOnchain: async () => ({ state: "available", snapshot }) })();
    const result = await response.json();
    expect(result).toEqual({ database: { ...database, state: "available" }, onchain: { state: "available", asOf, blockTimestamp: asOf, metrics } });
    expect(JSON.stringify(result)).not.toContain("private-wallet");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("preserves valid database metrics when the chain fails and rejects unexpected database fields", async () => {
    const response = await createPublicLiveDashboardHandler({ readDatabase: async () => database, readOnchain: async () => { throw new Error("private RPC host"); } })();
    expect((await response.json()).database).toMatchObject({ state: "available", approvedParticipation: 12 });
    const invalid = await createPublicLiveDashboardHandler({ readDatabase: async () => ({ ...database, emails: ["private@example.com"] }), readOnchain: async () => ({ state: "unavailable" }) })();
    expect(await invalid.json()).toEqual({ database: { state: "unavailable" }, onchain: { state: "unavailable" } });
  });
});
