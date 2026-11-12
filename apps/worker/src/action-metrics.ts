import { finishOnchainWork } from "./onchain-work.js";
import { getAddress } from "viem";
import { actionCodes, linkOrigins } from "./action-constants.ts";

export interface IndexedCredential {
  credentialKey: string;
  kind: number;
  linkOrigin: number;
  nftContract: string;
  tokenId: string;
}

export interface IndexedFanAction {
  chainId: number;
  occurrenceId: string;
  actionId: string;
  revision: number;
  actionCode: number;
  recipient: string;
  environmentId: string;
  hubProxy: string;
  schemaUid: string;
  easAttester: string;
  easRecipient: string;
  easRevocationTime: bigint;
  easExpirationTime: bigint;
  easIsAttestationValid: boolean;
  status: "ACTIVE" | "INVALIDATED";
  origin: "NATIVE" | "HISTORICAL";
  finality: "included" | "safe" | "finalized";
  txHash: string;
  credentials: readonly IndexedCredential[];
}

export interface FinalizedIndexedFanAction extends IndexedFanAction {
  sourceOccurrence: string;
  easUid: string;
  creatorId: string;
  campaignId: string;
  occurredDay: number;
  blockNumber: bigint;
  blockHash: string;
  originalRecipient: string;
}

export interface ActionLifecycleTransaction {
  hubProxy: string;
  txHash: string;
  blockNumber: bigint;
  blockHash: string;
  kind: "record" | "invalidate" | "correct";
  actionIds: string[];
  recipients: string[];
  origin: "NATIVE" | "HISTORICAL";
}

export interface MetricTrustBoundary {
  chainId: number;
  environmentId: string;
  hubProxy: string;
  hubProxies?: readonly string[];
  schemaUid: string;
  asOfEpochSeconds: bigint;
}

export interface FanActionMetrics {
  uniqueActiveWallets: number;
  actionCounts: Record<number, number>;
  passportCredentials: number;
  mintedCredentials: number;
  collectibleClaims: number;
  transactions: number;
  historicalActions: number;
  excluded: number;
}

export function isTrustedCurrentAction(action: IndexedFanAction, boundary: MetricTrustBoundary, address = getAddress): boolean {
  const allowedHubs = boundary.hubProxies ?? [boundary.hubProxy];
  const issuerMatches = allowedHubs.some((hub) => address(action.hubProxy) === address(hub))
    && address(action.easAttester) === address(action.hubProxy);
  const recipientMatches = address(action.easRecipient) === address(action.recipient);
  const expirationValid = action.easExpirationTime === 0n || action.easExpirationTime > boundary.asOfEpochSeconds;
  return action.chainId === boundary.chainId
    && action.environmentId.toLowerCase() === boundary.environmentId.toLowerCase()
    && action.schemaUid.toLowerCase() === boundary.schemaUid.toLowerCase()
    && issuerMatches
    && recipientMatches
    && action.status === "ACTIVE"
    && action.finality === "finalized"
    && action.easIsAttestationValid
    && action.easRevocationTime === 0n
    && expirationValid;
}

function belongsToTrustDomain(action: IndexedFanAction, boundary: MetricTrustBoundary, address = getAddress): boolean {
  const allowedHubs = boundary.hubProxies ?? [boundary.hubProxy];
  return action.chainId === boundary.chainId
    && action.environmentId.toLowerCase() === boundary.environmentId.toLowerCase()
    && action.schemaUid.toLowerCase() === boundary.schemaUid.toLowerCase()
    && allowedHubs.some((hub) => address(action.hubProxy) === address(hub))
    && address(action.easAttester) === address(action.hubProxy);
}

export function* aggregateFanActionMetricSteps(actions: readonly IndexedFanAction[], boundary: MetricTrustBoundary, options: { includeHistorical?: boolean } = {}): Generator<void, FanActionMetrics> {
  const addresses = new Map<string, ReturnType<typeof getAddress>>();
  const address = (value: string) => {
    let result = addresses.get(value);
    if (result === undefined) { result = getAddress(value); addresses.set(value, result); }
    return result;
  };
  const latest = new Map<string, IndexedFanAction>();
  for (const action of actions) {
    yield;
    if (!belongsToTrustDomain(action, boundary, address)) continue;
    const current = latest.get(action.occurrenceId.toLowerCase());
    if (!current || action.revision > current.revision) latest.set(action.occurrenceId.toLowerCase(), action);
  }
  const current: IndexedFanAction[] = [];
  for (const action of latest.values()) { yield; if (isTrustedCurrentAction(action, boundary, address)) current.push(action); }
  const trusted = current.filter((action) => options.includeHistorical || action.origin !== "HISTORICAL");
  const actionCounts: Record<number, number> = {};
  const wallets = new Set<string>();
  const txs = new Set<string>();
  const passports = new Set<string>();
  const minted = new Set<string>();
  for (const action of actions) {
    yield;
    const recipientMatches = address(action.easRecipient) === address(action.recipient);
    if (!belongsToTrustDomain(action, boundary, address)
      || !recipientMatches
      || action.finality !== "finalized"
      || (!options.includeHistorical && action.origin === "HISTORICAL")) continue;
    for (const credential of action.credentials) {
      if (credential.linkOrigin === linkOrigins.MINTED_NOW) minted.add(credential.credentialKey.toLowerCase());
    }
  }
  let collectibleClaims = 0;
  for (const action of trusted) {
    yield;
    wallets.add(address(action.recipient));
    txs.add(action.txHash.toLowerCase());
    actionCounts[action.actionCode] = (actionCounts[action.actionCode] ?? 0) + 1;
    let linkedCollectible = false;
    for (const credential of action.credentials) {
      if (credential.kind === 0) passports.add(credential.credentialKey.toLowerCase());
      if (credential.kind === 2) linkedCollectible = true;
    }
    if (action.actionCode === actionCodes.COLLECTIBLE_CLAIMED && linkedCollectible) collectibleClaims += 1;
  }
  return {
    uniqueActiveWallets: wallets.size,
    actionCounts,
    passportCredentials: passports.size,
    mintedCredentials: minted.size,
    collectibleClaims,
    transactions: txs.size,
    historicalActions: current.filter((action) => action.origin === "HISTORICAL").length,
    excluded: latest.size - trusted.length,
  };
}

export function aggregateFanActionMetrics(actions: readonly IndexedFanAction[], boundary: MetricTrustBoundary, options: { includeHistorical?: boolean } = {}): FanActionMetrics {
  return finishOnchainWork(aggregateFanActionMetricSteps(actions, boundary, options));
}
