import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { dashboardConfigFingerprint, parseVerifiedSnapshot, validatePublication } from "./verified-snapshot";
import { onchainConfig } from "./public-config";
import type { PublicOnchainSnapshot } from "./public-types";
const hash = `0x${"1".repeat(64)}`;
function snapshot(): PublicOnchainSnapshot {
  const metrics = { uniqueActiveWallets: 0, actionCounts: {}, passportCredentials: 0, mintedCredentials: 0, lifecycleTransactions: 0, currentActionTransactions: 0 };
  return { version: 2, network: onchainConfig.network, chainId: onchainConfig.chainId, hubAddress: onchainConfig.hubAddress,
    environmentId: onchainConfig.environmentId, schemaUid: onchainConfig.schemaUid, fromBlock: String(onchainConfig.fromBlock),
    blockNumber: "40000000", blockHash: hash, generatedAt: new Date().toISOString(), blockTimestamp: new Date(Date.now()-1000).toISOString(),
    deployments: onchainConfig.deployments.map(d => ({ ...d, fromBlock: String(d.fromBlock), actionCount: 0 })),
    business: metrics, raw: metrics, excludedQaWallets: [...onchainConfig.qaWallets], excludedQaActions: 0, historicalActions: 0, actions: [], transactions: [] };
}
const envelope = (value = snapshot()) => ({ configFingerprint: dashboardConfigFingerprint(), snapshot: value });
afterEach(() => vi.useRealTimers());
it("retains the whole verified ledger and its original time", () => {
  const input = envelope();
  expect(parseVerifiedSnapshot(input)).toEqual(input.snapshot);
});
it("rejects malformed, private, stale, future and changed-config payloads", () => {
  const value = snapshot();
  for (const input of [null, { ...envelope(value), extra: "private" }, { ...envelope(value), configFingerprint: "0".repeat(64) },
    envelope({ ...value, generatedAt: new Date(Date.now()-900001).toISOString() }),
    envelope({ ...value, generatedAt: new Date(Date.now()+1000).toISOString() }),
    envelope({ ...value, environmentId: hash }), envelope({ ...value, chainId: 1 }),
    envelope({ ...value, excludedQaWallets: [] }), envelope({ ...value, deployments: [] }),
    envelope({ ...value, blockNumber: "1" }), envelope({ ...value, actions: [{ wallet: "private" }] } as unknown as PublicOnchainSnapshot),
    envelope({ ...value, private: "secret" } as PublicOnchainSnapshot)]) expect(() => parseVerifiedSnapshot(input)).toThrow();
});
it("keeps a fully verified raw ledger when business aggregation is unavailable", () => {
  const value = { ...snapshot(), business: null, businessUnavailableReason: "cross_hub_source_collision" as const };
  expect(parseVerifiedSnapshot(envelope(value))).toEqual(value);
  expect(() => validatePublication(value, null)).not.toThrow();
  expect(() => validatePublication(snapshot(), null)).toThrow();
});
it("rejects a projection that differs from its full verified source", () => {
  const value = snapshot();
  const dashboard = { version: 1, configFingerprint: dashboardConfigFingerprint(), network: value.network, chainId: value.chainId,
    verifiedAt: value.generatedAt, blockNumber: value.blockNumber, blockHash: value.blockHash, blockTimestamp: value.blockTimestamp,
    deployments: value.deployments, metrics: value.business!, proof: null };
  expect(() => validatePublication(value, dashboard)).not.toThrow();
  for (const changed of [{ blockHash: `0x${"2".repeat(64)}` }, { blockNumber: "40000001" }, { metrics: { ...dashboard.metrics, mintedCredentials: 1 } },
    { verifiedAt: new Date(Date.now()-2000).toISOString() }]) expect(() => validatePublication(value, { ...dashboard, ...changed })).toThrow();
});

it("round-trips nested credentials and keeps QA exclusion across recipient corrections", () => {
  const value = snapshot(), wallet = "0xd100000000000000000000000000000000000001";
  const action = { actionId: hash, occurrenceId: hash, sourceOccurrence: hash, revision: 1, actionCode: 12,
    wallet: onchainConfig.qaWallets[0], creatorId: hash, campaignId: hash, occurredDay: 20000, easUid: hash, txHash: hash,
    blockNumber: value.blockNumber, hubAddress: onchainConfig.hubAddress, environmentId: onchainConfig.environmentId,
    sourceDeployment: onchainConfig.deployments[1].label, status: "ACTIVE" as const, current: false, qa: true, origin: "NATIVE" as const,
    credentials: [{ kind: 1, nftContract: onchainConfig.assetBindings[1][1], tokenId: "123", linkOrigin: 0,
      representativeAsset: { nftContract: onchainConfig.assetBindings[2][1], tokenId: "234", owner: wallet, issuanceKey: hash, metadataHash: hash,
        migration: { migratorAddress: onchainConfig.credentialReplacement.deployment!.address, batchId: hash, txHash: hash,
          blockNumber: value.blockNumber, sourceHub: onchainConfig.hubAddress, sourceActionId: hash, minted: true } } }] };
  value.actions = [action, { ...action, actionId: `0x${"2".repeat(64)}`, revision: 2, wallet, current: true }];
  value.deployments[1].actionCount = 2; value.excludedQaActions = 1;
  value.transactions = [{ txHash: hash, blockNumber: value.blockNumber, hubAddress: onchainConfig.hubAddress, kind: "record", qa: true, origin: "NATIVE" }];
  expect(parseVerifiedSnapshot(envelope(value))).toEqual(value);
  value.actions[1].qa = false; expect(() => parseVerifiedSnapshot(envelope(value))).toThrow();
  value.actions[1].qa = true; value.actions[0].credentials[0].kind = 0; expect(() => parseVerifiedSnapshot(envelope(value))).toThrow();
});
