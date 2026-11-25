import { beforeEach, expect, it, vi } from "vitest";
import type { VerifiedActionFact, VerifiedActionFacts } from "../../../worker/src/action-public-snapshot";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ verify: vi.fn(), stored: vi.fn() }));
vi.mock("../../../worker/src/action-public-snapshot", async (original) => ({
  ...(await original<typeof import("../../../worker/src/action-public-snapshot")>()),
  readFinalizedActionSnapshot: mocks.verify, snapshotClient: () => ({}),
}));
vi.mock("./verified-snapshot", async (original) => ({
  ...(await original<typeof import("./verified-snapshot")>()), readStoredActionFacts: mocks.stored,
}));

const fact = (digit: string): VerifiedActionFact => ({ digest: `0x${digit.repeat(64)}`, bindingVersion: 1,
  sourceOccurrence: `0x${digit.repeat(64)}`, anchorBlockNumber: 100n, anchorBlockHash: `0x${"9".repeat(64)}` });
async function failedRun() {
  const { refreshDashboardSnapshot } = await import("./dashboard-snapshot");
  await expect(refreshDashboardSnapshot()).rejects.toThrow("Action public snapshot deadline exceeded");
  return mocks.verify.mock.calls.at(-1)![0].facts as VerifiedActionFacts;
}
beforeEach(() => { vi.resetModules(); mocks.verify.mockReset(); mocks.stored.mockReset(); vi.spyOn(console, "warn").mockImplementation(() => undefined); });

it("starts from the published facts and carries the facts of a run that hit its deadline into the next run", async () => {
  mocks.stored.mockResolvedValue(new Map([["published", fact("a")]]));
  mocks.verify.mockImplementation(async ({ facts }: { facts: VerifiedActionFacts }) => {
    facts.set(`verified-${facts.size}`, fact("b"));
    throw new Error("Action public snapshot deadline exceeded");
  });
  const first = await failedRun();
  expect([...first.keys()]).toEqual(["published", "verified-1"]);
  const second = await failedRun();
  expect(second).toBe(first);
  expect([...second.keys()]).toEqual(["published", "verified-1", "verified-2"]);
});

it("while catching up, takes the facts another task published for actions it has not verified and keeps its own", async () => {
  mocks.stored.mockResolvedValue(new Map());
  mocks.verify.mockImplementation(async ({ facts }: { facts: VerifiedActionFacts }) => {
    facts.set("own", fact("b"));
    throw new Error("Action public snapshot deadline exceeded");
  });
  expect([...(await failedRun()).keys()]).toEqual(["own"]);
  // Another task finished first and published the whole ledger.
  mocks.stored.mockResolvedValue(new Map([["own", fact("c")], ["other", fact("c")]]));
  const merged = await failedRun();
  expect(merged.get("own")).toEqual(fact("b"));
  expect(merged.get("other")).toEqual(fact("c"));
  expect(mocks.stored).toHaveBeenCalledTimes(2);
});

it("stops reading the stored publication once it has verified the whole ledger, and reads it again after a failed run", async () => {
  mocks.stored.mockResolvedValue(new Map());
  // The verifier finishes; whatever the later phases make of this empty ledger, the process has caught up.
  mocks.verify.mockResolvedValueOnce({ blockNumber: 0n, blockHash: `0x${"9".repeat(64)}`, timestamp: 0n, actions: [], lifecycleTransactions: [], deployments: [], sourceCollisions: [] });
  const { refreshDashboardSnapshot } = await import("./dashboard-snapshot");
  await refreshDashboardSnapshot(undefined).catch(() => undefined);
  expect(mocks.stored).toHaveBeenCalledTimes(1);
  mocks.verify.mockRejectedValue(new Error("Action public snapshot deadline exceeded"));
  await failedRun();
  expect(mocks.stored).toHaveBeenCalledTimes(1);
  await failedRun();
  expect(mocks.stored).toHaveBeenCalledTimes(2);
});

it("fails the run when the stored publication cannot be read", async () => {
  mocks.stored.mockRejectedValue(new Error("VERIFIED_SNAPSHOT_READ_UNAVAILABLE"));
  const { refreshDashboardSnapshot } = await import("./dashboard-snapshot");
  await expect(refreshDashboardSnapshot()).rejects.toThrow("VERIFIED_SNAPSHOT_READ_UNAVAILABLE");
  expect(mocks.verify).not.toHaveBeenCalled();
});
