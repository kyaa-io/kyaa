import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { dashboardConfigFingerprint, sanitizeDashboardSnapshot, parseDashboardSnapshot, getDashboardOnchainResult, refreshDashboardSnapshot } from "./dashboard-snapshot";
import { onchainConfig } from "./public-config";
import type { PublicOnchainSnapshot } from "./public-types";
const hash = `0x${"1".repeat(64)}`;
function source(): PublicOnchainSnapshot {
  const action = { txHash: hash, blockNumber: "10", hubAddress: onchainConfig.hubAddress, actionId: hash, easUid: hash,
    status: "ACTIVE", current: true, origin: "NATIVE", qa: false, wallet: "private wallet", creatorId: "private creator", credentials: [{ tokenId: "private token" }] };
  return { version: 2, network: onchainConfig.network, chainId: onchainConfig.chainId, generatedAt: new Date().toISOString(),
    blockTimestamp: new Date(Date.now() - 1000).toISOString(), blockNumber: "10", blockHash: hash,
    deployments: onchainConfig.deployments.map(d => ({ ...d, fromBlock: d.fromBlock.toString(), actionCount: 1 })),
    business: { uniqueActiveWallets: 1, actionCounts: { 10: 1 }, passportCredentials: 1, mintedCredentials: 1, lifecycleTransactions: 1, currentActionTransactions: 1 },
    actions: [action], transactions: [{ txHash: hash, hubAddress: onchainConfig.hubAddress, qa: false, origin: "NATIVE" }], raw: { secret: "raw" }, excludedQaWallets: ["private"] } as unknown as PublicOnchainSnapshot;
}
afterEach(() => vi.useRealTimers());
it("retains only safe aggregates and one current native non-QA proof", () => {
  const input = source();
  input.actions.unshift(...[{ qa: true }, { current: false }, { origin: "HISTORICAL" }, { status: "INVALIDATED" }].map(overrides => ({ ...input.actions[0], ...overrides } as typeof input.actions[number])));
  const safe = sanitizeDashboardSnapshot(input);
  expect(safe.proof).toMatchObject({ txHash: hash, current: true, status: "ACTIVE", origin: "NATIVE" });
  expect(JSON.stringify(safe)).not.toMatch(/private|"(?:wallet|creatorId|credentials|tokenId|raw|actions)":/);
  expect(Object.keys(safe.proof!)).toEqual(["txHash", "blockNumber", "hubAddress", "actionId", "easUid", "status", "current", "origin"]);
});
it("excludes a proof transaction that contains QA activity", () => {
  const input = source(); input.transactions[0].qa = true;
  expect(sanitizeDashboardSnapshot(input).proof).toBeNull();
});
it("allows no proof when there is no current native business action", () => {
  const input = source(); input.actions[0].qa = true;
  expect(sanitizeDashboardSnapshot(input).proof).toBeNull();
});
it("rejects business-null without writing and retains the prior value on verification failure", async () => {
  const previous = sanitizeDashboardSnapshot(source()); const write = vi.fn();
  await expect(refreshDashboardSnapshot({ verify: async () => ({ ...source(), business: null }), write })).rejects.toThrow();
  await expect(refreshDashboardSnapshot({ verify: async () => { throw new Error("RPC failure"); }, write })).rejects.toThrow();
  expect(write).not.toHaveBeenCalled();
  expect(await getDashboardOnchainResult(async () => previous)).toMatchObject({ state: "available" });
});
it("fails closed for missing, future, stale, malformed and changed-config projections", async () => {
  const safe = sanitizeDashboardSnapshot(source());
  for (const bad of [null, { ...safe, extra: true }, { ...safe, configFingerprint: "0".repeat(64) },
    { ...safe, verifiedAt: new Date(Date.now() + 1000).toISOString() }, { ...safe, verifiedAt: new Date(Date.now() - 900001).toISOString() },
    { ...safe, proof: { ...safe.proof, blockNumber: "11" } }]) {
    expect(await getDashboardOnchainResult(async () => bad)).toEqual({ state: "unavailable" });
  }
  expect(() => parseDashboardSnapshot(safe)).not.toThrow();
});
it("fingerprints every verification input and namespace", () => {
  for (const key of ["rpcUrl", "chainId", "network", "environmentId", "deployments", "schemaUid", "easAddress", "assetBindings", "credentialReplacement", "qaWallets"]) {
    expect(dashboardConfigFingerprint({ ...onchainConfig, [key]: "changed" })).not.toBe(dashboardConfigFingerprint(onchainConfig));
  }
});
it("aborts the full verification deadline and never writes partial state", async () => {
  vi.useFakeTimers(); const write = vi.fn(); let signal: AbortSignal | undefined;
  const running = refreshDashboardSnapshot({ verify: s => { signal = s; return new Promise(() => {}); }, write });
  const assertion = expect(running).rejects.toThrow("DASHBOARD_REFRESH_TIMEOUT");
  await vi.advanceTimersByTimeAsync(285000); await assertion;
  expect(signal?.aborted).toBe(true); expect(write).not.toHaveBeenCalled();
});
it("writes the sanitized projection and returns CAS rejection honestly", async () => {
  const write = vi.fn(async (_snapshot: unknown) => false);
  expect(await refreshDashboardSnapshot({ verify: async () => source(), write })).toEqual({ updated: false });
  expect(write).toHaveBeenCalledOnce();
  expect(write.mock.calls[0][0]).not.toHaveProperty("actions");
});
