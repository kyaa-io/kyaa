import { describe, expect, it } from "vitest";
import { joinTranslatedSlots, postTitleSlots, splitTranslatedSlots } from "./post-title-slots";

describe("post title slots", () => {
  it("cuts a body into the first line and the rest, leaving out a slot with nothing in it", () => {
    expect(postTitleSlots("제목\n본문\n둘째 줄").texts).toEqual(["제목", "본문\n둘째 줄"]);
    expect(postTitleSlots("제목").texts).toEqual(["제목"]);
    expect(postTitleSlots("제목\n  \n").texts).toEqual(["제목"]);
    expect(postTitleSlots("\n본문").texts).toEqual(["본문"]);
    expect(postTitleSlots("  ").texts).toEqual([]);
  });
  it("stores a translated title on one line, so the first line break is always the boundary", () => {
    const slots = postTitleSlots("제목\n본문");
    expect(joinTranslatedSlots(["Line one\nline two", "Body\nmore"], slots)).toBe("Line one line two\nBody\nmore");
    expect(splitTranslatedSlots(joinTranslatedSlots(["A\r\nB", "Body"], slots), slots)).toEqual(["A B", "Body"]);
    expect(() => joinTranslatedSlots(["Only one"], slots)).toThrow("TRANSLATION_FAILED");
    expect(() => joinTranslatedSlots(["\n", "Body"], slots)).toThrow("TRANSLATION_FAILED");
  });
  it("does not cut a cached text it cannot cut with certainty", () => {
    const slots = postTitleSlots("제목\n본문");
    expect(splitTranslatedSlots("No line break at all", slots)).toBeNull();
    expect(splitTranslatedSlots("\nStarts with a break", slots)).toBeNull();
    expect(splitTranslatedSlots("Title\n  ", slots)).toBeNull();
    expect(splitTranslatedSlots("Title\nBody", slots)).toEqual(["Title", "Body"]);
    expect(splitTranslatedSlots("Whole text\nwith lines", postTitleSlots("제목"))).toEqual(["Whole text\nwith lines"]);
  });
});
