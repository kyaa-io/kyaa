import { describe, expect, it } from "vitest";
import { z } from "zod";
import { fanRewardSchema } from "./fan-reward";
import { passportActivityContextSchema } from "@/features/passport/domain/passport-read-model";
import { activitySourceSchema } from "@/server/mobile-fan-economy/domain";

// Ids that Postgres derived with md5(...)::uuid: no RFC version/variant bits. Copied from the local database (2026-11-08):
// fan_post_likes.reward_source_id and mobile_fan_economy_ledger.source_id (group_check_in).
const derived = "b5142d31-f28a-c4a3-e35f-69a3ad597914";
const derivedLedger = "09b85f08-8bbe-54b1-c53d-5ea9948e16a3";

describe("display reads accept database ids without RFC version bits", () => {
  it("rejects them under strict z.uuid() (why the reads use z.guid())", () => {
    expect(z.uuid().safeParse(derived).success).toBe(false);
  });
  it("reads an awarded like reward whose source id was derived", () => {
    expect(fanRewardSchema.parse({ status: "awarded", asset: "fan_point", amount: 1, policyVersion: "v1", sourceId: derived, ledgerId: derivedLedger }).sourceId).toBe(derived);
  });
  it("reads the activity source behind a like whose reward source id was derived", () => {
    expect(activitySourceSchema.parse({ sourceId: derivedLedger }).sourceId).toBe(derivedLedger);
  });
  it("reads a passport activity context with a derived source id", () => {
    expect(passportActivityContextSchema.shape.sourceId.safeParse(derived).success).toBe(true);
  });
  it("still rejects values that are not ids", () => {
    expect(fanRewardSchema.safeParse({ status: "awarded", asset: "fan_point", amount: 1, policyVersion: "v1", sourceId: "not-an-id", ledgerId: derivedLedger }).success).toBe(false);
  });
});
