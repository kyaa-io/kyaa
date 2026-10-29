import { describe, expect, it } from "vitest";
import { buildCanonicalActionPayload, assertSnapshotMatchesCanonical, renderActionMetadata } from "../src/action-builder.js";
import { actionCodes, actionSourceSnapshotV1Schema, localActionId, localOccurrenceId, sourceCredentialIssuanceKey, sourceOccurrenceId, sortCanonicalIntents, type ActionSourceSnapshotV1, type FanActionJob } from "../src/action-domain.js";
import { keccak256, stringToHex } from "viem";
import type { ActionChainPort, ActionReceipt } from "../src/action-ports.js";
import type { PreparedSubmission } from "../src/domain.js";
import type { MetadataDocument } from "../src/ports.js";
import { FIRST_CLIP_IMAGE_URI, KYAA_CREDENTIAL_ASSET_BASE_URI } from "../src/kyaa-credential-assets.js";

const h = (value: string) => `0x${value.repeat(64)}`.slice(0, 66);
const address = (value: string) => `0x${value.repeat(40)}`.slice(0, 42);
const source: ActionSourceSnapshotV1 = {
  version: 1, chainId: 91342, environmentId: h("1"), hubProxy: address("2"), schemaUid: h("3"),
  schemaVersion: 1, bindingVersion: 1, operationKind: "RECORD_AND_ISSUE", sourceNamespace: "quiz_passes",
  canonicalSourceKey: "3ff058e6-8865-46c5-ae01-94a93f1dbe3c", revision: 1, actionCode: actionCodes.FAN_VERIFIED,
  policyVersion: 1, recipient: address("4"), creatorId: h("5"), campaignId: h("6"),
  sourceOccurredAt: "2026-09-12T10:00:00.000Z", origin: "NATIVE", evidenceCommitment: h("7"),
  migrationBatchId: h("0"), assetBaseUri: "ipfs://bafyassets/credentials/v1", migrationProof: [],
  credentials: [
    { kind: 1, nftContract: address("9"), issuanceKey: h("b"), mode: "MINT", metadata: { operationKey: "knowledge:1", legacyEntityType: "stamp", legacyPayload: { recipient: address("4"), celebritySlug: "kara", issuanceId: h("b"), stampType: "Knowledge" } } },
    { kind: 0, nftContract: address("8"), issuanceKey: h("a"), mode: "MINT", metadata: { operationKey: "passport:1", legacyEntityType: "passport", legacyPayload: { recipient: address("4"), celebritySlug: "kara", passportId: h("a") } } },
  ],
};
const job: FanActionJob = { id: "82479946-5c2b-4cb7-838a-cd48f260bbcf", occurrenceRowId: "3ff058e6-8865-46c5-ae01-94a93f1dbe3c", payloadVersion: 1, sourceSnapshot: source, payload: null, actionId: null, requestHash: null, attempts: 1, maxAttempts: 8, txHash: null, signedTransaction: null, leaseOwner: "worker-test", leaseExpiresAt: "2099-01-01T00:00:00Z" };

class HashChain implements ActionChainPort {
  relayerAddress = address("f");
  async canonicalHashes(payload: Parameters<ActionChainPort["canonicalHashes"]>[0]) {
    const occurrenceId = localOccurrenceId(payload.chainId, payload.hubProxy as `0x${string}`, payload.environmentId as `0x${string}`, payload.request.sourceOccurrence as `0x${string}`);
    return { occurrenceId, actionId: localActionId(occurrenceId, payload.request.revision), requestHash: h("d") };
  }
  async findExisting(): Promise<ActionReceipt | null> { return null; }
  async prepare(): Promise<PreparedSubmission> { throw new Error("unused"); }
  async broadcast(): Promise<string> { throw new Error("unused"); }
  async receipt(): Promise<ActionReceipt | null> { return null; }
}

describe("canonical fan action domain", () => {
  function communitySnapshot(stampKind = "share") {
    return { ...source, bindingVersion: 2, actionCode: actionCodes.COMMUNITY_STAMP_ISSUED,
      sourceNamespace: "community_stamps", assetBaseUri: KYAA_CREDENTIAL_ASSET_BASE_URI,
      credentials: [{ ...source.credentials[0]!, metadata: { operationKey: "byus:community-stamp:v1:source",
        legacyEntityType: "community_stamp", legacyPayload: { recipient: source.recipient,
          celebritySlug: "kara", issuanceId: h("b"), stampKind } } }] };
  }

  it.each(["share", "first_clip"])("issues one native %s Stamp with its preserved identity", async (kind) => {
    const documents: MetadataDocument[] = [];
    const payload = await buildCanonicalActionPayload(job, communitySnapshot(kind), { pin: async (document) => {
      documents.push(document); return "ipfs://community-metadata";
    } }, new HashChain());
    expect(payload.intents).toHaveLength(1);
    expect(payload.intents[0]!.issuanceKey).toBe(h("b"));
    expect(documents[0]!.image).toBe(kind === "share" ? `${KYAA_CREDENTIAL_ASSET_BASE_URI}/share.png` : FIRST_CLIP_IMAGE_URI);
    expect(documents[0]!.name).toBe(kind === "share" ? "kyaa Share Stamp" : "kyaa First Clip Stamp");
    expect(documents[0]!.attributes).toContainEqual({ trait_type: "Action", value: "COMMUNITY_STAMP_ISSUED" });
  });

  it("rejects untrusted community issuance before pinning or signing", async () => {
    const valid = communitySnapshot();
    const first = valid.credentials[0]!;
    const variants = [
      communitySnapshot("subscription"), communitySnapshot("daily_checkin"),
      { ...valid, sourceNamespace: "quiz_passes" }, { ...valid, creatorId: h("0") },
      { ...valid, bindingVersion: 1 }, { ...valid, credentials: [] },
      { ...valid, credentials: [first, first] },
      { ...valid, credentials: [{ ...first, kind: 0 }] },
      { ...valid, credentials: [{ ...first, metadata: { ...first.metadata, legacyEntityType: "stamp" } }] },
      { ...valid, recipient: address("a") },
      { ...valid, credentials: [{ ...first, issuanceKey: h("c") }] },
    ];
    let pins = 0;
    for (const snapshot of variants) {
      expect(actionSourceSnapshotV1Schema.safeParse(snapshot).success).toBe(false);
      await expect(buildCanonicalActionPayload(job, snapshot, { pin: async () => { pins++; return "ipfs://invalid"; } }, new HashChain())).rejects.toThrow();
    }
    expect(pins).toBe(0);
  });

  it("uses reviewed creator-independent artwork only for binding 2", async () => {
    for (const bindingVersion of [1, 2]) {
      const images: string[] = [];
      const snapshot = { ...source, bindingVersion, assetBaseUri: bindingVersion === 2 ? KYAA_CREDENTIAL_ASSET_BASE_URI : source.assetBaseUri };
      await buildCanonicalActionPayload(job, snapshot, { pin: async (document) => { images.push(document.image); return "ipfs://metadata"; } }, new HashChain());
      expect(images).toEqual(bindingVersion === 2
        ? [`${KYAA_CREDENTIAL_ASSET_BASE_URI}/knowledge.png`, `${KYAA_CREDENTIAL_ASSET_BASE_URI}/passport.png`]
        : [`${source.assetBaseUri}/stamp/knowledge/kara.png`, `${source.assetBaseUri}/passport/kara.png`]);
    }
  });

  it("gives a binding 2 mission its own image without changing its original stamp key", async () => {
    const images: string[] = [];
    const snapshot = { ...source, bindingVersion: 2, assetBaseUri: KYAA_CREDENTIAL_ASSET_BASE_URI, actionCode: 4,
      credentials: [{ ...source.credentials[0]!, metadata: { ...source.credentials[0]!.metadata!, legacyPayload: { recipient: address("4"), celebritySlug: "kara", issuanceId: h("b"), stampType: "Survey" } } }] };
    const payload = await buildCanonicalActionPayload(job, snapshot, { pin: async (document) => { images.push(document.image); return "ipfs://metadata"; } }, new HashChain());
    expect(images).toEqual([`${KYAA_CREDENTIAL_ASSET_BASE_URI}/mission.png`]);
    expect(payload.intents[0]!.issuanceKey).toBe(h("b"));
  });

  it("builds one FAN_VERIFIED action with two deterministically sorted credentials", async () => {
    const pinned: string[] = [];
    const payload = await buildCanonicalActionPayload(job, source, { pin: async (_document, key) => { pinned.push(key); return `ipfs://${key}`; } }, new HashChain(), Date.parse("2026-09-13T00:00:00Z"));
    expect(payload.actionId).toBe(localActionId(payload.occurrenceId as `0x${string}`, 1));
    expect(payload.request.sourceOccurrence).toBe(sourceOccurrenceId("quiz_passes", source.canonicalSourceKey));
    expect(payload.intents.map((item) => item.kind)).toEqual([0, 1]);
    expect(pinned).toEqual(["knowledge:1", "passport:1"]);
    expect(payload.intents).toHaveLength(2);
    expect(() => assertSnapshotMatchesCanonical(source, payload)).not.toThrow();
  });

  it("rejects any frozen payload field changed after source capture", async () => {
    const payload = await buildCanonicalActionPayload(job, source, { pin: async (_document, key) => `ipfs://${key}` }, new HashChain(), Date.parse("2026-09-13T00:00:00Z"));
    expect(() => assertSnapshotMatchesCanonical(source, { ...payload, request: { ...payload.request, campaignId: h("e") } })).toThrowError(/immutable source snapshot/);
  });

  it("rejects duplicate credential intents", () => {
    const intent = { kind: 0 as const, mode: 0 as const, nftContract: address("8"), issuanceKey: h("a"), tokenId: "0", metadataUri: "ipfs://a" };
    expect(() => sortCanonicalIntents([intent, intent])).toThrowError(/Duplicate credential intent/);
  });
  it("derives a new Collectible issuance key from the immutable legacy claim id", () => {
    const claimId = "3ff058e6-8865-46c5-ae01-94a93f1dbe3c";
    const credential = { kind: 2 as const, nftContract: address("8"), issuanceKey: null, mode: "MINT" as const, metadata: { operationKey: "collectible:1", legacyEntityType: "collectible" as const, legacyPayload: { recipient: address("4"), celebritySlug: "kara", liveSlug: "kara-live", claimId, metadataVersion: 1 } } };
    expect(sourceCredentialIssuanceKey(credential)).toBe(keccak256(stringToHex(claimId)));
  });
  it("labels mission metadata explicitly while preserving the existing Survey artwork URI", () => {
    const document = renderActionMetadata({ schema: "https://byus.kr/schemas/credential-metadata-v1.json", version: 1, name: "ByUs Survey Stamp", description: "survey", image: "ipfs://assets/stamp/survey/kara.png", attributes: [{ trait_type: "Credential", value: "Survey Stamp" }, { trait_type: "Metadata Version", value: "1" }] }, 4, 1);
    expect(document).toMatchObject({ schema: "https://byus.kr/schemas/credential-metadata-v2.json", version: 2, name: "kyaa Mission Completion Stamp", image: "ipfs://assets/stamp/survey/kara.png" });
    expect(document.attributes).toContainEqual({ trait_type: "Action", value: "MISSION_COMPLETED" });
  });
});

it("pins WAVE mission artwork and mission identity only under action 4", async () => {
  const snapshot = { ...source, bindingVersion: 2, assetBaseUri: KYAA_CREDENTIAL_ASSET_BASE_URI, sourceNamespace: "community_stamps", actionCode: 4,
    credentials: [{ ...source.credentials[0], metadata: { operationKey: "byus:community-stamp:v1:mission", legacyEntityType: "community_stamp", legacyPayload: { recipient: address("4"), issuanceId: h("b"), celebritySlug: "kyaa-wave-fanpage", stampKind: "wave_mission", missionKey: "bingo" } } }] };
  const documents: unknown[] = [];
  await buildCanonicalActionPayload(job, snapshot, { pin: async doc => { documents.push(doc); return "ipfs://mission"; } }, new HashChain());
  expect(documents).toEqual([expect.objectContaining({ image: `${KYAA_CREDENTIAL_ASSET_BASE_URI}/mission.png`, attributes: expect.arrayContaining([{trait_type:"Mission",value:"bingo"},{trait_type:"Action",value:"MISSION_COMPLETED"}]) })]);
  await expect(buildCanonicalActionPayload(job, {...snapshot,actionCode:5}, {pin: async () => "ipfs://wrong"}, new HashChain())).rejects.toThrow("MISSION_COMPLETED");
});
