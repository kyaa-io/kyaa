import { describe, expect, it } from "vitest";
import { pickSelectedBias, type SelectedBiasOption } from "./use-selected-bias";

const option = (slug: string) => ({ slug }) as SelectedBiasOption;

describe("pickSelectedBias", () => {
  it("takes the stored choice while its passport exists", () => {
    expect(pickSelectedBias([option("a"), option("b")], "b")?.slug).toBe("b");
  });
  it("needs a choice with several passports and no usable stored value", () => {
    expect(pickSelectedBias([option("a"), option("b")], null)).toBeNull();
    expect(pickSelectedBias([option("a"), option("b")], "gone")).toBeNull();
  });
  it("uses the only passport, and nothing without one", () => {
    expect(pickSelectedBias([option("a")], "gone")?.slug).toBe("a");
    expect(pickSelectedBias([], "a")).toBeNull();
  });
});
