import type { FinalizedActionSnapshot } from '../../../worker/src/action-public-snapshot';
import type { PublicRepresentativeAsset } from './public-types';
import { onchainConfig as config } from './public-config';
import { credentialAssetKey } from './credential-replacements';

// Public /api/public/onchain, 2026-11-12: 3 + 4591 actions, 1719 representatives.
export const productionScale = { actions: 4594, representatives: 1719 };
export function performanceFixture() {
  const hash = (n: number) => `0x${n.toString(16).padStart(64, '0')}` as `0x${string}`;
  const representatives = new Map<string, PublicRepresentativeAsset>();
  const count = productionScale.actions * 2;
  const source: FinalizedActionSnapshot = {
    blockNumber: 41_110_860n, blockHash: hash(1), timestamp: BigInt(Math.floor(Date.now()/1000)-1),
    deployments: config.deployments.map((d, i) => ({ ...d, actionCount: i === 1 ? count : 0 })),
    sourceCollisions: [], actions: [], lifecycleTransactions: [],
  };
  for (let i = 0; i < count; i++) {
    const id = hash(i+100), wallet = `0x${(i%1208+100).toString(16).padStart(40,'0')}`;
    const tokenId = String(i+1), nftContract = config.assetBindings[1][1];
    source.actions.push({ chainId: config.chainId, sourceOccurrence: id, occurrenceId: id, actionId: id, revision: 1, actionCode: 10,
      recipient: wallet, originalRecipient: wallet, environmentId: config.environmentId, hubProxy: config.hubAddress, schemaUid: config.schemaUid,
      easAttester: config.hubAddress, easRecipient: wallet, easRevocationTime: 0n, easExpirationTime: 0n,
      easIsAttestationValid: true, status: 'ACTIVE', origin: 'NATIVE', finality: 'finalized', txHash: id,
      creatorId: hash(2), campaignId: hash(0), occurredDay: 20000, easUid: id, blockNumber: source.blockNumber, blockHash: source.blockHash,
      credentials: [{ credentialKey: id, kind: 1, linkOrigin: 0, nftContract, tokenId }],
    });
    source.lifecycleTransactions.push({ hubProxy: config.hubAddress, txHash: id, blockNumber: source.blockNumber, blockHash: source.blockHash,
      kind: 'record', actionIds: [id], recipients: [wallet], origin: 'NATIVE' });
    if (i >= count-productionScale.representatives*2) representatives.set(credentialAssetKey(nftContract,tokenId), {
      nftContract: config.assetBindings[2][1], tokenId, owner: wallet, issuanceKey: id, metadataHash: id,
      migration: { migratorAddress: config.credentialReplacement.deployment!.address, batchId: id, txHash: id,
        blockNumber: String(source.blockNumber), sourceHub: config.hubAddress, sourceActionId: id, minted: true },
    });
  }
  return { source, representatives };
}
