import { describe, expect, it } from "vitest";
import { pickSelectedBias, type SelectedBiasOption } from "./use-selected-bias";

const option = (slug: string) => ({ slug }) as SelectedBiasOption;

describe("pickSelectedBias", () => {
  it("takes the stored choice while its passport exists", () => {
    expect(pickSelectedBias([option("a"), option("b")], "b")?.slug).toBe("b");
  });
  it("defaults to the first passport when nothing usable is stored", () => {
    expect(pickSelectedBias([option("a"), option("b")], null)?.slug).toBe("a");
    expect(pickSelectedBias([option("a"), option("b")], "gone")?.slug).toBe("a");
  });
  it("uses the only passport, and nothing without one", () => {
    expect(pickSelectedBias([option("a")], "gone")?.slug).toBe("a");
    expect(pickSelectedBias([], "a")).toBeNull();
  });
});
