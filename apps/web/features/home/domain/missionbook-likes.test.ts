import { describe, expect, it } from "vitest";
import { MISSIONBOOK_LIKE_DISPLAY_START, displayedMissionbookLikes } from "./missionbook-likes";

describe("mission book like display (user 11/16: the screen starts at 10, records keep the real count)", () => {
  it("adds the display start to the real event likes", () => {
    expect(MISSIONBOOK_LIKE_DISPLAY_START).toBe(10);
    expect(displayedMissionbookLikes(0)).toBe(10);
    expect(displayedMissionbookLikes(1)).toBe(11);
    expect(displayedMissionbookLikes(340)).toBe(350);
  });
});
