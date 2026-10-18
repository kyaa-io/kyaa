import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { APP_LOCALES } from "@/i18n/locales";
import { communityInviteRedemptionResultSchema, communityInviteSchema, communityStampAsset, communityStampSchema, communityStampKstDate, AVAILABLE_COMMUNITY_STAMPS, COMMUNITY_STAMPS } from "./community-stamps";
const stamp = { id: "11111111-1111-4111-8111-111111111111", kind: "welcome", celebritySlug: null, issuedAt: "2026-09-12T15:00:00Z", mint: { status: "queued", txHash: null, tokenId: null } };
describe("community stamp projection", () => {
 it("accepts global welcome without invented celebrity", () => expect(communityStampSchema.parse(stamp)).toEqual(stamp));
 it.each([{ kind:"welcome",celebritySlug:"elina" }, {kind:"first_comment",celebritySlug:null}, {kind:"first_clip",celebritySlug:null}, {kind:"invite",celebritySlug:"elina"}])("rejects wrong scope %j", override => expect(communityStampSchema.safeParse({...stamp,...override}).success).toBe(false));
 it("uses KST midnight boundary", () => {expect(communityStampKstDate("2026-09-12T14:59:59Z")).toBe("2026-09-12");expect(communityStampKstDate(stamp.issuedAt)).toBe("2026-09-13");});
 it("keeps server-awarded-only and unverified external awards out of the action catalog", () => {expect(AVAILABLE_COMMUNITY_STAMPS).not.toContain("first_clip");expect(AVAILABLE_COMMUNITY_STAMPS).not.toContain("subscription");expect(AVAILABLE_COMMUNITY_STAMPS).not.toContain("support");expect(AVAILABLE_COMMUNITY_STAMPS).toContain("share");});
 it.each(["welcome", "first_comment", "subscription", "support", "share", "invite", "daily_checkin"] as const)("preserves kyaa artwork for %s", kind => expect(communityStampAsset(kind)).toBe(`/images/credentials/v2/${kind}.png`));
 it("keeps the first clip contract localized and separate from first-comment artwork", () => {
  for (const locale of APP_LOCALES) {
   expect(COMMUNITY_STAMPS.first_clip[locale]).toBeTruthy();
   expect(COMMUNITY_STAMPS.first_clip.help[locale]).toBeTruthy();
  }
  expect(communityStampAsset("first_clip")).toBe("/images/community-stamps/first-clip.png");
  expect(communityStampAsset("first_clip")).not.toBe(communityStampAsset("first_comment"));
  const assets = path.join(process.cwd(), "public/images/community-stamps");
  const firstClip = readFileSync(path.join(assets, "first-clip.png"));
  expect(firstClip.equals(readFileSync(path.join(assets, "subscription.png")))).toBe(true);
  expect(firstClip.equals(readFileSync(path.join(assets, "first-comment.png")))).toBe(false);
 });
 it("keeps invite registration, waiting and issued states explicit", () => {
  expect(communityInviteSchema.parse({ code: "ABC123", redeemed: true, redemptionState: "pending_fan_verification" }).redemptionState).toBe("pending_fan_verification");
  expect(communityInviteRedemptionResultSchema.parse({ state: "registered_pending_fan_verification" }).state).toBe("registered_pending_fan_verification");
  expect(communityInviteRedemptionResultSchema.parse({ state: "qualified_reward_issued" }).state).toBe("qualified_reward_issued");
  expect(communityInviteRedemptionResultSchema.safeParse({ awarded: true }).success).toBe(false);
 });
});
