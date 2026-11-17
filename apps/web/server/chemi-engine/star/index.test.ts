import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { calculateChart, dailySky, separation } from "./index";
import reference from "./reference.test.json";
describe("tropical whole-sign engine", () => {
  for (const fixture of reference.cases) it(`Swiss reference ${fixture.local} ${fixture.zone}`, () => {
    const result = calculateChart({ ...fixture, instant: new Date(fixture.instant), timeKnown: true });
    expect(separation(result.ascendant!, fixture.ascendant)).toBeLessThan(1 / 60);
    expect(separation(result.midheaven!, fixture.midheaven)).toBeLessThan(1 / 60);
    expect(result.wholeSignCusps).toEqual(fixture.cusps);
    result.planets.forEach((planet, index) => {
      expect(separation(planet.longitude, fixture.planets[index]!)).toBeLessThan(1 / 60);
      expect(Math.floor(planet.longitude / 30)).toBe(Math.floor(fixture.planets[index]! / 30));
      expect(planet.wholeSignHouse).toBe(Math.floor(((fixture.planets[index]! - fixture.cusps[0]! + 360) % 360) / 30) + 1);
    });
  });
  it("omits angles and houses without known time", () => {
    const result = calculateChart({ instant: new Date("2000-01-01Z"), timeKnown: false, latitude: 37, longitude: 127 });
    expect(result.ascendant).toBeNull(); expect(result.midheaven).toBeNull(); expect(result.wholeSignCusps).toBeNull();
    expect(result.planets.every(p => p.wholeSignHouse === null)).toBe(true);
  });
  it("samples 24 KST hours and rejects invalid days", () => {
    const sky = dailySky("2026-11-18"); expect(sky).toHaveLength(24);
    expect(sky[0]!.instant).toBe("2026-11-17T15:00:00.000Z");
    expect(() => dailySky("2026-02-30")).toThrow();
  });
});
