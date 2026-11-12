import { finishOnchainWork, runOnchainWork, mapOnchainWork } from "../../../worker/src/onchain-work";
import { getAddress } from "viem";
import { aggregateFanActionMetricSteps, isTrustedCurrentAction } from "../../../worker/src/action-metrics";
import type { FinalizedActionSnapshot } from "../../../worker/src/action-public-snapshot";
import { onchainConfig } from "./public-config";
import type { PublicOnchainSnapshot } from "./public-types";
import type { PublicRepresentativeAsset } from "./public-types";
import { credentialAssetKey } from "./credential-replacements";

const ZERO_ADDRESS = `0x${"0".repeat(40)}`;

/** Pure projection: every metric input comes from the validated chain snapshot. */
function* projectPublicOnchainSteps(
  source: FinalizedActionSnapshot,
  generatedAt = new Date(),
  representatives: ReadonlyMap<string, PublicRepresentativeAsset> = new Map(),
): Generator<void, PublicOnchainSnapshot> {
  const addresses = new Map<string, ReturnType<typeof getAddress>>();
  const address = (value: string) => {
    let result = addresses.get(value);
    if (result === undefined) { result = getAddress(value); addresses.set(value, result); }
    return result;
  };
  const hubProxies = source.deployments.map(({ hubAddress }) => hubAddress);
  const boundary = {
    chainId: onchainConfig.chainId, environmentId: onchainConfig.environmentId,
    hubProxy: onchainConfig.hubAddress, hubProxies, schemaUid: onchainConfig.schemaUid,
    asOfEpochSeconds: source.timestamp,
  };
  const qaWallets = new Set<string>(onchainConfig.qaWallets.map((wallet) => wallet.toLowerCase()));
  // sourceOccurrence is stable across revisions and deployments; exclude its whole history if any recipient is QA.
  const qaSources = new Set(source.actions
    .filter((action) => qaWallets.has(action.recipient.toLowerCase()))
    .map((action) => action.sourceOccurrence.toLowerCase()));
  const qaActionIds = new Set(source.actions
    .filter((action) => qaSources.has(action.sourceOccurrence.toLowerCase()))
    .map((action) => action.actionId.toLowerCase()));
  const qaTx = (tx: FinalizedActionSnapshot["lifecycleTransactions"][number]) => tx.recipients.some((wallet) => qaWallets.has(wallet.toLowerCase()))
    || tx.actionIds.some((id) => qaActionIds.has(id.toLowerCase()));
  const businessActions = source.actions.filter((action) => !qaSources.has(action.sourceOccurrence.toLowerCase()) && action.origin === "NATIVE");
  const collision = source.sourceCollisions.length > 0;
  const businessMetrics = collision ? null : yield* aggregateFanActionMetricSteps(businessActions, boundary);
  const raw = yield* aggregateFanActionMetricSteps(source.actions, boundary, { includeHistorical: true });
  const latest = new Map<string, number>();
  for (const action of source.actions) {
    yield;
    const key = `${address(action.hubProxy).toLowerCase()}:${action.occurrenceId.toLowerCase()}`;
    latest.set(key, Math.max(latest.get(key) ?? 0, action.revision));
  }
  const isCurrent = (action: FinalizedActionSnapshot["actions"][number]) => {
    const key = `${address(action.hubProxy).toLowerCase()}:${action.occurrenceId.toLowerCase()}`;
    return latest.get(key) === action.revision && isTrustedCurrentAction(action, boundary, address);
  };
  const currentActions = (yield* mapOnchainWork(source.actions, action => isCurrent(action) ? action : undefined)).filter(action => action !== undefined);
  const sourceById = new Map<string, typeof source.actions[number]>();
  for (const action of source.actions) {
    yield;
    const key = `${address(action.hubProxy)}:${action.actionId.toLowerCase()}`;
    if (!sourceById.has(key)) sourceById.set(key, action);
  }
  const nativeAssets = new Set<string>(), ownedAssets = new Set<string>();
  for (const action of currentActions) {
    yield;
    const owner = address(action.recipient), hub = address(action.hubProxy);
    for (const credential of action.credentials) {
      const key = `${owner}:${credentialAssetKey(credential.nftContract, credential.tokenId)}`;
      ownedAssets.add(key);
      nativeAssets.add(`${hub}:${action.occurrenceId.toLowerCase()}:${key}`);
    }
  }
  const authorizedRepresentatives = new Set<string>();
  for (const [key, representative] of representatives) {
    yield;
    const hub = address(representative.migration.sourceHub);
    const native = hub !== address(ZERO_ADDRESS);
    const sourceAction = native ? sourceById.get(`${hub}:${representative.migration.sourceActionId.toLowerCase()}`) : undefined;
    if (native && !sourceAction) continue;
    const ownedKey = `${address(representative.owner)}:${key}`;
    const authorized = native
      ? nativeAssets.has(`${hub}:${sourceAction!.occurrenceId.toLowerCase()}:${ownedKey}`)
      : ownedAssets.has(ownedKey);
    if (authorized) authorizedRepresentatives.add(key);
  }
  const metrics = (value: typeof raw, lifecycleTransactions: number) => ({
    uniqueActiveWallets: value.uniqueActiveWallets, actionCounts: value.actionCounts,
    passportCredentials: value.passportCredentials, mintedCredentials: value.mintedCredentials,
    currentActionTransactions: value.transactions, lifecycleTransactions,
  });
  const deploymentNames = new Map(source.deployments.map((deployment) => [address(deployment.hubAddress).toLowerCase(), deployment.label]));
  const configuredDeployments = new Map(onchainConfig.deployments.map((deployment) => [address(deployment.hubAddress).toLowerCase(), deployment]));
  const projected: PublicOnchainSnapshot = {
    version: 2, network: onchainConfig.network, chainId: onchainConfig.chainId, hubAddress: onchainConfig.hubAddress,
    environmentId: onchainConfig.environmentId, schemaUid: onchainConfig.schemaUid,
    fromBlock: onchainConfig.fromBlock.toString(), blockNumber: source.blockNumber.toString(), blockHash: source.blockHash,
    blockTimestamp: new Date(Number(source.timestamp) * 1000).toISOString(), generatedAt: generatedAt.toISOString(),
    deployments: source.deployments.map((deployment) => {
      const configured = configuredDeployments.get(address(deployment.hubAddress).toLowerCase());
      if (!configured) throw new Error("Action public projection received an unconfigured Hub deployment");
      return {
        label: deployment.label, hubAddress: address(deployment.hubAddress), fromBlock: deployment.fromBlock.toString(),
        actionCount: deployment.actionCount, writeStatus: configured.writeStatus,
      };
    }),
    business: businessMetrics ? metrics(businessMetrics, source.lifecycleTransactions.filter((tx) => !qaTx(tx) && tx.origin === "NATIVE").length) : null,
    raw: metrics(raw, source.lifecycleTransactions.length),
    excludedQaWallets: [...onchainConfig.qaWallets], excludedQaActions: qaSources.size, historicalActions: raw.historicalActions,
    actions: yield* mapOnchainWork(source.actions, (action) => {
      return {
        actionId: action.actionId, occurrenceId: action.occurrenceId, sourceOccurrence: action.sourceOccurrence,
        revision: action.revision, actionCode: action.actionCode, wallet: action.recipient,
        creatorId: action.creatorId, campaignId: action.campaignId, occurredDay: action.occurredDay,
        easUid: action.easUid, txHash: action.txHash, blockNumber: action.blockNumber.toString(),
        hubAddress: address(action.hubProxy), environmentId: action.environmentId,
        sourceDeployment: deploymentNames.get(address(action.hubProxy).toLowerCase()) ?? "ActionHub",
        status: action.status,
        current: isCurrent(action),
        qa: qaSources.has(action.sourceOccurrence.toLowerCase()), origin: action.origin,
        credentials: action.credentials.map(({ kind, nftContract, tokenId, linkOrigin }) => {
          const key = credentialAssetKey(nftContract, tokenId);
          const representativeAsset = authorizedRepresentatives.has(key) ? representatives.get(key) : undefined;
          return { kind, nftContract, tokenId, linkOrigin, ...(representativeAsset ? { representativeAsset } : {}) };
        }),
      };
    }),
    transactions: yield* mapOnchainWork(source.lifecycleTransactions, (tx) => ({
      txHash: tx.txHash, blockNumber: tx.blockNumber.toString(), hubAddress: address(tx.hubProxy),
      kind: tx.kind, qa: qaTx(tx), origin: tx.origin,
    })),
  };
  if (collision) projected.businessUnavailableReason = "cross_hub_source_collision";
  return projected;
}

export function projectPublicOnchainSnapshot(source: FinalizedActionSnapshot, generatedAt = new Date(), representatives: ReadonlyMap<string, PublicRepresentativeAsset> = new Map()): PublicOnchainSnapshot {
  return finishOnchainWork(projectPublicOnchainSteps(source, generatedAt, representatives));
}
export function projectPublicOnchainSnapshotAsync(source: FinalizedActionSnapshot, generatedAt: Date, representatives: ReadonlyMap<string, PublicRepresentativeAsset>, signal?: AbortSignal): Promise<PublicOnchainSnapshot> {
  return runOnchainWork(projectPublicOnchainSteps(source, generatedAt, representatives), signal);
}
