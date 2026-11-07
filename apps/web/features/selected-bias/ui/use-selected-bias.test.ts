import { describe, expect, it } from "vitest";
import { pickSelectedBias, type SelectedBiasOption } from "./use-selected-bias";

const option = (slug: string) => ({ slug, tier: "Silver", stage: null }) as SelectedBiasOption;

describe("pickSelectedBias", () => {
  it("takes the stored choice while its passport exists", () => {
    expect(pickSelectedBias([option("a"), option("b")], "b")?.slug).toBe("b");
  });
  it("defaults to the same passport whatever order the locale sorted the list in", () => {
    expect(pickSelectedBias([option("a"), option("b")], null)?.slug).toBe("a");
    expect(pickSelectedBias([option("b"), option("a")], "gone")?.slug).toBe("a");
  });
  it("defaults to the highest stage, so ko and en headers show one favorite (261107-2 H-1)", () => {
    const diamond = { slug: "ranking", tier: "Diamond", stage: { key: "diamond-1", tier: "Diamond", subdivision: 1 } } as SelectedBiasOption;
    const silver = { slug: "p1", tier: "Silver", stage: { key: "silver-1", tier: "Silver", subdivision: 1 } } as SelectedBiasOption;
    const ko = pickSelectedBias([diamond, silver], null);
    const en = pickSelectedBias([silver, diamond], null);
    expect(ko?.slug).toBe("ranking");
    expect(en?.slug).toBe("ranking");
  });
  it("uses the only passport, and nothing without one", () => {
    expect(pickSelectedBias([option("a")], "gone")?.slug).toBe("a");
    expect(pickSelectedBias([], "a")).toBeNull();
  });
});
