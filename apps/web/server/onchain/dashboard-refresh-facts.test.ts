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
  // The stored publication is read once; afterwards this process holds every fact it verified.
  expect(mocks.stored).toHaveBeenCalledOnce();
});

it("reads the stored publication again while it holds no facts, and fails the run when that read fails", async () => {
  mocks.stored.mockResolvedValue(new Map());
  mocks.verify.mockRejectedValue(new Error("Action public snapshot deadline exceeded"));
  expect((await failedRun()).size).toBe(0);
  await failedRun();
  expect(mocks.stored).toHaveBeenCalledTimes(2);
  mocks.stored.mockRejectedValue(new Error("VERIFIED_SNAPSHOT_READ_UNAVAILABLE"));
  const { refreshDashboardSnapshot } = await import("./dashboard-snapshot");
  await expect(refreshDashboardSnapshot()).rejects.toThrow("VERIFIED_SNAPSHOT_READ_UNAVAILABLE");
  expect(mocks.verify).toHaveBeenCalledTimes(2);
});
