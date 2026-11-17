import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCanonicalActionPayload } from "../src/action-builder.js";
import { actionSourceSnapshotV1Schema, localActionId, localOccurrenceId, sourceOccurrenceId, type FanActionJob } from "../src/action-domain.js";
import type { ActionChainPort, ActionReceipt } from "../src/action-ports.js";
import type { PreparedSubmission } from "../src/domain.js";
import { KYAA_CREDENTIAL_ASSET_BASE_URI } from "../src/kyaa-credential-assets.js";

// Snapshots written by enqueue_fan_action_source on a disposable clean-chain DB with 20261231120000 applied
// (supabase/tests/dukjil_stamps_native_onchain.sql, run with -v export_snapshots=<file>): new, held-then-released and
// backlog-recovered dukjil stamps. Regenerate with the same command when the SQL shape changes.
const snapshots = JSON.parse(readFileSync(new URL("./fixtures/dukjil-native-snapshots.json", import.meta.url), "utf8")) as Array<Record<string, unknown>>;

class HashChain implements ActionChainPort {
  relayerAddress = `0x${"f".repeat(40)}`;
  async canonicalHashes(payload: Parameters<ActionChainPort["canonicalHashes"]>[0]) {
    const occurrenceId = localOccurrenceId(payload.chainId, payload.hubProxy as `0x${string}`, payload.environmentId as `0x${string}`, payload.request.sourceOccurrence as `0x${string}`);
    return { occurrenceId, actionId: localActionId(occurrenceId, payload.request.revision), requestHash: `0x${"d".repeat(64)}` as `0x${string}` };
  }
  async findExisting(): Promise<ActionReceipt | null> { return null; }
  async prepare(): Promise<PreparedSubmission> { throw new Error("unused"); }
  async broadcast(): Promise<string> { throw new Error("unused"); }
  async receipt(): Promise<ActionReceipt | null> { return null; }
}

describe("dukjil native snapshots from the database", () => {
  it("covers code 10 and 12 rows", () => {
    expect(snapshots.length).toBeGreaterThanOrEqual(20);
    expect(new Set(snapshots.map((snapshot) => snapshot.actionCode))).toEqual(new Set([10, 12]));
  });

  it.each(snapshots.map((snapshot) => [String(snapshot.canonicalSourceKey).split(":")[1], snapshot] as const))(
    "parses and builds the %s request with the original day and issuance key", async (_kind, raw) => {
      const snapshot = actionSourceSnapshotV1Schema.parse({ ...raw, assetBaseUri: KYAA_CREDENTIAL_ASSET_BASE_URI });
      const job: FanActionJob = { id: "82479946-5c2b-4cb7-838a-cd48f260bbcf", occurrenceRowId: "3ff058e6-8865-46c5-ae01-94a93f1dbe3c",
        payloadVersion: 1, sourceSnapshot: snapshot, payload: null, actionId: null, requestHash: null, attempts: 1, maxAttempts: 8,
        txHash: null, signedTransaction: null, leaseOwner: "worker-test", leaseExpiresAt: "2099-01-01T00:00:00Z" };
      const payload = await buildCanonicalActionPayload(job, snapshot, { pin: async () => "ipfs://dukjil-metadata" }, new HashChain(), Date.now(), "prod");
      expect(payload.request.actionCode).toBe(snapshot.actionCode);
      expect(payload.request.occurredDay).toBe(Math.floor(Date.parse(snapshot.sourceOccurredAt) / 86_400_000));
      expect(payload.request.sourceOccurrence).toBe(sourceOccurrenceId("community_stamps", snapshot.canonicalSourceKey));
      expect(payload.intents).toHaveLength(1);
      expect(payload.intents[0]!.issuanceKey).toBe(snapshot.credentials[0]!.issuanceKey);
    });
});
