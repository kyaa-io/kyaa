import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ read: vi.fn(), verify: vi.fn() }));
vi.mock("../../../worker/src/action-public-snapshot", () => ({ readFinalizedActionSnapshot: mocks.verify }));
vi.mock("@/server/data/client", () => ({ createClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ abortSignal: (signal: AbortSignal) => ({ maybeSingle: () => mocks.read(signal) }) }) }) }) }) }));
vi.mock("../config/env", () => ({ loadServerEnv: () => ({ SUPABASE_URL: "https://example.test", SUPABASE_SERVICE_ROLE_KEY: "test" }) }));
import { getPublicOnchainResult } from "./public-snapshot";
import { dashboardConfigFingerprint } from "./verified-snapshot";
import { onchainConfig } from "./public-config";
function payload() {
  const metrics = { uniqueActiveWallets: 0, actionCounts: {}, passportCredentials: 0, mintedCredentials: 0, lifecycleTransactions: 0, currentActionTransactions: 0 };
  return { configFingerprint: dashboardConfigFingerprint(), snapshot: { version: 2, network: onchainConfig.network, chainId: onchainConfig.chainId,
    hubAddress: onchainConfig.hubAddress, environmentId: onchainConfig.environmentId, schemaUid: onchainConfig.schemaUid, fromBlock: String(onchainConfig.fromBlock),
    blockNumber: "40000000", blockHash: `0x${"1".repeat(64)}`, generatedAt: new Date().toISOString(), blockTimestamp: new Date(Date.now()-1000).toISOString(),
    deployments: onchainConfig.deployments.map(d => ({ ...d, fromBlock: String(d.fromBlock), actionCount: 0 })), business: metrics, raw: metrics,
    excludedQaWallets: [...onchainConfig.qaWallets], excludedQaActions: 0, historicalActions: 0, actions: [], transactions: [] } };
}
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });
it("serves the complete stored verified result without starting any RPC scan", async () => {
  const value = payload(); mocks.read.mockResolvedValue({ data: { public_payload: value, block_number: value.snapshot.blockNumber, block_hash: value.snapshot.blockHash, verified_at: value.snapshot.generatedAt }, error: null });
  const timeout = vi.spyOn(AbortSignal, "timeout");
  expect(await getPublicOnchainResult()).toEqual({ state: "available", snapshot: value.snapshot });
  expect(timeout).toHaveBeenCalledWith(4000);
  expect(mocks.verify).not.toHaveBeenCalled();
});
it("returns unavailable for a cold, expired, malformed or failed read without a foreground refresh", async () => {
  const value = payload(); value.snapshot.generatedAt = "2020-01-01T00:00:00Z";
  for (const result of [{ data: null }, { data: { public_payload: value } }, { data: { public_payload: { generatedAt: new Date().toISOString() } } }, { error: { message: "private" } }]) {
    mocks.read.mockResolvedValue(result); expect(await getPublicOnchainResult()).toEqual({ state: "unavailable" });
  }
  mocks.read.mockRejectedValue(new Error("private infrastructure error"));
  expect(await getPublicOnchainResult()).toEqual({ state: "unavailable" });
  expect(mocks.verify).not.toHaveBeenCalled();
});
it("keeps raw ledger availability when business aggregation is unavailable", async () => {
  const value = payload();
  const raw = { ...value, snapshot: { ...value.snapshot, business: null, businessUnavailableReason: "cross_hub_source_collision" } };
  expect(await getPublicOnchainResult(async () => raw)).toEqual({ state: "available", snapshot: raw.snapshot });
});

it("rejects stored row metadata that differs from the complete payload", async () => {
  const value = payload();
  mocks.read.mockResolvedValue({ data: { public_payload: value, block_number: "40000001", block_hash: value.snapshot.blockHash, verified_at: value.snapshot.generatedAt } });
  expect(await getPublicOnchainResult()).toEqual({ state: "unavailable" });
});
