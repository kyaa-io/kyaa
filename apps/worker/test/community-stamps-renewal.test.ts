import { describe, expect, it } from "vitest";
import { communityStampKinds, communityStampPayloadV1Schema, type BlockchainJob, type CommunityStampPayloadV1 } from "../src/domain.js";
import { KYAA_CREDENTIAL_ASSET_BASE_URI, kyaaCredentialImage, renewalStampImageUri } from "../src/kyaa-credential-assets.js";
import { renderMetadata } from "../src/metadata.js";

const kinds = ["post", "comment", "reaction", "live_reserve", "live_attend", "survey", "mission", "event_checkin", "event_review", "cheer", "proof", "quiz", "steady_checkin"] as const;
const files: Record<string, string> = {
  post: "post", comment: "first-comment", reaction: "first-like", live_reserve: "reservation", live_attend: "attendance", survey: "survey",
  mission: "mission", event_checkin: "event-checkin", event_review: "event-review", cheer: "support", proof: "proof", quiz: "knowledge", steady_checkin: "steady-checkin",
};
const payload = (stampKind: string) => ({ recipient: `0x${"1".repeat(40)}`, issuanceId: `0x${"2".repeat(64)}`, celebritySlug: "some-creator", stampKind }) as CommunityStampPayloadV1;
const job = (p: CommunityStampPayloadV1) => ({ id: "j", entityType: "community_stamp", entityId: "e", operationKey: "k", payloadVersion: 1, payload: p, attempts: 0, maxAttempts: 3, txHash: null, leaseOwner: null, leaseExpiresAt: null }) as unknown as BlockchainJob;

describe("passport renewal stamp kinds", () => {
  it.each(kinds)("%s is in the closed list and parses", (kind) => {
    expect(communityStampKinds).toContain(kind);
    expect(communityStampPayloadV1Schema.safeParse(payload(kind)).success).toBe(true);
  });
  it.each(kinds)("%s resolves metadata and image URI", (kind) => {
    const p = payload(kind);
    const uri = `https://dev.kyaa.io/images/stamps/ink-v1/${files[kind]}.webp`;
    expect(renewalStampImageUri(kind, "dev")).toBe(uri);
    expect(kyaaCredentialImage("community_stamp", p, KYAA_CREDENTIAL_ASSET_BASE_URI, undefined, "dev")).toBe(uri);
    const doc = renderMetadata(job(p), p, KYAA_CREDENTIAL_ASSET_BASE_URI, "dev");
    expect(doc.image).toBe(uri);
    expect(doc.name).toMatch(/Stamp$/);
  });
  it("keeps wave_mission on the pinned mission image", () => {
    const p = { ...payload("wave_mission"), celebritySlug: "kyaa-wave-fanpage", missionKey: "bingo" } as CommunityStampPayloadV1;
    expect(renderMetadata(job(p), p, KYAA_CREDENTIAL_ASSET_BASE_URI).image).toBe(`${KYAA_CREDENTIAL_ASSET_BASE_URI}/mission.png`);
  });
  it("uses the production site for prod and fails for missing or unknown environments", () => {
    const p = payload("post");
    expect(renderMetadata(job(p), p, KYAA_CREDENTIAL_ASSET_BASE_URI, "prod").image).toBe("https://kyaa.io/images/stamps/ink-v1/post.webp");
    for (const env of [undefined, "staging", "local"]) expect(() => renderMetadata(job(p), p, KYAA_CREDENTIAL_ASSET_BASE_URI, env)).toThrow(/dev or prod/);
    expect(() => kyaaCredentialImage("community_stamp", p, KYAA_CREDENTIAL_ASSET_BASE_URI)).toThrow(/dev or prod/);
  });
  it("leaves existing kinds independent of the environment", () => {
    const p = payload("first_comment");
    expect(renderMetadata(job(p), p, KYAA_CREDENTIAL_ASSET_BASE_URI).image).toBe("https://kyaa.io/images/community-stamps/first-comment.png");
  });
});
