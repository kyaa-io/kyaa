import { expect, it } from "vitest";
import { heartDonationEvent } from "./heart-donation-event";

it("defaults to Elina with no cause and no recipient yet", () => {
  expect(heartDonationEvent({})).toEqual({ creatorSlug: "elina", creatorName: null, cause: null, recipient: null });
});
it("reads the creator, the cause and the recipient from the settings", () => {
  expect(heartDonationEvent({ KYAA_HEART_DONATION_CREATOR_SLUG: " Wena ", KYAA_HEART_DONATION_CREATOR_NAME: "웬아", KYAA_HEART_DONATION_CAUSE: "유기동물", KYAA_HEART_DONATION_RECIPIENT: "  사단법인 예시  " }))
    .toEqual({ creatorSlug: "wena", creatorName: "웬아", cause: "유기동물", recipient: "사단법인 예시" });
});
it("ignores a slug that cannot be a page address", () => {
  expect(heartDonationEvent({ KYAA_HEART_DONATION_CREATOR_SLUG: "../admin" }).creatorSlug).toBe("elina");
});
