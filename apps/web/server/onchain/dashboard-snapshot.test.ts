import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { dashboardConfigFingerprint, sanitizeDashboardSnapshot, parseDashboardSnapshot, getDashboardOnchainResult, refreshDashboardSnapshot, createDashboardLogScan } from "./dashboard-snapshot";
import { onchainConfig } from "./public-config";
import { assertSnapshotLogScanHead } from "../../../worker/src/action-public-snapshot";
import type { PublicClient } from "viem";
import type { PublicOnchainSnapshot } from "./public-types";
const hash = `0x${"1".repeat(64)}` as const;
function source(): PublicOnchainSnapshot {
  const action = { txHash: hash, blockNumber: "10", hubAddress: onchainConfig.hubAddress, actionId: hash, easUid: hash,
    status: "ACTIVE", current: true, origin: "NATIVE", qa: false, wallet: "private wallet", creatorId: "private creator", credentials: [{ tokenId: "private token" }] };
  return { version: 2, network: onchainConfig.network, chainId: onchainConfig.chainId, generatedAt: new Date().toISOString(),
    blockTimestamp: new Date(Date.now() - 1000).toISOString(), blockNumber: "10", blockHash: hash,
    deployments: onchainConfig.deployments.map(d => ({ ...d, fromBlock: d.fromBlock.toString(), actionCount: 1 })),
    business: { uniqueActiveWallets: 1, actionCounts: { 10: 1 }, passportCredentials: 1, mintedCredentials: 1, lifecycleTransactions: 1, currentActionTransactions: 1 },
    actions: [action], transactions: [{ txHash: hash, hubAddress: onchainConfig.hubAddress, qa: false, origin: "NATIVE" }], raw: { secret: "raw" }, excludedQaWallets: ["private"] } as unknown as PublicOnchainSnapshot;
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
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
it("publishes the raw ledger with a null dashboard and preserves the prior value on verification failure", async () => {
  const previous = sanitizeDashboardSnapshot(source()); const write = vi.fn();
  const raw = { ...source(), business: null };
  await refreshDashboardSnapshot({ verify: async () => raw, write });
  expect(write).toHaveBeenCalledWith(raw, null, expect.any(AbortSignal));
  write.mockClear();
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
  await vi.advanceTimersByTimeAsync(540000); await assertion;
  expect(signal?.aborted).toBe(true); expect(write).not.toHaveBeenCalled();
});
it("writes the whole verified result and its sanitized projection and returns CAS rejection honestly", async () => {
  const write = vi.fn(async (_source: unknown, _snapshot: unknown) => false);
  expect(await refreshDashboardSnapshot({ verify: async () => source(), write })).toEqual({ updated: false });
  expect(write).toHaveBeenCalledOnce();
  expect(write.mock.calls[0][0]).toHaveProperty("actions");
  expect(write.mock.calls[0][1]).not.toHaveProperty("actions");
});

it("paces dashboard logs on the fixed official RPC and propagates cancellation", async () => {
  vi.useFakeTimers();
  const sent: number[] = [];
  const fetch = vi.fn(async (_url: unknown, init: RequestInit | undefined) => {
    sent.push(Date.now());
    const body = JSON.parse(String(init?.body));
    return Response.json({ jsonrpc: "2.0", id: body.id, result: [] });
  });
  vi.stubGlobal("fetch", fetch);
  const controller = new AbortController(), scan = createDashboardLogScan(controller.signal);
  expect(scan.chunkBlocks).toBe(10_000n);
  const fromBlock = 1n, toBlock = 10_000n;
  const result = Promise.all([scan.client.getLogs({ fromBlock, toBlock }), scan.client.getLogs({ fromBlock, toBlock })]);
  await vi.advanceTimersByTimeAsync(200);
  await result;
  expect(sent).toHaveLength(2);
  expect(sent[1] - sent[0]).toBeGreaterThanOrEqual(125);
  expect(new URL(String(fetch.mock.calls[0][0])).href).toBe(new URL(onchainConfig.rpcUrl).href);
  expect(fetch.mock.calls[0][1]?.signal).toBe(controller.signal);
  controller.abort();
  const cancelled = scan.client.getLogs({ fromBlock, toBlock });
  const assertion = expect(cancelled).rejects.toThrow();
  await vi.runAllTimersAsync(); await assertion;
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("retains the prior snapshot when the separate log source is behind the pinned state block", async () => {
  const previous = sanitizeDashboardSnapshot(source()); const write = vi.fn();
  await expect(refreshDashboardSnapshot({ verify: async () => {
    await assertSnapshotLogScanHead({ client: { getChainId: async () => onchainConfig.chainId,
      getBlock: async () => null } as unknown as PublicClient, chunkBlocks: 10_000n }, onchainConfig.chainId, 10n, hash);
    return source();
  }, write })).rejects.toThrow();
  expect(write).not.toHaveBeenCalled();
  expect(await getDashboardOnchainResult(async () => previous)).toMatchObject({ state: "available" });
});

it("cancels verification before publication when the caller disconnects", async () => {
  const controller = new AbortController(), write = vi.fn(); let signal: AbortSignal | undefined;
  const pending = refreshDashboardSnapshot({ verify: s => { signal = s; return new Promise(() => {}); }, write }, controller.signal);
  const assertion = expect(pending).rejects.toThrow("CANCELLED"); controller.abort(); await assertion;
  expect(signal?.aborted).toBe(true); expect(write).not.toHaveBeenCalled();
});
