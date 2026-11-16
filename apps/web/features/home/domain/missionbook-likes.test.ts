import { describe, expect, it } from "vitest";
import { MISSIONBOOK_LIKE_DISPLAY_START, MISSIONBOOK_NOTICE_SLUG, displayedNoticeLikes } from "./missionbook-likes";

describe("mission book like display (user 11/16: the screen starts at 10, records keep the real count)", () => {
  it("adds the display start only to the mission book notice", () => {
    expect(MISSIONBOOK_LIKE_DISPLAY_START).toBe(10);
    expect(displayedNoticeLikes(MISSIONBOOK_NOTICE_SLUG, 0)).toBe(10);
    expect(displayedNoticeLikes(MISSIONBOOK_NOTICE_SLUG, 340)).toBe(350);
    expect(displayedNoticeLikes("service-guide", 0)).toBe(0);
    expect(displayedNoticeLikes("service-guide", 7)).toBe(7);
  });
});
