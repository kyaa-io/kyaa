import { Body } from "astronomy-engine";
import { describe, expect, it, vi } from "vitest";
import { synastryConnections } from "./synastry";
vi.mock("server-only", () => ({}));


describe("synastry connections", () => {
  const self = { planets: [{ body: Body.Sun, longitude: 359 }], moonKnown: true } as const;
  const partner = { planets: [{ body: Body.Moon, longitude: 119 }, { body: Body.Sun, longitude: 1 }], moonKnown: true } as const;
  it("keeps owners and orders connections by angular error across zero Aries", () => {
    expect(synastryConnections(self, partner)).toEqual([
      { mine: Body.Sun, theirs: Body.Moon, angle: 120, error: 0 },
      { mine: Body.Sun, theirs: Body.Sun, angle: 0, error: 2 },
    ]);
  });
  it("omits an uncertain Moon on either side", () => {
    const uncertain = { ...partner, moonKnown: false };
    expect(synastryConnections(self, uncertain)).toHaveLength(1);
    expect(synastryConnections(uncertain, self)).toHaveLength(1);
  });
});
