import { describe, expect, it } from "vitest";
import { firstStepHref, firstStepsCookieString, firstStepsDoneCookie, firstStepsProgress } from "./first-steps";

const elina = { slug: "elina", name: "엘리나" };
const yuna = { slug: "yuna", name: "유나" };

describe("first steps", () => {
  it("starts at joining a page", () => {
    const progress = firstStepsProgress({ joinedPages: [], passports: [], attended: false });
    expect(progress).toMatchObject({ doneCount: 0, complete: false, next: "join" });
  });

  it("counts a passport as having picked a creator", () => {
    const progress = firstStepsProgress({ joinedPages: [], passports: [elina], attended: false });
    expect(progress.steps.map((step) => step.done)).toEqual([true, true, false]);
    expect(progress.next).toBe("attend");
  });

  it("is complete only with all three", () => {
    expect(firstStepsProgress({ joinedPages: [elina], passports: [elina], attended: true })).toMatchObject({ doneCount: 3, complete: true, next: null });
    expect(firstStepsProgress({ joinedPages: [elina], passports: [], attended: true })).toMatchObject({ doneCount: 2, next: "passport" });
  });

  it("sends the passport step to a joined page without a passport", () => {
    expect(firstStepHref("passport", { joinedPages: [elina, yuna], passports: [elina] }, "ko")).toBe("/c/yuna/verify?locale=ko");
    expect(firstStepHref("passport", { joinedPages: [], passports: [] }, "en")).toBe("/pages/groups?locale=en");
    expect(firstStepHref("passport", null, "ko")).toBe("/pages/groups?locale=ko");
    expect(firstStepHref("join", null, "ko")).toBe("/pages/groups?locale=ko");
    expect(firstStepHref("attend", null, "ko")).toBe("/benefits?locale=ko");
  });

  it("reads and writes the finished cookie", () => {
    expect(firstStepsDoneCookie("done")).toBe(true);
    expect(firstStepsDoneCookie(undefined)).toBe(false);
    expect(firstStepsDoneCookie("1")).toBe(false);
    expect(firstStepsCookieString()).toMatch(/^kyaa_first_steps=done; path=\/; max-age=\d+; samesite=lax$/);
  });
});
