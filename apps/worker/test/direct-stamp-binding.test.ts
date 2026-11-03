import { describe, expect, it } from "vitest";
import { parseJobPayload, type BlockchainJob, type EntityType } from "../src/domain.js";

const base = { recipient: `0x${"1".repeat(40)}`, celebritySlug: "kara" };
const issuanceId = `0x${"2".repeat(64)}`;
const job = (entityType: EntityType, payload: unknown): BlockchainJob => ({
  id: "test-job", entityType, entityId: "test-entity", operationKey: "test-operation", payloadVersion: 1,
  payload, attempts: 1, maxAttempts: 8, txHash: null, leaseOwner: "worker-test", leaseExpiresAt: "2099-01-01T00:00:00Z",
});

describe("direct stamp payload binding", () => {
  it.each(["Attendance", "Membership"])("accepts numeric version 2 only on %s stamps", (stampType) => {
    const payload = { ...base, issuanceId, stampType, bindingVersion: 2 };
    expect(parseJobPayload(job("stamp", payload))).toEqual(payload);
  });

  it.each(["Knowledge", "Reservation", "Attendance", "Survey", "Membership"])("preserves unmarked legacy %s payloads", (stampType) => {
    const payload = { ...base, issuanceId, stampType };
    expect(parseJobPayload(job("stamp", payload))).toEqual(payload);
  });

  it.each(["Knowledge", "Reservation", "Survey"])("rejects a version 2 %s stamp", (stampType) => {
    expect(() => parseJobPayload(job("stamp", { ...base, issuanceId, stampType, bindingVersion: 2 }))).toThrow();
  });

  it.each([1, 3, "2", null, true, {}, []])("rejects the invalid binding marker %j", (bindingVersion) => {
    expect(() => parseJobPayload(job("stamp", { ...base, issuanceId, stampType: "Attendance", bindingVersion }))).toThrow();
  });

  it.each([
    ["passport", { ...base, passportId: issuanceId }],
    ["reaction", { ...base, issuanceId, reactionType: "FirstReaction" }],
    ["community_stamp", { ...base, issuanceId, stampKind: "daily_checkin" }],
    ["collectible", { ...base, liveSlug: "live-show", claimId: "82479946-5c2b-4cb7-838a-cd48f260bbcf", metadataVersion: 1 }],
  ] as const)("rejects the marker on %s entities", (entityType, payload) => {
    expect(parseJobPayload(job(entityType, payload))).toEqual(payload);
    expect(() => parseJobPayload(job(entityType, { ...payload, bindingVersion: 2 }))).toThrow();
  });
});
