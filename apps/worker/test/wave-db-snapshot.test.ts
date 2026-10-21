import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { assertSnapshotMatchesCanonical, buildCanonicalActionPayload } from "../src/action-builder.js";
import { actionSourceSnapshotV1Schema, localActionId, localOccurrenceId, sourceOccurrenceId, type FanActionJob } from "../src/action-domain.js";
import type { ActionChainPort } from "../src/action-ports.js";
import type { MetadataDocument } from "../src/ports.js";
import { KYAA_CREDENTIAL_ASSET_BASE_URI } from "../src/kyaa-credential-assets.js";

it("builds the actual DB-generated WAVE snapshot with unchanged context and mission metadata", async () => {
  const fixture = JSON.parse(readFileSync(new URL("../../../contracts/test/fixtures/kyaa-wave-db-snapshot.json", import.meta.url), "utf8"));
  const snapshot = actionSourceSnapshotV1Schema.parse(fixture.snapshot);
  const job: FanActionJob = {
    id: "82479946-5c2b-4cb7-838a-cd48f260bbcf", occurrenceRowId: "3ff058e6-8865-46c5-ae01-94a93f1dbe3c",
    payloadVersion: 1, sourceSnapshot: snapshot, payload: null, actionId: null, requestHash: null,
    attempts: 1, maxAttempts: 8, txHash: null, signedTransaction: null, leaseOwner: "db-snapshot-test", leaseExpiresAt: "2099-01-01T00:00:00Z",
  };
  const documents: MetadataDocument[] = [];
  const unused = async (): Promise<never> => { throw new Error("Signing and broadcasting are outside this test"); };
  // Actual Hub hash and receipt behavior is checked separately by WaveMissionDbSnapshotTest.
  const chain: ActionChainPort = {
    relayerAddress: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    async canonicalHashes(payload) {
      const occurrenceId = localOccurrenceId(payload.chainId, payload.hubProxy as `0x${string}`, payload.environmentId as `0x${string}`, payload.request.sourceOccurrence as `0x${string}`);
      return { occurrenceId, actionId: localActionId(occurrenceId, payload.request.revision), requestHash: `0x${"00".repeat(32)}` };
    },
    findExisting: unused, prepare: unused, broadcast: unused, receipt: unused,
  };
  const payload = await buildCanonicalActionPayload(job, snapshot, {
    pin: async document => { documents.push(document); return "ipfs://wave-engineering-metadata"; },
  }, chain, Date.parse("2033-05-18T00:00:00Z"));
  expect(payload.request.actionCode).toBe(4);
  expect(payload.request.bindingVersion).toBe(2);
  expect(payload.request.campaignId).toBe("0x00000000000000000000000000000000869cfb38b4384b66a9e3cbce3e2bbd38");
  expect(payload.request.creatorId).toBe(snapshot.creatorId);
  expect(payload.request.occurredDay).toBe(fixture.occurredDay);
  expect(payload.request.sourceOccurrence).toBe(sourceOccurrenceId(snapshot.sourceNamespace, snapshot.canonicalSourceKey));
  expect(payload.intents[0]!.issuanceKey).toBe(snapshot.credentials[0]!.issuanceKey);
  expect(documents).toHaveLength(1);
  expect(documents[0]!.image).toBe(`${KYAA_CREDENTIAL_ASSET_BASE_URI}/mission.png`);
  expect(documents[0]!.attributes).toContainEqual({ trait_type: "Action", value: "MISSION_COMPLETED" });
  expect(() => assertSnapshotMatchesCanonical(snapshot, payload)).not.toThrow();
});
